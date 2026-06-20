/**
 * On-device WAV quality validation. Parses raw 16-bit PCM samples and runs a set
 * of GATING checks (level, clipping, true SNR, detected voiced speech, format)
 * before a recording is accepted, plus PAYLOAD-ONLY checks (noise floor, silence
 * ratio) that are measured + emitted for capture_metadata but never gate. v1 is
 * STRICT pass/fail — a failed gating check forces a re-record (marginal "yellow
 * warning" handling is v2).
 *
 * This gate measures RECORDING QUALITY ONLY — level, clipping, background noise,
 * and whether enough clear speech was captured. It is NOT a voice-health screen:
 * it must never key on jitter, shimmer, hoarseness, or any pathology signal. A
 * rough or disordered voice is a valid user; that analysis is the server's job.
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
  | 'format'
  | 'min_duration'
  | 'max_silence'
  | 'clipping'
  | 'noise_floor'
  | 'overall_rms'
  | 'too_quiet'
  | 'too_hot'
  | 'snr'
  | 'voiced';

export type VoiceCheck = {
  id: VoiceCheckId;
  passed: boolean;
  /**
   * Whether this check drives the pass/fail decision. Payload-only checks
   * (noise_floor, max_silence) are emitted with `gating: false` and forced
   * `passed: true` so they still satisfy `measuredFor` for capture_metadata but
   * never block a recording or surface as `firstFailureMessage`.
   */
  gating: boolean;
  /** Measured value (ratio, RMS, dB, or seconds) — for tuning + logs. */
  measured: number;
  /** User-facing message shown when this check fails. */
  failureMessage?: string;
};

export type VoiceValidationResult = {
  checks: VoiceCheck[];
  passed: boolean;
  /** The first GATING failure's message (the recording screen shows one reason). */
  firstFailureMessage?: string;
  /** Measured value for a check id (for capture_metadata at upload time). */
  measuredFor: (id: VoiceCheckId) => number;
};

/** Tunable thresholds. */
export const DEFAULT_THRESHOLDS = {
  /** A sample is "silent" below this normalized amplitude (~ -50 dBFS). */
  silenceAmplitude: 0.003,
  /** A sample is "clipped" at/above this (~ -0.09 dBFS). */
  clipAmplitude: 0.99,
  /** Fail if more than this fraction of samples are clipped. */
  maxClipRatio: 0.01,
  /** Sliding window (ms) for the noise-floor estimate; take the QUIETEST window. */
  noiseWindowMs: 500,
  /** Fail if overall RMS is below this (~ -40 dBFS) — mic didn't pick up voice. */
  minOverallRms: 0.01,
  /** Peak too quiet: FAIL if peak < this (~ -30 dBFS). */
  peakTooQuiet: 0.0316,
  /** Peak too hot: FAIL if peak > this (~ -1 dBFS). */
  peakTooHot: 0.891,
  /** SNR floor (dB): FAIL if framed SNR is below this. */
  // THRESHOLD: tune on-device (LOE risk #6)
  minSnrDb: 18,
  /** Frame size (ms) for SNR framing and VAD framing. */
  frameMs: 30,
  /** Decimation target (Hz) for the VAD's averaging low-pass. */
  vadTargetHz: 8000,
  /** Pitch autocorrelation search range (Hz). */
  pitchMinHz: 70,
  pitchMaxHz: 400,
};

export type VoiceThresholds = typeof DEFAULT_THRESHOLDS;

const FAIL = {
  format: 'We couldn’t process that recording. Please try again.',
  min_duration: 'Recording too short. Please try again.',
  too_loud:
    'Your audio was too loud and distorted — move back from the mic or speak a little softer, then try again.',
  too_quiet: 'We could barely hear you — move closer to the mic and record in a quieter spot.',
  snr: 'Too much background noise — please record in a quiet room.',
  voiced: 'We didn’t detect enough clear speech — please complete the full task.',
} as const;

function buildResult(checks: VoiceCheck[]): VoiceValidationResult {
  const firstFail = checks.find((c) => c.gating && !c.passed);
  return {
    checks,
    passed: checks.every((c) => !c.gating || c.passed),
    firstFailureMessage: firstFail?.failureMessage,
    measuredFor: (id) => checks.find((c) => c.id === id)?.measured ?? 0,
  };
}

export function unreadableResult(): VoiceValidationResult {
  return buildResult([
    {
      id: 'readable',
      passed: false,
      gating: true,
      measured: 0,
      failureMessage: 'We couldn’t read that recording. Please try again.',
    },
  ]);
}

/**
 * Parse a 16-bit PCM WAV. Returns { samples, sampleRate, numChannels } or null if
 * it isn't RIFF/WAVE/PCM/16-bit. Walks the RIFF chunk list rather than assuming
 * the canonical 44-byte layout: iOS (CoreAudio) writes extra chunks (FLLR filler,
 * sometimes 'fact') between 'fmt ' and 'data', so 'data' is not at offset 36.
 * Android's minimal 44-byte header is just the case where 'data' is first.
 *
 * This is a PURE header/sample parser: it returns the parsed header (samples,
 * rate, channel count) even for stereo/48k. The format GATE lives in
 * `validateWav` so the gating pipeline owns the reject decision and tests can
 * assert on the parsed header independently. For multi-channel data the returned
 * `samples` stay INTERLEAVED (no downmix) — `validateWav` rejects non-mono.
 */
