/**
 * Latest vitality result for the signed-in member.
 *
 * The backend runs a pipeline per submission (extract acoustic features → score
 * against the member's OWN baseline → write an AI narrative). Results land on an
 * `analysis_results` row keyed to a `voice_submissions` row; RLS scopes both
 * tables to the member, so we read them directly (no practitioner endpoint).
 *
 * Two important wrinkles from the verified backend contract:
 *
 *  1. `voice_submissions.status` is a state machine, NOT a boolean:
 *       pending → queued → extracting → scoring → analyzed → narrating → reported
 *     plus the terminal error states `failed` and `narrative_failed`. The screen
 *     must poll until a TERMINAL state — and `analyzed` is ambiguous: it is only
 *     terminal once `analysis_results.narrative_status` is past 'pending'. Polling
 *     on `status` alone makes a new member's submission poll forever.
 *
 *  2. Scores are relative to a personal baseline that needs recordings on 3
 *     SEPARATE days. Until then the backend deliberately returns null scores
 *     (not 0, not 100) with narrative_status == 'baseline_pending' and a
 *     templated progress message in `narratives.wellness`. That's the locked
 *     "building your baseline" state — the most common state for new members.
 *
 * Polling stays lean (status + a narrative_status/vitality_score presence check);
 * the heavy jsonb blobs are fetched once, on terminal, by `useAnalysisResult`.
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

/** `voice_submissions.status` — the pipeline state machine. */
export type SubmissionStatus =
  | 'pending'
  | 'queued'
  | 'extracting'
  | 'scoring'
  | 'analyzed'
  | 'narrating'
  | 'reported'
  | 'failed'
  | 'narrative_failed';

/** `analysis_results.narrative_status`. 'baseline_pending' = no baseline yet → null scores. */
export type NarrativeStatus = 'pending' | 'baseline_pending' | 'narrative_failed' | 'generated';

/** The four user-facing processing stages (several statuses collapse onto one). */
export type ProcessingStage = 'preparing' | 'extracting' | 'scoring' | 'narrating';

export type ScoreResult =
  | { state: 'none' }
  // Newest submission still in the pipeline; nothing usable to show yet.
  | { state: 'processing'; stage: ProcessingStage; pendingSince: string }
  // Newest submission failed and there is no earlier usable result.
  | { state: 'failed' }
  // Terminal, but no baseline yet → scores are null. Locked "building baseline" UI.
  | {
      state: 'baseline';
      /** Templated progress message from narratives.wellness (NOT AI-generated). */
      wellnessMessage: string | null;
      /** Structured progress, when the backend persists it (else null → no "Day X of 3"). */
      distinctUsableDays: number | null;
      daysRemaining: number | null;
      newerSampleProcessing: boolean;
    }
  // Terminal with a baseline → real scores.
  | {
      state: 'ready';
      vitalityScore: number;
      subscores: Subscore[];
      vitalityTrend: Trend | null;
      narrative: string | null; // member-facing wellness narrative (markdown-ish)
      /** false when the AI summary failed (narrative_failed): show scores, skip the summary. */
      summaryAvailable: boolean;
      protocols: ProtocolRec[];
      generatedAt: string | null;
      /** A submission newer than the one shown here is still being processed. */
      newerSampleProcessing: boolean;
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

/** Heavy result columns — fetched ONCE on terminal, never on the poll. */
const RESULT_COLUMNS = [
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
  // When the backend persists structured baseline progress, add
  // 'distinct_usable_days, days_remaining' here — `shapeAnalysis` already reads
  // them defensively and they flow into the locked "Day X of 3" UI. Selecting a
  // column that doesn't exist makes PostgREST 400, so they stay out until then.
].join(', ');

const numOrNull = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));

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

/**
 * The app's terminal test, straight from the contract:
 *   terminal = status in {reported, failed, narrative_failed}
 *              OR (status == 'analyzed' AND narrative_status != 'pending')
 *
 * `analysis_results` (hence narrative_status) does not exist until status reaches
 * 'analyzed', so a NULL narrative_status at 'analyzed' is a transient race — treat
 * it as NOT terminal and keep polling (it will resolve to baseline_pending,
 * generated, or narrative_failed). Every genuinely-terminal 'analyzed' state has a
 * non-null narrative_status.
 */
export function isTerminalStatus(status: SubmissionStatus, narrativeStatus: NarrativeStatus | null): boolean {
  if (status === 'reported' || status === 'failed' || status === 'narrative_failed') return true;
  if (status === 'analyzed') return narrativeStatus != null && narrativeStatus !== 'pending';
  return false;
}

