import { describe, expect, it } from 'vitest';
import { isWearNote, WEAR_BANDS, wearChipKey, wearJournalKey } from '../../state/wear-state.ts';
import { type HistoryEntry } from '../../state/history-entry.ts';
import { eventId } from '../../ids/content-ids.ts';
import { FULL_UNTIL, MID_SPAN, wearBandAt, wearRatePercent, worn } from '../wear-curve.ts';

/**
 * THE SHAPE, NEVER THE CONSTANTS.
 *
 * `FULL_UNTIL` is about to be swept, so a test that asserts 160 — or asserts a worn value
 * computed from 160 — is a test that forbids the sweep. Every expectation below is derived from
 * the exported constants, which is the discipline `world-tick.test.ts` had to learn three times
 * (once per meter) before it stuck: a literal that happens to equal today's constant silently
 * caps that constant, and fails later as an arithmetic accident rather than a broken property.
 *
 * The properties themselves are the reasons the curve has this shape and must not move.
 */

/** Far enough past the tail boundary to exercise all three bands whatever the knee is. */
const BEYOND = FULL_UNTIL + MID_SPAN * 3;

describe('worn — the curve itself', () => {
  it('is the identity at or below the knee, exactly', () => {
    // THE property that makes a short route bit-identical rather than merely close. If this
    // ever returns `h - 1` for some sub-knee `h`, every fixture golden moves for no mechanic.
    for (let h = 0; h <= FULL_UNTIL; h += 1) expect(worn(h)).toBe(h);
  });

  it('is monotone non-decreasing', () => {
    let previous = worn(0);
    for (let h = 1; h <= BEYOND; h += 1) {
      const current = worn(h);
      expect(current, `worn(${String(h)}) went backwards`).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('returns an integer for every integer hour', () => {
    // Not fussiness: a float reaches a resource delta, therefore the digest, therefore every
    // golden run — the one place a V8/Hermes rounding difference would be least visible.
    for (let h = 0; h <= BEYOND; h += 1) expect(Number.isInteger(worn(h))).toBe(true);
  });

  it('never charges a leg MORE than it lasted — the span identity', () => {
    // `worn(a + b) - worn(a) <= b` for every span, which is what guarantees the curve can only
    // ever make a run go further. A rounding scheme with slope > 1 anywhere would let a leg
    // straddling a boundary cost more than it did before the curve existed.
    for (let a = 0; a <= BEYOND; a += 1) {
      for (const b of [1, 2, 3, 5, 8, 12, 30]) {
        expect(worn(a + b) - worn(a), `span ${String(a)}+${String(b)}`).toBeLessThanOrEqual(b);
      }
    }
  });

  it('never charges a negative span', () => {
    for (let a = 0; a <= BEYOND; a += 1) {
      for (const b of [0, 1, 12, 30]) {
        expect(worn(a + b) - worn(a)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  /*
   * THE FENCE THAT WAS HERE IS DELETED, and the deletion is the finding.
   *
   * It read "is the identity function outright when the knee outruns the longest route", set
   * `const longestConceivableRoute = FULL_UNTIL`, and looped `worn(h) === h` to there. That is
   * the domain "is the identity at or below the knee, exactly" already pins POINTWISE, so the
   * test could not fail unless that one failed first — and the case it NAMED, a knee parked
   * above every route in the corpus, was never probed at all.
   *
   * It cannot be probed from here. `FULL_UNTIL` is a module constant read at import, so a test
   * cannot move the knee out from under `worn`, and every property restricted to `h <= knee`
   * is a corollary of the pointwise identity — the slope, the span form `worn(a+b) - worn(a)`,
   * all of it. A restatement would have re-asserted coverage that is not there, which is worse
   * than the gap: this file's own header is about literals that silently cap a constant.
   *
   * What actually holds the claim up is elsewhere and is real: the pointwise identity above,
   * the `bends` test below (anti-vacuity in the other direction), and the golden runs, which
   * measure the fixture routes against whatever knee is compiled in. Moving the knee 160 -> 200
   * at M3.12b changed three of the nine goldens and NOTHING in this file, which is exactly the
   * split that shows where the fence really lives.
   */

  it('bends: a span past the knee costs strictly less than the same span before it', () => {
    // Anti-vacuity. Every property above is satisfied by `worn = identity`, so one test has to
    // prove the curve actually bends — stated as a comparison between two spans of EQUAL
    // length, so it holds for any knee the sweep picks.
    const span = MID_SPAN;
    const before = worn(span) - worn(0);
    const after = worn(FULL_UNTIL + MID_SPAN + span) - worn(FULL_UNTIL + MID_SPAN);
    expect(after).toBeLessThan(before);
  });
});

describe('wearBandAt — which rate the next hour is charged at', () => {
  it('names every band somewhere on the curve, and only those', () => {
    const seen = new Set([0, FULL_UNTIL, FULL_UNTIL + MID_SPAN, BEYOND].map(wearBandAt));
    expect([...seen].sort()).toEqual([...WEAR_BANDS].sort());
  });

  it('reads the rate the run is about to pay, not the one it just left', () => {
    // Exactly `FULL_UNTIL` is already `mid`: `worn` there is still the identity, but the NEXT
    // hour is a half-rate hour. Off-by-one here would emit the chip a leg late.
    expect(wearBandAt(FULL_UNTIL - 1)).toBe('full');
    expect(wearBandAt(FULL_UNTIL)).toBe('mid');
    expect(wearBandAt(FULL_UNTIL + MID_SPAN - 1)).toBe('mid');
    expect(wearBandAt(FULL_UNTIL + MID_SPAN)).toBe('tail');
  });

  it('never goes backwards as travel accumulates', () => {
    let rank = 0;
    for (let h = 0; h <= BEYOND; h += 1) {
      const next = WEAR_BANDS.indexOf(wearBandAt(h));
      expect(next).toBeGreaterThanOrEqual(rank);
      rank = next;
    }
  });
});

describe('legibility — design pillar 2 (the player can reconstruct why)', () => {
  it('reports a strictly falling rate, and starts at 100%', () => {
    // Derived from the fractions rather than asserting 100/50/25, so the tail band can move
    // without this test having an opinion about it.
    const rates = WEAR_BANDS.map(wearRatePercent);
    expect(rates[0]).toBe(100);
    for (let i = 1; i < rates.length; i += 1) {
      expect(rates[i], `band ${String(WEAR_BANDS[i])}`).toBeLessThan(rates[i - 1] ?? 0);
    }
  });

  it('derives a distinct journal key and chip key per band', () => {
    const journal = new Set(WEAR_BANDS.map(wearJournalKey));
    const chips = new Set(WEAR_BANDS.map(wearChipKey));
    expect(journal.size).toBe(WEAR_BANDS.length);
    expect(chips.size).toBe(WEAR_BANDS.length);
    // Two families, never one: a journal line is read weeks later in the run's own record, a
    // chip is read on the leg it happened. Sharing a key would force one register on both.
    for (const key of journal) expect(chips.has(key)).toBe(false);
  });

  it('recognises its own note and nothing else', () => {
    // What stops `tension.ts` reading a band change as designed silence and ending the streak
    // on a leg where a high-tension event demonstrably fired.
    const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
      legIndex: 3,
      day: 1,
      eventId: null,
      choiceId: null,
      textKey: wearJournalKey('mid'),
      params: {},
      tags: [],
      ...over,
    });

    expect(isWearNote(entry({}))).toBe(true);
    expect(isWearNote(entry({ textKey: 'journal.leg.quiet' }))).toBe(false);
    // An entry that names an event is a verdict however it is keyed — the null id is half the
    // definition, and dropping it would let a fired event masquerade as an annotation.
    expect(isWearNote(entry({ eventId: eventId('border.bribe_attempt') }))).toBe(false);
  });
});
