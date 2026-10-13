import { describe, expect, it } from 'vitest';
import { enchantPoisonProc, elementalEnchantReplacements, enchantPoisonCastBlocked } from '../engine/enchantPoison';
import { fixture } from './engine-fixture';

const monster = { ...fixture().monsters[1002], level: 50, stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 } };
const input = { monster, skillLevel: 10, buffExpiresAt: 10000, at: 1000, casterLevel: 50,
  casterLuk: 0, skillAttack: false, landed: true, rng: () => 0 };

describe('Hercules Enchant Poison proc', () => {
  it('uses 7.5 percent at level ten and halves poison duration for monsters', () => {
    expect(enchantPoisonProc({ ...input, rng: () => 0.0749 })).toEqual({ level: 10, startsAt: 1000, expiresAt: 51000, nextTickAt: 2000 });
    expect(enchantPoisonProc({ ...input, rng: () => 0.075 })).toBeUndefined();
    expect(enchantPoisonProc({ ...input, skillLevel: 1, rng: () => 0.0299 })?.expiresAt).toBe(6000);
    expect(enchantPoisonProc({ ...input, skillLevel: 1, rng: () => 0.03 })).toBeUndefined();
  });
  it('only rolls landed normal attacks while the enchant is active', () => {
    for (const overrides of [{ landed: false }, { skillAttack: true }, { skillId: 'SM_BASH' }, { buffExpiresAt: 1000 }, { skillLevel: 0 }])
      expect(enchantPoisonProc({ ...input, ...overrides })).toBeUndefined();
  });
  it('applies VIT LUK and capped level difference resistance', () => {
    const resistant = { ...monster, stats: { ...monster.stats, vit: 30, luk: 3 } };
    expect(enchantPoisonProc({ ...input, monster: resistant, casterLevel: 40, rng: () => 0.039 })?.expiresAt).toBe(41000);
    expect(enchantPoisonProc({ ...input, monster: resistant, casterLevel: 40, rng: () => 0.04 })).toBeUndefined();
  });
  it('rejects bosses and already poisoned targets without refreshing the poison', () => {
    expect(enchantPoisonProc({ ...input, monster: { ...monster, boss: true } })).toBeUndefined();
    expect(enchantPoisonProc({ ...input, existingPoisonExpiresAt: 2000 })).toBeUndefined();
    expect(enchantPoisonProc({ ...input, existingPoisonExpiresAt: 1000 })).toBeDefined();
  });
  it('replaces elemental enchants while allowing Deadly Poison to coexist', () => {
    expect(elementalEnchantReplacements('AS_ENCHANTPOISON')).toContain('PR_ASPERSIO');
    expect(elementalEnchantReplacements('SA_FROSTWEAPON')).toContain('AS_ENCHANTPOISON');
    expect(elementalEnchantReplacements('AS_ENCHANTPOISON')).not.toContain('AS_ENCHANTPOISON');
    expect(elementalEnchantReplacements('AS_ENCHANTPOISON')).not.toContain('ASC_EDP');
    expect(elementalEnchantReplacements('ASC_EDP')).toEqual([]);
  });
  it('rejects player casts over Sage property enchants but permits Aspersio and self refresh', () => {
    for (const source of ['SA_FROSTWEAPON', 'SA_FLAMELAUNCHER', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON'])
      expect(enchantPoisonCastBlocked([source])).toBe(true);
    expect(enchantPoisonCastBlocked(['PR_ASPERSIO', 'AS_ENCHANTPOISON', 'ASC_EDP'])).toBe(false);
  });
});
