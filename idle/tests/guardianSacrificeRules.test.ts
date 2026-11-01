// Pending test contents for idle/tests only. Not executable at this private path.
import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import {
  autoGuardChance, autoGuardWalkDelayMs, shrinkRollAccepted,
  sacrificeHpCost, sacrificeRatio, sacrificeBaseDamage,
  SACRIFICE_CHARGES, SHRINK_DURATION_MS, SACRIFICE_AFK_EXPIRES_AT,
} from '../engine/guardianSacrificeRules.js';

const catalog = rawCatalog as unknown as Catalog;

describe('pinned pre-renewal Guardian and Sacrifice pure rules', () => {
  it.each([
    [1, 5], [2, 10], [3, 14], [4, 18], [5, 21],
    [6, 24], [7, 26], [8, 28], [9, 29], [10, 30],
  ])('uses literal Auto Guard level%i chance%i percent', (level, chance) => {
    expect(autoGuardChance(level)).toBe(chance);
  });
  it.each([
    [1, 300], [2, 300], [3, 300], [4, 300], [5, 300],
    [6, 200], [7, 200], [8, 200], [9, 200], [10, 100],
  ])('uses Auto Guard level%i walk delay%i ms', (level, delay) => {
    expect(autoGuardWalkDelayMs(level)).toBe(delay);
  });
  it.each([
    [1, 4, 5], [2, 9, 10], [3, 14, 15], [4, 19, 20], [5, 24, 25],
    [6, 29, 30], [7, 34, 35], [8, 39, 40], [9, 44, 45], [10, 49, 50],
  ])('at Auto Guard level%i accepts Shrink roll%i but rejects equal threshold%i', (level, accepted, rejected) => {
    expect(shrinkRollAccepted(level, accepted)).toBe(true);
    expect(shrinkRollAccepted(level, rejected)).toBe(false);
    expect(shrinkRollAccepted(level, 0)).toBe(true);
    expect(shrinkRollAccepted(level, 99)).toBe(false);
  });
  it.each([
    [1, 100, 900], [2, 110, 990], [3, 120, 1080], [4, 130, 1170], [5, 140, 1260],
  ])('uses Sacrifice level%i ratio%i and maxHP10000 damage%i with fixed self900', (level, ratio, damage) => {
    expect(sacrificeRatio(level)).toBe(ratio);
    expect(sacrificeHpCost(10000)).toBe(900);
    expect(sacrificeBaseDamage(10000, level)).toBe(damage);
  });
  it.each([[999, 89, 124], [1001, 90, 126], [1010, 90, 126]])(
    'truncates maxHP%i to base%i before level5 ratio produces%i', (maxHp, cost, damage) => {
      expect(sacrificeHpCost(maxHp)).toBe(cost);
      expect(sacrificeBaseDamage(maxHp, 5)).toBe(damage);
    },
  );
  it('does not invent a minimum HP loss or minimum base damage', () => {
    expect(sacrificeHpCost(1)).toBe(0);
    expect(sacrificeHpCost(11)).toBe(0);
    expect(sacrificeBaseDamage(11, 5)).toBe(0);
    expect(sacrificeHpCost(12)).toBe(1);
    expect(sacrificeBaseDamage(12, 5)).toBe(1);
  });
  it('supports the confirmed positive safe-integer HP contract without precision loss at its boundary', () => {
    expect(sacrificeHpCost(9007199254740991)).toBe(810647932926689);
    expect(sacrificeBaseDamage(9007199254740991, 5)).toBe(1134907106097364);
  });
  it('rejects invalid Auto Guard levels before arithmetic and never silently clamps', () => {
    for (const level of [0, -1, 11, 1.5, NaN, Infinity]) {
      expect(() => autoGuardChance(level)).toThrow(RangeError);
      expect(() => autoGuardWalkDelayMs(level)).toThrow(RangeError);
      expect(() => shrinkRollAccepted(level, 0)).toThrow(RangeError);
    }
  });
  it('rejects invalid source modulo rolls instead of rounding or changing the acceptance window', () => {
    for (const roll of [-1, 100, 0.5, NaN, Infinity])
      expect(() => shrinkRollAccepted(10, roll)).toThrow(RangeError);
  });
  it('rejects invalid Sacrifice levels and HP rather than producing an unintended drain', () => {
    for (const level of [0, -1, 6, 1.5, NaN, Infinity]) {
      expect(() => sacrificeRatio(level)).toThrow(RangeError);
      expect(() => sacrificeBaseDamage(10000, level)).toThrow(RangeError);
    }
    for (const maxHp of [0, -1, 1.5, NaN, Infinity, 9007199254740992]) {
      expect(() => sacrificeHpCost(maxHp)).toThrow(RangeError);
      expect(() => sacrificeBaseDamage(maxHp, 5)).toThrow(RangeError);
    }
  });
  it('pins five charges and Shrink five minutes with a JSON-safe AFK infinity adaptation', () => {
    expect(SACRIFICE_CHARGES).toBe(5);
    expect(SHRINK_DURATION_MS).toBe(300000);
    expect(SACRIFICE_AFK_EXPIRES_AT).toBe(9007199254740991);
    expect(JSON.parse(JSON.stringify({ expiresAt: SACRIFICE_AFK_EXPIRES_AT })).expiresAt).toBe(9007199254740991);
  });
  it('shows pure base against actual Neutral-to-Ghost percentages without claiming combat integration', () => {
    const percentages = catalog.elementModifiers!.neutral.ghost;
    expect(percentages).toEqual([25, 25, 0, 0]);
    const base = sacrificeBaseDamage(10000, 5);
    expect(percentages.map(percent => Math.trunc(base * percent / 100))).toEqual([315, 315, 0, 0]);
    expect(sacrificeHpCost(10000)).toBe(900);
  });
});
