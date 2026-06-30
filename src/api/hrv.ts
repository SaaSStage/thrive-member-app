/**
 * Persistence for live-HRV capture sessions. Each session is bound to the one
 * station it ran on (`content_asset_id`) so we can analyse how a frequency moved
 * the member's HRV. Writes go through the Clerk-bound Supabase client; RLS scopes
 * rows to the member (`client_id = current_user_id()`). Mirrors profile.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSupabase } from '@/api/supabase';
import type { HrvSessionSummary } from '@/stores/hrv-store';

export type HrvSession = {
  id: string;
  content_asset_id: string | null;
  station_code: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  avg_rmssd: number | null;
  min_rmssd: number | null;
  max_rmssd: number | null;
  sample_count: number;
};

const COLUMNS =
  'id, content_asset_id, station_code, started_at, ended_at, duration_seconds, avg_rmssd, min_rmssd, max_rmssd, sample_count';

/** Persist a finished capture. Returns the inserted row (for the results screen). */
export function useSaveHrvSession() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (summary: HrvSessionSummary): Promise<HrvSession> => {
      const { data: id, error: idErr } = await supabase.rpc('current_user_id');
      if (idErr || !id) throw idErr ?? new Error('Not signed in.');

      // Resolve the member's active practice. hrv_sessions.practice_id is NOT NULL
      // (every member belongs to a practice — same invariant voice_submissions
      // enforces). The one-active-practice constraint makes "the active one"
      // unambiguous; with none we throw rather than write a tenant-less row. The
      // save is best-effort/background, so this just surfaces as "not saved".
      const { data: pm, error: pmErr } = await supabase
        .from('practice_memberships')
        .select('practice_id')
        .eq('user_id', id)
        .eq('status', 'active')
        .maybeSingle();
      if (pmErr) throw pmErr;
      if (!pm?.practice_id) throw new Error('No active practice membership found for this account.');

      const { data, error } = await supabase
        .from('hrv_sessions')
        .insert({
          client_id: id,
          practice_id: pm.practice_id,
          content_asset_id: summary.station.id,
          station_code: summary.station.code,
          started_at: new Date(summary.startedAt).toISOString(),
          ended_at: new Date(summary.endedAt).toISOString(),
          duration_seconds: summary.durationSeconds,
          avg_rmssd: summary.avgRmssd,
          min_rmssd: summary.minRmssd,
          max_rmssd: summary.maxRmssd,
          sample_count: summary.sampleCount,
          // Full record (jsonb) — not read by list queries; for later reprocessing.
          rr_intervals_ms: summary.rrIntervalsMs,
          rmssd_series: summary.rmssdSeries,
          bpm_series: summary.bpmSeries,
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return data as HrvSession;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hrv-sessions'] }),
  });
}

/** Recent capture sessions, newest first (for a future history screen). */
export function useHrvSessions(limit = 30) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['hrv-sessions', limit],
    queryFn: async (): Promise<HrvSession[]> => {
      const { data, error } = await supabase
        .from('hrv_sessions')
        .select(COLUMNS)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as HrvSession[];
    },
  });
}
