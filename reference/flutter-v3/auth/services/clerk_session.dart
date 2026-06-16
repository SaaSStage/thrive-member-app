/// Session controller that owns Clerk auth state on top of [ClerkClient].
///
/// Responsibilities:
/// - Persist `sessionId` and `publicUserId` (the `public.users.id` uuid that
///   joins to the Clerk sub claim) across app launches, via
///   flutter_secure_storage.
/// - Cache the short-lived (60s TTL) Clerk session JWT in memory and refresh
///   it proactively on a Timer so [currentJwt] returns a fresh value cheaply
///   for `supabase_flutter`'s `accessToken` callback.
/// - Expose a [authStateChanges] stream that the AuthGate listens to.
///
/// Lifecycle:
/// 1. [bootstrap] is called once at app startup with a constructed
///    [ClerkClient].
/// 2. [restore] tries to bring back the previous session — if it succeeds the
///    user is signed in without any UI prompt.
/// 3. On sign-in completion, callers invoke [onSignInComplete] with the new
///    sessionId; this fetches the JWT, looks up `public.users.id`, persists,
///    and emits authenticated=true.
/// 4. On sign-out, [signOut] revokes the Clerk session, clears persisted
///    state, and emits authenticated=false. The dev session token (device
///    trust) is preserved — call [ClerkClient.clearDeviceTrust] separately if
///    you want to force the email-code device verification on next sign-in.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'package:radio_online/auth/services/clerk_client.dart';

class ClerkSession {
  ClerkSession._({
    required ClerkClient client,
    required FlutterSecureStorage storage,
    required String supabaseUrl,
    required String supabaseAnonKey,
  })  : _client = client,
        _storage = storage,
        _supabaseUrl = supabaseUrl,
        _supabaseAnonKey = supabaseAnonKey;

  /// The global session instance. Throws if [bootstrap] hasn't been called.
  static ClerkSession get instance {
    final i = _instance;
    if (i == null) {
      throw StateError(
        'ClerkSession.bootstrap() must be called before ClerkSession.instance.',
      );
    }
    return i;
  }

  static ClerkSession? _instance;

  /// Construct the singleton and attempt to restore any previous session.
  /// Call exactly once at app startup, BEFORE [Supabase.initialize] (since the
  /// `accessToken` callback registered with Supabase calls back into this
  /// instance).
  static Future<void> bootstrap({
    required ClerkClient client,
    required String supabaseUrl,
    required String supabaseAnonKey,
    FlutterSecureStorage? storage,
  }) async {
    if (_instance != null) return;
    final session = ClerkSession._(
      client: client,
      storage: storage ?? const FlutterSecureStorage(),
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: supabaseAnonKey,
    );
    _instance = session;
    await session._restore();
  }

  /// Test-only seam to install a fake or wipe state between tests.
  @visibleForTesting
  static void setForTest(ClerkSession? session) {
    _instance = session;
  }

  static const _kSessionId = 'clerk_session_id';
  static const _kPublicUserId = 'clerk_public_user_id';

  /// JWT refresh cadence. Clerk session tokens have a 60s TTL on this
  /// instance; refresh well before that to avoid Supabase requests racing
  /// with expiry.
  static const _refreshInterval = Duration(seconds: 40);

  /// If [currentJwt] is called and the cached JWT is closer than this to
  /// expiry, force an inline refresh before returning it.
  static const _inlineRefreshThreshold = Duration(seconds: 10);

  final ClerkClient _client;
  final FlutterSecureStorage _storage;
  final String _supabaseUrl;
  final String _supabaseAnonKey;

  final StreamController<bool> _authStateController =
      StreamController<bool>.broadcast();

  String? _sessionId;
  String? _publicUserId;
  String? _cachedJwt;
  DateTime? _jwtExpiresAt;
  Timer? _refreshTimer;

  /// Stream of auth-state changes. Emits `true` when the user becomes
  /// authenticated, `false` when signed out. Replays the current value to
  /// new listeners.
  Stream<bool> get authStateChanges {
    return Stream<bool>.multi((controller) {
      // Replay current state to the new subscriber.
      controller.add(isAuthenticated);
      final sub = _authStateController.stream.listen(
        controller.add,
        onError: controller.addError,
        onDone: controller.close,
      );
      controller.onCancel = sub.cancel;
    });
  }

  bool get isAuthenticated => _sessionId != null && _publicUserId != null;

  /// The `public.users.id` uuid for the current user. NULL when signed out.
  /// This is what [analytics_service], [report_service], and any user-scoped
  /// table inserts (e.g., `station_listens.user_id`) should use.
  String? get publicUserId => _publicUserId;

  /// The Clerk session id (`sess_...`). Mostly internal; exposed for
  /// debugging/instrumentation.
  String? get sessionId => _sessionId;

  /// Return a current Clerk session JWT for use with Supabase REST. Mints a
  /// fresh one if the cached value is missing or close to expiry. Returns
  /// `null` if the user is not signed in.
  ///
  /// This is the function passed to [Supabase.initialize] as `accessToken`.
  Future<String?> currentJwt() async {
    final sid = _sessionId;
    if (sid == null) return null;

    final cached = _cachedJwt;
    final expiry = _jwtExpiresAt;
    final now = DateTime.now();
    if (cached != null &&
        expiry != null &&
        expiry.isAfter(now.add(_inlineRefreshThreshold))) {
      return cached;
    }

    return _refreshJwt(sid);
  }

