/**
 * RNTP playback service — the headless task registered in index.js. Wires the
 * lock-screen / notification / Control Center remote controls to the player.
 * Must stay lightweight; it runs outside the React tree.
 */
import TrackPlayer, { Event } from 'react-native-track-player';

export async function PlaybackService(): Promise<void> {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
}