function stageFor(status: SubmissionStatus): ProcessingStage {
  switch (status) {
    case 'extracting':
      return 'extracting';
    case 'scoring':
      return 'scoring';
    case 'analyzed': // analyzed reaches here only while narrative_status is still 'pending'
    case 'narrating':
      return 'narrating';
    default:
      return 'preparing'; // pending, queued
  }
}

/** Poll cadence while a submission is in flight (~4s per the contract). */
const STATUS_POLL_MS = 4_000;
/** Stop auto-polling this long after the pending submission (guards a stuck pipeline). */
const MAX_POLL_MS = 5 * 60_000;
/** How many recent submissions to scan when finding the newest usable result. */
const SUBMISSION_WINDOW = 10;

type ResultKind = 'baseline' | 'scored';

type StatusView =
  | { kind: 'none' }
  | { kind: 'failed' }
  | { kind: 'processing'; stage: ProcessingStage; pendingSince: string }
  | { kind: 'result'; submissionId: string; resultKind: ResultKind; newerSampleProcessing: boolean; pendingSince: string | null };

/**
 * Lean status poll. Resolves WHICH submission to display and its high-level kind,
 * reading only the cheap columns. Heavy jsonb is left to `useAnalysisResult`.
 */
function useSubmissionStatus() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['submission-status'],
    refetchIntervalInBackground: false,
    // Poll only while the newest submission is still being processed — true right
    // after a submit, false once it reaches a terminal state. Capped so a stuck
    // pipeline can't poll forever.
    refetchInterval: (query) => {
      const d = query.state.data as StatusView | undefined;
      if (!d) return false;
      let pendingSince: string | null = null;
      if (d.kind === 'processing') pendingSince = d.pendingSince;
      else if (d.kind === 'result' && d.newerSampleProcessing) pendingSince = d.pendingSince;
      else return false;
      if (pendingSince) {
        const since = Date.parse(pendingSince);
        if (!Number.isNaN(since) && Date.now() - since > MAX_POLL_MS) return false;
      }
      return STATUS_POLL_MS;
    },
    queryFn: async (): Promise<StatusView> => {
      const { data: userId, error: idErr } = await supabase.rpc('current_user_id');
      if (idErr || !userId) throw idErr ?? new Error('Not signed in.');

      // Window of recent submissions (newest first) — so a brand-new sample that's
      // still processing doesn't hide the last usable result.
      const { data: submissions, error: subErr } = await supabase
        .from('voice_submissions')
        .select('id, status, submitted_at')
        .eq('client_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(SUBMISSION_WINDOW);
      if (subErr) throw subErr;
      const subs = (submissions ?? []) as { id: string; status: SubmissionStatus; submitted_at: string }[];
      if (subs.length === 0) return { kind: 'none' };

      // Lean join: narrative_status (for the terminal test) and a vitality_score
      // presence check (baseline vs scored). NO narratives/trend/protocol jsonb here.
      const { data: arRows, error: arErr } = await supabase
        .from('analysis_results')
        .select('submission_id, narrative_status, vitality_score, generated_at')
        .in(
          'submission_id',
          subs.map((s) => s.id),
        )
        .order('generated_at', { ascending: false });
      if (arErr) throw arErr;
      const byId = new Map<string, { narrative_status: NarrativeStatus | null; vitality_score: number | null }>();
      for (const row of (arRows ?? []) as Record<string, any>[]) {
        const sid = String(row.submission_id);
        if (byId.has(sid)) continue; // rows are newest-first; keep the first
        byId.set(sid, {
          narrative_status: (row.narrative_status as NarrativeStatus) ?? null,
          vitality_score: row.vitality_score ?? null,
        });
      }

      const classify = (s: { id: string; status: SubmissionStatus }): 'processing' | ResultKind | 'failed' => {
        const ar = byId.get(s.id);
        const ns = ar?.narrative_status ?? null;
        if (!isTerminalStatus(s.status, ns)) return 'processing';
        if (s.status === 'failed') return 'failed';
        // Terminal and not failed → an analysis row exists.
        if (ns === 'baseline_pending' || ar?.vitality_score == null) return 'baseline';
        return 'scored';
      };

      const newest = subs[0];
      // Newest submission that produced something usable (a score or a locked baseline).
      let display: { id: string; kind: ResultKind } | null = null;
      for (const s of subs) {
        const k = classify(s);
        if (k === 'scored' || k === 'baseline') {
          display = { id: s.id, kind: k };
          break;
        }
      }

      const newestKind = classify(newest);
      if (display) {
        const newerSampleProcessing = display.id !== newest.id && newestKind === 'processing';
        return {
          kind: 'result',
          submissionId: display.id,
          resultKind: display.kind,
          newerSampleProcessing,
          pendingSince: newerSampleProcessing ? newest.submitted_at : null,
        };
      }
      if (newestKind === 'processing') {
        return { kind: 'processing', stage: stageFor(newest.status), pendingSince: newest.submitted_at };
      }
      // Newest is terminal-failed and there's no earlier usable result.
      return { kind: 'failed' };
    },
  });
}

