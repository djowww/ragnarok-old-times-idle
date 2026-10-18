import { describe, expect, it } from 'vitest';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import type { GameState, Item } from '../shared/types';
import { weaponRepairMaterial } from '../engine/weaponRepair';
import { parseCommandRequest } from '../server/validation';
import { fixture } from './engine-fixture';

type TestState = GameState;
function replaceState(s: TestState, next: TestState) { for (const key of Object.keys(s)) delete (s as any)[key]; Object.assign(s, next); }
function command(s: TestState, c: ReturnType<typeof fixture>, value: Parameters<typeof applyCommand>[2], now: number) { replaceState(s, applyCommand(s, c, value, now)); }
function setup() {
  const c = fixture();
  c.classes.blacksmith = { ...c.classes.novice, id: 'blacksmith', family: 'merchant', tier: 2,
    skills: ['bs_repairweapon'], jobCap: 50 };
  c.skills.bs_repairweapon = { id: 'bs_repairweapon', sourceName: 'BS_REPAIRWEAPON',
    name: 'Weapon Repair', description: '', kind: 'buff', maxLevel: 1, spCost: [30],
    castTimeMs: [7500], cooldownMs: 0, power: [0], manualUse: 'weaponRepair', implementation: 'supported' };
  for (const [id, name] of [[1003, 'Iron Ore'], [998, 'Iron'], [999, 'Steel'], [756, 'Rough Oridecon']] as const)
    c.items[id] = { ...c.items[984], id, name, type: 'material' };
  c.items[1201].weaponLevel = 1;
  c.items[2301].type = 'equipment';
  const s = createInitialState(c, 0);
  s.job = 'blacksmith'; s.learnedSkills = { bs_repairweapon: 1 }; s.rotation = []; s.sp = 50;
  s.inventory = [
    { uid: 'broken-sword', itemId: 1201, quantity: 1, refine: 3, cards: [4001], favorite: true, identified: true, rarity: 'rare', broken: true },
    { uid: 'broken-armor', itemId: 2301, quantity: 1, refine: 0, cards: [], favorite: false, broken: true },
    ...[1003, 998, 999, 756].map(itemId => ({ uid: `mat-${itemId}`, itemId, quantity: 1, refine: 0, cards: [], favorite: false })),
  ];
  return { s, c };
}
function castToMenu(s: TestState, c: ReturnType<typeof fixture>) {
  command(s, c, { type: 'useSkill', skillId: 'bs_repairweapon' }, 0);
  const endsAt = s.supportCast?.endsAt ?? 0;
  expect(endsAt).toBeGreaterThan(0); expect(endsAt).toBeLessThanOrEqual(7500);
  expect(s.sp).toBe(50);
  replaceState(s, advanceState(s, c, 7500));
  expect(s.sp).toBe(20);
  return s.weaponRepairMenu!;
}

describe('Hercules Weapon Repair', () => {
  it('maps the four Hercules weapon levels and all armor to their source materials', () => {
    const { c } = setup();
    for (const [level, material] of [[1, 1003], [2, 998], [3, 999], [4, 756]] as const) {
      const weapon = { ...c.items[1201], weaponLevel: level } as Item;
      expect(weaponRepairMaterial(weapon)).toBe(material);
    }
    expect(weaponRepairMaterial(c.items[2301])).toBe(999);
    expect(weaponRepairMaterial(c.items[909])).toBeUndefined();
  });

  it('accepts only the bounded selected-item commands at the server boundary', () => {
    const requestId = 'repair-test-01';
    expect(parseCommandRequest({ requestId, command: { type: 'weaponRepair', menuId: 'menu-1', uid: 'gear-1' } }).command)
      .toEqual({ type: 'weaponRepair', menuId: 'menu-1', uid: 'gear-1' });
    expect(() => parseCommandRequest({ requestId, command: { type: 'weaponRepair', menuId: 'bad/id', uid: 'gear-1' } })).toThrow();
  });
  it('blocks casting at Hercules 90 percent weight', () => {
    const { s, c } = setup();
    c.items[1003].weight = 1_000_000;
    expect(() => command(s, c, { type: 'useSkill', skillId: 'bs_repairweapon' }, 0)).toThrow();
    expect(s.supportCast).toBeUndefined();
  });

  it('waits for the 7.5-second cast, then offers only broken equipment and pays 30 SP once', () => {
    const { s, c } = setup();
    const menu = castToMenu(s, c);
    expect(menu.offeredItems.map(item => item.uid)).toEqual(['broken-sword', 'broken-armor']);
    expect(s.inventory[0].broken).toBe(true);
    expect(s.skillReadyAt.bs_repairweapon).toBeUndefined();
  });

  it('repairs only the selected weapon, consumes its level material, and preserves item metadata', () => {
    const { s, c } = setup(), menu = castToMenu(s, c);
    command(s, c, { type: 'weaponRepair', menuId: menu.id, uid: 'broken-sword' }, 7500);
    expect(s.inventory.find(item => item.uid === 'broken-sword')).toMatchObject({
      itemId: 1201, refine: 3, cards: [4001], favorite: true, identified: true, rarity: 'rare',
    });
    expect(s.inventory.find(item => item.uid === 'broken-sword')).not.toHaveProperty('broken');
    expect(s.inventory.find(item => item.uid === 'mat-1003')?.quantity).toBeUndefined();
    expect(s.inventory.find(item => item.uid === 'broken-armor')?.broken).toBe(true);
    expect(s.sp).toBe(20);
    expect(s.weaponRepairMenu).toBeUndefined();
  });

  it('uses Steel for armor and preserves every other broken item', () => {
    const { s, c } = setup(), menu = castToMenu(s, c);
    command(s, c, { type: 'weaponRepair', menuId: menu.id, uid: 'broken-armor' }, 7500);
    expect(s.inventory.find(item => item.uid === 'broken-armor')).not.toHaveProperty('broken');
    expect(s.inventory.find(item => item.uid === 'mat-999')?.quantity).toBeUndefined();
    expect(s.inventory.find(item => item.uid === 'mat-1003')?.quantity).toBe(1);
    expect(s.inventory.find(item => item.uid === 'broken-sword')?.broken).toBe(true);
  });

  it('rejects tampered or stale selections without consuming materials', () => {
    const { s, c } = setup(), menu = castToMenu(s, c);
    s.inventory.find(item => item.uid === 'broken-armor')!.broken = false;
    const before = structuredClone(s.inventory);
    command(s, c, { type: 'weaponRepair', menuId: menu.id, uid: 'broken-armor' }, 7500);
    expect(s.inventory).toEqual(before);
    expect(s.weaponRepairMenu).toBeUndefined();
  });

  it('cancels the selection without another SP or material charge', () => {
    const { s, c } = setup(), menu = castToMenu(s, c);
    command(s, c, { type: 'cancelWeaponRepair', menuId: menu.id }, 7500);
    expect(s.sp).toBe(20);
    expect(s.inventory.find(item => item.uid === 'broken-sword')?.broken).toBe(true);
    expect(s.inventory.find(item => item.uid === 'mat-1003')?.quantity).toBe(1);
  });
});
