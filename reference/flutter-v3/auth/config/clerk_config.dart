/// Clerk configuration for THRIVE Radio v3.
///
/// The publishable key is a client identifier, not a secret — it's safe to
/// include in client code. The Frontend API host is decoded from the key at
/// runtime by [ClerkClient.decodeFrontendApiHost].
///
/// Eager-calf-94 is the dev Clerk instance shared with the v3 Supabase
/// project (yotaqkgfpifomudtwgzr). When we cut a production Clerk app for
/// launch, swap this constant for the `pk_live_...` key.
library;

const String clerkPublishableKey =
    'pk_test_ZWFnZXItY2FsZi05NC5jbGVyay5hY2NvdW50cy5kZXYk';
