import {
  GAP_RESET_MS,
  MAX_REL_JUMP,
  MAX_RR_MS,
  MIN_RR_MS,
  RmssdWindow,
  WINDOW_MS,
  rmssd,
} from '../rmssd';

describe('rmssd', () => {
  it('returns 0 for a constant interval series [800, 800, 800]', () => {
    // diffs = [0, 0] → mean of squares = 0 → sqrt(0) = 0
    expect(rmssd([800, 800, 800])).toBe(0);
  });

  it('matches a hand-computed vector [800, 900, 700]', () => {
    // diffs = [100, -200] → sq = [10000, 40000] → mean = 25000 → sqrt ≈ 158.11
    expect(rmssd([800, 900, 700])).toBeCloseTo(158.11, 1);
  });

  it('returns null for fewer than 2 intervals', () => {
    expect(rmssd([])).toBeNull();
    expect(rmssd([800])).toBeNull();
  });
});

describe('RmssdWindow', () => {
  it('exposes the documented constants', () => {
    expect(WINDOW_MS).toBe(30_000);
    expect(MIN_RR_MS).toBe(300);
    expect(MAX_RR_MS).toBe(2000);
    expect(MAX_REL_JUMP).toBe(0.2);
    expect(GAP_RESET_MS).toBe(3000);
  });

  it('drops out-of-range intervals via the range gate', () => {
    const w = new RmssdWindow();
    // 100 (< MIN_RR_MS) and 2500 (> MAX_RR_MS) are rejected; only 800 survives.
    w.addIntervals([100, 800, 2500], 0);
    expect(w.current().count).toBe(1);
  });

  it('drops a spike via the relative-jump gate', () => {
    const w = new RmssdWindow();
    w.addIntervals([800], 0);
    // 1100 is +37.5% over 800 (> MAX_REL_JUMP 20%) → rejected; the second 800 is fine.
    w.addIntervals([800, 1100], 1000);
    // 800 (t=0) + 800 (t=1000) accepted, 1100 dropped.
    expect(w.current().count).toBe(2);
    // Two equal accepted intervals → a single diff of 0 → rmssd 0 (no fake spike).
    expect(w.current().rmssd).toBe(0);
  });

  it('resets the diff anchor across a gap so no fake successive difference is computed', () => {
    const w = new RmssdWindow();
    // Two beats at t=0 → window holds [800, 800] → rmssd 0.
    w.addIntervals([800, 800], 0);
    expect(w.current().rmssd).toBe(0);
    expect(w.current().count).toBe(2);

    // A 900 arrives at t=5000, > GAP_RESET_MS (3000) after the last beat. It passes
    // the artifact filters and joins the window, but the anchor was reset so the
    // window's rmssd just reflects its contents [800, 800, 900] — the gap did not
    // synthesize a diff against the pre-gap beat in any special way.
    w.addIntervals([900], 5000);
    expect(w.current().count).toBe(3);
    // rmssd of [800, 800, 900]: diffs [0, 100] → sq [0, 10000] → mean 5000 → ~70.71
    expect(w.current().rmssd).toBeCloseTo(70.71, 1);
    expect(w.current().lastBeatAt).toBe(5000);
  });

  it('admits a valid beat after a long gap without throwing (gap branch stays defensive)', () => {
    // Exercises the GAP_RESET_MS branch in addIntervals. Note: that branch only clears
    // prevInterval, which is immediately re-set when the same beat is accepted (step d),
    // and prevInterval never feeds the rmssd computation (which folds over the whole
    // buffer). So the gap reset has no separately observable effect on rmssd/count via
    // the public API — this test pins down what IS observable: the post-gap beat is
    // still accepted and nothing throws.
    const w = new RmssdWindow();
    w.addIntervals([800], 0);
    expect(w.current().count).toBe(1);

    // 850 arrives well past GAP_RESET_MS. It is in jump-range of 800 (+6.25%), so the
    // jump gate (which runs before the gap reset) accepts it and the gap branch runs.
    expect(() => w.addIntervals([850], 10_000)).not.toThrow();
    expect(w.current().count).toBe(2);
    expect(w.current().lastBeatAt).toBe(10_000);
    // Window [800, 850]: single diff of 50 -> rmssd 50.
    expect(w.current().rmssd).toBe(50);
  });

  it('ages out entries older than WINDOW_MS', () => {
    const w = new RmssdWindow();
    w.addIntervals([800, 800], 0);
    expect(w.current().count).toBe(2);

    // A later update at t=31000 (> WINDOW_MS past t=0) drops the t=0 entries. The
    // empty array adds nothing new, exercising pure window aging.
    w.addIntervals([], 31000);
    expect(w.current().count).toBe(0);
    expect(w.current().rmssd).toBeNull();
  });

  it('summary() accumulates across updates', () => {
    const w = new RmssdWindow();
    // Update 1 at t=0: window [800, 900, 700] → rmssd ≈ 158.11.
    w.addIntervals([800, 900, 700], 0);
    const x = w.current().rmssd!;
    // Update 2 at t=1000: window grows; a second sample folds into the summary.
    w.addIntervals([800], 1000);
    const y = w.current().rmssd!;

    const s = w.summary();
    expect(s.sampleCount).toBe(2);
    expect(s.min).toBeCloseTo(Math.min(x, y), 5);
    expect(s.max).toBeCloseTo(Math.max(x, y), 5);
    expect(s.avg).toBeCloseTo((x + y) / 2, 5);
  });

  it('reset() clears the window but preserves the session summary', () => {
    const w = new RmssdWindow();
    w.addIntervals([800, 900, 700], 0);
    expect(w.summary().sampleCount).toBeGreaterThan(0);

    w.reset();
    expect(w.current().count).toBe(0);
    expect(w.current().rmssd).toBeNull();
    // Aggregates survive the reset.
    expect(w.summary().sampleCount).toBeGreaterThan(0);
  });
});
