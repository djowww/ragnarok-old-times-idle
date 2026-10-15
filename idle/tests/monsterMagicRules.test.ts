import { describe, expect, it } from 'vitest';
import { energyCoatMagicDamage, magicRodAcceptsCast, magicRodRefund, magicRodWindow, monsterMagicAttack, monsterMagicDamage } from '../engine/monsterMagic.js';

describe('incoming monster magic', () => {
  it('uses pre-renewal INT MATK bounds and preserves Mind Breaker MATK', () => {
    expect(monsterMagicAttack(30)).toEqual([46, 66]);
    expect(monsterMagicAttack(30, 12)).toEqual([51, 73]);
  });

  it('applies hard MDEF as a percent and soft MDEF as a flat amount before element', () => {
    expect(monsterMagicDamage({ matk: 100, hardMdef: 10, softMdef: 5, elementRate: 1 })).toBe(85);
    expect(monsterMagicDamage({ matk: 100, hardMdef: 10, softMdef: 5, elementRate: 2 })).toBe(170);
  });

  it('uses source integer rounding and keeps zero element immune', () => {
    expect(monsterMagicDamage({ matk: 101, hardMdef: 25, softMdef: 7, elementRate: 0.5 })).toBe(34);
    expect(monsterMagicDamage({ matk: 101, hardMdef: 25, softMdef: 7, elementRate: 0 })).toBe(0);
  });

  it('preserves Energy Coat source band boundaries and cost rounding', () => {
    expect(energyCoatMagicDamage(100, 1, 20)).toEqual({ damage: 94, spCost: 0 });
    expect(energyCoatMagicDamage(1000, 39, 100)).toEqual({ damage: 880, spCost: 1 });
    expect(energyCoatMagicDamage(1000, 40, 100)).toEqual({ damage: 880, spCost: 1 });
    expect(energyCoatMagicDamage(1000, 79, 100)).toEqual({ damage: 760, spCost: 2 });
    expect(energyCoatMagicDamage(1000, 80, 100)).toEqual({ damage: 760, spCost: 2 });
  });

  it('uses lower-inclusive/upper-exclusive Magic Rod windows and original SP refunds', () => {
    expect([1, 2, 3, 4, 5].map(magicRodWindow)).toEqual([400, 600, 800, 1000, 1200]);
    expect([1, 2, 3, 4, 5].map(level => magicRodRefund(17, level))).toEqual([3, 6, 10, 13, 17]);
    expect(magicRodAcceptsCast({ startsAt: 100, endsAt: 199, armedAt: 200, expiresAt: 600 })).toBe(false);
    expect(magicRodAcceptsCast({ startsAt: 100, endsAt: 200, armedAt: 200, expiresAt: 600 })).toBe(true);
    expect(magicRodAcceptsCast({ startsAt: 100, endsAt: 600, armedAt: 200, expiresAt: 600 })).toBe(false);
    expect(magicRodAcceptsCast({ startsAt: 100, endsAt: 601, armedAt: 200, expiresAt: 600 })).toBe(false);
    expect(magicRodAcceptsCast({ startsAt: 100, endsAt: 500, armedAt: 200, expiresAt: 600 })).toBe(true);
    expect(magicRodAcceptsCast({ startsAt: 100, endsAt: 601, armedAt: 200, expiresAt: 600 })).toBe(false);
    expect(magicRodAcceptsCast({ startsAt: 201, endsAt: 500, armedAt: 200, expiresAt: 600 })).toBe(true);
  });
});
