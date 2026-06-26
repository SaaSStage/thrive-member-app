/**
 * The live-HRV engine: wires the BLE transport (`BleHrClient`) → the rolling
 * RMSSD window (`RmssdWindow`) → the Zustand store, on a ~1s throttle so React
 * re-renders stay cheap even though R-R notifications arrive faster.
 *
 * Mirrors the interval-with-refs pattern in `components/voice/recording-view`:
 * the BLE client, the window, and the latest values live in refs (decoupled from
 * render), and a single interval reads them and pushes a throttled sample to the
 * store. Always tears down on unmount.
 *
 * Returns imperative `startTracking(station)` / `stopTracking()` for the player.
 * BLE needs a physical device — this is inert on emulators/simulators.
 */
import { useCallback, useEffect, useRef } from 'react';

import { useHrvStore, type HrvSessionSummary, type HrvStation } from '@/stores/hrv-store';

import { BleHrClient } from './ble-hr';
import { RmssdWindow } from './rmssd';

const THROTTLE_MS = 1000;
/** No beats for this long ⇒ surface "hold still" in the UI. */
const STALE_MS = 5000;
const WHOOP_NAME_HINT = 'whoop';

export function useLiveHrv() {
  const clientRef = useRef<BleHrClient | null>(null);
  const windowRef = useRef<RmssdWindow | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBeatAtRef = useRef<number | null>(null);
  const latestBpmRef = useRef<number | null>(null);

  const teardown = useCallback(async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const client = clientRef.current;
    clientRef.current = null;
    windowRef.current = null;
    lastBeatAtRef.current = null;
    latestBpmRef.current = null;
    if (client) await client.stop();
  }, []);

  const startTracking = useCallback(
    (station: HrvStation) => {
      // Imperative store access (like recording-view) to dodge stale closures.
      const store = useHrvStore.getState();
      store.beginSession(station);

      const window = new RmssdWindow();
      windowRef.current = window;

      const client = new BleHrClient({
        onStatus: (status) => useHrvStore.getState().setStatus(status),
        onSample: ({ bpm, rrMs }) => {
          latestBpmRef.current = bpm;
          if (rrMs.length > 0) {
            window.addIntervals(rrMs, Date.now());
            lastBeatAtRef.current = Date.now();
          }
        },
        onError: (code) => useHrvStore.getState().setError(code),
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
    },
    [],
  );

  const stopTracking = useCallback(async (): Promise<HrvSessionSummary | null> => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const summary = useHrvStore.getState().endSession();
    await teardown();
    return summary;
  }, [teardown]);

  // Safety net: if the player unmounts mid-capture, tear the BLE connection down.
  useEffect(() => {
    return () => {
      void teardown();
    };
  }, [teardown]);

  return { startTracking, stopTracking };
}
