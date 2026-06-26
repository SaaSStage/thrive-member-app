/**
 * Foreground-only daily sync provider. Mounts only when the user is signed in
 * (see _layout.tsx). Renders nothing — pure side-effect component.
 *
 * Strategy:
 *   - Fire once on mount (catches the "just opened app" case).
 *   - Subscribe to AppState 'active' transitions (catches foreground returns).
 *   - Client-side guard: skip if last attempt was < 1 hour ago.
 *   - Real throttle lives server-side in the edge function.
 *
 * No background tasks. No push notifications. Foreground-only.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useDailySync } from '@/api/whoop';
import { useWhoopStore } from '@/stores/whoop-store';

const ONE_HOUR_MS = 60 * 60 * 1000;

export function WhoopSyncProvider() {
  const { triggerSync } = useDailySync();
  const { lastAttemptAt, setLastAttempt } = useWhoopStore();

  // Stable ref so the AppState closure always reads the latest value without
  // triggering re-renders or capturing a stale closure.
  const stateRef = useRef({ lastAttemptAt, setLastAttempt, triggerSync });

  useEffect(() => {
    stateRef.current = { lastAttemptAt, setLastAttempt, triggerSync };
  });

  useEffect(() => {
    async function maybeSync() {
      const { lastAttemptAt: last, setLastAttempt: setLast, triggerSync: sync } = stateRef.current;
      const now = Date.now();
      if (last !== null && now - last < ONE_HOUR_MS) return;
      setLast(now);
      try {
        await sync();
      } catch {
        // Non-fatal — next foreground will retry.
      }
    }

    // Fire once on mount.
    void maybeSync();

    function handleAppState(next: AppStateStatus) {
      if (next === 'active') void maybeSync();
    }

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  return null;
}
