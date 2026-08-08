/**
 * The single place in the repository permitted to read the host clock.
 *
 * CLAUDE.md rule 2.3 bans `Date.now()` everywhere, because a run must be reproducible
 * from (seed, choiceSequence, contentVersion). That ban only works if there is exactly
 * one sanctioned boundary where real time enters the system — this file. Everything
 * downstream receives a timestamp as an argument and stays deterministic and testable.
 *
 * eslint.config.mjs grants the exemption to this path and nothing else. Phase 1 will
 * define the Clock port inside packages/engine and this becomes its app-side adapter.
 */

// eslint-disable-next-line no-restricted-properties -- the one sanctioned clock read; see above.
export const readSystemTimeMs = (): number => Date.now();
