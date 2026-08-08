import { CHECK_TAGS, SKILL_IMPLIES_TAG, type CheckTag } from '@odyssey/engine';
import { error, warn, type LintIssue } from './issue.ts';
import { type ContentBundle } from './load-content.ts';
import { fileFor } from './rules-references.ts';

/**
 * The rules that keep the modifier registry doing its job.
 *
 * D1's whole argument is that per-choice modifiers do not scale. These are what stop the
 * registry quietly decaying back into that: a modifier hand-copied instead of declared, a
 * check with tags too narrow to draw anything, a tag nothing covers.
 */

const MIN_EVENTS_PER_TAG = 3;
const MIN_MODIFIERS_PER_TAG = 5;

/**
 * LOCAL_MODIFIER — a modifier written onto a choice that belongs in the registry.
 *
 * Two signals, deliberately different severities. A local modifier with no `why` is an ERROR:
 * the authoring schema makes `why` the place you justify the exception, and an unjustified one
 * is the anti-pattern with no argument attached. The same `when`/`delta` pair appearing on two
 * or more choices is also an error — that is the copy-paste D1 exists to prevent, and it is
 * mechanically certain rather than a judgement.
 */
export function localModifiers(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Map<string, string[]>();

  for (const event of bundle.events) {
    const file = fileFor(bundle, String(event.id));
    for (const choice of event.choices) {
      const check = choice.skillCheck;
      if (check === null) continue;

      for (const modifier of check.modifiers) {
        const signature = `${JSON.stringify(modifier.when)}|${String(modifier.delta)}`;
        const where = `${String(event.id)}/${String(choice.id)}`;
        seen.set(signature, [...(seen.get(signature) ?? []), where]);

        const duplicate = bundle.modifiers.find(
          (row) =>
            JSON.stringify(row.when) === JSON.stringify(modifier.when) &&
            row.delta === modifier.delta,
        );
        if (duplicate !== undefined) {
          issues.push(
            error(
              'LOCAL_MODIFIER',
              file,
              `\`${where}\` repeats registry row \`${duplicate.id}\` — delete it and let the registry apply`,
            ),
          );
        }
      }
    }
  }

  for (const [signature, places] of seen) {
    if (places.length < 2) continue;
    issues.push(
      error(
        'LOCAL_MODIFIER',
        'modifiers.yaml',
        `the same modifier appears on ${String(places.length)} choices (${places.join(', ')}) — declare it once here. Signature: ${signature.slice(0, 80)}`,
      ),
    );
  }

  return issues;
}

/**
 * MISSING_CHECK_TAGS — a check whose tags are too narrow, starving it of modifiers.
 *
 * The failure this catches is silent: a check with the wrong tags still rolls, it just draws
 * nothing from the registry and the author never notices. Two forms, both mechanical:
 * omitting the tag the SKILL implies, and matching fewer registry rows than a check needs to
 * be worth having a registry at all.
 */
export function missingCheckTags(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];

  for (const event of bundle.events) {
    const file = fileFor(bundle, String(event.id));
    for (const choice of event.choices) {
      const check = choice.skillCheck;
      if (check === null) continue;

      const implied = SKILL_IMPLIES_TAG[check.skill];
      if (!check.tags.includes(implied)) {
        issues.push(
          error(
            'MISSING_CHECK_TAGS',
            file,
            `\`${String(choice.id)}\` rolls ${check.skill} but does not tag \`${implied}\`, so every ${implied} modifier misses it`,
          ),
        );
      }

      const reachable = bundle.modifiers.filter((row) =>
        row.appliesTo.some((tag) => check.tags.includes(tag)),
      );
      if (reachable.length === 0) {
        issues.push(
          error(
            'STARVED_CHECK',
            file,
            `\`${String(choice.id)}\` draws NO registry modifiers — its tags match nothing`,
          ),
        );
      }
    }
  }

  return issues;
}

/**
 * Every check tag should be earning its place: used by enough events to be a real category,
 * and covered by enough modifiers to be worth tagging.
 *
 * Warnings, not errors. A thin tag on a fixture corpus is expected; a thin tag on the seed
 * corpus is a design question, and the report is how it gets asked.
 */
export function tagCoverage(bundle: ContentBundle): readonly LintIssue[] {
  const eventsPerTag = new Map<CheckTag, number>();
  const modifiersPerTag = new Map<CheckTag, number>();

  for (const event of bundle.events) {
    const tags = new Set<CheckTag>();
    for (const choice of event.choices) {
      for (const tag of choice.skillCheck?.tags ?? []) tags.add(tag);
    }
    for (const tag of tags) eventsPerTag.set(tag, (eventsPerTag.get(tag) ?? 0) + 1);
  }

  for (const row of bundle.modifiers) {
    for (const tag of row.appliesTo) {
      modifiersPerTag.set(tag, (modifiersPerTag.get(tag) ?? 0) + 1);
    }
  }

  const issues: LintIssue[] = [];
  for (const tag of CHECK_TAGS) {
    const events = eventsPerTag.get(tag) ?? 0;
    const modifiers = modifiersPerTag.get(tag) ?? 0;

    if (events > 0 && events < MIN_EVENTS_PER_TAG) {
      issues.push(
        warn(
          'THIN_TAG',
          'modifiers.yaml',
          `\`${tag}\` is used by ${String(events)} event(s); a tag below ${String(MIN_EVENTS_PER_TAG)} is not a category yet`,
        ),
      );
    }
    if (events > 0 && modifiers < MIN_MODIFIERS_PER_TAG) {
      issues.push(
        warn(
          'THIN_TAG',
          'modifiers.yaml',
          `\`${tag}\` is covered by ${String(modifiers)} modifier(s), below ${String(MIN_MODIFIERS_PER_TAG)} — checks carrying it draw almost nothing`,
        ),
      );
    }
    if (events === 0 && modifiers > 0) {
      issues.push(
        warn(
          'UNUSED_TAG',
          'modifiers.yaml',
          `\`${tag}\` has ${String(modifiers)} modifier(s) and NO check uses it — those rows can never apply`,
        ),
      );
    }
  }

  return issues;
}
