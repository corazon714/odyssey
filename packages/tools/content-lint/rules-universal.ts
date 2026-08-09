import { injectUniversalChoices, tagsOf } from '@odyssey/engine';
import { error, warn, type LintIssue } from './issue.ts';
import { type ContentBundle } from './load-content.ts';
import { fileFor } from './rules-references.ts';

/**
 * The rules that keep `universal-choices.yaml` honest.
 *
 * These run the REAL splice (`injectUniversalChoices`) rather than reimplementing its matching,
 * cap and family logic. A linter with its own copy of the rule it is checking reports on a
 * second implementation, and the first divergence between them is a rule that passes on
 * content the engine will treat differently — which is the exact failure this whole tool
 * exists to prevent.
 */

const FILE = 'universal-choices.yaml';

export function universalChoices(bundle: ContentBundle): readonly LintIssue[] {
  const registry = bundle.universalChoices;
  if (registry.length === 0) return [];

  const issues: LintIssue[] = [];

  // A row whose tags match no event in the corpus can never be injected. Distinct from the
  // rule below because the fix is different: this is a typo'd or aspirational tag, not a row
  // losing a contest.
  const corpusTags = new Set(bundle.events.flatMap((event) => tagsOf(event)));
  const unmatched = registry.filter((row) => !row.appliesTo.some((tag) => corpusTags.has(tag)));
  for (const row of unmatched) {
    issues.push(
      warn(
        'UNIVERSAL_MATCHES_NOTHING',
        FILE,
        `\`${row.id}\` applies to [${row.appliesTo.join(', ')}], which no event carries — it can never be injected`,
      ),
    );
  }

  const injected = injectUniversalChoices(bundle.events, registry);

  // A collision should be impossible: ids are minted with a prefix `ID_PATTERN` forbids. If one
  // ever appears the prefix rule has broken, and the consequence is silent — the player picks
  // the injected choice and gets the authored one's outcomes.
  for (const clash of injected.shadowed) {
    issues.push(
      error(
        'UNIVERSAL_SHADOWED',
        fileFor(bundle, String(clash.event)),
        `\`${clash.row}\` would inject \`${String(clash.choiceId)}\`, which \`${String(clash.event)}\` already authors — the injected row was dropped`,
      ),
    );
  }

  // A row that matches events but never survives the cap or its family is dead weight that
  // reads as coverage. Only detectable by running the splice.
  const landed = new Set<string>();
  for (const event of injected.events) {
    for (const choice of event.choices) landed.add(String(choice.id));
  }
  const neverInjected = registry.filter(
    (row) => !landed.has(String(row.choice.id)) && !unmatched.includes(row),
  );
  for (const row of neverInjected) {
    issues.push(
      warn(
        'UNIVERSAL_NEVER_INJECTED',
        FILE,
        `\`${row.id}\` matches events but is beaten out of every one by priority, the family cap, or the 3-per-event limit`,
      ),
    );
  }

  return issues;
}