export function parsePcm16(
  buf: ArrayBuffer,
): { samples: Int16Array; sampleRate: number; numChannels: number } | null {
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
  const samples = new Int16Array(buf, dataStart, sampleCount);
  return { samples, sampleRate, numChannels };
}

/** Result of the bounded SNR framing pass. */
function framedSnrDb(samples: Int16Array, sampleRate: number, frameMs: number): number {
  const frameSize = Math.max(1, Math.floor((frameMs * sampleRate) / 1000));
  const frameCount = Math.floor(samples.length / frameSize);
  if (frameCount < 2) return Number.POSITIVE_INFINITY; // too short to frame — don't gate on SNR
  const rms: number[] = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    const base = f * frameSize;
    for (let i = 0; i < frameSize; i++) {
      const amp = samples[base + i] / 32768;
      sum += amp * amp;
    }
    rms[f] = Math.sqrt(sum / frameSize);
  }
  rms.sort((a, b) => a - b);
  const tenth = Math.max(1, Math.floor(frameCount * 0.1));
  let noiseSum = 0;
  for (let i = 0; i < tenth; i++) noiseSum += rms[i];
  const noiseRms = noiseSum / tenth;
  let speechSum = 0;
  for (let i = frameCount - tenth; i < frameCount; i++) speechSum += rms[i];
  const speechRms = speechSum / tenth;
  // Floor both terms so an all-zero quiet (or silent) window can't make SNR
  // ±Infinity and pass/break the gate; the ratio stays a real, finite number.
  // With speech ~0 this lands near 0 dB and correctly fails the 18 dB gate.
  const noise = Math.max(noiseRms, 1e-6);
  const speech = Math.max(speechRms, 1e-6);
  return 20 * Math.log10(speech / noise);
}

/**
 * Decimate to ~targetHz with an averaging low-pass (box-average over each
 * decimation block) to avoid aliasing — NOT stride/pick-every-Nth.
 */
function decimateAveraging(
  samples: Int16Array,
  sampleRate: number,
  targetHz: number,
): { decimated: Float32Array; rate: number } {
  const factor = Math.max(1, Math.round(sampleRate / targetHz));
  const outLen = Math.floor(samples.length / factor);
  const decimated = new Float32Array(outLen);
  for (let o = 0; o < outLen; o++) {
    let sum = 0;
    const base = o * factor;
    for (let k = 0; k < factor; k++) sum += samples[base + k] / 32768;
    decimated[o] = sum / factor;
  }
  return { decimated, rate: sampleRate / factor };
}

/** Autocorrelation pitch check: true if a clear periodic peak exists in 70-400 Hz. */
function isPeriodic(
  frame: Float32Array,
  rate: number,
  pitchMinHz: number,
  pitchMaxHz: number,
): boolean {
  const minLag = Math.max(1, Math.floor(rate / pitchMaxHz));
  const maxLag = Math.min(frame.length - 1, Math.floor(rate / pitchMinHz));
  if (maxLag <= minLag) return false;
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (energy === 0) return false;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < frame.length; i++) corr += frame[i] * frame[i + lag];
    const norm = corr / energy;
    if (norm > bestCorr) bestCorr = norm;
  }
  // A clear periodic peak: normalized autocorrelation above 0.5 at some lag.
  return bestCorr >= 0.5;
}

/**
 * Energy+pitch VAD over a decimated copy. Returns longest contiguous voiced run
 * (seconds) and total voiced seconds.
 */
function voicedSeconds(
  samples: Int16Array,
  sampleRate: number,
  thresholds: VoiceThresholds,
): { longestRunMs: number; totalMs: number } {
  const { decimated, rate } = decimateAveraging(samples, sampleRate, thresholds.vadTargetHz);
  const frameSize = Math.max(1, Math.floor((thresholds.frameMs * rate) / 1000));
  const frameCount = Math.floor(decimated.length / frameSize);
  if (frameCount === 0) return { longestRunMs: 0, totalMs: 0 };

  // Per-frame RMS to set an energy floor relative to the whole clip.
  const rms = new Float32Array(frameCount);
  let maxRms = 0;
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    const base = f * frameSize;
    for (let i = 0; i < frameSize; i++) sum += decimated[base + i] * decimated[base + i];
    const r = Math.sqrt(sum / frameSize);
    rms[f] = r;
    if (r > maxRms) maxRms = r;
  }
  const energyFloor = maxRms * 0.1; // a voiced frame must carry >=10% of peak-frame energy

  const frameMsActual = (frameSize / rate) * 1000;
  let totalFrames = 0;
  let longestRun = 0;
  let run = 0;
  for (let f = 0; f < frameCount; f++) {
    const base = f * frameSize;
    const frame = decimated.subarray(base, base + frameSize);
    const voiced =
      rms[f] > energyFloor &&
      rms[f] > 0 &&
      isPeriodic(frame, rate, thresholds.pitchMinHz, thresholds.pitchMaxHz);
    if (voiced) {
      totalFrames++;
      run++;
      if (run > longestRun) longestRun = run;
    } else {
      run = 0;
    }
  }
  return { longestRunMs: longestRun * frameMsActual, totalMs: totalFrames * frameMsActual };
}

