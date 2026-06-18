/**
 * Latest vitality score for the signed-in member. The score is produced by the
 * backend (analyze-voice → generate-report) and stored in `analysis_results`,
 * keyed to a `voice_submissions` row. RLS scopes both tables to the member.
 *
 * We resolve the member's latest submission, then its analysis — so the screen
 * can distinguish "no submissions yet", "latest sample still analyzing", and
 * "score ready" (mirrors the v3 Flutter score_repository two-step).
 *
 * The composite Vitality Score (0-100) is the equally-weighted average of four
 * subscores (also 0-100): Emotional Wellness, Cognitive Clarity, Physical Energy,
 * Voice Power.
 */
import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@/api/supabase';

export type Subscore = {
  key: 'emotional_wellness' | 'cognitive_clarity' | 'physical_energy' | 'voice_power';
  label: string;
  description: string;
  value: number;
};

export type ScoreResult =
  | { state: 'none' } // no submissions yet
  | { state: 'analyzing' } // latest submission has no analysis result yet
  | {
      state: 'ready';
      vitalityScore: number;
      subscores: Subscore[];
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

export function useLatestScore() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['latest-score'],
    queryFn: async (): Promise<ScoreResult> => {
      const { data: userId, error: idErr } = await supabase.rpc('current_user_id');
      if (idErr || !userId) throw idErr ?? new Error('Not signed in.');

      // Latest submission for this member.
      const { data: submissions, error: subErr } = await supabase
        .from('voice_submissions')
        .select('id, submitted_at')
        .eq('client_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(1);
      if (subErr) throw subErr;
      const submissionId = submissions?.[0]?.id as string | undefined;
      if (!submissionId) return { state: 'none' };

      // Its analysis result (if generated yet).
      const { data: rows, error: arErr } = await supabase
        .from('analysis_results')
        .select(
          'vitality_score, subscore_emotional_wellness, subscore_cognitive_clarity, subscore_physical_energy, subscore_voice_power, generated_at',
        )
        .eq('submission_id', submissionId)
        .order('generated_at', { ascending: false })
        .limit(1);
      if (arErr) throw arErr;
      const r = rows?.[0] as Record<string, number | string | null> | undefined;
      if (!r || r.vitality_score == null) return { state: 'analyzing' };

      return {
        state: 'ready',
        vitalityScore: Number(r.vitality_score),
        generatedAt: (r.generated_at as string) ?? null,
        subscores: SUBSCORE_META.map((m) => ({
          key: m.key,
          label: m.label,
          description: m.description,
          value: Number(r[m.column] ?? 0),
        })),
      };
    },
  });
}
