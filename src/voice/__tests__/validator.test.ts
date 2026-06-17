import { parsePcm16, validateWav } from '../validator';

/**
 * Build a 16-bit PCM mono WAV ArrayBuffer with the given samples at `sampleRate`.
 * Mirrors the canonical 44-byte header (Android layout); the parser is also
 * exercised against a leading-filler-chunk variant below.
 */
function makeWav(samples: Int16Array, sampleRate = 44100): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits
  ascii(36, 'data');
  dv.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, samples[i], true);
  return buf;
}

/** A loud-ish sine tone (good signal): amplitude ~0.3 of full scale. */
function tone(seconds: number, sampleRate = 44100, freq = 200, amp = 0.3): Int16Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp * 32767);
  return out;
}

/**
 * A realistic "good" recording: a short quiet onset (the user tapping record /
 * breathing in) followed by sustained voice. The quiet onset gives the
 * noise-floor check a low quietest-window — a pure continuous tone never does,
 * which is unlike any real capture.
 */
function goodVoice(totalSeconds: number, sampleRate = 44100): Int16Array {
  const lead = Math.floor(0.6 * sampleRate); // ~0.6s near-silence
  const voiced = tone(totalSeconds - 0.6, sampleRate);
  const out = new Int16Array(lead + voiced.length);
  out.set(voiced, lead); // leading samples stay 0
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
    expect(parsed!.samples.length).toBe(44100);
  });

  it('walks past a leading filler chunk (iOS FLLR-style) to find data', () => {
    // Build fmt + a junk chunk + data, data not at offset 36.
    const samples = tone(0.5);
    const dataBytes = samples.length * 2;
    const junk = 8; // a 0-length-bodied filler is too trivial; give it a small body
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

describe('validateWav', () => {
  it('passes a good sustained vowel (quiet onset + 30s voice)', () => {
    const r = validateWav(makeWav(goodVoice(30)), 'sustained_vowel');
    expect(r.passed).toBe(true);
    expect(r.firstFailureMessage).toBeUndefined();
  });

  it('fails when too short', () => {
    const r = validateWav(makeWav(tone(3)), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.measuredFor('min_duration')).toBeCloseTo(3, 1);
    expect(r.firstFailureMessage).toMatch(/too short/i);
  });

  it('fails silence (low energy / mostly silent) even when long enough', () => {
    const silent = new Int16Array(44100 * 30); // 30s of zeros
    const r = validateWav(makeWav(silent), 'sustained_vowel');
    expect(r.passed).toBe(false);
    // overall RMS ~0 and silence ratio ~1 both trip.
    expect(r.measuredFor('overall_rms')).toBeLessThan(0.01);
  });

  it('fails clipping when most samples are at full scale', () => {
    const n = 44100 * 30;
    const clipped = new Int16Array(n);
    for (let i = 0; i < n; i++) clipped[i] = 32767;
    const r = validateWav(makeWav(clipped), 'sustained_vowel');
    expect(r.passed).toBe(false);
    expect(r.measuredFor('clipping')).toBeGreaterThan(0.01);
  });

  it('returns unreadable for non-WAV bytes', () => {
    const r = validateWav(new ArrayBuffer(8), 'reading_passage');
    expect(r.passed).toBe(false);
    expect(r.checks[0].id).toBe('readable');
  });
});
