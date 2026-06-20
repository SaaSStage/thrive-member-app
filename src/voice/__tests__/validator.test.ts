import { parsePcm16, validateWav } from '../validator';

/**
 * Build a 16-bit PCM WAV ArrayBuffer with the given samples at `sampleRate`.
 * Mirrors the canonical 44-byte header (Android layout); the parser is also
 * exercised against a leading-filler-chunk variant below. `samples` for stereo
 * must already be INTERLEAVED L,R,L,R...; `channels` only sets the header.
 */
function makeWav(samples: Int16Array, sampleRate = 44100, channels = 1): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  const blockAlign = channels * 2;
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * blockAlign, true); // byte rate
  dv.setUint16(32, blockAlign, true); // block align
  dv.setUint16(34, 16, true); // bits
  ascii(36, 'data');
  dv.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, samples[i], true);
  return buf;
}

/** A loud-ish sine tone (good periodic signal): amplitude ~0.3 of full scale. */
function tone(seconds: number, sampleRate = 44100, freq = 200, amp = 0.3): Int16Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp * 32767);
  return out;
}

/**
 * A clearly-periodic "voiced" waveform: a fundamental + a couple of harmonics
 * (like a vowel). Autocorrelation finds a strong peak at the fundamental lag.
 */
function voiced(seconds: number, sampleRate = 44100, f0 = 150, amp = 0.3): Int16Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const s =
      Math.sin(2 * Math.PI * f0 * t) +
      0.5 * Math.sin(2 * Math.PI * 2 * f0 * t) +
      0.33 * Math.sin(2 * Math.PI * 3 * f0 * t);
    out[i] = Math.round((s / 1.83) * amp * 32767); // normalize harmonic sum to ~amp
  }
  return out;
}

/** Matched-RMS white noise (unvoiced): same energy as a voiced clip, no period. */
function noise(seconds: number, sampleRate = 44100, amp = 0.3): Int16Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Int16Array(n);
  // Deterministic LCG so tests are stable.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff; // [0,1)
  };
  // White noise RMS for uniform[-A,A] is A/sqrt(3); pick A so RMS ≈ amp/sqrt(2)
  // (matching a sine of amplitude `amp`). A = amp * sqrt(3/2).
  const A = amp * Math.sqrt(1.5);
  for (let i = 0; i < n; i++) out[i] = Math.round((rand() * 2 - 1) * A * 32767);
  return out;
}

/**
 * A realistic "good" recording: a short quiet onset (the user tapping record /
 * breathing in) followed by sustained periodic voice, over a faint broadband
 * noise bed. The bed is essential: a pure synthetic tone has zero noise floor and
 * a flat per-frame RMS (so framed SNR collapses to ~0 dB) — unlike any real
 * capture. The bed gives a non-zero `noise_floor` and a real speech/noise spread
 * that clears the 18 dB SNR gate, while staying quiet enough not to trip it.
 */
function goodVoice(totalSeconds: number, sampleRate = 44100): Int16Array {
  // ~15% noise-only onset/tail (record tap-in + trailing quiet). The quietest-10%
  // SNR estimate needs at least that fraction of genuine noise-only frames, or a
  // perfectly steady tone collapses to ~0 dB SNR. Real captures always have it.
  const lead = Math.floor(0.12 * totalSeconds * sampleRate);
  const tail = Math.floor(0.06 * totalSeconds * sampleRate);
  const bodySeconds = totalSeconds - (lead + tail) / sampleRate;
  const body = voiced(bodySeconds, sampleRate, 150, 0.3);
  const total = lead + body.length + tail;
  const bed = noise(total / sampleRate + 1, sampleRate, 0.01); // faint bed (~ -40 dBFS peak)
  const out = new Int16Array(total);
  for (let i = 0; i < out.length; i++) {
    const v = i >= lead && i < lead + body.length ? body[i - lead] : 0;
    out[i] = Math.max(-32768, Math.min(32767, v + bed[i]));
  }
  return out;
}

