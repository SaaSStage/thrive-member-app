/**
 * On-device WAV quality validation. Parses raw 16-bit PCM samples and runs five
 * checks before a recording is accepted. v1 is STRICT pass/fail — a failed check
 * forces a re-record (marginal "yellow warning" handling is v2).
 *
 * Pure over bytes: the caller reads the WAV file (expo-file-system) and passes
 * an ArrayBuffer, so this module has no IO and is unit-testable. Re-implemented
 * in TS from the v3 Flutter app's `lib/voice/services/voice_validator.dart`,
 * preserving its tuned thresholds (the valuable part).
 *
 * All thresholds WILL need a tuning pass against real-device data (LOE risk #6:
 * Samsung/Xiaomi audio HAL variance). Keep them centralized so a pass is a
 * one-object change.
 */
import { configFor, type VoiceRecordingType } from './recording-type';

export type VoiceCheckId =
  | 'readable'
  | 'min_duration'
  | 'max_silence'
  | 'clipping'
  | 'noise_floor'
  | 'overall_rms';

export type VoiceCheck = {
  id: VoiceCheckId;
  passed: boolean;
  /** Measured value (ratio, RMS, or seconds) — for tuning + logs. */
  measured: number;
  /** User-facing message shown when this check fails. */
  failureMessage?: string;
};

export type VoiceValidationResult = {
  checks: VoiceCheck[];
  passed: boolean;
  /** The first failure's message (the recording screen shows one reason). */
  firstFailureMessage?: string;
  /** Measured value for a check id (for capture_metadata at upload time). */
  measuredFor: (id: VoiceCheckId) => number;
};

/** Tunable thresholds for the five checks. */
export const DEFAULT_THRESHOLDS = {
  /** A sample is "silent" below this normalized amplitude (~ -50 dBFS). */
  silenceAmplitude: 0.003,
  /** A sample is "clipped" at/above this (~ -0.09 dBFS). */
  clipAmplitude: 0.99,
  /** Fail if more than this fraction of samples are clipped. */
  maxClipRatio: 0.01,
  /** Sliding window (ms) for the noise-floor estimate; take the QUIETEST window. */
  noiseWindowMs: 500,
  /** Fail if even the quietest window's RMS exceeds this (~ -26 dBFS). Lenient. */
  maxNoiseFloorRms: 0.05,
  /** Fail if overall RMS is below this (~ -40 dBFS) — mic didn't pick up voice. */
  minOverallRms: 0.01,
};

export type VoiceThresholds = typeof DEFAULT_THRESHOLDS;

/**
 * Max fraction of "silent" samples, BY RECORDING TYPE. Connected speech (reading,
 * pa-ta-ka) naturally has far more inter-word/inter-syllable silence than a
 * sustained vowel, so a flat 30% wrongly rejects valid speech.
 */
function maxSilenceRatioFor(type: VoiceRecordingType): number {
  switch (type) {
    case 'sustained_vowel':
      return 0.4; // continuous tone — almost no silence
    case 'reading_passage':
      return 0.7; // lots of natural pauses + trailing quiet
    case 'diadochokinetic':
      return 0.65; // gaps between syllable bursts
  }
}

const FAIL = {
  min_duration: 'Recording too short. Please try again.',
  max_silence: 'We didn’t pick up enough sound. Please try again.',
  clipping: 'Recording was too loud. Move further from the mic and try again.',
  noise_floor: 'Background noise is too high. Try a quieter space.',
  overall_rms: 'Microphone didn’t pick up your voice clearly. Try again.',
} as const;

function buildResult(checks: VoiceCheck[]): VoiceValidationResult {
  const firstFail = checks.find((c) => !c.passed);
  return {
    checks,
    passed: checks.every((c) => c.passed),
    firstFailureMessage: firstFail?.failureMessage,
    measuredFor: (id) => checks.find((c) => c.id === id)?.measured ?? 0,
  };
}

export function unreadableResult(): VoiceValidationResult {
  return buildResult([
    {
      id: 'readable',
      passed: false,
      measured: 0,
      failureMessage: 'We couldn’t read that recording. Please try again.',
    },
  ]);
}

/**
 * Parse a 16-bit PCM WAV. Returns { samples, sampleRate } or null if it isn't
 * RIFF/WAVE/PCM/16-bit. Walks the RIFF chunk list rather than assuming the
 * canonical 44-byte layout: iOS (CoreAudio) writes extra chunks (FLLR filler,
 * sometimes 'fact') between 'fmt ' and 'data', so 'data' is not at offset 36.
 * Android's minimal 44-byte header is just the case where 'data' is first.
 */
