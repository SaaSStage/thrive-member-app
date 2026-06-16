/// Authentication facade for THRIVE Radio v3.
///
/// Public API is preserved across the Clerk migration so callers in
/// [login_screen], [register_screen], [forgot_password_screen],
/// [navigation_drawer], and [auth_gate] don't need to change.
///
/// Internally, all auth flows now go through [ClerkClient] (raw Clerk
/// Frontend API HTTP) and [ClerkSession] (auth state controller). The legacy
/// `supabase.auth.*` namespace is no longer used for sign-in/sign-up.
///
/// **v1 scope (chunk 2b):**
/// - [signIn] — wired through ClerkClient; returns `AuthResult` indicating
///   whether email-code device verification is needed next.
/// - [completeEmailCodeVerification] — finishes a sign-in that returned
///   `requiresEmailConfirmation: true`.
/// - [signOut] — revokes the Clerk session, preserves device trust.
/// - [getProfile] / [hasProfile] / [updateProfile] — query `public.users`.
///
/// Stubbed (functional in chunks 4+/v2):
/// - [signUp] — Clerk Frontend API path exists but the v1 UI is invite-only;
///   this returns `AuthResult.failure` to make accidental UI exposure obvious.
/// - [resetPassword] — same; chunk 4 wires the Clerk reset-password strategy.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:radio_online/auth/config/supabase_config.dart';
import 'package:radio_online/auth/models/user_profile.dart';
import 'package:radio_online/auth/services/analytics_service.dart';
import 'package:radio_online/auth/services/clerk_client.dart';
import 'package:radio_online/auth/services/clerk_session.dart';

/// Result of an authentication operation.
class AuthResult {
  AuthResult({
    required this.success,
    this.errorMessage,
    this.profile,
    this.requiresEmailConfirmation = false,
    this.signInAttemptId,
    this.signInEmail,
  });

  factory AuthResult.success({
    UserProfile? profile,
    bool requiresEmailConfirmation = false,
    String? signInAttemptId,
    String? signInEmail,
  }) {
    return AuthResult(
      success: true,
      profile: profile,
      requiresEmailConfirmation: requiresEmailConfirmation,
      signInAttemptId: signInAttemptId,
      signInEmail: signInEmail,
    );
  }

  factory AuthResult.failure(String message) {
    return AuthResult(success: false, errorMessage: message);
  }

  final bool success;
  final String? errorMessage;
  final UserProfile? profile;

  /// True when Clerk requires the user to confirm device trust via a 6-digit
  /// email code. The UI should navigate to an email-code-entry screen and
  /// call [AuthService.completeEmailCodeVerification] with the code +
  /// [signInAttemptId].
  final bool requiresEmailConfirmation;

  /// The Clerk sign-in attempt id (`sia_...`). Pass to
  /// [completeEmailCodeVerification] when the user has the email code.
  final String? signInAttemptId;

  /// The email the code was sent to — useful for the UI to display
  /// ("We emailed a code to you@…").
  final String? signInEmail;
}

class AuthService {
  AuthService._({required ClerkClient client}) : _client = client;

  /// Wires up the singleton with the constructed [ClerkClient] from
  /// `main.dart`. Call exactly once before any UI tries to read
  /// [AuthService.instance].
  static void bootstrap({required ClerkClient client}) {
    _instance ??= AuthService._(client: client);
  }

  static AuthService? _instance;

  static AuthService get instance {
    final i = _instance;
    if (i == null) {
      throw StateError(
        'AuthService.bootstrap() must be called before AuthService.instance.',
      );
    }
    return i;
  }

  final ClerkClient _client;
  final AnalyticsService _analytics = AnalyticsService.instance;

  UserProfile? _cachedProfile;
  UserProfile? get cachedProfile => _cachedProfile;

  /// Stream of auth-state changes (signed in → true; signed out → false).
  Stream<bool> get authStateChanges =>
      ClerkSession.instance.authStateChanges;

  bool get isAuthenticated => ClerkSession.instance.isAuthenticated;

  /// No-op placeholder kept for source compatibility with the prior Supabase
  /// implementation (called from [AuthGate.initState] in earlier code). The
  /// new [ClerkSession.bootstrap] does the restore work; nothing to do here.
  void initSessionRestoreHandler() {}

  // ============================================
  // SIGN IN (chunk 2b — wired)
  // ============================================

  /// Sign in with email and password.
  ///
  /// Returns:
  /// - `AuthResult.success(requiresEmailConfirmation: true, signInAttemptId)`
  ///   if Clerk wants a 6-digit email code (first sign-in for this device,
  ///   per the "trust new device" policy). The UI should collect the code
  ///   and call [completeEmailCodeVerification].
  /// - `AuthResult.success()` (with no requiresEmailConfirmation flag) when
  ///   the user is fully signed in — [ClerkSession] is now authenticated
  ///   and the AuthGate will route to the main app.
  /// - `AuthResult.failure(message)` on any error.
  Future<AuthResult> signIn({
    required String email,
    required String password,
  }) async {
    try {
      final attempt = await _client.signInWithPassword(
        email: email,
        password: password,
      );

      if (attempt.isComplete) {
        await ClerkSession.instance.onSignInComplete(
          sessionId: attempt.createdSessionId!,
        );
        await _loadCachedProfile();
        return AuthResult.success(profile: _cachedProfile);
      }

      if (attempt.needsEmailCode) {
        await _client.prepareEmailCodeVerification(attempt: attempt);
        return AuthResult.success(
          requiresEmailConfirmation: true,
          signInAttemptId: attempt.id,
          signInEmail: email,
        );
      }

      return AuthResult.failure(
        'Sign in could not be completed (status: ${attempt.status}). '
        'Please try again or contact support.',
      );
    } on ClerkException catch (e) {
      return AuthResult.failure(_mapClerkError(e));
    } catch (e) {
      return AuthResult.failure('An unexpected error occurred: $e');
    }
  }

