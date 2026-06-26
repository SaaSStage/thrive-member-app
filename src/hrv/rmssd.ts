/**
 * Rolling-window RMSSD (root mean square of successive differences) for HRV.
 *
 * RMSSD is the standard short-term HRV time-domain metric: the square root of the
 * mean of the squared differences between successive R-R intervals. This module
 * keeps a sliding WINDOW_MS buffer of accepted beats, computes RMSSD over the
 * current window, and accumulates a session-level summary.
 *
 * R-R intervals arriving from a chest strap are noisy: dropped/extra beats produce
 * implausible or spiky values. Two artifact filters run before an interval is
 * accepted into the window:
 *   - range gate: reject anything outside [MIN_RR_MS, MAX_RR_MS]
 *   - relative-jump gate: reject a beat that differs from the previous accepted
 *     beat by more than MAX_REL_JUMP (fraction of the previous interval)
 *
 * A connection gap (no beats for longer than GAP_RESET_MS) resets the successive-
 * difference anchor so we never compute a difference across the gap.
 */

export const WINDOW_MS = 30_000;
export const MIN_RR_MS = 300;
export const MAX_RR_MS = 2000;
export const MAX_REL_JUMP = 0.2;
export const GAP_RESET_MS = 3000;

type WindowEntry = {
  intervalMs: number;
  arrivedAt: number;
};

export function rmssd(intervalsMs: number[]): number | null {
  if (intervalsMs.length < 2) return null;

  let sumSq = 0;
  for (let i = 1; i < intervalsMs.length; i++) {
    const diff = intervalsMs[i] - intervalsMs[i - 1];
    sumSq += diff * diff;
  }

  const meanSq = sumSq / (intervalsMs.length - 1);
  return Math.sqrt(meanSq);
}

export class RmssdWindow {
  private buffer: WindowEntry[] = [];
  private prevInterval: number | null = null;
  private lastBeatAt: number | null = null;

  private avg: number | null = null;
  private min: number | null = null;
  private max: number | null = null;
  private sampleCount = 0;

  addIntervals(rrMs: number[], nowMs: number): void {
    for (const intervalMs of rrMs) {
      // (a) range gate
      if (intervalMs < MIN_RR_MS || intervalMs > MAX_RR_MS) continue;

      // (b) gap handling: a long silence means the successive difference across
      // the gap is meaningless, so reset the anchor before judging this beat.
      // Clearing prevInterval here makes the relative-jump gate below skip the
      // first post-gap beat (it has nothing valid to compare against).
      if (this.lastBeatAt !== null && nowMs - this.lastBeatAt > GAP_RESET_MS) {
        this.prevInterval = null;
      }

      // (c) relative-jump gate (only when we have a previous accepted interval)
      if (
        this.prevInterval !== null &&
        Math.abs(intervalMs - this.prevInterval) / this.prevInterval > MAX_REL_JUMP
      ) {
        continue;
      }

      this.buffer.push({ intervalMs, arrivedAt: nowMs });

      // (d) advance the anchor and last-beat timestamp
      this.prevInterval = intervalMs;
      this.lastBeatAt = nowMs;
    }

    // Age out entries older than the window.
    const cutoff = nowMs - WINDOW_MS;
    this.buffer = this.buffer.filter((e) => e.arrivedAt >= cutoff);

    // Fold the current window's RMSSD into the session summary.
    const value = rmssd(this.buffer.map((e) => e.intervalMs));
    if (value !== null) {
      this.sampleCount += 1;
      this.avg = this.avg === null ? value : this.avg + (value - this.avg) / this.sampleCount;
      this.min = this.min === null ? value : Math.min(this.min, value);
      this.max = this.max === null ? value : Math.max(this.max, value);
    }
  }

  current(): { rmssd: number | null; count: number; lastBeatAt: number | null } {
    return {
      rmssd: rmssd(this.buffer.map((e) => e.intervalMs)),
      count: this.buffer.length,
      lastBeatAt: this.lastBeatAt,
    };
  }

  reset(): void {
    this.buffer = [];
    this.prevInterval = null;
    this.lastBeatAt = null;
  }

  summary(): { avg: number | null; min: number | null; max: number | null; sampleCount: number } {
    return {
      avg: this.avg,
      min: this.min,
      max: this.max,
      sampleCount: this.sampleCount,
    };
  }
}
