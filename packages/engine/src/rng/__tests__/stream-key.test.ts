import { describe, expect, it } from 'vitest';
import { RNG_STREAMS } from '../rng-stream.ts';
import { createStreamKeys, deriveKey, streamKey } from '../stream-key.ts';
import { utf8Bytes } from '../utf8-bytes.ts';

describe('streamKey', () => {
  it('is deterministic', () => {
    expect(streamKey('abc', 'eventPick')).toBe(streamKey('abc', 'eventPick'));
  });

  it('differs per stream for one seed', () => {
    const keys = RNG_STREAMS.map((stream) => streamKey('one-seed', stream));
    expect(new Set(keys).size).toBe(RNG_STREAMS.length);
  });

  it('differs per seed for one stream', () => {
    const keys = Array.from({ length: 200 }, (_, i) => streamKey(`seed-${i}`, 'eventPick'));
    expect(new Set(keys).size).toBe(200);
  });

  it('decorrelates seeds that differ by one character', () => {
    const a = streamKey('seed-a', 'eventPick');
    const b = streamKey('seed-b', 'eventPick');
    expect(a).not.toBe(b);
    expect(a >>> 24).not.toBe(b >>> 24);
  });

  it('handles a non-ASCII seed', () => {
    // Seeds may be player-supplied. utf8Bytes must not throw on anything a string can hold.
    expect(() => streamKey('yolculuk-🚌-Ω', 'routeGen')).not.toThrow();
    expect(streamKey('yolculuk-🚌-Ω', 'routeGen')).toBe(streamKey('yolculuk-🚌-Ω', 'routeGen'));
  });

  it('is a uint32', () => {
    for (const stream of RNG_STREAMS) {
      const key = streamKey('bounds', stream);
      expect(key).toBeGreaterThanOrEqual(0);
      expect(key).toBeLessThanOrEqual(4294967295);
    }
  });
});

describe('createStreamKeys', () => {
  it('matches streamKey for every stream', () => {
    const keys = createStreamKeys('bulk');
    for (const stream of RNG_STREAMS) expect(keys[stream]).toBe(streamKey('bulk', stream));
  });
});

describe('deriveKey', () => {
  it('is deterministic and label-sensitive', () => {
    const base = streamKey('run', 'chanceGate');
    expect(deriveKey(base, 'border.bribe:4:0')).toBe(deriveKey(base, 'border.bribe:4:0'));
    expect(deriveKey(base, 'border.bribe:4:0')).not.toBe(deriveKey(base, 'border.bribe:5:0'));
  });

  it('separates labels across base keys', () => {
    const a = deriveKey(streamKey('run-a', 'chanceGate'), 'same-label');
    const b = deriveKey(streamKey('run-b', 'chanceGate'), 'same-label');
    expect(a).not.toBe(b);
  });
});

describe('utf8Bytes', () => {
  it('encodes ASCII as single bytes', () => {
    expect(utf8Bytes('abc')).toEqual([0x61, 0x62, 0x63]);
  });

  it('encodes two-byte and three-byte code points', () => {
    expect(utf8Bytes('Ω')).toEqual([0xce, 0xa9]);
    expect(utf8Bytes('€')).toEqual([0xe2, 0x82, 0xac]);
  });

  it('encodes a surrogate pair as one four-byte code point', () => {
    // '🚌' is U+1F68C. Encoding it as two three-byte surrogates instead would be CESU-8 and
    // would disagree with every published murmur3 vector.
    expect(utf8Bytes('🚌')).toEqual([0xf0, 0x9f, 0x9a, 0x8c]);
  });

  it('does not throw on a lone surrogate', () => {
    expect(() => utf8Bytes('\ud83d')).not.toThrow();
    expect(utf8Bytes('\ud83d')).toHaveLength(3);
  });

  it('is empty for an empty string', () => {
    expect(utf8Bytes('')).toEqual([]);
  });
});
