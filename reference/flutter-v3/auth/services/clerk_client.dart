/// Clerk Frontend API client for native mobile flows.
///
/// Talks directly to https://<your-instance>.clerk.accounts.dev/v1/client/...
/// using raw HTTP + the publishable key. There is no separate auth-clerk-bridge
/// edge function — the portal's existing Clerk webhook at
/// /api/webhooks/clerk handles public.users row bootstrap on user.created.
///
/// Auth-header rotation: Clerk's native flows use a "dev session token" pattern.
/// The first request in a sign-in flow goes out with Authorization: Bearer <pk>.
/// Clerk returns a new value in the *response* Authorization header that
/// represents the persistent client identity for this app install. Subsequent
/// requests must use that returned token verbatim (it's not prefixed with
/// Bearer; pass it as-is). We capture and persist it via TokenStore so it
/// survives across app restarts — that's what makes the device "trusted" after
/// first email-code verification.
library;

import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

/// Persistent storage for the Clerk dev session token.
///
/// The mobile app implementation uses flutter_secure_storage. Tests can pass
/// an in-memory implementation.
abstract class ClerkTokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

/// Result of starting (or progressing) a sign-in attempt.
///
/// Inspect [status] + helpers to decide the next step:
/// - [isComplete] → call [ClerkClient.getToken] with [createdSessionId].
/// - [needsEmailCode] → call [ClerkClient.prepareEmailCodeVerification], wait
///   for the user to paste the 6-digit code, then call
///   [ClerkClient.attemptEmailCodeVerification].
class SignInAttempt {
  const SignInAttempt({
    required this.id,
    required this.status,
    required this.createdSessionId,
    required this.supportedSecondFactors,
    required this.firstFactorVerified,
  });

  /// Clerk sign-in attempt id, e.g. `sia_3Dx...`.
  final String id;

  /// One of: `complete`, `needs_first_factor`, `needs_second_factor`,
  /// `needs_identifier`, `abandoned`, etc.
  final String status;

  /// Populated when status == 'complete'. Pass to [ClerkClient.getToken].
  final String? createdSessionId;

  /// Strategies the user can use to complete second-factor verification.
  /// In practice for our instance: `['email_code']` for first-install
  /// device verification.
  final List<String> supportedSecondFactors;

  /// True if Clerk has accepted the first factor (e.g., the password matched).
  /// Useful to distinguish "wrong password" from "right password + email code
  /// still needed."
  final bool firstFactorVerified;

  bool get isComplete => status == 'complete' && createdSessionId != null;

  bool get needsEmailCode =>
      status == 'needs_second_factor' &&
      supportedSecondFactors.contains('email_code');
}

/// Thrown when Clerk returns a 4xx/5xx response or an unparseable body.
class ClerkException implements Exception {
  ClerkException(this.message, {this.code, this.statusCode});

  factory ClerkException.fromResponse(http.Response response) {
    try {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final errors = (json['errors'] as List?) ?? const <Object?>[];
      final first = errors.isNotEmpty
          ? errors.first as Map<String, dynamic>
          : null;
      return ClerkException(
        (first?['long_message'] as String?) ??
            (first?['message'] as String?) ??
            'Clerk error',
        code: first?['code'] as String?,
        statusCode: response.statusCode,
      );
    } catch (_) {
      return ClerkException(
        'Clerk error (status ${response.statusCode}): ${response.body}',
        statusCode: response.statusCode,
      );
    }
  }

  final String message;
  final String? code;
  final int? statusCode;

  @override
  String toString() =>
      'ClerkException(code: $code, status: $statusCode, message: $message)';
}

class ClerkClient {
  ClerkClient({
    required this.publishableKey,
    required this.frontendApiHost,
    required ClerkTokenStore tokenStore,
    http.Client? httpClient,
  })  : _store = tokenStore,
        _http = httpClient ?? http.Client();

  /// Publishable key (`pk_test_...` for dev, `pk_live_...` for prod). Safe to
  /// embed in client code — Clerk treats it as a client identifier, not a
  /// secret.
  final String publishableKey;

  /// The Frontend API host, e.g. `eager-calf-94.clerk.accounts.dev`. Decode it
  /// from the publishable key with [decodeFrontendApiHost].
  final String frontendApiHost;

  final ClerkTokenStore _store;
  final http.Client _http;

  /// In-memory cache of the persisted dev session token. Null until
  /// [initialize] is called, or until Clerk has returned a token via the
  /// response Authorization header.
  String? _devSessionToken;

  /// Decode the Frontend API host from a Clerk publishable key.
  static String decodeFrontendApiHost(String publishableKey) {
    final match = RegExp(r'^pk_(test|live)_(.+?)$').firstMatch(publishableKey);
    if (match == null) {
      throw ArgumentError('Not a valid Clerk publishable key');
    }
    final b64 = match.group(2)!.replaceAll(RegExp(r'\$+$'), '');
    final decoded = utf8.decode(base64.decode(b64));
    return decoded.replaceAll(RegExp(r'\$+$'), '');
  }

