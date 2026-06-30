/**
 * Pure derivations for the post-session "Session Response" card
 * (see docs/specs/session-response-insight.md §4). Operates on the in-memory
 * `HrvSessionSummary` — no React, no store coupling.
 *
 * NOTE (v1): these run on the LIVE rmssd/bpm series as stored. Artifact-filtered
 * recompute from raw R-R (spec §4.0) is deferred.
 */
import type { HrvSessionSummary } from '@/stores/hrv-store';

/** A session needs this much signal before we'll read a response from it. */
export const MIN_READABLE_SECONDS = 180;
const MIN_READABLE_SAMPLES = 60;

/** Trend thresholds — mirror hrv-store TREND_HIGH/LOW (±12%). */
const TREND_HIGH = 12;
const TREND_LOW = -12;

export type ResponseTrend = 'calmer' | 'steady' | 'activated';

function median(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1]! + s[m]!) / 2 : s[m]!;
}

/** Enough duration + a locked baseline + enough samples to render the response card. */
export function isReadable(summary: HrvSessionSummary): boolean {
  return (
    summary.durationSeconds >= MIN_READABLE_SECONDS &&
    summary.baselineRmssd != null &&
    summary.rmssdSeries.length >= MIN_READABLE_SAMPLES
  );
}

/**
 * Resting-HR settle: median HR over the early window vs the final window.
 * `bpmSeries` is ~1s/tick but NOT strictly index-aligned with rmssdSeries, so we
 * use proportional slices (first/last ~25%). Negative delta = calming.
 */
export function hrDelta(
  bpmSeries: number[],
): { baselineHr: number; endHr: number; delta: number } | null {
  const n = bpmSeries.length;
  if (n < 8) return null;
  const q = Math.max(2, Math.round(n * 0.25));
  const baselineHr = median(bpmSeries.slice(0, q));
  const endHr = median(bpmSeries.slice(n - q));
  if (baselineHr == null || endHr == null) return null;
  const b = Math.round(baselineHr);
  const e = Math.round(endHr);
  return { baselineHr: b, endHr: e, delta: e - b };
}

/** Seconds until RMSSD first stays ≥ baseline+10% for ~60 consecutive ticks. Null if never. */
export function timeToCalmSec(rmssdSeries: number[], baselineRmssd: number | null): number | null {
  if (baselineRmssd == null || baselineRmssd <= 0) return null;
  const target = baselineRmssd * 1.1;
  const HOLD = 60; // ticks ≈ seconds
  let runStart = -1;
  for (let i = 0; i < rmssdSeries.length; i++) {
    if (rmssdSeries[i]! >= target) {
      if (runStart < 0) runStart = i;
      if (i - runStart + 1 >= HOLD) return runStart; // index ≈ seconds from start
    } else {
      runStart = -1;
    }
  }
  return null;
}

export function trendOf(pctFromBaseline: number | null): ResponseTrend {
  if (pctFromBaseline == null) return 'steady';
  if (pctFromBaseline >= TREND_HIGH) return 'calmer';
  if (pctFromBaseline <= TREND_LOW) return 'activated';
  return 'steady';
}

/** Signed percent for the headline, e.g. "+18%" / "−5%". Em-dash minus for typography. */
export function formatSignedPct(pctFromBaseline: number | null): string {
  if (pctFromBaseline == null) return '—';
  const r = Math.round(pctFromBaseline);
  if (r > 0) return `+${r}%`;
  if (r < 0) return `−${Math.abs(r)}%`;
  return '0%';
}

/** Trend label + member-facing sentence for the response. */
export function responseCopy(
  pctFromBaseline: number | null,
  durationSeconds: number,
): { trend: ResponseTrend; sentence: string } {
  const trend = trendOf(pctFromBaseline);
  const mins = Math.max(1, Math.round(durationSeconds / 60));
  const absPct = pctFromBaseline != null ? Math.abs(Math.round(pctFromBaseline)) : null;
  if (trend === 'calmer') {
    return {
      trend,
      sentence: `Your HRV rose ${absPct}% over ${mins} min — you reached a calmer, rest-and-restore state.`,
    };
  }
  if (trend === 'activated') {
    return {
      trend,
      sentence: `Your HRV dipped ${absPct}% over ${mins} min — you stayed alert and active.`,
    };
  }
  return {
    trend,
    sentence: `Your HRV held steady over ${mins} min — you stayed balanced.`,
  };
}
