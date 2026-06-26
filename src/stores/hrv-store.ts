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
};

/** How many recent RMSSD samples to keep for the sparkline. */
export const RECENT_CAP = 40;
/** Defensive cap on stored raw R-R intervals (~14h at 60bpm; no real session hits it). */
export const RAW_RR_CAP = 50_000;

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
    set({
      liveRmssd: rmssd,
      bpm,
      stale,
      recent,
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
    };
    set({ ...INITIAL });
    return summary;
  },

  reset: () => set({ ...INITIAL }),
}));
