import { base64ToBytes, parseHeartRate } from '../parse-hr';

describe('parseHeartRate', () => {
  it('parses a uint8 HR with no R-R intervals', () => {
    const result = parseHeartRate([0x00, 75]);
    expect(result).toEqual({ bpm: 75, rrMs: [], rrPresent: false });
  });

  it('parses a uint16 LE HR', () => {
    // flags=0x01 → HR is uint16 LE; 180 = 0x00B4 → bytes [0xB4, 0x00]
    const result = parseHeartRate([0x01, 0xb4, 0x00]);
    expect(result.bpm).toBe(180);
  });

  it('parses one R-R interval (raw 1024 → 1000 ms)', () => {
    // flags=0x10 (R-R present), HR=70 uint8, one R-R raw=1024 (0x0400)
    const result = parseHeartRate([0x10, 70, 0x00, 0x04]);
    expect(result).toEqual({ bpm: 70, rrMs: [1000], rrPresent: true });
  });

  it('parses multiple R-R intervals', () => {
    // raws 1024 (0x0400) and 512 (0x0200) → 1000, 500 ms
    const result = parseHeartRate([0x10, 70, 0x00, 0x04, 0x00, 0x02]);
    expect(result.rrMs).toEqual([1000, 500]);
    expect(result.rrPresent).toBe(true);
  });

  it('skips the Energy Expended field before reading R-R (bit3 + bit4)', () => {
    // flags=0x18, HR=70 uint8, 2 energy bytes (skipped), then R-R raw=1024
    const result = parseHeartRate([0x18, 70, 0xff, 0xff, 0x00, 0x04]);
    expect(result).toEqual({ bpm: 70, rrMs: [1000], rrPresent: true });
  });

  it('rounds the 1/1024 s R-R conversion rather than truncating', () => {
    // raw 1025 (0x0401): 1025 * 1000 / 1024 = 1000.98 -> round = 1001 (truncation would give 1000)
    const result = parseHeartRate([0x10, 70, 0x01, 0x04]);
    expect(result.rrMs).toEqual([1001]);

    // raw 1536 (0x0600): 1536 * 1000 / 1024 = 1500 exactly -> 1500
    const exact = parseHeartRate([0x10, 70, 0x00, 0x06]);
    expect(exact.rrMs).toEqual([1500]);
  });

  it('does not throw on a uint16 HR truncated to a single byte (bit0 set)', () => {
    // flags=0x11 (uint16 HR + R-R present), but only 1 HR byte present.
    let result: ReturnType<typeof parseHeartRate>;
    expect(() => {
      result = parseHeartRate([0x11, 0xb4]);
    }).not.toThrow();
    // Truncated HR field: bpm stays 0, rrPresent reflects the flag, no R-R read.
    expect(result!.bpm).toBe(0);
    expect(result!.rrPresent).toBe(true);
    expect(result!.rrMs).toEqual([]);
  });

  it('does not throw on a truncated packet (flags only)', () => {
    let result: ReturnType<typeof parseHeartRate>;
    expect(() => {
      result = parseHeartRate([0x10]);
    }).not.toThrow();
    expect(result!.rrPresent).toBe(true);
    expect(result!.rrMs).toEqual([]);
    expect(result!.bpm).toBe(0);
  });

  it('does not throw on a packet truncated mid-R-R (drops the partial value)', () => {
    // flags=0x10, HR=70, then only 1 byte of a 2-byte R-R
    let result: ReturnType<typeof parseHeartRate>;
    expect(() => {
      result = parseHeartRate([0x10, 70, 0x00]);
    }).not.toThrow();
    expect(result!.bpm).toBe(70);
    expect(result!.rrPresent).toBe(true);
    expect(result!.rrMs).toEqual([]);
  });
});

describe('base64ToBytes', () => {
  it('decodes standard padded base64', () => {
    // [0x10, 70, 0x00, 0x04] → "EEYABA=="
    const bytes = base64ToBytes('EEYABA==');
    expect(Array.from(bytes)).toEqual([0x10, 70, 0x00, 0x04]);
  });

  it('round-trips through parseHeartRate', () => {
    const result = parseHeartRate(base64ToBytes('EEYABA=='));
    expect(result).toEqual({ bpm: 70, rrMs: [1000], rrPresent: true });
  });
});
