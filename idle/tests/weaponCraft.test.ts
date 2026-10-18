import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index.js';
import { craftWeapon, weaponCraftChance, weaponCraftPreview, weaponRecipe, weaponRecipes } from '../engine/weaponCraft.js';
import { fixture } from './engine-fixture.js';
import type { Catalog, Skill } from '../shared/types.js';

function skill(id: string, sourceName: string): Skill {
  return { id, sourceName, name: sourceName, description: '', kind: 'passive', maxLevel: 3, spCost: [0, 0, 0], power: [0, 0, 0], cooldownMs: 0, implementation: 'supported', manualUse: 'weaponCraft' };
}
function setup(output = 1101, learned = 1) {
  const c = fixture() as Catalog;
  c.items[998] = { ...c.items[909], id: 998, name: 'Iron', type: 'material', weight: 1, shop: false };
  c.items[999] = { ...c.items[909], id: 999, name: 'Steel', type: 'material', weight: 1, shop: false };
  c.items[1101] = { ...c.items[1201], id: 1101, name: 'Sword', type: 'equipment', slot: 'weapon', weaponType: 'sword', weaponLevel: 1, attack: 25, weight: 10, allowedClasses: ['blacksmith'] };
  c.skills.bs_sword = skill('bs_sword', 'BS_SWORD');
  c.skills.bs_dagger = skill('bs_dagger', 'BS_DAGGER');
  c.skills.bs_weaponresearch = { ...skill('bs_weaponresearch', 'BS_WEAPONRESEARCH'), maxLevel: 10 };
  c.skills.bs_orideocon = { ...skill('bs_orideocon', 'BS_ORIDEOCON'), maxLevel: 5, implementation: 'unsupported', manualUse: undefined };
  c.classes.blacksmith = { ...c.classes.novice, id: 'blacksmith', name: 'Blacksmith', family: 'merchant', tier: 2, skills: ['bs_sword', 'bs_dagger', 'bs_weaponresearch', 'bs_orideocon'] };
  const s = createInitialState(c, 0); s.job = 'blacksmith'; s.jobLevel = 10; s.baseLevel = 20;
  s.stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 10, luk: 10 }; s.hp = 100; s.sp = 100; s.rngState = 0;
  s.learnedSkills.bs_sword = learned; s.learnedSkills.bs_weaponresearch = 2; s.learnedSkills.bs_orideocon = 1;
  const recipe = weaponRecipe(output)!;
  s.inventory = recipe.ingredients.map((ingredient, index) => ({ uid: `mat-${index}`, itemId: ingredient.itemId, quantity: ingredient.quantity, refine: 0, cards: [], favorite: false }));
  s.equipment = {};
  return { c, s };
}
const count = (s: ReturnType<typeof setup>['s'], itemId: number) => s.inventory.filter(entry => entry.itemId === itemId).reduce((n, entry) => n + entry.quantity, 0);

describe('pinned classic weapon forging recipes', () => {
  it('imports all 45 exact recipes from the seven Hercules weapon skills', () => {
    expect(weaponRecipes).toHaveLength(52);
    expect(weaponRecipe(1101)).toMatchObject({ skillName: 'BS_SWORD', skillLevel: 1, weaponLevel: 1, ingredients: [{ itemId: 998, quantity: 2 }] });
    expect(weaponRecipe(1116)).toMatchObject({ skillName: 'BS_TWOHANDSWORD', skillLevel: 1, weaponLevel: 1, ingredients: [{ itemId: 998, quantity: 35 }, { itemId: 958, quantity: 15 }] });
    expect(weaponRecipe(1460)).toMatchObject({ skillName: 'BS_SPEAR', skillLevel: 3, weaponLevel: 3, ingredients: [{ itemId: 984, quantity: 8 }, { itemId: 999, quantity: 10 }, { itemId: 720, quantity: 5 }] });
  });
  it('previews chance and materials without changing the character', () => {
    const { c, s } = setup(); const before = structuredClone(s);
    expect(weaponCraftPreview(s, c, 1101, 0)).toMatchObject({ available: true, chance: 6100, skillLevel: 1, ingredients: [{ itemId: 998, quantity: 2, owned: 2, missing: 0 }] });
    expect(s).toEqual(before);
    expect(weaponCraftChance(s, c, weaponRecipe(1101)!)).toBe(6100);
  });
  it('consumes one recipe, rolls once, and creates an identified normal weapon on success', () => {
    const { c, s } = setup(); const beforeZeny = s.zeny; const beforeSp = s.sp;
    craftWeapon(s, c, 1101, 0);
    expect(count(s, 998)).toBe(0); expect(count(s, 1101)).toBe(1);
    expect(s.inventory.find(entry => entry.itemId === 1101)).toMatchObject({ identified: true, rarity: 'common', refine: 0, cards: [] });
    expect(s.rngState).toBe(1013904223); expect(s.zeny).toBe(beforeZeny); expect(s.sp).toBe(beforeSp);
    expect(s.totals.items[1101]).toBeUndefined();
  });
  it('consumes ingredients and reports failure when the source roll misses', () => {
    const { c, s } = setup(); s.rngState = 1;
    craftWeapon(s, c, 1101, 0);
    expect(count(s, 998)).toBe(0); expect(count(s, 1101)).toBe(0);
    expect(s.rngState).toBe(1015568748);
    expect(s.events.at(-1)?.text).toContain('falhou');
  });
  it('applies source bonuses from learned smith level, research, oridecon and carried anvils', () => {
    const { c, s } = setup();
    expect(weaponCraftChance(s, c, weaponRecipe(1101)!)).toBe(6100);
    s.inventory.push({ uid: 'emperor-anvil', itemId: 989, quantity: 1, refine: 0, cards: [], favorite: false });
    expect(weaponCraftChance(s, c, weaponRecipe(1101)!)).toBe(7100);
  });
  it.each(['missing-material', 'unlearned', 'wrong-class', 'wrong-skill', 'too-heavy', 'field', 'unsupported'])('rejects %s without consuming items or rolling', mode => {
    const { c, s } = setup();
    if (mode === 'missing-material') s.inventory[0].quantity = 0;
    if (mode === 'unlearned') delete s.learnedSkills.bs_sword;
    if (mode === 'wrong-class') s.job = 'mage';
    if (mode === 'wrong-skill') s.learnedSkills.bs_sword = 0;
    if (mode === 'too-heavy') { for (const item of Object.values(c.items)) item.weight = 1000; }
    if (mode === 'field') s.status = 'resting';
    if (mode === 'unsupported') c.skills.bs_sword.implementation = 'unsupported';
    const before = structuredClone(s);
    expect(weaponCraftPreview(s, c, 1101, 0).available).toBe(false);
    expect(() => craftWeapon(s, c, 1101, 0)).toThrow(); expect(s).toEqual(before);
  });
  it('dispatches the persisted command through the cloned game transaction', () => {
    const { c, s } = setup(); const before = structuredClone(s);
    const next = applyCommand(s, c, { type: 'craftWeapon', itemId: 1101 }, 0);
    expect(count(next, 1101)).toBe(1); expect(s).toEqual(before);
  });
});
