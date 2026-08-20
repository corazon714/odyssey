import { describe, expect, it } from '@jest/globals';
import {
  BUDGET_MS,
  DROP_FACTOR,
  EMPTY_FOLD,
  WINDOW_FRAMES,
  foldFrame,
  type FrameFold,
} from '../frame-fold';

/**
 * The frame meter's arithmetic, tested here because it cannot be tested where it runs.
 *
 * `useFrameCallback` does not drive the readout under react-native-web, so a browser tells you
 * nothing about this fold. Without these tests the first place a mistake would surface is a device
 * session, which is the most expensive place to find one.
 */

const feed = (deltas: readonly (number | null)[], from: FrameFold = EMPTY_FOLD): FrameFold =>
  deltas.reduce<FrameFold>((acc, d) => foldFrame(acc, d), from);

describe('foldFrame — the reading the 60fps floor is actually about', () => {
  it('ignores the first frame rather than folding it in as zero', () => {
    // The one reading that would make a janky device look perfect: a null delta counted as 0 ms
    // divides by a smaller accumulator and reports an fps the display cannot produce.
    expect(foldFrame(EMPTY_FOLD, null)).toEqual(EMPTY_FOLD);
    const after = feed([null, 16.7, null, 16.7]);
    expect(after.frames).toBe(2);
    expect(after.accum).toBeCloseTo(33.4, 5);
  });

  it('keeps the WORST frame, not the mean — a hitch must survive an average', () => {
    // 59 good frames and one terrible one is a visible stutter and a passing mean. The gate is
    // the worst frame, so it has to be the number that survives the fold.
    const deltas = [...Array.from({ length: 59 }, () => 16.7), 92];
    const fold = feed(deltas);
    expect(fold.worst).toBe(92);
    expect(fold.fps).toBeGreaterThan(50);
  });

  it('counts a dropped frame at 1.5x budget, not at 1x', () => {
    // 1x would report ordinary vsync jitter as jank and the meter would never read zero.
    const justOver = BUDGET_MS * 1.2;
    const reallyOver = BUDGET_MS * DROP_FACTOR + 0.1;
    expect(feed([justOver, justOver, justOver]).dropped).toBe(0);
    expect(feed([reallyOver]).dropped).toBe(1);
  });

  it('publishes an fps only when a window closes, and reports a true 60', () => {
    const oneShort = feed(Array.from({ length: WINDOW_FRAMES - 1 }, () => 1000 / 60));
    expect(oneShort.fps).toBe(0);
    expect(oneShort.frames).toBe(WINDOW_FRAMES - 1);

    const closed = foldFrame(oneShort, 1000 / 60);
    expect(closed.fps).toBe(60);
    // The window resets so the next mean is not dragged by the last one...
    expect(closed.frames).toBe(0);
    expect(closed.accum).toBe(0);
  });

  it('does NOT reset worst or dropped when a window closes', () => {
    // ...but the worst frame of the whole SEQUENCE is what is being measured, not the worst frame
    // of the last second. Resetting these with the mean would quietly hide the hitch that a
    // replay was run to find.
    const withHitch = feed([...Array.from({ length: WINDOW_FRAMES - 1 }, () => 16.7), 120]);
    expect(withHitch.worst).toBe(120);
    expect(withHitch.dropped).toBe(1);
    expect(withHitch.fps).toBeGreaterThan(0);

    const later = feed(
      Array.from({ length: 10 }, () => 16.7),
      withHitch,
    );
    expect(later.worst).toBe(120);
    expect(later.dropped).toBe(1);
  });

  it('reports a slow device as slow — 30fps reads 30, not 60', () => {
    // The anti-vacuity check. A fold that always reported 60 would pass every test above that
    // only asserts "greater than 50".
    const fold = feed(Array.from({ length: WINDOW_FRAMES }, () => 1000 / 30));
    expect(fold.fps).toBe(30);
    expect(fold.dropped).toBe(WINDOW_FRAMES);
  });

  it('is pure — folding the same input twice from the same state gives the same result', () => {
    const a = feed([16.7, 33.4, 16.7]);
    const b = feed([16.7, 33.4, 16.7]);
    expect(a).toEqual(b);
    expect(EMPTY_FOLD).toEqual({ accum: 0, frames: 0, worst: 0, dropped: 0, fps: 0, meanMs: 0 });
  });
});