  /// Load any persisted dev session token from storage. Call once at app
  /// startup, before any other method.
  Future<void> initialize() async {
    _devSessionToken = await _store.read();
  }

  /// Wipe the persisted dev session token. Use this on sign-out if you want
  /// the next sign-in to re-trigger the email-code device verification.
  /// Typically you DON'T want this — preserving the token across sign-out is
  /// what makes the device "trusted" for subsequent logins.
  Future<void> clearDeviceTrust() async {
    _devSessionToken = null;
    await _store.clear();
  }

  /// Start a sign-in attempt with email + password.
  ///
  /// Possible outcomes:
  /// - returned attempt's [SignInAttempt.isComplete] → call [getToken].
  /// - [SignInAttempt.needsEmailCode] → run the email-code flow.
  /// - [ClerkException] with code `form_password_incorrect` → wrong password.
  Future<SignInAttempt> signInWithPassword({
    required String email,
    required String password,
  }) async {
    final response = await _post(
      '/v1/client/sign_ins',
      body: {
        'identifier': email,
        'password': password,
        'strategy': 'password',
      },
    );
    return _parseSignInAttempt(response);
  }

  /// Tell Clerk to email a 6-digit code to the user as the second factor.
  ///
  /// [emailAddressId] is the `idn_...` id of the user's primary email; pull it
  /// from `attempt.supported_second_factors[].email_address_id` if you need to
  /// be precise, or pass null to let Clerk pick the default.
  Future<void> prepareEmailCodeVerification({
    required SignInAttempt attempt,
    String? emailAddressId,
  }) async {
    await _post(
      '/v1/client/sign_ins/${attempt.id}/prepare_second_factor',
      body: {
        'strategy': 'email_code',
        if (emailAddressId != null) 'email_address_id': emailAddressId,
      },
    );
  }

  /// Submit the 6-digit email code to complete second-factor verification.
  Future<SignInAttempt> attemptEmailCodeVerification({
    required SignInAttempt attempt,
    required String code,
  }) async {
    final response = await _post(
      '/v1/client/sign_ins/${attempt.id}/attempt_second_factor',
      body: {'strategy': 'email_code', 'code': code},
    );
    return _parseSignInAttempt(response);
  }

  /// Mint a session JWT for use with Supabase (or any Clerk-trusting service).
  ///
  /// **The JWT TTL is ~60 seconds on this Clerk instance.** Mobile must call
  /// this again before each expiry to refresh the token fed to
  /// `supabase_flutter`'s `accessToken` callback.
  Future<String> getToken({required String sessionId}) async {
    final response =
        await _post('/v1/client/sessions/$sessionId/tokens', body: const {});
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final jwt = (json['jwt'] ?? (json['response'] as Map?)?['jwt']) as String?;
    if (jwt == null || jwt.isEmpty) {
      throw ClerkException(
        'getToken response had no jwt',
        statusCode: response.statusCode,
      );
    }
    return jwt;
  }

  /// Revoke the Clerk session (sign-out). Does NOT clear the device-trust
  /// token; see [clearDeviceTrust] for that.
  Future<void> signOut({required String sessionId}) async {
    await _post('/v1/client/sessions/$sessionId/remove', body: const {});
  }

  // ---- internals --------------------------------------------------------

  Future<http.Response> _post(
    String path, {
    required Map<String, String> body,
  }) async {
    final url = Uri.parse('https://$frontendApiHost$path');
    final authorization = _devSessionToken ?? 'Bearer $publishableKey';

    final response = await _http.post(
      url,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authorization,
      },
      body: _encodeForm(body),
    );

    // Capture Clerk's rotated Authorization header. This is the device-trust
    // token that we persist for the lifetime of the app install.
    final returned = response.headers['authorization'];
    if (returned != null &&
        returned.isNotEmpty &&
        returned != _devSessionToken) {
      _devSessionToken = returned;
      await _store.write(returned);
    }

    if (response.statusCode >= 400) {
      throw ClerkException.fromResponse(response);
    }
    return response;
  }

  static String _encodeForm(Map<String, String> body) {
    return body.entries
        .map(
          (e) =>
              '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}',
        )
        .join('&');
  }

  static SignInAttempt _parseSignInAttempt(http.Response response) {
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final si =
        (json['response'] as Map<String, dynamic>?) ?? json;
    final firstFactor = si['first_factor_verification'] as Map<String, dynamic>?;
    final secondFactorsRaw = (si['supported_second_factors'] as List?) ?? const [];
    return SignInAttempt(
      id: si['id'] as String,
      status: si['status'] as String,
      createdSessionId: si['created_session_id'] as String?,
      supportedSecondFactors: [
        for (final f in secondFactorsRaw)
          (f as Map<String, dynamic>)['strategy'] as String,
      ],
      firstFactorVerified: firstFactor?['status'] == 'verified',
    );
  }
}
