import { describe, expect, it } from 'vitest';
import { bladeStopRules, bladeStopSkillAllowed, shouldBladeStop } from '../engine/bladeStop.js';

describe('Blade Stop source rules', () => {
  it('uses the pinned pre-renewal wait, duration, SP and sphere values at each level', () => {
    expect([1, 2, 3, 4, 5].map(bladeStopRules)).toEqual([
      { waitMs: 500, durationMs: 20_000, spCost: 10, sphereCost: 1 },
      { waitMs: 700, durationMs: 30_000, spCost: 10, sphereCost: 1 },
      { waitMs: 900, durationMs: 40_000, spCost: 10, sphereCost: 1 },
      { waitMs: 1100, durationMs: 50_000, spCost: 10, sphereCost: 1 },
      { waitMs: 1300, durationMs: 60_000, spCost: 10, sphereCost: 1 },
    ]);
  });

  it('allows only the four cumulative linked-target follow-ups at their minimum levels', () => {
    expect(['MO_FINGEROFFENSIVE', 'MO_INVESTIGATE', 'MO_CHAINCOMBO', 'MO_EXTREMITYFIST']
      .map((source, index) => [source, index + 2, bladeStopSkillAllowed(source, index + 2)])).toEqual([
      ['MO_FINGEROFFENSIVE', 2, true], ['MO_INVESTIGATE', 3, true],
      ['MO_CHAINCOMBO', 4, true], ['MO_EXTREMITYFIST', 5, true],
    ]);
    expect(bladeStopSkillAllowed('MO_TRIPLEATTACK', 10)).toBe(false);
    expect(bladeStopSkillAllowed('MO_CHAINCOMBO', 3)).toBe(false);
    expect(bladeStopSkillAllowed('MO_FINGEROFFENSIVE', 1)).toBe(false);
  });

  it('intercepts only an in-window, two-cell basic attack from a non-boss', () => {
    const wait = { level: 5, expiresAt: 1300 };
    expect(shouldBladeStop({ wait, at: 1200, distance: 2, basicAttack: true, boss: false })).toBe(true);
    expect(shouldBladeStop({ wait, at: 1300, distance: 1, basicAttack: true, boss: false })).toBe(false);
    expect(shouldBladeStop({ wait, at: 1200, distance: 2.01, basicAttack: true, boss: false })).toBe(false);
    expect(shouldBladeStop({ wait, at: 1200, distance: 1, basicAttack: false, boss: false })).toBe(false);
    expect(shouldBladeStop({ wait, at: 1200, distance: 1, basicAttack: true, boss: true })).toBe(false);
  });

  it('derives the start of a legacy transient wait from its source duration', () => {
    const legacyWait = { level: 1, expiresAt: 600 };
    const input = { wait: legacyWait, distance: 1, basicAttack: true, boss: false };
    expect(shouldBladeStop({ ...input, at: 50 })).toBe(false);
    expect(shouldBladeStop({ ...input, at: 100 })).toBe(true);
    expect(shouldBladeStop({ ...input, at: 599 })).toBe(true);
    expect(shouldBladeStop({ ...input, at: 600 })).toBe(false);
  });
});
