import { describe, expect, it } from 'vitest';
import * as rules from '../engine/reactiveSolo';

describe('Hercules Poison React and Splasher rules', () => {
  it('initializes the integer counter charges at every learned level', () => {
    expect(Array.from({ length: 10 }, (_, i) => rules.poisonReactCharges(i + 1)))
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 6]);
  });
  it('rolls 50 percent against non-poison bodies and consumes one even if its counter will miss', () => {
    expect(rules.poisonReactCounter({ level: 10, charges: 6, bodyElement: 'water', rollPct: 49 }))
      .toEqual({ source: 'TF_POISON', level: 5, charges: 5 });
    expect(rules.poisonReactCounter({ level: 10, charges: 6, bodyElement: 'water', rollPct: 50 })).toBeUndefined();
  });
  it('consumes the entire buff for the level-specific hit against a poison body', () => {
    expect(rules.poisonReactCounter({ level: 7, charges: 4, bodyElement: 'poison', rollPct: 99 }))
      .toEqual({ source: 'AS_POISONREACT', level: 7, charges: 0 });
    expect(rules.poisonReactCounter({ level: 7, charges: 0, bodyElement: 'poison', rollPct: 0 })).toBeUndefined();
  });
  it('Splasher uses the actual timer delay, individual cooldown and strict integer HP boundary', () => {
    expect(rules.splasherRules(1)).toEqual({ delayMs: 5500, cooldownMs: 8000 });
    expect(rules.splasherRules(10)).toEqual({ delayMs: 10000, cooldownMs: 12500 });
    expect(rules.canApplySplasher({ hp: 75, maxHp: 101, boss: false, activeUntil: 0, at: 1000 })).toBe(true);
    expect(rules.canApplySplasher({ hp: 76, maxHp: 101, boss: false, activeUntil: 0, at: 1000 })).toBe(false);
    expect(rules.canApplySplasher({ hp: 75, maxHp: 100, boss: true, activeUntil: 0, at: 1000 })).toBe(false);
    expect(rules.canApplySplasher({ hp: 0, maxHp: 100, boss: false, activeUntil: 0, at: 1000 })).toBe(false);
    expect(rules.canApplySplasher({ hp: 75, maxHp: 100, boss: false, activeUntil: 2000, at: 1000 })).toBe(false);
  });
});
