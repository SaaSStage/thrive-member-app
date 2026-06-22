// Runs before any module is imported (jest `setupFiles`). Several app modules
// (e.g. src/api/supabase.tsx) throw at import time if their EXPO_PUBLIC_* env
// vars are missing — jest doesn't load .env.local the way `expo` does. Inject
// harmless placeholders so pure-logic tests can import app modules without real
// credentials. Tests must never hit the network with these.
process.env.EXPO_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||= 'pk_test_placeholder';
process.env.EXPO_PUBLIC_AZURACAST_BASE_URL ||= 'http://localhost:8000';
