import { describe, expect, it } from 'vitest';
import { clampValue } from '../clamp-event.ts';
import { clampResources, createResources, RESOURCE_BOUNDS, RESOURCE_KEYS } from '../resources.ts';
import { clampSkills, createSkills, SKILL_KEYS } from '../skills.ts';

describe('clampValue', () => {
  it('reports nothing when in range', () => {
    expect(clampValue('energy', 5, 0, 10)).toEqual({ applied: 5, clamp: null });
  });

  it('reports the floor it hit', () => {
    expect(clampValue('energy', -3, 0, 10)).toEqual({
      applied: 0,
      clamp: { key: 'energy', requested: -3, applied: 0, bound: 'min', limit: 0 },
    });
  });

  it('treats a null max as unbounded', () => {
    expect(clampValue('cash', 10_000_000, 0, null).clamp).toBeNull();
  });

  it('keeps the bounds themselves in range', () => {
    expect(clampValue('heat', 0, 0, 10).clamp).toBeNull();
    expect(clampValue('heat', 10, 0, 10).clamp).toBeNull();
  });
});

describe('clampResources', () => {
  it('leaves a fresh set untouched', () => {
    const { resources, clamps } = clampResources(createResources());
    expect(resources).toEqual(createResources());
    expect(clamps).toEqual([]);
  });

  it('has bounds for every declared resource', () => {
    // Guards against a resource being added to the union but not to the bounds table, which
    // would leave it silently unclamped.
    for (const key of RESOURCE_KEYS) expect(RESOURCE_BOUNDS[key]).toBeDefined();
    expect(Object.keys(RESOURCE_BOUNDS).sort()).toEqual([...RESOURCE_KEYS].sort());
  });

  it('reports clamps in declaration order, not insertion order', () => {
    // Determinism: the clamps array feeds the digest and the sim, so its order cannot
    // depend on how the caller happened to build the object.
    const scrambled = { ...createResources(), reputation: -99, energy: -1, cash: -1 };
    const { clamps } = clampResources(scrambled);
    expect(clamps.map((c) => c.key)).toEqual(['cash', 'energy', 'reputation']);
  });

  it('is pure', () => {
    const input = { ...createResources(), energy: 99 };
    clampResources(input);
    expect(input.energy).toBe(99);
  });

  it('clamps reputation on both sides', () => {
    expect(clampResources({ ...createResources(), reputation: 9 }).resources.reputation).toBe(5);
    expect(clampResources({ ...createResources(), reputation: -9 }).resources.reputation).toBe(-5);
  });
});

describe('clampSkills', () => {
  it('leaves a fresh set untouched', () => {
    const { skills, clamps } = clampSkills(createSkills());
    expect(clamps).toEqual([]);
    for (const key of SKILL_KEYS) expect(skills[key]).toBe(0);
  });

  it('clamps to 0..10 and preserves languages', () => {
    const { skills, clamps } = clampSkills({ ...createSkills(), mechanics: 50, stealth: -2 });
    expect(skills.mechanics).toBe(10);
    expect(skills.stealth).toBe(0);
    expect(skills.languages).toEqual([]);
    expect(clamps.map((c) => c.key)).toEqual(['stealth', 'mechanics']);
  });
});
