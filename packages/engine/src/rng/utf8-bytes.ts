/**
 * Encode a string as UTF-8 bytes, by hand.
 *
 * `TextEncoder` is not available: packages/engine/tsconfig.src.json sets `types: []` and
 * omits DOM from `lib`, so no host-provided encoder typechecks here (CLAUDE.md 2.2).
 *
 * Hashing UTF-16 code units directly would have been simpler and is tempting, since seeds
 * and stream names are ASCII in practice. It is rejected because UTF-8 is what every
 * published MurmurHash3 test vector is defined over — hashing code units would leave the
 * vector test comparing this implementation against itself, which proves nothing.
 *
 * Lone surrogates (a malformed string) encode as three bytes each rather than throwing.
 * That is WTF-8 rather than strict UTF-8, and it is the right trade here: a player-supplied
 * seed must never crash a run, and the result stays deterministic either way.
 */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];

  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);

    // Combine a well-formed surrogate pair into its single code point before encoding.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >>> 18),
        0x80 | ((code >>> 12) & 0x3f),
        0x80 | ((code >>> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return out;
}
