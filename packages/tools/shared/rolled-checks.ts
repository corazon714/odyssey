import { type CheckTag, type Choice, type SkillKey } from '@odyssey/engine';

/**
 * Everything a choice rolls, as one shape. Shared by `content-lint` and `content-stats`.
 *
 * A `search` resolves through the same `runSkillCheck` and draws from the same registry as a
 * `check` does, so any tool that reasons about check tags has to see both. It lives in
 * `shared/` because it has been got wrong twice in two places: `content-lint` read
 * `choice.skillCheck?.tags` until M0 added searches, and `content-stats` was still reading it
 * afterwards — which made the coverage report say the `search` tag was used by ONE choice when
 * three carry it, and the two that were invisible were the searches themselves. The instrument
 * that exists to find content holes had a hole in it.
 *
 * The schema guarantees at most one of `check`/`search` is non-null, so this yields 0 or 1. It
 * returns a list anyway so a future third kind of roll is one line here rather than a shape
 * change at every call site.
 */
export type RolledCheck = {
  /** `'check'` or `'search'` — for a report that wants to say which kind was starved. */
  readonly what: string;
  readonly skill: SkillKey;
  readonly tags: readonly CheckTag[];
};

export function rolledChecks(choice: Choice): readonly RolledCheck[] {
  if (choice.skillCheck !== null) {
    return [{ what: 'check', skill: choice.skillCheck.skill, tags: choice.skillCheck.tags }];
  }
  if (choice.search !== null) {
    return [{ what: 'search', skill: choice.search.skill, tags: choice.search.tags }];
  }
  return [];
}
