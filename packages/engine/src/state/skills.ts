import { type LanguageId } from '../ids/content-ids.ts';
import { clampValue, type ClampEvent } from './clamp-event.ts';

/**
 * Skills are 0-10 and change rarely — preparation choices and the occasional outcome.
 *
 * `languages` is a separate axis: a list, not a level. It gates content (an event that
 * needs you to understand what is being said) rather than shifting a check.
 */
export const SKILL_KEYS = [
  'negotiation',
  'stealth',
  'mechanics',
  'streetwise',
  'endurance',
] as const;

export type SkillKey = (typeof SKILL_KEYS)[number];

export type Skills = Record<SkillKey, number> & {
  readonly languages: readonly LanguageId[];
};

export const SKILL_MIN = 0;
export const SKILL_MAX = 10;

export type ClampedSkills = {
  readonly skills: Skills;
  readonly clamps: readonly ClampEvent[];
};

export function clampSkills(skills: Skills): ClampedSkills {
  const levels: Record<SkillKey, number> = {
    negotiation: skills.negotiation,
    stealth: skills.stealth,
    mechanics: skills.mechanics,
    streetwise: skills.streetwise,
    endurance: skills.endurance,
  };
  const clamps: ClampEvent[] = [];

  for (const key of SKILL_KEYS) {
    const { applied, clamp } = clampValue(key, levels[key], SKILL_MIN, SKILL_MAX);
    levels[key] = applied;
    if (clamp !== null) clamps.push(clamp);
  }

  return { skills: { ...levels, languages: skills.languages }, clamps };
}

export function createSkills(languages: readonly LanguageId[] = []): Skills {
  return {
    negotiation: 0,
    stealth: 0,
    mechanics: 0,
    streetwise: 0,
    endurance: 0,
    languages,
  };
}
