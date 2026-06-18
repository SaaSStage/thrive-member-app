/**
 * Voice-capture entry point — the recording counterpart to player.ts (one owned
 * audio module per AUDIO-PLAYBACK.md §1). Wraps the local Expo module
 * `modules/voice-recorder` (Android AudioRecord → WAV; iOS AVAudioRecorder
 * LinearPCM) which produces the exact 44.1 kHz / 16-bit / mono PCM WAV the
 * analyze-voice pipeline + on-device validator require.
 *
 * Audio-session coordination: the live radio player and the recorder share one
 * session, so we stop live playback before recording. The user restarts radio
 * from the Radio tab afterward (v1 — no auto-resume).
 */
import { PermissionsAndroid, Platform } from 'react-native';

import { stopPlayback } from '@/audio/player';
import type { VoiceRecordingType } from '@/voice/recording-type';
import { VoiceRecorder, type StopRecordingResult } from '../../modules/voice-recorder';

export type Recording = StopRecordingResult;

/** Ask for microphone permission, returning whether it's granted. */
export async function ensureRecordingPermission(): Promise<boolean> {
  if (await VoiceRecorder.hasPermission()) return true;
  if (Platform.OS === 'android') {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone access',
      message: 'THRIVE needs your microphone to record voice samples.',
      buttonPositive: 'Allow',
    });
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  // iOS: the native session prompts on first record (NSMicrophoneUsageDescription).
  return true;
}

/** Start capturing the given recording type to a WAV file in cache. */
export async function startRecording(type: VoiceRecordingType): Promise<void> {
  // The live radio player and the recorder share the audio session — free it.
  stopPlayback();
  await VoiceRecorder.startRecording(`${type}.wav`);
}

/** Stop and finalize the WAV; resolves with its uri + duration + format. */
export async function stopRecording(): Promise<Recording> {
  return VoiceRecorder.stopRecording();
}

/** Abort the current recording and delete the partial file. */
export async function cancelRecording(): Promise<void> {
  await VoiceRecorder.cancelRecording();
}
