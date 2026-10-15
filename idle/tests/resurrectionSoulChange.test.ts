import { describe, expect, it } from 'vitest';
import {
  resurrectionBaseDamage,
  resurrectionMonsterEligible,
  soulChangeMonsterEligible,
  soulChangeRecovery,
} from '../engine/resurrectionSoulChange.js';

describe('Resurrection monster eligibility', () => {
  it('accepts undead element even when the race is not undead', () => {
    const monster = Object.freeze({ element: 'undead', race: 'formless' });
    expect(resurrectionMonsterEligible(monster)).toBe(true);
    expect(monster).toEqual({ element: 'undead', race: 'formless' });
  });

  it('accepts the historical capitalized Undead element without changing it', () => {
    const monster = Object.freeze({ element: 'Undead', race: 'formless' });
    expect(resurrectionMonsterEligible(monster)).toBe(true);
    expect(monster).toEqual({ element: 'Undead', race: 'formless' });
  });

  it('rejects undead race with neutral element under the source default', () => {
    const monster = Object.freeze({ element: 'neutral', race: 'undead' });
    expect(resurrectionMonsterEligible(monster)).toBe(false);
    expect(monster).toEqual({ element: 'neutral', race: 'undead' });
  });

  it.each(['holy', 'dark', 'fire', 'water'])('rejects the %s element', element => {
    expect(resurrectionMonsterEligible({ element })).toBe(false);
  });
});

describe('Soul Change monster eligibility', () => {
  it('accepts a living ordinary monster with an unused flag without marking it', () => {
    const enemy = Object.freeze({ hp: 1, soulChangeUsed: false });
    const monster = Object.freeze({ boss: false });
    expect(soulChangeMonsterEligible(enemy, monster)).toBe(true);
    expect(enemy).toEqual({ hp: 1, soulChangeUsed: false });
    expect(monster).toEqual({ boss: false });
  });

  it('accepts a legacy state with absent use and boss flags without adding them', () => {
    const enemy = Object.freeze({ hp: 1000 });
    const monster = Object.freeze({});
    expect(soulChangeMonsterEligible(enemy, monster)).toBe(true);
    expect(enemy).toEqual({ hp: 1000 });
    expect(monster).toEqual({});
  });

  it.each([0, -1])('rejects a monster with hp %s', hp => {
    expect(soulChangeMonsterEligible({ hp, soulChangeUsed: false }, { boss: false })).toBe(false);
  });

  it('rejects a living boss', () => {
    expect(soulChangeMonsterEligible({ hp: 1000 }, { boss: true })).toBe(false);
  });

  it('rejects a living monster already used without clearing its flag', () => {
    const enemy = Object.freeze({ hp: 1000, soulChangeUsed: true });
    expect(soulChangeMonsterEligible(enemy, { boss: false })).toBe(false);
    expect(enemy).toEqual({ hp: 1000, soulChangeUsed: true });
  });
});

describe('Hercules pre-renewal Resurrection raw damage', () => {
  const input = Object.freeze({
    level: 4,
    baseLevel: 50,
    intelligence: 30,
    luck: 10,
    targetHp: 1000,
    targetMaxHp: 2000,
    boss: false,
  });

  // Literal results from battle.c:4129-4143, before MDEF and Holy element.
  it.each([
    { roll: 0.269, damage: 1000 },
    { roll: 0.2699, damage: 1000 },
    { roll: 0.270, damage: 120 },
    { roll: 0.999, damage: 120 },
  ])('returns $damage for normalized roll $roll at chance 270', ({ roll, damage }) => {
    expect(resurrectionBaseDamage(input, () => roll)).toBe(damage);
  });

  it.each([
    { targetHp: 2000, roll: 0.169, damage: 2000 },
    { targetHp: 2000, roll: 0.170, damage: 120 },
    { targetHp: 1, roll: 0.369, damage: 1 },
    { targetHp: 1, roll: 0.370, damage: 120 },
  ])('uses current HP $targetHp with roll $roll for raw damage $damage', ({ targetHp, roll, damage }) => {
    expect(resurrectionBaseDamage({ ...input, targetHp }, () => roll)).toBe(damage);
  });

  it.each([
    { roll: 0.236, damage: 2001 },
    { roll: 0.237, damage: 120 },
  ])('preserves source integer HP division at chance 237 and roll $roll', ({ roll, damage }) => {
    expect(resurrectionBaseDamage({ ...input, targetHp: 2001, targetMaxHp: 3000 }, () => roll)).toBe(damage);
  });

  it.each([
    { roll: 0.699, damage: 1000 },
    { roll: 0.700, damage: 1039 },
  ])('caps the chance at 700 for roll $roll', ({ roll, damage }) => {
    expect(resurrectionBaseDamage({ ...input, baseLevel: 99, intelligence: 900, luck: 900 }, () => roll)).toBe(damage);
  });

  it.each([0, 0.269, 0.999])('uses fallback raw damage for a boss at roll %s', roll => {
    expect(resurrectionBaseDamage({ ...input, boss: true }, () => roll)).toBe(120);
  });

  it.each([
    { boss: false, roll: 0, damage: 1000 },
    { boss: false, roll: 0.999, damage: 120 },
    { boss: true, roll: 0, damage: 120 },
    { boss: true, roll: 0.999, damage: 120 },
  ])('consumes exactly one roll with boss=$boss and roll=$roll', ({ boss, roll, damage }) => {
    let calls = 0;
    const rng = () => { calls += 1; return roll; };
    expect(resurrectionBaseDamage({ ...input, boss }, rng)).toBe(damage);
    expect(calls).toBe(1);
  });

  it('leaves the raw-damage input unchanged', () => {
    expect(resurrectionBaseDamage(input, () => 0)).toBe(1000);
    expect(input).toEqual({ level: 4, baseLevel: 50, intelligence: 30, luck: 10, targetHp: 1000, targetMaxHp: 2000, boss: false });
  });
});

describe('Soul Change SP recovery', () => {
  it.each([
    { maxSp: 0, recovery: 0 },
    { maxSp: 33, recovery: 0 },
    { maxSp: 34, recovery: 1 },
    { maxSp: 999, recovery: 29 },
    { maxSp: 1000, recovery: 30 },
  ])('recovers $recovery SP from maxSP $maxSp', ({ maxSp, recovery }) => {
    expect(soulChangeRecovery(maxSp)).toBe(recovery);
  });
});
