import { sortIssues, type LintIssue } from './issue.ts';
import { loadContent, type ContentBundle } from './load-content.ts';
import { contentSafety } from './rules-safety.ts';
import { itemLiability, orphanFlags, undeclaredReferences } from './rules-references.ts';
import { localModifiers, missingCheckTags, tagCoverage } from './rules-registry.ts';
import {
  contradictoryRequires,
  duplicateIds,
  i18nCoverage,
  imageRefs,
  unreachableOutcomes,
  wordCounts,
} from './rules-structure.ts';

/**
 * Every rule, as data.
 *
 * A list rather than a sequence of calls so `--rules` can filter it, the report can name what
 * ran, and adding a rule is one line rather than three edits. Order does not affect the
 * result — issues are sorted by location before printing.
 */
export const RULES: readonly {
  readonly name: string;
  readonly run: (bundle: ContentBundle) => readonly LintIssue[];
}[] = [
  { name: 'references', run: undeclaredReferences },
  { name: 'orphan-flags', run: orphanFlags },
  { name: 'item-liability', run: itemLiability },
  { name: 'duplicate-ids', run: duplicateIds },
  { name: 'unreachable-outcomes', run: unreachableOutcomes },
  { name: 'contradictory-requires', run: contradictoryRequires },
  { name: 'local-modifiers', run: localModifiers },
  { name: 'check-tags', run: missingCheckTags },
  { name: 'tag-coverage', run: tagCoverage },
  { name: 'i18n', run: i18nCoverage },
  { name: 'word-counts', run: wordCounts },
  { name: 'images', run: imageRefs },
  { name: 'safety', run: contentSafety },
];

export type LintRun = {
  readonly issues: readonly LintIssue[];
  readonly ruleCount: number;
  readonly eventCount: number;
};

export function runLint(root: string, only: readonly string[] = []): LintRun {
  const bundle = loadContent(root);

  // Schema failures come first and are NOT a reason to stop: the other rules still run on
  // whatever loaded. A linter that gives up on the first bad file turns fixing a batch of
  // content into an N-round trip.
  const issues: LintIssue[] = [...bundle.issues];

  const selected = only.length === 0 ? RULES : RULES.filter((rule) => only.includes(rule.name));
  for (const rule of selected) issues.push(...rule.run(bundle));

  return {
    issues: sortIssues(issues),
    ruleCount: selected.length,
    eventCount: bundle.events.length,
  };
}
