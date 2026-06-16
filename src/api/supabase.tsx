/**
 * Supabase client bound to the Clerk session.
 *
 * Port of the v3 Flutter wiring (auth/config/supabase_config.dart): the client
 * authenticates every REST/RLS request with the current Clerk session JWT via
 * the `accessToken` callback. We never use the supabase.auth namespace — Clerk
 * owns identity; RLS resolves the member from the JWT (current_user_id()).
 *
 * The Clerk Expo SDK + its token cache handle JWT minting/refresh/persistence,
 * so unlike the Flutter app we don't hand-roll the 60s refresh timer.
 */
import { useSession } from '@clerk/clerk-expo';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local',
  );
}

const SupabaseContext = createContext<SupabaseClient | null>(null);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();

  // Recreate the client when the Clerk session changes (sign-in / sign-out)
  // so the accessToken callback closes over the right session.
  const client = useMemo(
    () =>
      createClient(supabaseUrl!, supabaseAnonKey!, {
        accessToken: async () => (session ? ((await session.getToken()) ?? null) : null),
      }),
    [session],
  );

  return <SupabaseContext.Provider value={client}>{children}</SupabaseContext.Provider>;
}

export function useSupabase(): SupabaseClient {
  const client = useContext(SupabaseContext);
  if (!client) {
    throw new Error('useSupabase must be used inside <SupabaseProvider>');
  }
  return client;
}
