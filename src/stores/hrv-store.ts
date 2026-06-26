/**
 * Session-level state for the live-HRV capture that runs inline on Now Playing.
 * Zustand, mirroring voice-store/player-store. The BLE lifecycle + RMSSD window
 * live in `useLiveHrv` (it needs refs and the native client); that hook pushes
 * throttled samples here via `pushSample`, and the UI renders from this store.
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
};

/** How many recent RMSSD samples to keep for the sparkline. */
export const RECENT_CAP = 40;

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

  /** Station Play-button toggle on/off. Arming clears any prior session. */
  arm: (station: HrvStation) => void;
  disarm: () => void;
  /** Connection started for `station`. */
  beginSession: (station: HrvStation) => void;
  setStatus: (status: HrvStatus) => void;
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
    };
    set({ ...INITIAL });
    return summary;
  },

  reset: () => set({ ...INITIAL }),
}));