describe('parsePcm16', () => {
  it('rejects non-RIFF data', () => {
    expect(parsePcm16(new ArrayBuffer(8))).toBeNull();
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer;
    expect(parsePcm16(garbage)).toBeNull();
  });

  it('parses a canonical 44-byte WAV header', () => {
    const parsed = parsePcm16(makeWav(tone(1)));
    expect(parsed).not.toBeNull();
    expect(parsed!.sampleRate).toBe(44100);
    expect(parsed!.numChannels).toBe(1);
    expect(parsed!.samples.length).toBe(44100);
  });

  it('returns the parsed header (numChannels) for stereo without downmixing', () => {
    const stereo = makeWav(tone(0.5), 44100, 2);
    const parsed = parsePcm16(stereo);
    expect(parsed).not.toBeNull();
    expect(parsed!.numChannels).toBe(2);
    // Interleaved samples are kept as-is (no downmix in the parser).
    expect(parsed!.samples.length).toBe(44100 * 0.5);
  });

  it('walks past a leading filler chunk (iOS FLLR-style) to find data', () => {
    const samples = tone(0.5);
    const dataBytes = samples.length * 2;
    const junk = 8;
    const buf = new ArrayBuffer(12 + 24 + (8 + junk) + 8 + dataBytes);
    const dv = new DataView(buf);
    const ascii = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
    };
    ascii(0, 'RIFF');
    dv.setUint32(4, buf.byteLength - 8, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, 44100, true);
    dv.setUint32(28, 88200, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    let o = 36;
    ascii(o, 'FLLR');
    dv.setUint32(o + 4, junk, true);
    o += 8 + junk;
    ascii(o, 'data');
    dv.setUint32(o + 4, dataBytes, true);
    o += 8;
    for (let i = 0; i < samples.length; i++) dv.setInt16(o + i * 2, samples[i], true);

    const parsed = parsePcm16(buf);
    expect(parsed).not.toBeNull();
    expect(parsed!.samples.length).toBe(samples.length);
  });
});