/**
 * Validate the WAV bytes against the type's expectations.
 *
 * Gating-check ORDER drives `firstFailureMessage`:
 *   format -> min_duration(sanity) -> too-quiet/level -> too-hot/clipping -> SNR -> voiced.
 * Payload-only checks (noise_floor, max_silence) are emitted with gating:false
 * and forced passed:true so they never surface as a failure.
 */
export function validateWav(
  buf: ArrayBuffer,
  type: VoiceRecordingType,
  thresholds: VoiceThresholds = DEFAULT_THRESHOLDS,
): VoiceValidationResult {
  const parsed = parsePcm16(buf);
  if (!parsed) return unreadableResult();
  const { samples, sampleRate, numChannels } = parsed;
  const total = samples.length;
  if (total === 0 || sampleRate <= 0) return unreadableResult();

  // Item 4 — format gate. Reject (don't coerce) non-mono / non-{44100,48000}.
  // Our recorder always emits mono 44.1k, so this firing means it regressed.
  const formatOk = (sampleRate === 44100 || sampleRate === 48000) && numChannels === 1;
  if (!formatOk) {
    console.warn(
      `[voice] unexpected recording format: rate=${sampleRate} channels=${numChannels} bits=16`,
    );
    return buildResult([
      {
        id: 'format',
        passed: false,
        gating: true,
        measured: sampleRate,
        failureMessage: FAIL.format,
      },
    ]);
  }

  const durationSeconds = total / sampleRate;
  const windowSize = Math.max(1, Math.floor((thresholds.noiseWindowMs * sampleRate) / 1000));

  // Single pass: silence, clipping, overall energy, peak, and per-window energy
  // for the quietest-window noise floor (robust to immediate speakers).
  let silentCount = 0;
  let clippedCount = 0;
  let sumSquares = 0;
  let maxAmp = 0;
  let windowSumSquares = 0;
  let windowFill = 0;
  let minWindowMeanSquare = Number.POSITIVE_INFINITY;

  for (let i = 0; i < total; i++) {
    const amp = Math.abs(samples[i]) / 32768; // normalize 16-bit → [0,1]
    if (amp > maxAmp) maxAmp = amp;
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
  const peak = maxAmp;
  const noiseRms = Number.isFinite(minWindowMeanSquare) ? Math.sqrt(minWindowMeanSquare) : 0;
  const minSeconds = configFor(type).minValidMs / 1000;

  const snrDb = framedSnrDb(samples, sampleRate, thresholds.frameMs);
  const { longestRunMs, totalMs } = voicedSeconds(samples, sampleRate, thresholds);

  const cfg = configFor(type);
  const voicedMeasuredMs = cfg.requiresContinuousVoiced ? longestRunMs : totalMs;
  const voicedOk = voicedMeasuredMs >= cfg.minVoicedMs;

  return buildResult([
    // --- GATING checks, in firstFailureMessage priority order ---
    {
      id: 'min_duration',
      passed: durationSeconds >= minSeconds,
      gating: true,
      measured: durationSeconds,
      failureMessage: FAIL.min_duration,
    },
    {
      id: 'too_quiet',
      passed: peak >= thresholds.peakTooQuiet,
      gating: true,
      measured: peak,
      failureMessage: FAIL.too_quiet,
    },
    {
      id: 'overall_rms',
      passed: overallRms >= thresholds.minOverallRms,
      gating: true,
      measured: overallRms,
      failureMessage: FAIL.too_quiet,
    },
    {
      id: 'too_hot',
      passed: peak <= thresholds.peakTooHot,
      gating: true,
      measured: peak,
      failureMessage: FAIL.too_loud,
    },
    {
      id: 'clipping',
      passed: clipRatio <= thresholds.maxClipRatio,
      gating: true,
      measured: clipRatio,
      failureMessage: FAIL.too_loud,
    },
    {
      id: 'snr',
      passed: snrDb >= thresholds.minSnrDb,
      gating: true,
      measured: snrDb,
      failureMessage: FAIL.snr,
    },
    {
      id: 'voiced',
      passed: voicedOk,
      gating: true,
      measured: voicedMeasuredMs / 1000,
      failureMessage: FAIL.voiced,
    },
    // --- PAYLOAD-ONLY checks: measured + emitted for capture_metadata, never gate ---
    {
      id: 'noise_floor',
      passed: true,
      gating: false,
      measured: noiseRms,
    },
    {
      id: 'max_silence',
      passed: true,
      gating: false,
      measured: silenceRatio,
    },
  ]);
}
