/**
 * Reactive player UI state (Zustand — the spec's client-state choice). The
 * imperative player (src/audio/player.ts) writes here; screens (MiniPlayer,
 * Now Playing, Radio, Station) read reactively. This is the single source of
 * truth for "which station is active" + the live now-playing metadata, so play
 * state stays consistent across the app.
 */
import { create } from 'zustand';

export type PlayableStation = {
  id: string;
  /** AzuraCast shortcode (== content_assets.code) for now-playing. */
  code?: string;
  name: string;
  stream_url: string;
  description?: string | null;
};

export type NowPlaying = {
  title: string;
  artist: string;
  artworkUrl?: string;
};

type PlayerState = {
  activeStation: PlayableStation | null;
  nowPlaying: NowPlaying | null;
  setActiveStation: (station: PlayableStation | null) => void;
  setNowPlaying: (nowPlaying: NowPlaying | null) => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  activeStation: null,
  nowPlaying: null,
  setActiveStation: (activeStation) =>
    set(activeStation ? { activeStation } : { activeStation: null, nowPlaying: null }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
}));
