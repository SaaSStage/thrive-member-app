/**
 * The single audio entry point for the app (AUDIO-PLAYBACK.md §1: keep the
 * player behind one module so a future swap is contained).
 *
 * Engine: expo-audio (iOS AVPlayer / Android ExoPlayer-Media3) over HLS. We let
 * each engine self-manage HLS buffering and live-edge — NO buffer overrides
 * (§3/§4/§5). Reactive UI state lives in the Zustand player store; this module
 * writes to it.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { fetchNowPlaying } from '@/api/azuracast';
import { usePlayerStore, type PlayableStation } from '@/stores/player-store';

export type { PlayableStation };

/**
 * One reusable player for the live radio stream. expo-audio is a first-party
 * Expo module, safe to instantiate at import. Screens read live playback state
 * via `useAudioPlayerStatus(radioPlayer)` and station/metadata via the store.
 */
export const radioPlayer: AudioPlayer = createAudioPlayer(null, { updateInterval: 1000 });

let audioModeReady = false;

/**
 * Audio session posture for live playback (AUDIO-PLAYBACK.md §4): route as
 * playback, never voice/Bluetooth-HFP. `doNotMix` is also REQUIRED for the
 * lock-screen controls to bind.
 */
async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });
  audioModeReady = true;
}

// HLS carries no ICY metadata, so poll the AzuraCast now-playing API and push
// the live track to both the lock screen and the store. 15s for now; move to
// mobile_app_settings when that loader lands (AUDIO-PLAYBACK.md §6).
const NOW_PLAYING_INTERVAL_MS = 15_000;
let nowPlayingTimer: ReturnType<typeof setInterval> | null = null;

function stopNowPlayingPoll(): void {
  if (nowPlayingTimer) {
    clearInterval(nowPlayingTimer);
    nowPlayingTimer = null;
  }
}

function startNowPlayingPoll(station: PlayableStation): void {
  stopNowPlayingPoll();
  const shortcode = station.code ?? station.id;
  const tick = async () => {
    const np = await fetchNowPlaying(shortcode);
    if (usePlayerStore.getState().activeStation?.id !== station.id) return; // stale
    // A real track has an artist; otherwise fall back to the station identity
    // (avoids showing AzuraCast's "Station Offline" placeholder).
    const hasTrack = np?.artist != null;
    const meta = {
      title: hasTrack ? (np?.title ?? station.name) : station.name,
      artist: hasTrack ? np!.artist! : 'THRIVE Radio',
      artworkUrl: np?.artworkUrl ?? undefined,
    };
    radioPlayer.updateLockScreenMetadata(meta);
    usePlayerStore.getState().setNowPlaying(meta);
  };
  void tick();
  nowPlayingTimer = setInterval(() => void tick(), NOW_PLAYING_INTERVAL_MS);
}

export async function playStation(station: PlayableStation): Promise<void> {
  await ensureAudioMode();
  radioPlayer.replace({ uri: station.stream_url });
  usePlayerStore.getState().setActiveStation(station);

  // REQUIRED on Android: without setActiveForLockScreen, background audio is
  // killed after ~3 min. `isLiveStream: true` hides the scrubber/duration.
  radioPlayer.setActiveForLockScreen(
    true,
    { title: station.name, artist: 'THRIVE Radio' },
    { isLiveStream: true },
  );
  radioPlayer.play();
  startNowPlayingPoll(station);
}

/** Pause/resume the current active station (keeps it active + lock-screen up). */
export function togglePlayPause(): void {
  if (radioPlayer.playing) radioPlayer.pause();
  else radioPlayer.play();
}

/** Full stop: pause, drop the lock screen, clear the active station. */
export function stopPlayback(): void {
  stopNowPlayingPoll();
  radioPlayer.pause();
  radioPlayer.setActiveForLockScreen(false);
  usePlayerStore.getState().setActiveStation(null);
}
