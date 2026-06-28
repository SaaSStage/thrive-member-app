/**
 * Session-level state for the live-HRV capture that runs inline on Now Playing.
 * Zustand, mirroring voice-store/player-store. The BLE lifecycle + RMSSD window
 * live in `LiveHrvProvider` (app-level, so the session survives navigation); it
 * pushes throttled samples here via `pushSample`, and the UI renders from here.
 *
 * `armed` is the station Play-button toggle; `status` tracks the connection.
 * Session aggregates accumulate here so the summary screen is self-sufficient.
 */
import { create } from 'zustand';

export type HrvStatus = 'idle' | 'scanning' | 'connecting' | 'tracking' | 'no-rr' | 'error';
export type HrvErrorCode =
  | 'bluetooth-off'
  | 'permission-denied'
  | 'not-found'
  | 'connect-failed'
  | 'unknown';

/** The station a capture is bound to (one session ↔ one frequency). */
export type HrvStation = { id: string; code: string | null; name: string };

/** Snapshot returned by `endSession`, shaped for the `hrv_sessions` insert. */
export type HrvSessionSummary = {
  station: HrvStation;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  avgRmssd: number | null;
  minRmssd: number | null;
  maxRmssd: number | null;
  sampleCount: number;
  /** Raw beat-to-beat R-R intervals (ms), unfiltered — the full scientific record. */
  rrIntervalsMs: number[];
  /** Per-tick (~1s) live RMSSD time-course. */
  rmssdSeries: number[];
  /** Per-tick heart-rate time-course (bpm). */
  bpmSeries: number[];
  /**
   * Median RMSSD computed from the 30–60s settling window (display-only;
   * not written to DB — the migration hasn't been applied).
   */
  baselineRmssd: number | null;
  /**
   * Final smoothed RMSSD vs baseline as a percentage (display-only).
   * Positive = rose, negative = dipped.
   */
  pctFromBaseline: number | null;
};

/** How many recent RMSSD samples to keep for the sparkline. */
export const RECENT_CAP = 40;
/** Defensive cap on stored raw R-R intervals (~14h at 60bpm; no real session hits it). */
export const RAW_RR_CAP = 50_000;

/** Elapsed time before we start collecting baseline samples (ms). */
const BASELINE_WARMUP_MS = 30_000;
/** Elapsed time at which we lock in the baseline from the 30–60s window (ms). */
const BASELINE_LOCK_MS = 60_000;
/** Number of recent samples used for the live smoothed RMSSD. */
const SMOOTH_CAP = 8;
/** Percent change thresholds for trend classification. */
const TREND_HIGH = 12;
const TREND_LOW = -12;

/** Compute the median of a non-empty number array (mutates a copy). */
function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** Live trend direction once baseline is established. */
export type HrvTrend = 'settling' | 'steady' | 'activated';

type HrvState = {
  armed: boolean;
  status: HrvStatus;
  station: HrvStation | null;
  startedAt: number | null;
  liveRmssd: number | null;
  bpm: number | null;
  recent: number[];
  /** No fresh beats lately — prompt the member to hold still. */
  stale: boolean;
  error: HrvErrorCode | null;

  // Session aggregates (accumulated across the whole capture).
  sum: number;
  sampleCount: number;
  minRmssd: number | null;
  maxRmssd: number | null;

  // Raw / time-series capture (the full record, persisted on Stop capture).
  rrAll: number[];
  rmssdSeries: number[];
  bpmSeries: number[];

  // Baseline + live trend (within-session settling readout).
  /** Samples collected in the 30–60s window, used to compute the baseline. */
  _baselineBuffer: number[];
  /** Last ~8 non-null RMSSD samples used for live smoothing. */
  _smoothBuffer: number[];
  /** Median RMSSD from the 30–60s window. Null until the window closes. */
  baselineRmssd: number | null;
  /** Trend direction relative to baseline. Null until baseline is set. */
  trend: HrvTrend | null;
  /** Percentage change from baseline (positive = up, negative = down). */
  pctFromBaseline: number | null;

  /** Station Play-button toggle on/off. Arming clears any prior session. */
  arm: (station: HrvStation) => void;
  disarm: () => void;
  /** Connection started for `station`. */
  beginSession: (station: HrvStation) => void;
  setStatus: (status: HrvStatus) => void;
  /** Append raw beat-to-beat R-R intervals (ms) as they arrive from BLE. */
  addRawRr: (rrMs: number[]) => void;
  /** Feed a throttled sample from the live hook. */
  pushSample: (sample: { rmssd: number | null; bpm: number | null; stale: boolean }) => void;
  setError: (error: HrvErrorCode) => void;
  /** Stop the capture and return the summary for persistence (null if nothing captured). */
  endSession: () => HrvSessionSummary | null;
  reset: () => void;
};

