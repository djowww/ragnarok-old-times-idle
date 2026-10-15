import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index.js';
import { GameRepository } from '../server/repository.js';
import type { Pool } from 'mysql2/promise';
import type { GameState } from '../shared/types.js';
import { craftConverter, converterCraftPreview, converterRecipe } from '../engine/converterCraft.js';
import { fixture } from './engine-fixture.js';

// Literal unit catalog for SA_CREATECON and pinned recipes; never modifies exported content.
function setup(output = 12114, material = 904) {
  const c = fixture();
  c.classes.sage = { ...c.classes.mage, id: 'sage', tier: 2, skills: ['sa_createcon'] };
  c.classes.professor = { ...c.classes.sage, id: 'professor', trans: true };
  c.skills.sa_createcon = { id: 'sa_createcon', sourceName: 'SA_CREATECON', name: 'Criar Conversor',
    description: '', kind: 'buff', maxLevel: 1, spCost: [30], power: [0], cooldownMs: 0, implementation: 'supported' };
  for (const [id, weight] of [[7433, 1], [904, 1], [946, 1], [947, 1], [1013, 1], [12114, 1], [12115, 1], [12116, 1], [12117, 1]])
    c.items[id] = { ...c.items[909], id, type: id >= 12114 ? 'consumable' : 'material', weight, shop: false };
  const s = createInitialState(c, 0);
  s.job = 'sage'; s.hp = 100; s.sp = 100; s.learnedSkills.sa_createcon = 1; s.rngState = 1;
  s.inventory = [
    { uid: 'scroll-a', itemId: 7433, quantity: 1, refine: 0, cards: [], favorite: false },
    { uid: 'scroll-b', itemId: 7433, quantity: 5, refine: 0, cards: [], favorite: true },
    { uid: 'material-a', itemId: material, quantity: 2, refine: 0, cards: [], favorite: false },
    { uid: 'material-b', itemId: material, quantity: 16, refine: 0, cards: [], favorite: true },
  ]; s.equipment = {};
  return { c, s, output };
}
const count = (s: ReturnType<typeof setup>['s'], id: number) => s.inventory.filter(e => e.itemId === id).reduce((n, e) => n + e.quantity, 0);

