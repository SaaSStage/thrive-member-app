/**
 * TanStack Query hooks for WHOOP cloud data. Mirrors profile.ts / hrv.ts.
 *
 * Token contract: tokens are NEVER on the device. The app only:
 *   1. Runs the OAuth front-channel (runWhoopOAuth) and sends the code to
 *      the `whoop-link` edge function.
 *   2. Calls the `whoop-sync` edge function to trigger a server-side pull.
 *   3. Reads its own WHOOP data from whoop_daily / whoop_workouts (RLS
 *      select-own) and link status from the SECURITY DEFINER RPC.
 *
 * Query keys:
 *   ['whoop-link-status']     — link + last-sync metadata
 *   ['whoop-daily', days]     — per-day recovery / HRV rows
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSupabase } from '@/api/supabase';
import { useWhoopStore } from '@/stores/whoop-store';
import { runWhoopOAuth } from '@/whoop/oauth';
import { runWhoopSync } from '@/whoop/sync';

// ---- Types ------------------------------------------------------------------

export type WhoopLinkStatus =
  | { state: 'unlinked' }
  | {
      state: 'linked';
      scope: string | null;
      lastSyncedAt: string | null;
      lastSyncStatus: string | null;
      whoopUserId: string | null;
    }
  | { state: 'reauth_required' };

/** One row from `whoop_daily` — explicit columns, no `*`. */
export type WhoopDailyRow = {
  day: string;
  recovery_score: number | null;
  hrv_rmssd_ms: number | null;
  resting_hr_bpm: number | null;
  spo2_pct: number | null;
  skin_temp_c: number | null;
  sleep_performance_pct: number | null;
  sleep_total_minutes: number | null;
  sleep_rem_minutes: number | null;
  sleep_deep_minutes: number | null;
  sleep_light_minutes: number | null;
  respiratory_rate: number | null;
  strain: number | null;
  cycle_avg_hr_bpm: number | null;
  cycle_max_hr_bpm: number | null;
};

const DAILY_COLUMNS = [
  'day',
  'recovery_score',
  'hrv_rmssd_ms',
  'resting_hr_bpm',
  'spo2_pct',
  'skin_temp_c',
  'sleep_performance_pct',
  'sleep_total_minutes',
  'sleep_rem_minutes',
  'sleep_deep_minutes',
  'sleep_light_minutes',
  'respiratory_rate',
  'strain',
  'cycle_avg_hr_bpm',
  'cycle_max_hr_bpm',
].join(', ');

// ---- Hooks ------------------------------------------------------------------

/**
 * Link status from the SECURITY DEFINER RPC — no tokens ever returned.
 * Maps the nullable RPC response to a typed discriminated union.
 */
export function useWhoopLinkStatus() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['whoop-link-status'],
    queryFn: async (): Promise<WhoopLinkStatus> => {
      const { data, error } = await supabase.rpc('whoop_link_status');
      if (error) throw error;

      if (!data) return { state: 'unlinked' };

      const row = data as {
        linked: boolean;
        scope: string | null;
        last_synced_at: string | null;
        last_sync_status: string | null;
        whoop_user_id: string | null;
      };

      if (!row.linked) return { state: 'unlinked' };
      if (row.last_sync_status === 'reauth_required') return { state: 'reauth_required' };

      return {
        state: 'linked',
        scope: row.scope,
        lastSyncedAt: row.last_synced_at,
        lastSyncStatus: row.last_sync_status,
        whoopUserId: row.whoop_user_id,
      };
    },
  });
}

/**
 * Connect WHOOP: OAuth front-channel → `whoop-link` edge function.
 * On success, invalidates link-status and whoop-daily, then triggers a sync.
 */
export function useConnectWhoop() {
  const supabase = useSupabase();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { code, codeVerifier, redirectUri } = await runWhoopOAuth();
      const { data, error } = await supabase.functions.invoke('whoop-link', {
        body: { code, code_verifier: codeVerifier, redirect_uri: redirectUri },
      });
      if (error) throw error;
      return data as { linked: true; whoop_user_id: string; scope: string };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['whoop-link-status'] });
      await qc.invalidateQueries({ queryKey: ['whoop-daily'] });
      // Best-effort immediate sync after linking.
      try {
        await runWhoopSync(supabase);
        await qc.invalidateQueries({ queryKey: ['whoop-daily'] });
      } catch {
        // Non-fatal — sync will run on next foreground.
      }
    },
  });
}

/** Unlink WHOOP: calls `whoop-unlink` and clears all local caches. */
export function useUnlinkWhoop() {
  const supabase = useSupabase();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('whoop-unlink', { body: {} });
      if (error) throw error;
      return data as { linked: false };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['whoop-link-status'] });
      await qc.invalidateQueries({ queryKey: ['whoop-daily'] });
    },
  });
}

/**
 * On-demand sync trigger. Guards against concurrent calls with the Zustand
 * `syncing` flag. The real throttle is server-side.
 *
 * On `reauth_required` the link-status is invalidated so the UI shows
 * "Reconnect". On `synced` the daily data cache is invalidated.
 */
export function useDailySync() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { syncing, setSyncing } = useWhoopStore();

  async function triggerSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await runWhoopSync(supabase);
      if (result.kind === 'reauth_required') {
        await qc.invalidateQueries({ queryKey: ['whoop-link-status'] });
      } else if (result.kind === 'synced') {
        await qc.invalidateQueries({ queryKey: ['whoop-daily'] });
      }
    } finally {
      setSyncing(false);
    }
  }

  return { triggerSync, syncing };
}

/**
 * Per-day WHOOP data for the last `days` days.
 * Rows come back ascending (oldest→newest) for charting.
 * Explicit columns — never `*`.
 */
export function useWhoopDailyData(days = 30) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['whoop-daily', days],
    queryFn: async (): Promise<WhoopDailyRow[]> => {
      const { data, error } = await supabase
        .from('whoop_daily')
        .select(DAILY_COLUMNS)
        .order('day', { ascending: false })
        .limit(days);
      if (error) throw error;
      // Reverse so charts get oldest-first.
      return ((data ?? []) as unknown as WhoopDailyRow[]).reverse();
    },
  });
}
