import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { craftPharmacy, deadlyPoisonChance, pharmacyCraftPreview } from '../engine/pharmacyCraft';
import { createInitialState } from '../engine/index';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

const input = [937, 952, 939, 7033, 972, 657, 713];
const count = (s: GameState, id: number) => s.inventory.filter(item => item.itemId === id).reduce((n, item) => n + item.quantity, 0);
const next = (seed: number, draws: number) => { for (let i = 0; i < draws; i++) seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };

function setup(seed = 2) {
  const c = fixture(), source = catalogJson as unknown as Catalog;
  c.classes.assassin_cross = { ...source.classes.assassin_cross, skills: ['asc_cdp'] };
  c.skills.asc_cdp = { id: 'asc_cdp', sourceName: 'ASC_CDP', name: 'Criar Veneno Mortal', description: '', kind: 'buff', maxLevel: 1, spCost: [50], power: [0], cooldownMs: 0, afterCastDelayMs: [500], implementation: 'supported', manualUse: 'pharmacyCraft' };
  for (const id of [...input, 678]) c.items[id] = structuredClone(source.items[id]);
  const s = createInitialState(c, 0); s.job = 'assassin_cross'; s.jobLevel = 50; s.learnedSkills = { asc_cdp: 1 };
  s.hp = 1000; s.sp = 100; s.stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 20, luk: 30 }; s.rngState = seed;
  for (const id of input) stateTools.addItem(s, c, id, 1);
  return { s, c };
}

afterEach(() => vi.restoreAllMocks());

describe('Create Deadly Poison from pinned Hercules production recipe', () => {
  it('keeps the nominal Hercules DEX/LUK rate while showing the quantity-one guarantee', () => {
    expect(deadlyPoisonChance({ dex: 20, luk: 30 })).toBe(3400);
    const { s, c } = setup();
    const before = structuredClone(s);
    expect(pharmacyCraftPreview(s, c, 678, 1)).toMatchObject({ available: true, chanceMin: 10000, chanceMax: 10000, spPerAttempt: 50, spTotal: 50, guide: undefined, ingredients: input.map(itemId => ({ itemId, quantity: 1, owned: 1, missing: 0 })) });
    expect(s).toEqual(before);
  });

  it('consumes the source materials and produces one bottle on a successful roll', () => {
    const { s, c } = setup(2);
    craftPharmacy(s, c, 678, 1);
    expect(s.sp).toBe(50); expect(count(s, 678)).toBe(1);
    for (const id of input) expect(count(s, id)).toBe(0);
    expect(s.rngState).toBe(next(2, 1));
    expect(s.playerCanActAt).toBe(500);
    expect(pharmacyCraftPreview(s, c, 678, 1, 499).reason?.code).toBe('SKILL_STATUS_BLOCKED');
    expect(pharmacyCraftPreview(s, c, 678, 1, 500).reason?.code).toBe('PHARMACY_MATERIALS_REQUIRED');
    expect(s.events.at(-1)).toMatchObject({ kind: 'craft', itemId: 678, quantity: 1, attempts: 1, failures: 0, skillId: 'asc_cdp', skillLevel: 1 });
  });

  it('preserves Hercules one-bottle success guard and its single RNG draw', () => {
    const { s, c } = setup(1); const beforeHp = s.hp;
    craftPharmacy(s, c, 678, 1);
    expect(s.sp).toBe(50); expect(count(s, 678)).toBe(1);
    for (const id of input) expect(count(s, id)).toBe(0);
    expect(s.hp).toBe(beforeHp);
    expect(s.rngState).toBe(next(1, 1));
    expect(s.events.at(-1)).toMatchObject({ kind: 'craft', itemId: 678, quantity: 1, attempts: 1, failures: 0, skillId: 'asc_cdp', skillLevel: 1 });
  });
});
