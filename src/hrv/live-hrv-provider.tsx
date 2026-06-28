/**
 * App-level owner of the live-HRV BLE session.
 *
 * Why a provider (not a per-screen hook): arming HRV happens on the station
 * page, the live readout lives on Now Playing, and the mini-player shows status
 * from anywhere — so the BLE connection + RMSSD window must live ABOVE the
 * screens, or it would tear down the moment you navigate. This provider watches
 * the store's `armed` intent and owns the connection for its whole lifetime.
 *
 * Flow: station toggle → `arm(station)` → this provider connects + begins the
 * session → status/live values land in the store (rendered by station page,
 * player, mini-player) → player's "Stop capture" calls `stopCapture()` here,
 * which ends the session, returns the summary to persist, and disconnects.
 *
 * BLE needs a physical device — inert on emulators/simulators.
 */
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';

import { useSupabase } from '@/api/supabase';
import { useHrvStore, type HrvSessionSummary } from '@/stores/hrv-store';

import { BleHrClient } from './ble-hr';
import { RmssdWindow } from './rmssd';

const THROTTLE_MS = 1000;
const STALE_MS = 5000;
const WHOOP_NAME_HINT = 'whoop';

type LiveHrvControls = {
  /** End the capture, return its summary for persistence, and disconnect. */
  stopCapture: () => Promise<HrvSessionSummary | null>;
  /** Retry the BLE connection for the current armed station (after an error). */
  reconnect: () => Promise<void>;
};

const LiveHrvContext = createContext<LiveHrvControls>({
  stopCapture: async () => null,
  reconnect: async () => {},
});

export function useLiveHrvControls(): LiveHrvControls {
  return useContext(LiveHrvContext);
}

export function LiveHrvProvider({ children }: { children: ReactNode }) {
  const armed = useHrvStore((s) => s.armed);
  const station = useHrvStore((s) => s.station);

  const clientRef = useRef<BleHrClient | null>(null);
  const windowRef = useRef<RmssdWindow | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBeatAtRef = useRef<number | null>(null);
  const latestBpmRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  // --- Debug telemetry: each live session writes its timeline to user_reports so
  //     a failure (drop vs. no R-R delivery) is diagnosable without guesswork. ---
  const supabase = useSupabase();
  const supabaseRef = useRef(supabase);
  useEffect(() => {
    supabaseRef.current = supabase;
  }, [supabase]);
  const telemetryRef = useRef<{ t: number; e: string }[]>([]);
  const sessionStartRef = useRef(0);
  const hrCountRef = useRef(0);
  const rrCountRef = useRef(0);
  const firstRrRef = useRef<number | null>(null);
  const writeTelemetry = async () => {
    const events = telemetryRef.current;
    if (events.length === 0) return;
    telemetryRef.current = [];
    try {
      const sb = supabaseRef.current;
      const { data: id } = await sb.rpc('current_user_id');
      if (!id) return;
      await sb.from('user_reports').insert({
        user_id: id,
        message: 'live-hrv telemetry',
        player_state: 'live-hrv-debug',
        playback_stats: {
          durationMs: sessionStartRef.current ? Date.now() - sessionStartRef.current : 0,
          hrPackets: hrCountRef.current,
          rrIntervals: rrCountRef.current,
          firstRrMs: firstRrRef.current,
          events,
        },
      });
    } catch {
      // best-effort telemetry; never block teardown
    }
  };
  const writeTelemetryRef = useRef(writeTelemetry);
  useEffect(() => {
    writeTelemetryRef.current = writeTelemetry;
  });

  const teardown = useCallback(async () => {
    void writeTelemetryRef.current?.();
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const client = clientRef.current;
    clientRef.current = null;
    windowRef.current = null;
    lastBeatAtRef.current = null;
    latestBpmRef.current = null;
    runningRef.current = false;
    if (client) await client.stop();
  }, []);

  const startSession = useCallback((forStation: NonNullable<typeof station>) => {
    runningRef.current = true;
    useHrvStore.getState().beginSession(forStation);

    // reset telemetry for this session
    sessionStartRef.current = Date.now();
    telemetryRef.current = [{ t: 0, e: 'session-start' }];
    hrCountRef.current = 0;
    rrCountRef.current = 0;
    firstRrRef.current = null;

    const window = new RmssdWindow();
    windowRef.current = window;

    const client = new BleHrClient({
      onStatus: (status) => {
        telemetryRef.current.push({ t: Date.now() - sessionStartRef.current, e: `status:${status}` });
        useHrvStore.getState().setStatus(status);
      },
      onSample: ({ bpm, rrMs }) => {
        latestBpmRef.current = bpm;
        hrCountRef.current += 1;
        if (rrMs.length > 0) {
          rrCountRef.current += rrMs.length;
          if (firstRrRef.current == null) {
            firstRrRef.current = Date.now() - sessionStartRef.current;
            telemetryRef.current.push({ t: firstRrRef.current, e: 'first-rr' });
          }
          window.addIntervals(rrMs, Date.now());
          useHrvStore.getState().addRawRr(rrMs);
          lastBeatAtRef.current = Date.now();
        }
      },
      onError: (code, message) => {
        telemetryRef.current.push({
          t: Date.now() - sessionStartRef.current,
          e: `error:${code}${message ? ` ${message}` : ''}`,
        });
        useHrvStore.getState().setError(code);
      },
    });
    clientRef.current = client;
    void client.start({ deviceNameHint: WHOOP_NAME_HINT });

    tickRef.current = setInterval(() => {
      const win = windowRef.current;
      if (!win) return;
      const { rmssd } = win.current();
      const last = lastBeatAtRef.current;
      const stale = last != null && Date.now() - last > STALE_MS;
      useHrvStore.getState().pushSample({ rmssd, bpm: latestBpmRef.current, stale });
    }, THROTTLE_MS);
  }, []);

  // Start the BLE session when armed; tear it down when disarmed.
  useEffect(() => {
    if (armed && station && !runningRef.current) {
      startSession(station);
    } else if (!armed && runningRef.current) {
      void teardown();
    }
  }, [armed, station, startSession, teardown]);

  // Tear the connection down if the whole app unmounts.
  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  const stopCapture = useCallback(async (): Promise<HrvSessionSummary | null> => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const summary = useHrvStore.getState().endSession();
    await teardown();
    return summary;
  }, [teardown]);

  const reconnect = useCallback(async (): Promise<void> => {
    const current = useHrvStore.getState().station;
    if (!current) return;
    await teardown();
    startSession(current);
  }, [teardown, startSession]);

  return (
    <LiveHrvContext.Provider value={{ stopCapture, reconnect }}>{children}</LiveHrvContext.Provider>
  );
}
