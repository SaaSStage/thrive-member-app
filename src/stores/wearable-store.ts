/**
 * Persisted flag: has the user successfully connected their WHOOP band via BLE
 * in Settings? When false, all live-HRV UI is hidden app-wide.
 *
 * Persisted via expo-secure-store (already installed) under key 'wearable.connected'.
 * `hydrate()` is called once at app start from _layout; `setConnected` is called
 * from the Settings WHOOP screen after a successful BLE probe.
 */
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const STORE_KEY = 'wearable.connected';

type WearableStoreState = {
  connected: boolean;
  hydrated: boolean;
  setConnected: (v: boolean) => void;
  hydrate: () => Promise<void>;
};

export const useWearableStore = create<WearableStoreState>((set) => ({
  connected: false,
  hydrated: false,

  setConnected: (v) => {
    set({ connected: v });
    SecureStore.setItemAsync(STORE_KEY, v ? '1' : '0').catch(() => {});
  },

  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORE_KEY);
      set({ connected: raw === '1', hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
