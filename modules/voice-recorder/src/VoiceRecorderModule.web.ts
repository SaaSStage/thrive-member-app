import { registerWebModule, NativeModule } from 'expo';

import { StopRecordingResult } from './VoiceRecorder.types';

// Web is not a target for voice capture (the flow is native-only). Provide a
// shape-compatible stub so web bundling/import doesn't crash; recording throws.
class VoiceRecorderModule extends NativeModule {
  readonly sampleRate = 44100;
  readonly channels = 1;
  readonly bitsPerSample = 16;

  async hasPermission(): Promise<boolean> {
    return false;
  }
  async startRecording(_filename: string): Promise<void> {
    throw new Error('Voice recording is not supported on web.');
  }
  async stopRecording(): Promise<StopRecordingResult> {
    throw new Error('Voice recording is not supported on web.');
  }
  async cancelRecording(): Promise<void> {}
}

export default registerWebModule(VoiceRecorderModule, 'VoiceRecorder');
