import { NativeModule, requireNativeModule } from 'expo';

import { StopRecordingResult } from './VoiceRecorder.types';

declare class VoiceRecorderModule extends NativeModule {
  /** Capture format constants (fixed at 44.1 kHz / 16-bit / mono). */
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;

  /** Whether RECORD_AUDIO (Android) / mic (iOS) is already granted. */
  hasPermission(): Promise<boolean>;
  /** Start writing a WAV to a cache file named `filename`. */
  startRecording(filename: string): Promise<void>;
  /** Stop and finalize the WAV; resolves with the file info. */
  stopRecording(): Promise<StopRecordingResult>;
  /** Stop and delete the partial file. */
  cancelRecording(): Promise<void>;
}

export default requireNativeModule<VoiceRecorderModule>('VoiceRecorder');
