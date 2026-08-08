import { warn, type LintIssue } from './issue.ts';
import { type ContentBundle } from './load-content.ts';

/**
 * CLAUDE.md §11, as far as a regex can honestly take it.
 *
 * WARNINGS, NEVER ERRORS, and that is the load-bearing decision. These patterns are
 * false-positive-prone by nature — "Turkish coffee" is not a nationality slur and "Czech the
 * papers" is a typo, not a country. A §11 rule that fails CI on a false positive gets
 * suppressed, and a suppressed §11 check is strictly worse than no check, because it looks
 * like coverage.
 *
 * It scans the LOCALE, not the YAML. Event files contain no prose at all — that is what the
 * derived-key design bought — so the only place a §11 violation can live is a translation.
 * With no locale there is nothing to scan, and the report says so rather than passing quietly.
 *
 * "Geography is real; character is not" is the rule these serve. The map uses real cities and
 * borders — that is a feature. What is banned is attaching DANGER, CORRUPTION or BEHAVIOUR to
 * a named real place or people.
 */

/** Nationality/demonym-shaped words next to a behaviour word. Deliberately narrow. */
const BEHAVIOUR = String.raw`(?:corrupt|bribe|bribes|bribed|thief|thieves|steal|steals|stole|lazy|violent|dangerous|criminal|smuggler)`;
const DEMONYM = String.raw`\b[A-Z][a-z]{3,}(?:ian|ish|ese|ean|i|an)\b`;

const PATTERNS: readonly {
  readonly rule: string;
  readonly re: RegExp;
  readonly why: string;
}[] = [
  {
    rule: 'SAFETY_GROUP_BEHAVIOUR',
    re: new RegExp(
      `${DEMONYM}[^.]{0,40}\\b${BEHAVIOUR}\\b|\\b${BEHAVIOUR}\\b[^.]{0,40}${DEMONYM}`,
      'i',
    ),
    why: 'reads as attaching behaviour to a nationality — §11: corruption is a SITUATION, not a people',
  },
  {
    rule: 'SAFETY_ACTIONABLE',
    re: /\b(?:how to (?:forge|fake|smuggle|conceal)|forge a passport|hide (?:drugs|contraband) in)\b/i,
    why: 'reads as real-world actionable instruction — §11 forbids forgery, evasion and concealment methods',
  },
  {
    rule: 'SAFETY_MINOR',
    re: /\b(?:child|children|kid|kids|baby|infant|teenager)\b[^.]{0,40}\b(?:beaten|killed|hurt|abused|sold|trafficked)\b/i,
    why: 'reads as depicting a minor in danger — §11 forbids it outright',
  },
  {
    rule: 'SAFETY_BRAND',
    re: /\b(?:Coca-Cola|Marlboro|Kalashnikov|Interpol|Schengen Information System)\b/,
    why: 'names a real brand or institution — §11 forbids naming real, living institutions or brands',
  },
];

export function contentSafety(bundle: ContentBundle): readonly LintIssue[] {
  if (bundle.locale === null) {
    return [
      warn(
        'SAFETY_NOT_SCANNED',
        'i18n/en',
        'no locale to scan — §11 patterns are checked against translated text, not YAML',
      ),
    ];
  }

  const issues: LintIssue[] = [];
  for (const [key, text] of bundle.locale) {
    for (const pattern of PATTERNS) {
      if (!pattern.re.test(text)) continue;
      issues.push(
        warn(
          pattern.rule,
          'i18n/en',
          `\`${key}\`: ${pattern.why}. Review, then suppress if it is a false positive.`,
        ),
      );
    }
  }
  return issues;
}
