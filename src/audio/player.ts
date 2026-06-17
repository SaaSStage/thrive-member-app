/**
 * The single audio entry point for the app (AUDIO-PLAYBACK.md §1: keep the
 * player behind one module so a future swap is contained).
 *
 * Engine: expo-audio (iOS AVPlayer / Android ExoPlayer-Media3) over HLS. We let
 * each engine self-manage HLS buffering and live-edge — NO buffer overrides
 * (§3/§4/§5). Tuning, if ever needed, is measured first and lands in
 * mobile_app_settings, never hardcoded here.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { fetchNowPlaying } from '@/api/azuracast';

/**
 * One reusable player for the live radio stream. expo-audio is a first-party
 * Expo module, safe to instantiate at import (unlike RNTP, which crashed the
 * New-Arch TurboModule bridge at startup). Screens read live state via
 * `useAudioPlayerStatus(radioPlayer)`.
 */
export const radioPlayer: AudioPlayer = createAudioPlayer(null, { updateInterval: 1000 });

let audioModeReady = false;
let activeStationId: string | null = null;

/**
 * Audio session posture for live playback (AUDIO-PLAYBACK.md §4, still-valid
 * format-independent lessons): route as playback, never voice/Bluetooth-HFP.
 * `doNotMix` is also REQUIRED for the lock-screen controls to bind.
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

export type PlayableStation = {
  id: string;
  /** AzuraCast station shortcode (== content_assets.code), for now-playing. */
  code?: string;
  name: string;
  stream_url: string;
  description?: string | null;
};

// HLS has no ICY metadata, so poll the AzuraCast now-playing API and push the
// live track to the lock screen. 15s cadence for now; move to mobile_app_settings
// when that loader lands (AUDIO-PLAYBACK.md §6).
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
    if (activeStationId !== station.id) return; // station changed/stopped mid-fetch
    // A real track has an artist; otherwise fall back to the station identity
    // (avoids showing AzuraCast's "Station Offline" placeholder).
    const hasTrack = np?.artist != null;
    radioPlayer.updateLockScreenMetadata({
      title: hasTrack ? (np?.title ?? station.name) : station.name,
      artist: hasTrack ? np!.artist! : 'THRIVE Radio',
      artworkUrl: np?.artworkUrl ?? undefined,
    });
  };
  void tick();
  nowPlayingTimer = setInterval(() => void tick(), NOW_PLAYING_INTERVAL_MS);
}

export async function playStation(station: PlayableStation): Promise<void> {
  await ensureAudioMode();
  radioPlayer.replace({ uri: station.stream_url });
  activeStationId = station.id;

  // REQUIRED on Android: without setActiveForLockScreen, background audio is
  // killed after ~3 min (OS limitation — expo-audio docs). `isLiveStream: true`
  // hides the scrubber/duration (correct for live radio). The poll below then
  // refines the title/artist/artwork from AzuraCast now-playing.
  radioPlayer.setActiveForLockScreen(
    true,
    { title: station.name, artist: 'THRIVE Radio' },
    { isLiveStream: true },
  );
  radioPlayer.play();
  startNowPlayingPoll(station);
}

export function stopPlayback(): void {
  stopNowPlayingPoll();
  radioPlayer.pause();
  radioPlayer.setActiveForLockScreen(false);
  activeStationId = null;
}

export function getActiveStationId(): string | null {
  return activeStationId;
}
