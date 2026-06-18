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
  | { state: 'analyzing' }
  | {
      state: 'ready';
      vitalityScore: number;
      subscores: Subscore[];
      vitalityTrend: Trend | null;
      narrative: string | null; // member-facing wellness narrative (markdown-ish)
      narrativeStatus: NarrativeStatus;
      protocols: ProtocolRec[];
      generatedAt: string | null;
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

export function useLatestScore() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['latest-score'],
    queryFn: async (): Promise<ScoreResult> => {
      const { data: userId, error: idErr } = await supabase.rpc('current_user_id');
      if (idErr || !userId) throw idErr ?? new Error('Not signed in.');

      const { data: submissions, error: subErr } = await supabase
        .from('voice_submissions')
        .select('id, submitted_at')
        .eq('client_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(1);
      if (subErr) throw subErr;
      const submissionId = submissions?.[0]?.id as string | undefined;
      if (!submissionId) return { state: 'none' };

      const { data: rows, error: arErr } = await supabase
        .from('analysis_results')
        .select(COLUMNS)
        .eq('submission_id', submissionId)
        .order('generated_at', { ascending: false })
        .limit(1);
      if (arErr) throw arErr;
      const r = rows?.[0] as Record<string, any> | undefined;
      if (!r || r.vitality_score == null) return { state: 'analyzing' };

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
        subscores: SUBSCORE_META.map((m) => ({
          key: m.key,
          label: m.label,
          description: m.description,
          value: Number(r[m.column] ?? 0),
          trend: parseTrend((bySub as Record<string, unknown>)[m.key]),
        })),
      };
    },
  });
}