export function parsePcm16(buf: ArrayBuffer): { samples: Int16Array; sampleRate: number } | null {
  if (buf.byteLength < 12) return null;
  const dv = new DataView(buf);
  const tag = (o: number) =>
    String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let audioFormat = 0;
  let numChannels = 1;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart: number | null = null;
  let dataSize = 0;

  let off = 12;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ' && body + 16 <= buf.byteLength) {
      audioFormat = dv.getUint16(body, true);
      numChannels = dv.getUint16(body + 2, true);
      sampleRate = dv.getUint32(body + 4, true);
      bitsPerSample = dv.getUint16(body + 14, true);
    } else if (id === 'data') {
      dataStart = body;
      dataSize = size;
      break;
    }
    off = body + size + (size % 2); // word-aligned (odd sizes get a pad byte)
  }

  if (dataStart === null || sampleRate === 0) return null;
  if (audioFormat !== 1 || bitsPerSample !== 16) return null;

  const available = buf.byteLength - dataStart;
  if (available <= 0) return null;
  // iOS can leave a placeholder/oversized data-chunk size; clamp to what's present.
  const usable = dataSize <= 0 || dataSize > available ? available : dataSize;
  const sampleCount = Math.floor(usable / 2);
  const interleaved = new Int16Array(buf, dataStart, sampleCount);
  if (numChannels <= 1) return { samples: interleaved, sampleRate };

  // Stereo (shouldn't happen with our mono config) — take the left channel.
  const mono = new Int16Array(Math.floor(sampleCount / numChannels));
  for (let i = 0, oi = 0; i < sampleCount && oi < mono.length; i += numChannels) {
    mono[oi++] = interleaved[i];
  }
  return { samples: mono, sampleRate };
}

/**
 * Validate the WAV bytes against the type's expectations. Single pass over the
 * PCM: silence, clipping, overall energy, and per-window energy for the
 * quietest-window noise floor (robust to users who start speaking immediately).
 */
export function validateWav(
  buf: ArrayBuffer,
  type: VoiceRecordingType,
  thresholds: VoiceThresholds = DEFAULT_THRESHOLDS,
): VoiceValidationResult {
  const parsed = parsePcm16(buf);
  if (!parsed) return unreadableResult();
  const { samples, sampleRate } = parsed;
  const total = samples.length;
  if (total === 0 || sampleRate <= 0) return unreadableResult();

  const durationSeconds = total / sampleRate;
  const windowSize = Math.max(1, Math.floor((thresholds.noiseWindowMs * sampleRate) / 1000));

  let silentCount = 0;
  let clippedCount = 0;
  let sumSquares = 0;
  let windowSumSquares = 0;
  let windowFill = 0;
  let minWindowMeanSquare = Number.POSITIVE_INFINITY;

  for (let i = 0; i < total; i++) {
    const amp = Math.abs(samples[i]) / 32768; // normalize 16-bit → [0,1]
    if (amp < thresholds.silenceAmplitude) silentCount++;
    if (amp >= thresholds.clipAmplitude) clippedCount++;
    const sq = amp * amp;
    sumSquares += sq;

    windowSumSquares += sq;
    windowFill++;
    if (windowFill === windowSize) {
      const meanSq = windowSumSquares / windowSize;
      if (meanSq < minWindowMeanSquare) minWindowMeanSquare = meanSq;
      windowSumSquares = 0;
      windowFill = 0;
    }
  }
  // Fold in a trailing partial window so short recordings still get a floor.
  if (windowFill > 0) {
    const meanSq = windowSumSquares / windowFill;
    if (meanSq < minWindowMeanSquare) minWindowMeanSquare = meanSq;
  }

  const silenceRatio = silentCount / total;
  const clipRatio = clippedCount / total;
  const overallRms = Math.sqrt(sumSquares / total);
  const noiseRms = Number.isFinite(minWindowMeanSquare) ? Math.sqrt(minWindowMeanSquare) : 0;
  const minSeconds = configFor(type).minValidMs / 1000;

  return buildResult([
    {
      id: 'min_duration',
      passed: durationSeconds >= minSeconds,
      measured: durationSeconds,
      failureMessage: FAIL.min_duration,
    },
    {
      id: 'max_silence',
      passed: silenceRatio <= maxSilenceRatioFor(type),
      measured: silenceRatio,
      failureMessage: FAIL.max_silence,
    },
    {
      id: 'clipping',
      passed: clipRatio <= thresholds.maxClipRatio,
      measured: clipRatio,
      failureMessage: FAIL.clipping,
    },
    {
      id: 'noise_floor',
      passed: noiseRms <= thresholds.maxNoiseFloorRms,
      measured: noiseRms,
      failureMessage: FAIL.noise_floor,
    },
    {
      id: 'overall_rms',
      passed: overallRms >= thresholds.minOverallRms,
      measured: overallRms,
      failureMessage: FAIL.overall_rms,
    },
  ]);
}