describe('validateWav — gating', () => {
  it('passes a good sustained vowel (quiet onset + voiced tone)', () => {
    const r = validateWav(makeWav(goodVoice(30)), 'sustained_vowel');
    expect(r.passed).toBe(true);
    expect(r.firstFailureMessage).toBeUndefined();
  });

  it('passes a clean voiced reading passage of sufficient length', () => {
    const r = validateWav(makeWav(goodVoice(30)), 'reading_passage');
    expect(r.passed).toBe(true);
  });

  it('passes a clean voiced diadochokinetic clip of sufficient length', () => {
    const r = validateWav(makeWav(goodVoice(10)), 'diadochokinetic');
    expect(r.passed).toBe(true);
  });

  it('fails when too short (min_duration sanity gate)', () => {
    const r = validateWav(makeWav(voiced(3)), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.measuredFor('min_duration')).toBeCloseTo(3, 1);
    expect(r.firstFailureMessage).toMatch(/too short/i);
  });

  it('fails too-hot/clipping with the exact too-loud copy', () => {
    const n = 44100 * 30;
    const clipped = new Int16Array(n);
    for (let i = 0; i < n; i++) clipped[i] = 32767;
    const r = validateWav(makeWav(clipped), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.firstFailureMessage).toBe(
      'Your audio was too loud and distorted — move back from the mic or speak a little softer, then try again.',
    );
  });

  it('fails too-quiet (low peak) with the exact too-quiet copy', () => {
    // Voiced but scaled way down: peak well below -30 dBFS and RMS below floor.
    const quiet = voiced(30, 44100, 150, 0.005);
    const r = validateWav(makeWav(quiet), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.measuredFor('too_quiet')).toBeLessThan(0.0316);
    expect(r.measuredFor('overall_rms')).toBeLessThan(0.01);
    expect(r.firstFailureMessage).toBe(
      'We could barely hear you — move closer to the mic and record in a quieter spot.',
    );
  });

  it('fails low-SNR with the exact noise copy', () => {
    // Voiced tone + strong broadband noise so framed SNR < 18 dB but level is OK.
    const sv = voiced(30, 44100, 150, 0.3);
    const nz = noise(30, 44100, 0.25);
    const mixed = new Int16Array(sv.length);
    for (let i = 0; i < sv.length; i++) {
      mixed[i] = Math.max(-32768, Math.min(32767, sv[i] + nz[i]));
    }
    const r = validateWav(makeWav(mixed), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.measuredFor('snr')).toBeLessThan(18);
    expect(r.firstFailureMessage).toBe('Too much background noise — please record in a quiet room.');
  });

  it('fails insufficient-voiced (long, loud, but unvoiced) with the exact speech copy', () => {
    // Long enough, level OK, and with a real loud/quiet spread (alternating loud
    // noise bursts over a faint bed) so the framed SNR clears 18 dB — but every
    // frame is broadband noise, never periodic, so the voiced gate is the one
    // that fires (proving SNR alone can't substitute for voiced detection).
    const sr = 44100;
    const seconds = 30;
    const n = seconds * sr;
    const bed = noise(seconds, sr, 0.01); // faint floor → SNR has headroom
    const burst = noise(seconds, sr, 0.3); // loud broadband
    const buf = new Int16Array(n);
    const period = sr; // 1s on / 1s off
    for (let i = 0; i < n; i++) {
      const loud = Math.floor(i / (period / 2)) % 2 === 0;
      buf[i] = loud ? burst[i] : bed[i];
    }
    const r = validateWav(makeWav(buf), 'reading_passage');
    expect(r.passed).toBe(false);
    expect(r.measuredFor('snr')).toBeGreaterThanOrEqual(18);
    expect(r.firstFailureMessage).toBe(
      'We didn’t detect enough clear speech — please complete the full task.',
    );
  });

  it('VAD distinguishes voiced (periodic) from matched-RMS noise at the same length', () => {
    const sr = 44100;
    const seconds = 30;

    // Voiced case: a clean 30s good take. The voiced gate is satisfied.
    const voicedR = validateWav(makeWav(goodVoice(seconds, sr)), 'reading_passage');
    expect(voicedR.passed).toBe(true);
    expect(voicedR.measuredFor('voiced')).toBeGreaterThanOrEqual(20);

    // Noise case: loud broadband bursts over a faint bed (mirrors the existing
    // insufficient-voiced fixture) so framed SNR clears 18 dB and level is fine,
    // but no frame is ever periodic. Same length, comparable energy — only the
    // VAD's periodicity test separates them.
    const n = seconds * sr;
    const bed = noise(seconds, sr, 0.01);
    const burst = noise(seconds, sr, 0.3);
    const buf = new Int16Array(n);
    const period = sr; // 1s on / 1s off
    for (let i = 0; i < n; i++) {
      const loud = Math.floor(i / (period / 2)) % 2 === 0;
      buf[i] = loud ? burst[i] : bed[i];
    }
    const noiseR = validateWav(makeWav(buf), 'reading_passage');
    expect(noiseR.passed).toBe(false);
    // NOT failing on energy/SNR: SNR clears the 18 dB gate and the clip is loud.
    expect(noiseR.measuredFor('snr')).toBeGreaterThanOrEqual(18);
    expect(noiseR.measuredFor('overall_rms')).toBeGreaterThan(0.05);
    // The VAD actively REJECTED the noise frames (near-zero voiced detected), not
    // that it accepted most and merely fell below the 20s gate. Measured = 0s.
    expect(noiseR.measuredFor('voiced')).toBeLessThan(4);
    // The voiced gate is the one that fires — periodicity, not energy.
    expect(noiseR.firstFailureMessage).toBe(
      'We didn’t detect enough clear speech — please complete the full task.',
    );
  });

  it('sustained_vowel passes with a single contiguous 4s+ voiced run', () => {
    // goodVoice(30) has a single long contiguous voiced body (no internal gaps),
    // so the longest-contiguous-run measurement (requiresContinuousVoiced) clears
    // the 4s floor. This locks in the POSITIVE direction of the continuity gate
    // (the existing split-2s+2s test covers the negative).
    const r = validateWav(makeWav(goodVoice(30)), 'sustained_vowel');
    expect(r.passed).toBe(true);
    // Tighter than the 4s gate floor (which passed===true already implies): assert
    // the longest CONTIGUOUS voiced run reflects the real ~24s body, proving the
    // VAD didn't fragment the sustained run into short pieces. Measured ~24.6s.
    expect(r.measuredFor('voiced')).toBeGreaterThanOrEqual(20);
  });

  it('sustained_vowel fails when 4s of voiced is split into 2s + 2s (no contiguous run)', () => {
    // 2s voiced, ~1s silence gap, 2s voiced, padded out to satisfy min_duration.
    const sr = 44100;
    const v1 = voiced(2, sr);
    const gap = new Int16Array(Math.floor(1 * sr));
    const v2 = voiced(2, sr);
    const tail = new Int16Array(Math.floor(16 * sr)); // pad to >20s for min_duration
    const buf = new Int16Array(v1.length + gap.length + v2.length + tail.length);
    let o = 0;
    buf.set(v1, o);
    o += v1.length;
    o += gap.length;
    buf.set(v2, o);
    o += v2.length;
    const r = validateWav(makeWav(buf), 'sustained_vowel');
    expect(r.passed).toBe(false);
    // The longest contiguous voiced run is ~2s, below the 4s continuous floor.
    expect(r.measuredFor('voiced')).toBeLessThan(4);
    expect(r.firstFailureMessage).toBe(
      'We didn’t detect enough clear speech — please complete the full task.',
    );
  });

  it('firstFailureMessage surfaces format over level when a stereo take is also too quiet', () => {
    // Stereo (format fail) AND too-quiet at once. Format gates first and short-
    // circuits before any level check, so it must win.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = validateWav(makeWav(voiced(30, 44100, 150, 0.005), 44100, 2), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.checks[0].id).toBe('format');
    expect(r.firstFailureMessage).toBe('We couldn’t process that recording. Please try again.');
    warn.mockRestore();
  });

  it('an earlier gate (too_quiet) suppresses a later gate (snr) message at runtime', () => {
    // RUNTIME-ordering proof (not array-position): pick a fixture where BOTH an
    // earlier gate (too_quiet) AND a later gate (snr) genuinely fail, then assert
    // firstFailureMessage carries the EARLIER gate's copy — proving too_quiet wins
    // over snr at selection time, not merely that they sit in a fixed array order.
    // A very quiet steady tone trips too_quiet (peak ≪ 0.0316) and also collapses
    // framed SNR toward ~0 dB (no real noise bed / flat per-frame RMS) → < 18.
    const r = validateWav(makeWav(voiced(30, 44100, 150, 0.005)), 'sustained_vowel');
    expect(r.passed).toBe(false);
    // (a) too_quiet DID trip.
    expect(r.measuredFor('too_quiet')).toBeLessThan(0.0316);
    // (b) snr ALSO tripped — so multiple gates really are failing simultaneously.
    expect(r.measuredFor('snr')).toBeLessThan(18);
    // (c) the EARLIER gate's message wins; the later snr message is suppressed.
    expect(r.firstFailureMessage).toBe(
      'We could barely hear you — move closer to the mic and record in a quieter spot.',
    );
    expect(r.firstFailureMessage).not.toBe(
      'Too much background noise — please record in a quiet room.',
    );
  });
});