  /// Called by AuthService after the Clerk sign-in (or email-code completion)
  /// reaches `status: complete`. Looks up `public.users.id` via the new JWT,
  /// persists session state, starts the refresh timer, and announces
  /// authenticated=true to listeners.
  Future<void> onSignInComplete({required String sessionId}) async {
    final jwt = await _refreshJwt(sessionId);
    if (jwt == null) {
      throw StateError(
        'Could not mint a JWT for sessionId=$sessionId after sign-in.',
      );
    }
    final publicUserId = await _lookupPublicUserId(jwt);
    if (publicUserId == null) {
      throw StateError(
        'JWT minted but public.users lookup returned no row. Webhook may be '
        'lagging on user.created event.',
      );
    }
    _sessionId = sessionId;
    _publicUserId = publicUserId;
    await _storage.write(key: _kSessionId, value: sessionId);
    await _storage.write(key: _kPublicUserId, value: publicUserId);
    _startRefreshTimer();
    _authStateController.add(true);
  }

  /// Revoke the Clerk session and clear persisted state. Preserves the
  /// device-trust token (so next sign-in skips email-code).
  Future<void> signOut() async {
    final sid = _sessionId;
    if (sid != null) {
      try {
        await _client.signOut(sessionId: sid);
      } catch (e) {
        // Network or already-revoked errors shouldn't block local sign-out.
        debugPrint('ClerkSession.signOut: revoke failed: $e');
      }
    }
    await _clearLocal();
  }

  /// Wipe persisted local state without calling Clerk. Useful when restore
  /// detects a stale/invalid session.
  Future<void> _clearLocal() async {
    _refreshTimer?.cancel();
    _refreshTimer = null;
    _sessionId = null;
    _publicUserId = null;
    _cachedJwt = null;
    _jwtExpiresAt = null;
    await _storage.delete(key: _kSessionId);
    await _storage.delete(key: _kPublicUserId);
    _authStateController.add(false);
  }

  /// On app launch: read persisted state, try to mint a JWT. If successful,
  /// the user is signed in; if not (session revoked, dev token rotated by
  /// Clerk, etc.), clear local state and emit signed-out.
  Future<void> _restore() async {
    final storedSession = await _storage.read(key: _kSessionId);
    final storedPublicUser = await _storage.read(key: _kPublicUserId);

    if (storedSession == null || storedPublicUser == null) {
      _authStateController.add(false);
      return;
    }

    try {
      final jwt = await _refreshJwt(storedSession);
      if (jwt == null) {
        await _clearLocal();
        return;
      }
      _sessionId = storedSession;
      _publicUserId = storedPublicUser;
      _startRefreshTimer();
      _authStateController.add(true);
    } catch (e) {
      debugPrint('ClerkSession._restore failed: $e');
      await _clearLocal();
    }
  }

  /// Mint a fresh JWT for [sessionId] and update the cache + expiry.
  Future<String?> _refreshJwt(String sessionId) async {
    try {
      final jwt = await _client.getToken(sessionId: sessionId);
      _cachedJwt = jwt;
      _jwtExpiresAt = _readExpFromJwt(jwt);
      return jwt;
    } on ClerkException catch (e) {
      // 404/401 = session revoked or expired. Caller decides what to do.
      debugPrint('ClerkSession._refreshJwt failed: $e');
      return null;
    }
  }

  void _startRefreshTimer() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(_refreshInterval, (_) {
      final sid = _sessionId;
      if (sid == null) return;
      // Fire-and-forget; on failure we just leave the cache to expire and
      // the next inline call will retry.
      unawaited(_refreshJwt(sid));
    });
  }

  /// Look up `public.users.id` for the signed-in user. Uses the freshly
  /// minted JWT directly (not the supabase_flutter client) because Supabase
  /// may not be fully initialized when this is called, and to avoid a
  /// chicken-and-egg with the `accessToken` callback.
  Future<String?> _lookupPublicUserId(String jwt) async {
    final url = Uri.parse('$_supabaseUrl/rest/v1/users?select=id&limit=1');
    final response = await http.get(
      url,
      headers: {
        'apikey': _supabaseAnonKey,
        'Authorization': 'Bearer $jwt',
      },
    );
    if (response.statusCode != 200) {
      debugPrint(
        'ClerkSession._lookupPublicUserId status=${response.statusCode}: '
        '${response.body}',
      );
      return null;
    }
    final rows = jsonDecode(response.body) as List;
    if (rows.isEmpty) return null;
    return (rows.first as Map<String, dynamic>)['id'] as String?;
  }

  static DateTime? _readExpFromJwt(String jwt) {
    try {
      final parts = jwt.split('.');
      if (parts.length < 2) return null;
      final payloadJson = utf8.decode(base64.decode(base64.normalize(parts[1])));
      final payload = jsonDecode(payloadJson) as Map<String, dynamic>;
      final exp = payload['exp'];
      if (exp is! int) return null;
      return DateTime.fromMillisecondsSinceEpoch(exp * 1000, isUtc: true);
    } catch (_) {
      return null;
    }
  }
}
