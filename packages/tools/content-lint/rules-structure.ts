import { type GameEvent, type Predicate } from '@odyssey/engine';
import { error, warn, type LintIssue } from './issue.ts';
import { type ContentBundle } from './load-content.ts';
import { fileFor } from './rules-references.ts';

/**
 * Structural rules over a single event: duplicate ids, unreachable outcomes, and the
 * satisfiability fragment.
 */

export function duplicateIds(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];
  const seen = new Set<string>();

  for (const event of bundle.events) {
    const id = String(event.id);
    if (seen.has(id)) {
      issues.push(
        error('DUPLICATE_EVENT_ID', fileFor(bundle, id), `two events share the id \`${id}\``),
      );
    }
    seen.add(id);

    const choices = new Set<string>();
    for (const choice of event.choices) {
      if (choices.has(String(choice.id))) {
        issues.push(
          error(
            'DUPLICATE_CHOICE_ID',
            fileFor(bundle, id),
            `\`${id}\` has two choices called \`${String(choice.id)}\``,
          ),
        );
      }
      choices.add(String(choice.id));
    }
  }

  return issues;
}

/** A choice whose outcomes can never be selected is a dead branch nothing reports. */
export function unreachableOutcomes(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];

  for (const event of bundle.events) {
    const file = fileFor(bundle, String(event.id));
    for (const choice of event.choices) {
      const total = choice.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
      if (total <= 0) {
        issues.push(
          error(
            'ZERO_WEIGHT_CHOICE',
            file,
            `\`${String(choice.id)}\` has outcome weights summing to ${String(total)}; nothing can be picked`,
          ),
        );
      }

      // An outcome gated on a check result where the check cannot produce it. The schema
      // already refuses `onCheck` with no check at all; this catches the subtler half — every
      // outcome gated on one side, so the other side of the roll selects nothing.
      if (choice.skillCheck !== null && choice.outcomes.length > 0) {
        const sides = new Set(choice.outcomes.map((o) => o.onCheck));
        if (!sides.has(null) && sides.size === 1) {
          issues.push(
            warn(
              'ONE_SIDED_CHECK',
              file,
              `\`${String(choice.id)}\` rolls a check but every outcome is \`onCheck: ${String([...sides][0])}\` — the other result selects nothing`,
            ),
          );
        }
      }
    }
  }

  return issues;
}

/**
 * CONTRADICTORY_REQUIRES_NUMERIC — and the name carries its own limits on purpose.
 *
 * DECIDABLE: conjunctions of numeric comparisons on the same key inside an `all` (including
 * nested `all`s). Intersect the intervals; empty means the predicate can never be true.
 * Also decidable: an `all` containing `never`, and `flag isSet` beside `flag notSet` on the
 * same id.
 *
 * NOT DECIDABLE, and deliberately not attempted:
 *   - anything under `any` — satisfiable if any branch is;
 *   - anything involving `chance`;
 *   - every cross-key implication. `heat >= 6 AND cash >= 400` is satisfiable on paper and may
 *     be unreachable in play, and only the sim can say.
 *
 * A rule that claimed to find "contradictions" in general would be lying. This one says
 * NUMERIC in its name so the gap is visible at the call site of every suppression.
 */
export function contradictoryRequires(bundle: ContentBundle): readonly LintIssue[] {
  const issues: LintIssue[] = [];

  const check = (predicate: Predicate, where: string, file: string): void => {
    for (const conflict of findConflicts(predicate)) {
      issues.push(error('CONTRADICTORY_REQUIRES_NUMERIC', file, `${where}: ${conflict}`));
    }
  };

  for (const event of bundle.events) {
    const file = fileFor(bundle, String(event.id));
    check(event.requires, `\`${String(event.id)}\` requires`, file);
    for (const choice of event.choices) {
      check(choice.requires, `choice \`${String(choice.id)}\``, file);
      if (choice.hiddenUnless !== null) {
        check(choice.hiddenUnless, `choice \`${String(choice.id)}\` hiddenUnless`, file);
      }
      for (const outcome of choice.outcomes) {
        check(outcome.requires, `an outcome of \`${String(choice.id)}\``, file);
      }
    }
  }

  return issues;
}

type Interval = { min: number; max: number };

