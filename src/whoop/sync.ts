/**
 * Thin wrapper over the `whoop-sync` edge function.
 *
 * The edge function runs server-side: it reads the member's stored WHOOP
 * tokens (never on the device), fetches from the WHOOP API, and upserts
 * rows into whoop_daily / whoop_workouts. The client only triggers it.
 *
 * Returns a typed result union so callers can branch without string matching.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type WhoopSyncResult =
  | { kind: 'synced'; counts: Record<string, number> }
  | { kind: 'skipped'; reason: string }
  | { kind: 'unlinked' }
  | { kind: 'reauth_required' };

export async function runWhoopSync(supabase: SupabaseClient): Promise<WhoopSyncResult> {
  const { data, error } = await supabase.functions.invoke('whoop-sync', { body: {} });

  if (error) throw error;

  const d = data as Record<string, unknown>;

  if (d.reauth_required) return { kind: 'reauth_required' };
  if (d.linked === false) return { kind: 'unlinked' };
  if (d.skipped === true) return { kind: 'skipped', reason: String(d.reason ?? 'unknown') };
  if (d.synced === true) return { kind: 'synced', counts: (d.counts ?? {}) as Record<string, number> };

  // Defensive fallback — treat unexpected shapes as skipped.
  return { kind: 'skipped', reason: 'unexpected_response' };
}