const INITIAL = {
  armed: false,
  status: 'idle' as HrvStatus,
  station: null,
  startedAt: null,
  liveRmssd: null,
  bpm: null,
  recent: [] as number[],
  stale: false,
  error: null,
  sum: 0,
  sampleCount: 0,
  minRmssd: null,
  maxRmssd: null,
  rrAll: [] as number[],
  rmssdSeries: [] as number[],
  bpmSeries: [] as number[],
  _baselineBuffer: [] as number[],
  _smoothBuffer: [] as number[],
  baselineRmssd: null,
  trend: null,
  pctFromBaseline: null,
};

export const useHrvStore = create<HrvState>((set, get) => ({
  ...INITIAL,

  arm: (station) => set({ ...INITIAL, armed: true, station }),
  disarm: () => set({ ...INITIAL }),

  beginSession: (station) =>
    set({
      ...INITIAL,
      armed: true,
      station,
      status: 'connecting',
      startedAt: Date.now(),
    }),

  setStatus: (status) => set({ status }),

  addRawRr: (rrMs) => {
    if (rrMs.length === 0) return;
    const s = get();
    if (s.rrAll.length >= RAW_RR_CAP) return;
    set({ rrAll: [...s.rrAll, ...rrMs] });
  },

  pushSample: ({ rmssd, bpm, stale }) => {
    const s = get();
    if (rmssd == null) {
      set({ bpm, stale });
      return;
    }

    const recent = [...s.recent, rmssd].slice(-RECENT_CAP);
    const _smoothBuffer = [...s._smoothBuffer, rmssd].slice(-SMOOTH_CAP);

    // Baseline window logic.
    let _baselineBuffer = s._baselineBuffer;
    let baselineRmssd = s.baselineRmssd;
    let trend = s.trend;
    let pctFromBaseline = s.pctFromBaseline;

    if (baselineRmssd == null && s.startedAt != null) {
      const elapsed = Date.now() - s.startedAt;

      if (elapsed >= BASELINE_WARMUP_MS && elapsed < BASELINE_LOCK_MS) {
        // Collect samples in the 30–60s window.
        _baselineBuffer = [..._baselineBuffer, rmssd];
      } else if (elapsed >= BASELINE_LOCK_MS) {
        // Lock the baseline: use the 30–60s window if it has samples,
        // otherwise fall back to all non-null samples seen so far (incl. this one).
        const source = _baselineBuffer.length > 0 ? _baselineBuffer : [...s.rmssdSeries, rmssd];
        baselineRmssd = median(source);
        _baselineBuffer = []; // no longer needed
      }
    }

    // Compute live trend once baseline is set.
    if (baselineRmssd != null && _smoothBuffer.length > 0) {
      const smoothed = median(_smoothBuffer);
      const pct = Math.round(((smoothed - baselineRmssd) / baselineRmssd) * 100);
      pctFromBaseline = pct;
      trend = pct >= TREND_HIGH ? 'settling' : pct <= TREND_LOW ? 'activated' : 'steady';
    }

    set({
      liveRmssd: rmssd,
      bpm,
      stale,
      recent,
      _smoothBuffer,
      _baselineBuffer,
      baselineRmssd,
      trend,
      pctFromBaseline,
      sum: s.sum + rmssd,
      sampleCount: s.sampleCount + 1,
      minRmssd: s.minRmssd == null ? rmssd : Math.min(s.minRmssd, rmssd),
      maxRmssd: s.maxRmssd == null ? rmssd : Math.max(s.maxRmssd, rmssd),
      rmssdSeries: [...s.rmssdSeries, rmssd],
      bpmSeries: bpm != null ? [...s.bpmSeries, bpm] : s.bpmSeries,
    });
  },

  setError: (error) => set({ status: 'error', error }),

  endSession: () => {
    const s = get();
    if (!s.station || s.startedAt == null) {
      set({ ...INITIAL });
      return null;
    }
    const endedAt = Date.now();

    // Final pct: use the current smooth buffer vs baseline (may differ from
    // the last live tick if baseline was just set on this final sample).
    let finalPct: number | null = null;
    if (s.baselineRmssd != null && s._smoothBuffer.length > 0) {
      const smoothed = median(s._smoothBuffer);
      finalPct = Math.round(((smoothed - s.baselineRmssd) / s.baselineRmssd) * 100);
    }

    const summary: HrvSessionSummary = {
      station: s.station,
      startedAt: s.startedAt,
      endedAt,
      durationSeconds: Math.max(0, Math.round((endedAt - s.startedAt) / 1000)),
      avgRmssd: s.sampleCount > 0 ? s.sum / s.sampleCount : null,
      minRmssd: s.minRmssd,
      maxRmssd: s.maxRmssd,
      sampleCount: s.sampleCount,
      rrIntervalsMs: s.rrAll,
      rmssdSeries: s.rmssdSeries,
      bpmSeries: s.bpmSeries,
      baselineRmssd: s.baselineRmssd,
      pctFromBaseline: finalPct,
    };
    set({ ...INITIAL });
    return summary;
  },

  reset: () => set({ ...INITIAL }),
}));
