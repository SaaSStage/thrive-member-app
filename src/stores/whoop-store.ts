/**
 * Client-side guard state for WHOOP sync. Mirrors hrv-store/voice-store.
 *
 * `lastAttemptAt` prevents hammering the edge function when the user
 * foregrounds the app repeatedly. The real rate-limiting and throttle
 * logic live server-side; this is a client-side courtesy guard only.
 *
 * `syncing` is a transient UI boolean — it resets on every mount.
 */
import { create } from 'zustand';

type WhoopStoreState = {
  lastAttemptAt: number | null;
  syncing: boolean;
  setLastAttempt: (ts: number) => void;
  setSyncing: (syncing: boolean) => void;
};

export const useWhoopStore = create<WhoopStoreState>((set) => ({
  lastAttemptAt: null,
  syncing: false,
  setLastAttempt: (ts) => set({ lastAttemptAt: ts }),
  setSyncing: (syncing) => set({ syncing }),
}));
