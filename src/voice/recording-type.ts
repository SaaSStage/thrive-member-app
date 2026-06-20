/**
 * The three recording types in a voice submission, in capture order, with their
 * per-type config. The string values ARE `voice_recordings.recording_type` (the
 * analyze-voice pipeline keys on these), so we use them directly as the type.
 *
 * Ported (re-implemented in TS) from the v3 Flutter app's
 * `lib/voice/data/voice_recording_type.dart`.
 */

export type VoiceRecordingType = 'sustained_vowel' | 'reading_passage' | 'diadochokinetic';

/** Capture order — also the 1-based `recording_order` sent to the DB. */
export const RECORDING_ORDER: readonly VoiceRecordingType[] = [
  'sustained_vowel',
  'reading_passage',
  'diadochokinetic',
] as const;

export type RecordingTypeConfig = {
  type: VoiceRecordingType;
  /** Short label shown on review rows. */
  shortLabel: string;
  /** Screen title. */
  title: string;
  /** Instructional subtext. */
  instruction: string;
  /** Target capture duration (ms). The recorder auto-stops here. */
  targetMs: number;
  /**
   * Minimum acceptable length (ms) for validation. Deliberately NOT "80% of
   * target" for the reading passage — passages read in ~25-30s but the target
   * has 35s of headroom, so a fast reader stopping at 25s is still valid. These
   * are conservative floors to avoid false failures; retune against real-user
   * data (LOE risk #6).
   */
  minValidMs: number;
  /**
   * Minimum voiced speech (ms) the VAD must detect for this type. For
   * `sustained_vowel` this is enforced as the longest CONTINUOUS voiced run; for
   * the others it is TOTAL voiced time. Unvalidated on hardware — tune on-device.
   */
  // THRESHOLD: tune on-device (LOE risk #6)
  minVoicedMs: number;
  /**
   * When true, `minVoicedMs` is checked against the longest contiguous voiced run
   * (a sustained vowel must be held); when false, against total voiced time.
   */
  requiresContinuousVoiced: boolean;
  /**
   * Whether a bundled "Hear example" clip exists. The reading passage has none —
   * the text is the prompt. (Example WAV assets are not yet supplied; the button
   * surfaces a graceful placeholder until they are — matches Flutter v1.)
   */
  hasAudioExample: boolean;
  /** 1-based position for the "Recording N of 3" header. */
  stepNumber: number;
};

export const RECORDING_CONFIG: Record<VoiceRecordingType, RecordingTypeConfig> = {
  sustained_vowel: {
    type: 'sustained_vowel',
    shortLabel: "Sustained 'ah'",
    title: "Say 'ah' for 30 seconds",
    instruction:
      "Take a comfortable breath, then sustain the sound naturally. It's OK to pause and breathe if needed.",
    targetMs: 30_000,
    minValidMs: 20_000,
    // THRESHOLD: tune on-device (LOE risk #6)
    minVoicedMs: 4_000,
    requiresContinuousVoiced: true,
    hasAudioExample: true,
    stepNumber: 1,
  },
  reading_passage: {
    type: 'reading_passage',
    shortLabel: 'Reading passage',
    title: 'Read the passage below at a natural pace',
    instruction: 'Read at your natural conversational pace. Don’t rush.',
    targetMs: 35_000,
    minValidMs: 15_000,
    // THRESHOLD: tune on-device (LOE risk #6)
    minVoicedMs: 20_000,
    requiresContinuousVoiced: false,
    hasAudioExample: false,
    stepNumber: 2,
  },
  diadochokinetic: {
    type: 'diadochokinetic',
    shortLabel: "'pa-ta-ka'",
    title: "Say 'pa-ta-ka' as fast as you can for 10 seconds",
    instruction:
      "Repeat the syllables 'pa-ta-ka, pa-ta-ka' as quickly and clearly as you can.",
    targetMs: 10_000,
    minValidMs: 6_000,
    // THRESHOLD: tune on-device (LOE risk #6)
    minVoicedMs: 6_000,
    requiresContinuousVoiced: false,
    hasAudioExample: true,
    stepNumber: 3,
  },
};

export function configFor(type: VoiceRecordingType): RecordingTypeConfig {
  return RECORDING_CONFIG[type];
}
