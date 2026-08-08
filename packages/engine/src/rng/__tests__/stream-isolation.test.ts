import { describe, expect, it } from 'vitest';
import { drawWord } from '../draw-word.ts';
import { fmix32 } from '../mix32.ts';
import { createRng } from '../rng.ts';
import { createRngCursors } from '../rng-cursors.ts';
import { RNG_STREAMS, type RngStream } from '../rng-stream.ts';
import { createStreamKeys, streamKey } from '../stream-key.ts';

/**
 * The most important test in the engine (docs/PROGRESS.md, M1 acceptance criterion 4).
 *
 * If drawing from one substream can shift another, then adding a single event to the
 * content pack invalidates every golden run and every regression test at once. That failure
 * would not be loud — the runs would simply differ — so it has to be pinned here.
 */

const SEED = 'isolation-fixture';
const counters = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Every ordered pair of distinct streams: 8 x 7 = 56 cases. */
const STREAM_PAIRS: [RngStream, RngStream][] = RNG_STREAMS.flatMap((a) =>
  RNG_STREAMS.filter((b) => b !== a).map((b): [RngStream, RngStream] => [a, b]),
);

function drawN(rng: ReturnType<typeof createRng>, stream: RngStream, n: number): number[] {
  return counters(n).map(() => rng.nextWord(stream));
}

describe('rng substream isolation (PROGRESS.md M1.4)', () => {
  it('covers every ordered stream pair', () => {
    // Guards against the table silently emptying if RNG_STREAMS is refactored.
    expect(STREAM_PAIRS).toHaveLength(56);
  });

  it.each(STREAM_PAIRS)('drawing 1000 from %s does not shift %s', (busy, observed) => {
    const baseline = drawN(createRng(SEED, createRngCursors()), observed, 32);

    const disturbed = createRng(SEED, createRngCursors());
    drawN(disturbed, busy, 1000);

    expect(drawN(disturbed, observed, 32)).toEqual(baseline);
  });

  it.each(STREAM_PAIRS)('%s and %s produce different words at the same cursor', (a, b) => {
    // Non-interference alone is not isolation: two streams could be non-interfering and
    // still emit the SAME sequence. This asserts they are genuinely independent.
    const keys = createStreamKeys(SEED);
    const wordsA = counters(16).map((c) => drawWord(keys[a], c));
    const wordsB = counters(16).map((c) => drawWord(keys[b], c));

    expect(wordsA).not.toEqual(wordsB);
  });

  it('gives every stream a distinct key across 100 seeds', () => {
    for (let s = 0; s < 100; s += 1) {
      const keys = RNG_STREAMS.map((stream) => streamKey(`seed-${s}`, stream));
      expect(new Set(keys).size).toBe(RNG_STREAMS.length);
    }
  });

  it('would expose the additive-offset generator that was rejected', () => {
    // GUARD THE GUARD, and the reason this file is worth reading.
    //
    // The original brief proposed `splitmix(streamKey + cursor * GAMMA)`. That scheme
    // passes the non-interference test above trivially — each stream still depends only on
    // its own cursor — while being catastrophically wrong: two keys that differ by a
    // multiple of GAMMA are the SAME sequence, merely shifted. Without this case, an
    // implementation with that flaw would show green.
    const GAMMA = 0x9e3779b9;
    const naive = (key: number, counter: number): number =>
      fmix32((key + Math.imul(counter, GAMMA)) >>> 0);

    const keyA = 12345;
    const keyB = (keyA + GAMMA) >>> 0;

    const naiveA = counters(10).map((c) => naive(keyA, c));
    const naiveB = counters(10).map((c) => naive(keyB, c));
    expect(naiveB.slice(0, 9)).toEqual(naiveA.slice(1, 10));

    // The generator actually shipped has no such relationship at the same offset.
    const realA = counters(10).map((c) => drawWord(keyA, c));
    const realB = counters(10).map((c) => drawWord(keyB, c));
    expect(realB.slice(0, 9)).not.toEqual(realA.slice(1, 10));
  });
});
