import { murmur3Bytes } from './murmur3.ts';
import { utf8Bytes } from './utf8-bytes.ts';

/**
 * Hash a string to a uint32 with MurmurHash3 x86_32 over its UTF-8 bytes.
 *
 * Used to turn text — a run seed, a stream name, a content id — into a numeric key. The
 * UTF-8 step is what lets hash-string.test.ts check against published vectors instead of
 * against this implementation's own output.
 */
export function hashString32(text: string, seed: number): number {
  return murmur3Bytes(utf8Bytes(text), seed);
}