describe('manual pinned converter production', () => {
  it.each([[12114, 904], [12115, 946], [12116, 947], [12117, 1013]])('produces three %i with nine %i and only one 30 SP activation', (output, material) => {
    const { s, c } = setup(output, material); const totals = structuredClone(s.totals);
    craftConverter(s, c, output, 3, 0);
    expect(count(s, output)).toBe(3); expect(count(s, 7433)).toBe(3); expect(count(s, material)).toBe(9);
    expect(s.sp).toBe(70); expect(s.hp).toBe(100); expect(s.rngState).toBe(3027450565); // Four LCG rolls from seed 1.
    expect(s.totals).toEqual(totals);
    expect(s.inventory.find(e => e.itemId === output)).not.toHaveProperty('rarity');
    expect(s.inventory.find(e => e.uid === 'material-b')).toMatchObject({ quantity: 9, favorite: true });
  });
  it('previews exact requirements without changing inventory, SP, UIDs, events or RNG', () => {
    const { s, c } = setup(); const before = structuredClone(s);
    const preview = converterCraftPreview(s, c, 12114, 3, 0);
    expect(preview).toMatchObject({ available: true, learned: true, spCost: 30, resultWeight: 15,
      ingredients: [{ itemId: 7433, quantity: 3, owned: 6, missing: 0 }, { itemId: 904, quantity: 9, owned: 18, missing: 0 }] });
    expect(s).toEqual(before);
    const recipe = converterRecipe(12114)!; recipe.ingredients[0].quantity = 99;
    expect(converterRecipe(12114)?.ingredients[0].quantity).toBe(1);
  });
  it('charges the same equipment-modified 15 SP once for a six-item batch', () => {
    const { s, c } = setup(); c.items[2301].effects.spCostReductionPct = 50;
    s.inventory.push({ uid: 'armor', itemId: 2301, quantity: 1, refine: 0, cards: [], favorite: false, identified: true });
    s.equipment.armor = 'armor'; s.sp = 15;
    expect(converterCraftPreview(s, c, 12114, 6)?.spCost).toBe(15);
    craftConverter(s, c, 12114, 6); expect(s.sp).toBe(0); expect(count(s, 12114)).toBe(6);
  });
  it('admits net capacity after consuming materials even when gross output would overflow', () => {
    const { s, c } = setup(); c.items[12114].weight = 1005;
    expect(converterCraftPreview(s, c, 12114, 2)).toMatchObject({ maxWeight: 2030, resultWeight: 2026, available: true });
    craftConverter(s, c, 12114, 2); expect(count(s, 12114)).toBe(2);
  });
  it('uses one initial plus one output roll for a single item and preserves preexisting converter UID', () => {
    const { s, c } = setup(); s.inventory.push({ uid: 'existing-converter', itemId: 12114, quantity: 4, refine: 0, cards: [], favorite: false });
    craftConverter(s, c, 12114, 1);
    expect(s.rngState).toBe(1586005467); expect(s.inventory.find(e => e.uid === 'existing-converter')?.quantity).toBe(5);
  });
  it('allows inherited Professor learning and the API limit of 1000 while keeping one SP payment', () => {
    const { s, c } = setup(); s.job = 'professor'; s.inventory[0].quantity = 1000; s.inventory[2].quantity = 3000;
    for (const item of Object.values(c.items)) item.weight = 0;
    craftConverter(s, c, 12114, 1000); expect(count(s, 12114)).toBe(1000); expect(s.sp).toBe(70);
  });
  it('produces a catalogued material reagent without a use-item enchant or loot reward', () => {
    const { s, c } = setup(); c.items[12114].type = 'material';
    craftConverter(s, c, 12114, 1); expect(count(s, 12114)).toBe(1); expect(s.rngState).toBe(1586005467);
    expect(s.totals.items[12114]).toBeUndefined();
  });
  it('dispatches the actual craft command in the cloned engine without changing its input', () => {
    const { s, c } = setup(); s.sp = 50; const before = structuredClone(s);
    const next = applyCommand(s, c, { type: 'craftConverter', itemId: 12114, quantity: 3 }, 0);
    expect(count(next, 12114)).toBe(3); expect(next.sp).toBe(20); expect(next.rngState).toBe(3027450565);
    expect(s).toEqual(before);
  });
  it('replays a persisted request receipt and reconnects without charging or rolling twice', async () => {
    const { s, c } = setup(); s.sp = 50;
    // Only the SQL transport is replaced: real repository transaction, decode,
    // fingerprint receipt branch and actual command all execute without a DB.
    let saved = JSON.stringify(s); const receipts = new Map<string, string>();
    const query = async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT id')) return [[{ id: s.id }], []];
      if (sql.startsWith('SELECT state_json')) return [[{ state_json: saved }], []];
      if (sql.startsWith('SELECT fingerprint')) return [receipts.has(String(params[1])) ? [{ fingerprint: receipts.get(String(params[1])) }] : [], []];
      throw new Error(`Unexpected query ${sql}`);
    };
    const execute = async (sql: string, params: unknown[]) => {
      if (sql.startsWith('UPDATE idle_profiles')) saved = String(params[0]);
      else if (sql.startsWith('INSERT INTO idle_commands')) receipts.set(String(params[1]), String(params[2]));
      else throw new Error(`Unexpected write ${sql}`);
      return [{ affectedRows: 1 }, []];
    };
    let checkpoint = saved;
    const connection = { query, execute, beginTransaction: async () => { checkpoint = saved; }, commit: async () => {}, rollback: async () => { saved = checkpoint; }, release: () => {} };
    const pool = { query, execute, getConnection: async () => connection } as unknown as Pool;
    const repository = new GameRepository(pool, () => { throw new Error('Must restore existing profile'); }, s.id);
    const command = { type: 'craftConverter', itemId: 12114, quantity: 3 } as const;
    const action = (state: GameState) => applyCommand(state, c, command, 0);
    const first = await repository.transact('converter-receipt-1', action, JSON.stringify(command));
    const duplicate = await repository.transact('converter-receipt-1', action, JSON.stringify(command));
    expect(count(first, 12114)).toBe(3); expect(first.sp).toBe(20); expect(first.rngState).toBe(3027450565);
    expect(duplicate).toEqual(first); expect(first.revision).toBe(1);
    const reopened = new GameRepository(pool, () => { throw new Error('Must not reset'); }, s.id);
    expect(await reopened.read()).toEqual(first);
    await expect(repository.transact('converter-receipt-1', action, 'different-recipe')).rejects.toMatchObject({ code: 'REQUEST_REUSED' });
    expect(await reopened.read()).toEqual(first);
  });
  it.each([0, -1, 1.5, 1001, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])('rejects quantity %s atomically', quantity => {
    const { s, c } = setup(); const before = structuredClone(s);
    expect(() => craftConverter(s, c, 12114, quantity)).toThrow(); expect(s).toEqual(before);
  });
  it.each(['item', 'unlearned', 'wrong-class', 'bad-level', 'unsupported', 'field', 'hp', 'sp', 'materials', 'capacity', 'weight', 'silence', 'catalog', 'output-equipment', 'bad-cost'])('rejects %s without any new charge or roll', invalid => {
    const { s, c } = setup(); let output = 12114;
    if (invalid === 'item') output = 909;
    if (invalid === 'unlearned') delete s.learnedSkills.sa_createcon;
    if (invalid === 'wrong-class') s.job = 'mage';
    if (invalid === 'bad-level') s.learnedSkills.sa_createcon = 2;
    if (invalid === 'unsupported') c.skills.sa_createcon.implementation = 'unsupported';
    if (invalid === 'field') s.status = 'hunting';
    if (invalid === 'hp') s.hp = 0;
    if (invalid === 'sp') s.sp = 29;
    if (invalid === 'materials') s.inventory[3].quantity = 0;
    if (invalid === 'capacity') c.items[12114].weight = 2031;
    if (invalid === 'weight') s.inventory.push({ uid: 'heavy', itemId: 909, quantity: 1803, refine: 0, cards: [], favorite: false });
    if (invalid === 'silence') s.playerStatuses = { SC_SILENCE: { startsAt: 0, expiresAt: 1000, level: 1, sourceDurationMs: 1000 } };
    if (invalid === 'catalog') delete c.items[7433];
    if (invalid === 'output-equipment') c.items[12114].type = 'equipment';
    if (invalid === 'bad-cost') c.skills.sa_createcon.spCost = [NaN];
    const before = structuredClone(s); const preview = converterCraftPreview(s, c, output, 1);
    expect(preview.available).toBe(false); expect(preview.reason?.code).toBeTruthy();
    expect(() => craftConverter(s, c, output, 1)).toThrow(); expect(s).toEqual(before);
  });
  it.each(['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'RG_CHASEWALK', 'ST_INVISIBILITY', 'NV_TRICKDEAD'])('blocks production under %s', source => {
    const { s, c } = setup(); c.skills.blocked = { ...c.skills.sa_createcon, id: 'blocked', sourceName: source };
    s.buffs.blocked = { expiresAt: 1000, effects: {} }; const before = structuredClone(s);
    expect(() => craftConverter(s, c, 12114, 1)).toThrow(); expect(s).toEqual(before);
  });
});
