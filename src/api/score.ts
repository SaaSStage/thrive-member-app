/**
 * Latest vitality score for the signed-in member. The score is produced by the
 * backend (analyze-voice → generate-report) and stored in `analysis_results`,
 * keyed to a `voice_submissions` row. RLS scopes both tables to the member.
 *
 * We resolve the member's latest submission, then its analysis — so the screen
 * can distinguish "no submissions yet", "latest sample still analyzing", and
 * "score ready" (mirrors the v3 Flutter score_repository two-step).
 *
 * Beyond the composite Vitality Score (0-100) and its four subscores, we surface
 * the member-facing extras the backend produces: the plain-language wellness
 * narrative, the trend vs. prior submissions, and recommended protocols.
 */
import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@/api/supabase';

export type TrendDirection = 'improving' | 'stable' | 'declining';
export type Trend = { direction: TrendDirection; magnitude: number };

export type Subscore = {
  key: 'emotional_wellness' | 'cognitive_clarity' | 'physical_energy' | 'voice_power';
  label: string;
  description: string;
  value: number;
  trend: Trend | null;
};

export type ProtocolRec = {
  id: string;
  name: string;
  shortDescription: string;
  targetSubscore: string;
  durationMinutes: number | null;
  perWeek: number | null;
};

export type NarrativeStatus = 'pending' | 'generated' | 'narrative_failed';

export type ScoreResult =
  | { state: 'none' }
  | { state: 'analyzing'; pendingSince: string | null }
  | {
      state: 'ready';
      vitalityScore: number;
      subscores: Subscore[];
      vitalityTrend: Trend | null;
      narrative: string | null; // member-facing wellness narrative (markdown-ish)
      narrativeStatus: NarrativeStatus;
      protocols: ProtocolRec[];
      generatedAt: string | null;
      /** A submission newer than the one shown here is still being analyzed. */
      newerSampleAnalyzing: boolean;
      /** submitted_at of the newest still-analyzing submission (drives poll gating). */
      pendingSince: string | null;
    };

const SUBSCORE_META: { key: Subscore['key']; column: string; label: string; description: string }[] = [
  {
    key: 'emotional_wellness',
    column: 'subscore_emotional_wellness',
    label: 'Emotional Wellness',
    description: 'Mood, stress, and anxiety signals in your voice.',
  },
  {
    key: 'cognitive_clarity',
    column: 'subscore_cognitive_clarity',
    label: 'Cognitive Clarity',
    description: 'Sharpness, fluency, and mental engagement.',
  },
  {
    key: 'physical_energy',
    column: 'subscore_physical_energy',
    label: 'Physical Energy',
    description: 'Breath support, projection, and overall energy.',
  },
  {
    key: 'voice_power',
    column: 'subscore_voice_power',
    label: 'Voice Power',
    description: 'Strength, clarity, and steadiness of your voice.',
  },
];

const COLUMNS = [
  'vitality_score',
  'subscore_emotional_wellness',
  'subscore_cognitive_clarity',
  'subscore_physical_energy',
  'subscore_voice_power',
  'narratives',
  'narrative_status',
  'trend_data',
  'recommended_protocols',
  'generated_at',
].join(', ');

function parseTrend(t: unknown): Trend | null {
  if (!t || typeof t !== 'object') return null;
  const o = t as { direction?: string; magnitude?: number };
  if (o.direction !== 'improving' && o.direction !== 'stable' && o.direction !== 'declining') return null;
  return { direction: o.direction, magnitude: Number(o.magnitude ?? 0) };
}

function parseProtocols(rp: unknown): ProtocolRec[] {
  const byCategory = (rp as { by_category?: Record<string, unknown[]> })?.by_category;
  if (!byCategory || typeof byCategory !== 'object') return [];
  const seen = new Set<string>();
  const out: { rec: ProtocolRec; strength: number }[] = [];
  for (const list of Object.values(byCategory)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const p = item as Record<string, unknown>;
      const id = String(p.protocol_id ?? p.protocol_code ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        strength: Number(p.max_recommendation_strength ?? 0),
        rec: {
          id,
          name: String(p.name ?? 'Protocol'),
          shortDescription: String(p.short_description ?? ''),
          targetSubscore: String(p.target_subscore ?? ''),
          durationMinutes: p.duration_minutes != null ? Number(p.duration_minutes) : null,
          perWeek: p.recommended_frequency_per_week != null ? Number(p.recommended_frequency_per_week) : null,
        },
      });
    }
  }
  return out.sort((a, b) => b.strength - a.strength).map((x) => x.rec);
}