function findConflicts(predicate: Predicate): readonly string[] {
  if (predicate.kind !== 'all') return [];

  const out: string[] = [];
  const intervals = new Map<string, Interval>();
  const flagsSet = new Set<string>();
  const flagsUnset = new Set<string>();

  // Only descends through nested `all`s: everything under an `any` or a `not` is out of the
  // decidable fragment, and treating it as a conjunct would produce false positives.
  const visit = (node: Predicate): void => {
    if (node.kind === 'all') {
      node.of.forEach(visit);
      return;
    }
    if (node.kind === 'never') {
      out.push('contains `never`, so it can never be true');
      return;
    }
    if (node.kind === 'flag') {
      if (node.cmp.op === 'isSet') flagsSet.add(String(node.id));
      if (node.cmp.op === 'notSet') flagsUnset.add(String(node.id));
      return;
    }

    const key = numericKey(node);
    if (key === null) return;

    const current = intervals.get(key) ?? {
      min: Number.NEGATIVE_INFINITY,
      max: Number.POSITIVE_INFINITY,
    };
    const cmp = (node as { readonly cmp: { readonly op: string; readonly value: number } }).cmp;
    switch (cmp.op) {
      case 'gte':
        current.min = Math.max(current.min, cmp.value);
        break;
      case 'gt':
        current.min = Math.max(current.min, cmp.value + 1);
        break;
      case 'lte':
        current.max = Math.min(current.max, cmp.value);
        break;
      case 'lt':
        current.max = Math.min(current.max, cmp.value - 1);
        break;
      case 'eq':
        current.min = Math.max(current.min, cmp.value);
        current.max = Math.min(current.max, cmp.value);
        break;
      default:
        return; // `neq` does not narrow an interval.
    }
    intervals.set(key, current);
  };

  visit(predicate);

  for (const [key, span] of intervals) {
    if (span.min > span.max) {
      out.push(`${key} must be >= ${String(span.min)} and <= ${String(span.max)}`);
    }
  }
  for (const id of flagsSet) {
    if (flagsUnset.has(id)) out.push(`flag \`${id}\` must be both set and not set`);
  }

  return out;
}

/** A stable key for the meter a numeric comparison reads, or null if it reads none. */
function numericKey(node: Predicate): string | null {
  switch (node.kind) {
    case 'resource':
      return `resource:${node.key}`;
    case 'skill':
      return `skill:${node.key}`;
    case 'transportStat':
      return `transport:${node.key}`;
    case 'item':
      return `item:${String(node.id)}:${String(node.in ?? 'any')}`;
    case 'leg':
      return 'leg';
    case 'day':
      return 'day';
    case 'tension':
      return 'tension';
    default:
      return null;
  }
}

/** Pillar 5: readable in 15 seconds. Needs the locale, so it is skipped without one. */
export function wordCounts(bundle: ContentBundle): readonly LintIssue[] {
  const locale = bundle.locale;
  if (locale === null) return [];

  const issues: LintIssue[] = [];
  const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

  for (const event of bundle.events) {
    const file = fileFor(bundle, String(event.id));
    const body = locale.get(event.bodyKey);
    if (body !== undefined && words(body) > 60) {
      issues.push(
        warn('BODY_TOO_LONG', file, `body is ${String(words(body))} words; pillar 5 caps it at 60`),
      );
    }
    for (const choice of event.choices) {
      const label = locale.get(choice.labelKey);
      if (label !== undefined && words(label) > 8) {
        issues.push(
          warn(
            'CHOICE_TOO_LONG',
            file,
            `\`${String(choice.id)}\` is ${String(words(label))} words; pillar 5 caps it at 8`,
          ),
        );
      }
    }
  }

  return issues;
}

/** Every key an event derives must exist in `en/`. */
export function i18nCoverage(bundle: ContentBundle): readonly LintIssue[] {
  if (bundle.locale === null) {
    // ONE finding, not a hundred. Reporting every missing key when the real problem is an
    // absent locale buries the cause under its own consequences.
    return [
      warn(
        'MISSING_LOCALE',
        'i18n/en',
        'no en/*.json at all, so every derived key is unresolvable — key coverage is not checked',
      ),
    ];
  }

  const locale = bundle.locale;
  const issues: LintIssue[] = [];
  for (const event of bundle.events) {
    const file = fileFor(bundle, String(event.id));
    for (const key of keysOf(event)) {
      if (!locale.has(key)) {
        issues.push(error('MISSING_I18N_KEY', file, `\`${key}\` is not in en/`));
      }
    }
  }
  return issues;
}

function keysOf(event: GameEvent): readonly string[] {
  const keys = [event.titleKey, event.bodyKey];
  for (const choice of event.choices) {
    keys.push(choice.labelKey);
    for (const outcome of choice.outcomes) {
      keys.push(outcome.textKey, ...outcome.textVariants);
    }
  }
  return keys;
}

/** Every `image:` must resolve in the manifest. */
export function imageRefs(bundle: ContentBundle): readonly LintIssue[] {
  const used = bundle.events.filter((e) => e.image !== null);
  if (used.length === 0) return [];

  if (bundle.images === null) {
    return [
      warn(
        'MISSING_IMAGE_MANIFEST',
        'images/manifest.json',
        `${String(used.length)} event(s) reference an image but the manifest does not exist`,
      ),
    ];
  }

  const images = bundle.images;
  return used
    .filter((event) => event.image !== null && !images.has(event.image))
    .map((event) =>
      error(
        'UNKNOWN_IMAGE_REF',
        fileFor(bundle, String(event.id)),
        `image \`${String(event.image)}\` is not in images/manifest.json`,
      ),
    );
}
