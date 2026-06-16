/**
 * Thin RNTP wrapper for the first slice: set up the player once, then play a
 * live HLS station's stream_url. The remote-config buffer tuning, retry state
 * machine, and now-playing metadata sync (per the spec) land in the later
 * "playback core" step — this is the minimal play/stop path.
 */
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
} from 'react-native-track-player';

let setupPromise: Promise<void> | null = null;

/** Idempotent: TrackPlayer.setupPlayer throws if called twice. */
export function setupPlayer(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
        await TrackPlayer.updateOptions({
          android: {
            appKilledPlaybackBehavior:
              AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause],
        });
      } catch {
        // Already initialized — safe to ignore.
      }
    })();
  }
  return setupPromise;
}

export type PlayableStation = {
  id: string;
  name: string;
  stream_url: string;
};

export async function playStation(station: PlayableStation): Promise<void> {
  await setupPlayer();
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: station.id,
    url: station.stream_url,
    title: station.name,
    artist: 'THRIVE Radio',
    isLiveStream: true,
  });
  await TrackPlayer.play();
}

export async function stopPlayback(): Promise<void> {
  await TrackPlayer.reset();
}