type AnalysisShaped =
  | { kind: 'baseline'; wellnessMessage: string | null; distinctUsableDays: number | null; daysRemaining: number | null }
  | {
      kind: 'scored';
      vitalityScore: number;
      subscores: Subscore[];
      vitalityTrend: Trend | null;
      narrative: string | null;
      summaryAvailable: boolean;
      protocols: ProtocolRec[];
      generatedAt: string | null;
    };

function shapeAnalysis(r: Record<string, any>): AnalysisShaped {
  const ns = (r.narrative_status as NarrativeStatus) ?? null;
  const wellness = (r.narratives as { wellness?: string })?.wellness ?? null;

  // No baseline yet → scores are deliberately null. Locked state, regardless of
  // submission status.
  if (ns === 'baseline_pending' || r.vitality_score == null) {
    return {
      kind: 'baseline',
      wellnessMessage: wellness,
      distinctUsableDays: numOrNull(r.distinct_usable_days),
      daysRemaining: numOrNull(r.days_remaining),
    };
  }

  const bySub = (r.trend_data as { by_subscore?: Record<string, unknown> })?.by_subscore ?? {};
  const summaryAvailable = ns === 'generated';
  return {
    kind: 'scored',
    vitalityScore: Number(r.vitality_score),
    vitalityTrend: parseTrend((r.trend_data as { vitality?: unknown })?.vitality),
    narrative: summaryAvailable ? wellness : null, // narrative_failed → skip the summary
    summaryAvailable,
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
}

/** Heavy, one-shot fetch of the full result for a terminal submission. No polling. */
function useAnalysisResult(submissionId: string | null) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['analysis-result', submissionId],
    enabled: !!submissionId,
    queryFn: async (): Promise<AnalysisShaped> => {
      const { data, error } = await supabase
        .from('analysis_results')
        .select(RESULT_COLUMNS)
        .eq('submission_id', submissionId)
        .order('generated_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const r = (data?.[0] ?? null) as Record<string, any> | null;
      if (!r) throw new Error('Analysis result not found.');
      return shapeAnalysis(r);
    },
  });
}

function combine(view: StatusView | undefined, result: AnalysisShaped | undefined): ScoreResult | undefined {
  if (!view) return undefined;
  switch (view.kind) {
    case 'none':
      return { state: 'none' };
    case 'failed':
      return { state: 'failed' };
    case 'processing':
      return { state: 'processing', stage: view.stage, pendingSince: view.pendingSince };
    case 'result':
      if (!result) return undefined; // heavy fetch still loading → caller shows the spinner
      if (result.kind === 'baseline') {
        return {
          state: 'baseline',
          wellnessMessage: result.wellnessMessage,
          distinctUsableDays: result.distinctUsableDays,
          daysRemaining: result.daysRemaining,
          newerSampleProcessing: view.newerSampleProcessing,
        };
      }
      return {
        state: 'ready',
        vitalityScore: result.vitalityScore,
        subscores: result.subscores,
        vitalityTrend: result.vitalityTrend,
        narrative: result.narrative,
        summaryAvailable: result.summaryAvailable,
        protocols: result.protocols,
        generatedAt: result.generatedAt,
        newerSampleProcessing: view.newerSampleProcessing,
      };
  }
}

/**
 * Latest member-facing vitality result. Composes the lean status poll with the
 * heavy one-shot result fetch and exposes a single discriminated `ScoreResult`.
 */
export function useLatestScore() {
  const status = useSubmissionStatus();
  const view = status.data;
  const displayId = view?.kind === 'result' ? view.submissionId : null;
  const result = useAnalysisResult(displayId);

  const data = combine(view, result.data);
  const isLoading = status.isLoading || (!!displayId && result.isLoading && !result.data);
  const isError = status.isError || (!!displayId && result.isError);
  const refetch = () => {
    void status.refetch();
    if (displayId) void result.refetch();
  };

  return { data, isLoading, isError, refetch };
}
