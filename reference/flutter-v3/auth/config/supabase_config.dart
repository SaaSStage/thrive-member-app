/// Supabase configuration for THRIVE Radio v3.
///
/// As of chunk 2b (2026-05-19), authentication runs on Clerk via
/// [ClerkSession]; the `accessToken` callback below feeds the current Clerk
/// JWT to `supabase_flutter` so REST queries authenticate against the v3
/// Supabase project's third-party Clerk integration. Supabase Auth (the
/// supabase.auth namespace) is no longer the source of truth for "is the user
/// signed in" — query [ClerkSession.instance.isAuthenticated] instead.
library;

import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:radio_online/auth/services/clerk_session.dart';

/// Supabase project URL — v3 dev project (`yotaqkgfpifomudtwgzr`).
const String supabaseUrl = 'https://yotaqkgfpifomudtwgzr.supabase.co';

/// Supabase anonymous key (safe to include in client code; all real
/// authorization runs through RLS against the Clerk JWT).
const String supabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdGFxa2dmcGlmb211ZHR3Z3pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODc3OTUsImV4cCI6MjA5NDM2Mzc5NX0.3TpoA4G6NuIMstluKamoz4GUH007mMx6yaNAVwbVXlU';

/// Initialize Supabase. Call AFTER [ClerkSession.bootstrap] so the
/// `accessToken` callback can safely reach [ClerkSession.instance].
Future<void> initializeSupabase() async {
  await Supabase.initialize(
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    accessToken: () => ClerkSession.instance.currentJwt(),
  );
}

/// Get the Supabase client instance.
SupabaseClient get supabase => Supabase.instance.client;

/// Whether the current user is signed in (delegates to [ClerkSession]).
bool get isAuthenticated => ClerkSession.instance.isAuthenticated;

/// The current user's `public.users.id` uuid (NOT the Clerk user id). Use
/// this for FK columns like `station_listens.user_id`. Null when signed out.
String? get currentUserId => ClerkSession.instance.publicUserId;