/** How many recent submissions to consider when finding the last ready score. */
const SUBMISSION_WINDOW = 10;
/** Poll cadence while an analysis is in flight. */
const POLL_INTERVAL_MS = 6_000;
/** Stop auto-polling this long after the pending submission (guards a failed/stuck analysis). */
const MAX_POLL_MS = 5 * 60_000;

/** Shape a finished analysis_results row into the member-facing 'ready' result. */
function toReadyResult(
  r: Record<string, any>,
  newerSampleAnalyzing: boolean,
  pendingSince: string | null,
): ScoreResult {
  const bySub = (r.trend_data as { by_subscore?: Record<string, unknown> })?.by_subscore ?? {};
  const narrativeStatus = (r.narrative_status as NarrativeStatus) ?? 'pending';
  return {
    state: 'ready',
    vitalityScore: Number(r.vitality_score),
    vitalityTrend: parseTrend((r.trend_data as { vitality?: unknown })?.vitality),
    narrativeStatus,
    narrative: narrativeStatus === 'generated' ? ((r.narratives as { wellness?: string })?.wellness ?? null) : null,
    protocols: parseProtocols(r.recommended_protocols),
    generatedAt: (r.generated_at as string) ?? null,
    newerSampleAnalyzing,
    pendingSince,
    subscores: SUBSCORE_META.map((m) => ({
      key: m.key,
      label: m.label,
      description: m.description,
      value: Number(r[m.column] ?? 0),
      trend: parseTrend((bySub as Record<string, unknown>)[m.key]),
    })),
  };
}

export function useLatestScore() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['latest-score'],
    // Poll ONLY while an analysis is actually in flight (newest submission not yet
    // scored) — true right after a submit, false once the score lands — so the
    // screen self-resolves but we never poll an idle, fully-scored account. Capped
    // so a permanently-failed analysis can't poll indefinitely.
    refetchInterval: (query) => {
      const d = query.state.data as ScoreResult | undefined;
      if (!d) return false;
      const inFlight = d.state === 'analyzing' || (d.state === 'ready' && d.newerSampleAnalyzing);
      if (!inFlight) return false;
      const since = d.pendingSince ? Date.parse(d.pendingSince) : NaN;
      if (!Number.isNaN(since) && Date.now() - since > MAX_POLL_MS) return false;
      return POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<ScoreResult> => {
      const { data: userId, error: idErr } = await supabase.rpc('current_user_id');
      if (idErr || !userId) throw idErr ?? new Error('Not signed in.');

      // Pull a window of recent submissions (newest first), not just the latest —
      // so a brand-new sample that's still analyzing doesn't hide the last ready score.
      const { data: submissions, error: subErr } = await supabase
        .from('voice_submissions')
        .select('id, submitted_at')
        .eq('client_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(SUBMISSION_WINDOW);
      if (subErr) throw subErr;
      const subs = (submissions ?? []) as { id: string; submitted_at: string }[];
      if (subs.length === 0) return { state: 'none' };

      const { data: arRows, error: arErr } = await supabase
        .from('analysis_results')
        .select(`submission_id, ${COLUMNS}`)
        .in(
          'submission_id',
          subs.map((s) => s.id),
        )
        .order('generated_at', { ascending: false });
      if (arErr) throw arErr;

      // Newest analysis_results row per submission (rows are already sorted desc).
      const bySubmission = new Map<string, Record<string, any>>();
      for (const row of (arRows ?? []) as Record<string, any>[]) {
        const sid = String(row.submission_id);
        if (!bySubmission.has(sid)) bySubmission.set(sid, row);
      }

      // The displayed score is the NEWEST submission that actually has a finished
      // analysis (vitality_score present). subs is newest-first.
      const newest = subs[0];
      let displayRow: Record<string, any> | null = null;
      let displayId: string | null = null;
      for (const s of subs) {
        const row = bySubmission.get(s.id);
        if (row && row.vitality_score != null) {
          displayRow = row;
          displayId = s.id;
          break;
        }
      }

      // Submissions exist but none is scored yet (first-ever sample still processing).
      if (!displayRow) return { state: 'analyzing', pendingSince: newest.submitted_at };

      // A newer submission than the one we're showing exists but isn't scored → still analyzing.
      const newerSampleAnalyzing = displayId !== newest.id;
      const pendingSince = newerSampleAnalyzing ? newest.submitted_at : null;
      return toReadyResult(displayRow, newerSampleAnalyzing, pendingSince);
    },
  });
}