describe('validateWav — format', () => {
  it('passes a 48 kHz mono header on format', () => {
    const r = validateWav(makeWav(goodVoice(30, 48000), 48000), 'sustained_vowel');
    // Format must not be the failure; the take is otherwise good.
    expect(r.checks.find((c) => c.id === 'format')).toBeUndefined();
    expect(r.passed).toBe(true);
  });

  it('rejects a wrong sample rate (22050) as a format failure and warns', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = validateWav(makeWav(voiced(1, 22050), 22050), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.checks[0].id).toBe('format');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects stereo (numChannels=2) as a format failure without downmix and warns', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = validateWav(makeWav(tone(1), 44100, 2), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.checks[0].id).toBe('format');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('validateWav — payload-compat invariant', () => {
  it('emits real, non-zero measured values for the four payload ids', () => {
    // overall_rms / noise_floor / max_silence carry real measured numbers on a
    // normal good take. clip_ratio is legitimately 0 on clean audio (any clipped
    // sample is >= clipAmplitude 0.99, which also exceeds peakTooHot 0.891, so a
    // gate-passing take has no clipping), so its non-zero plumbing is asserted on
    // a clipped take below. A zero here would mean a check id went missing and
    // measuredFor silently returned its `?? 0` fallback — the regression we guard.
    const good = validateWav(makeWav(goodVoice(30)), 'sustained_vowel');
    expect(good.passed).toBe(true);
    expect(good.measuredFor('overall_rms')).toBeGreaterThan(0);
    expect(good.measuredFor('noise_floor')).toBeGreaterThan(0);
    expect(good.measuredFor('max_silence')).toBeGreaterThan(0);
    expect(good.checks.some((c) => c.id === 'clipping')).toBe(true);

    // A clipped take proves measuredFor('clipping') returns the real ratio.
    const n = 44100 * 30;
    const clipped = new Int16Array(n);
    for (let i = 0; i < n; i++) clipped[i] = 32767;
    const hot = validateWav(makeWav(clipped), 'sustained_vowel');
    expect(hot.measuredFor('clipping')).toBeGreaterThan(0);
  });

  it('payload-only checks never gate and never surface as firstFailureMessage', () => {
    // Even on a failing take, noise_floor / max_silence stay passed:true.
    // voiced(3) is 3s long → fails ONLY the min_duration gate (it's a clean loud
    // tone, so level/clip/snr/voiced would otherwise pass), isolating the gate.
    const r = validateWav(makeWav(voiced(3)), 'sustained_vowel');
    const noiseFloor = r.checks.find((c) => c.id === 'noise_floor')!;
    const maxSilence = r.checks.find((c) => c.id === 'max_silence')!;
    expect(noiseFloor.gating).toBe(false);
    expect(noiseFloor.passed).toBe(true);
    expect(maxSilence.gating).toBe(false);
    expect(maxSilence.passed).toBe(true);
    // firstFailureMessage is the min_duration gate's exact production copy — NOT a
    // payload-only check leaking (those have no failureMessage and never gate).
    expect(r.firstFailureMessage).toBe('Recording too short. Please try again.');
    // The check whose message surfaced must itself be a gating check.
    const surfaced = r.checks.find((c) => c.failureMessage === r.firstFailureMessage)!;
    expect(surfaced.gating).toBe(true);
  });

  it('noise_floor and max_silence always carry passed:true regardless of measured value', () => {
    const sr = 44100;
    // A clipped (too-hot) take.
    const clipped = new Int16Array(sr * 30);
    for (let i = 0; i < clipped.length; i++) clipped[i] = 32767;
    // A low-SNR mixed take (loud voiced + loud broadband noise).
    const sv = voiced(30, sr, 150, 0.3);
    const nz = noise(30, sr, 0.25);
    const mixed = new Int16Array(sv.length);
    for (let i = 0; i < sv.length; i++) {
      mixed[i] = Math.max(-32768, Math.min(32767, sv[i] + nz[i]));
    }

    const fixtures: Array<{ label: string; buf: ArrayBuffer }> = [
      { label: 'good', buf: makeWav(goodVoice(30)) },
      { label: 'clipped', buf: makeWav(clipped) },
      { label: 'too-quiet', buf: makeWav(voiced(30, sr, 150, 0.005)) },
      { label: 'low-snr', buf: makeWav(mixed) },
    ];

    for (const { buf } of fixtures) {
      const r = validateWav(buf, 'sustained_vowel');
      const noiseFloor = r.checks.find((c) => c.id === 'noise_floor')!;
      const maxSilence = r.checks.find((c) => c.id === 'max_silence')!;
      expect(noiseFloor.passed).toBe(true);
      expect(noiseFloor.gating).toBe(false);
      expect(maxSilence.passed).toBe(true);
      expect(maxSilence.gating).toBe(false);
    }

    // And at least one of those fixtures (every one except the good take) fails
    // overall — proving the payload-only checks stay passed:true even then.
    const failing = fixtures
      .slice(1)
      .map((f) => validateWav(f.buf, 'sustained_vowel'));
    expect(failing.every((r) => r.passed === false)).toBe(true);
  });
});

describe('validateWav — unreadable', () => {
  it('returns unreadable for non-WAV bytes', () => {
    const r = validateWav(new ArrayBuffer(8), 'reading_passage');
    expect(r.passed).toBe(false);
    expect(r.checks[0].id).toBe('readable');
  });
});