  /// Complete a sign-in that was paused on Clerk's email-code device
  /// verification step. Pass the 6-digit code the user entered and the
  /// `signInAttemptId` from the prior [signIn] result.
  Future<AuthResult> completeEmailCodeVerification({
    required String signInAttemptId,
    required String code,
  }) async {
    try {
      // Reconstruct a minimal SignInAttempt — we only need [id] for the
      // request URL. The remaining fields are placeholders that mirror what
      // Clerk had returned in the prior step.
      final attempt = SignInAttempt(
        id: signInAttemptId,
        status: 'needs_second_factor',
        createdSessionId: null,
        supportedSecondFactors: const ['email_code'],
        firstFactorVerified: true,
      );
      final completed = await _client.attemptEmailCodeVerification(
        attempt: attempt,
        code: code,
      );

      if (!completed.isComplete) {
        return AuthResult.failure(
          'Verification did not complete (status: ${completed.status}). '
          'Please try again.',
        );
      }

      await ClerkSession.instance.onSignInComplete(
        sessionId: completed.createdSessionId!,
      );
      await _loadCachedProfile();
      return AuthResult.success(profile: _cachedProfile);
    } on ClerkException catch (e) {
      return AuthResult.failure(_mapClerkError(e));
    } catch (e) {
      return AuthResult.failure('An unexpected error occurred: $e');
    }
  }

  // ============================================
  // SIGN OUT (chunk 2b — wired)
  // ============================================

  Future<AuthResult> signOut() async {
    try {
      unawaited(_analytics.endCurrentListenSession());
      await ClerkSession.instance.signOut();
      _cachedProfile = null;
      return AuthResult.success();
    } catch (e) {
      return AuthResult.failure('Sign out failed: $e');
    }
  }

  // ============================================
  // SIGN UP (chunk 4/v2 — stubbed)
  // ============================================

  /// Email/password sign-up. **Not exposed in v1 UI** (invite-only). The
  /// method signature is preserved so future v2 work can wire it up to the
  /// Clerk Frontend API `sign_ups` flow without touching callers.
  Future<AuthResult> signUp({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    String? phone,
  }) async {
    return AuthResult.failure(
      'Sign-up is invite-only. Please use the invitation link you received '
      'from your provider.',
    );
  }

  // ============================================
  // PASSWORD RESET (chunk 4 — stubbed)
  // ============================================

  Future<String?> resetPassword(String email) async {
    return 'Password reset is not yet available in this build. Please '
        'contact support.';
  }

  // ============================================
  // PROFILE (chunk 2b — wired to public.users)
  // ============================================

  /// Fetch the current user's `public.users` row. Returns null if not
  /// signed in or if the row is missing (e.g., webhook bootstrap pending).
  Future<UserProfile?> getProfile() async {
    if (!isAuthenticated) return null;
    try {
      final response = await supabase
          .from('users')
          .select()
          .limit(1)
          .maybeSingle();
      if (response == null) return null;
      _cachedProfile = UserProfile.fromJson(response);
      return _cachedProfile;
    } catch (e) {
      debugPrint('Error fetching profile: $e');
      return null;
    }
  }

  Future<bool> hasProfile() async {
    final profile = await getProfile();
    return profile != null;
  }

  /// Update the user's profile (currently: name, phone, avatar_url). The new
  /// schema dropped `first_name`/`last_name`; if both are passed, they're
  /// concatenated into `name`.
  Future<AuthResult> updateProfile({
    String? firstName,
    String? lastName,
    String? name,
    String? phone,
  }) async {
    if (!isAuthenticated) return AuthResult.failure('Not authenticated');

    try {
      final updates = <String, dynamic>{};
      final resolvedName = name ??
          ((firstName != null || lastName != null)
              ? '${firstName ?? ''} ${lastName ?? ''}'.trim()
              : null);
      if (resolvedName != null && resolvedName.isNotEmpty) {
        updates['name'] = resolvedName;
      }
      if (phone != null) updates['phone'] = phone;
      if (updates.isEmpty) return AuthResult.failure('No updates provided');

      final publicUserId = ClerkSession.instance.publicUserId!;
      await supabase
          .from('users')
          .update(updates)
          .eq('id', publicUserId);

      final profile = await getProfile();
      return AuthResult.success(profile: profile);
    } catch (e) {
      return AuthResult.failure('Failed to update profile: $e');
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  Future<void> _loadCachedProfile() async {
    _cachedProfile = await getProfile();
  }

  String _mapClerkError(ClerkException e) {
    final code = e.code ?? '';
    if (code == 'form_password_incorrect' ||
        code == 'form_identifier_not_found') {
      return 'Invalid email or password';
    }
    if (code == 'form_code_incorrect') {
      return 'That code is not correct. Check the email and try again.';
    }
    if (code == 'verification_expired') {
      return 'That code has expired. Sign in again to receive a new one.';
    }
    if (code == 'session_exists') {
      return 'You are already signed in.';
    }
    if (code == 'too_many_requests') {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    return e.message;
  }
}
