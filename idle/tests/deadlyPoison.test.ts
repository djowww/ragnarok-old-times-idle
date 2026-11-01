import { describe, expect, it } from 'vitest';
import { deadlyPoisonRules, deadlyPoisonDamageMultiplier, deadlyPoisonProcChance, deadlyPoisonInitialDamage, deadlyPoisonTickRules } from '../engine/deadlyPoison.js';

describe('pre-renewal Enchant Deadly Poison', () => {
  it('caps only initial damage at quarter HP', () => {
    expect(deadlyPoisonInitialDamage(1000, 1000)).toBe(150);
    expect(deadlyPoisonInitialDamage(300, 1000)).toBe(50);
    expect(deadlyPoisonInitialDamage(200, 1000)).toBe(0);
    expect(deadlyPoisonInitialDamage(1000, 1000, true)).toBe(100);
  });
  it('derives non-floor-limited tick damage and predecremented count', () => {
    expect(deadlyPoisonTickRules(1000, 20000)).toEqual({ damage: 13, intervalMs: 1000, damageTicks: 19 });
    expect(deadlyPoisonTickRules(1000, 999, true)).toEqual({ damage: 23, intervalMs: 1000, damageTicks: 0 });
  });
  it.each([[1, 2, 60000, 40000, 20000, 3], [5, 4, 100000, 60000, 60000, 7]])(
    'derives level %i reagent, SP, durations and damage', (level, multiplier, spMilli, durationMs, poisonDurationMs, chancePct) => {
      expect(deadlyPoisonRules(level)).toEqual({ spCost: spMilli / 1000, durationMs, poisonDurationMs,
        poisonChancePct: chancePct, damageMultiplier: multiplier, reagentItemId: 678, reagentAmount: 1 });
    });
  it.each([0, 6, 1.5, NaN])('rejects unsupported level %s', level => {
    expect(deadlyPoisonRules(level)).toBeUndefined();
  });
  it.each(['AS_SONICBLOW', 'AS_GRIMTOOTH', 'AS_VENOMKNIFE', undefined])('boosts weapon attack %s', source => {
    expect(deadlyPoisonDamageMultiplier(5, source)).toBe(4);
  });
  it.each(['AS_SPLASHER', 'ASC_BREAKER', 'ASC_METEORASSAULT'])('excludes %s', source => {
    expect(deadlyPoisonDamageMultiplier(5, source)).toBe(1);
  });
  it('does not boost magic, inactive or invalid buffs', () => {
    expect(deadlyPoisonDamageMultiplier(5, 'MG_FIREBOLT', false)).toBe(1);
    expect(deadlyPoisonDamageMultiplier(0)).toBe(1);
  });
  it('offers deadly poison only for landed normal attacks under an active buff', () => {
    const attack = { active: true, landed: true, skillAttack: false };
    expect(deadlyPoisonProcChance(5, attack)).toBe(7);
    expect(deadlyPoisonProcChance(1, attack)).toBe(3);
    expect(deadlyPoisonProcChance(5, { ...attack, active: false })).toBe(0);
    expect(deadlyPoisonProcChance(5, { ...attack, landed: false })).toBe(0);
    expect(deadlyPoisonProcChance(5, { ...attack, skillAttack: true })).toBe(0);
    expect(deadlyPoisonProcChance(5, { ...attack, skillId: 'AS_SONICBLOW' })).toBe(0);
    expect(deadlyPoisonProcChance(0, attack)).toBe(0);
  });
});
