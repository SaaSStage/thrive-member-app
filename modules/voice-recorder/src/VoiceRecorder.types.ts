/** Result returned by `stopRecording()`. The WAV is at `uri` (file:// path). */
export type StopRecordingResult = {
  uri: string;
  /** Duration computed from the data chunk size (ms). */
  durationMs: number;
  sampleRate: number;
  channels: number;
  /** Total file size including the 44-byte header. */
  bytes: number;
};
