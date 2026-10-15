import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog, GameState, BattleEnemy } from '../shared/types';
import { createInitialState } from '../engine';
import { derivedStats } from '../engine/stats';
import { decodeGat, gridWalkable, gridWall } from '../shared/fieldNavigation';
import * as fieldApi from '../engine/sageFields';
import { placeSageField, sageFieldModifiers, syncSageField, sageFieldCells, sageFieldElementRate } from '../engine/sageFields';
const api = { placeSageField, sageFieldModifiers, syncSageField, sageFieldCells, sageFieldElementRate };
const center = { x: .48, y: .65 };
function setup(element = 'neutral') {
  const c = structuredClone(raw) as unknown as Catalog;
  const s = createInitialState(c, 0);
  s.job = 'sage'; s.status = 'hunting'; s.areaId = 'prontera_south'; s.rotation = [];
  s.fieldHero = { areaId: s.areaId, from: center, position: center, startedAt: 0, arrivedAt: 0, routeIndex: 0 };
  const armor = s.inventory.find(i => i.uid === s.equipment.armor)!;
  c.items[armor.itemId].defenseElement = element;
  const enemy: BattleEnemy = { id: 'field-mob', monsterId: 1002, hp: 40, maxHp: 50, position: center, approachFrom: center,
    startedAt: 0, arrivedAt: 0, enemyNextAttackAt: 10000, spawnDirection: 0, fieldSlot: 0 };
  c.monsters[1002].element = element;
  s.fieldPopulation = { areaId: s.areaId, generation: 0, enemies: [enemy], respawns: [] };
  return { s, c, enemy };
}
function place(s: GameState, c: Catalog, id = 'sa_volcano', level = 5, at = 0) {
  return api.placeSageField?.(s, c, c.skills[id], level, at, center);
}
function modifiers(s: GameState, id: string, at = 0) { return api.sageFieldModifiers?.(s, id, at); }
function cellGat(types: number[]) {
  const bytes = new Uint8Array(14 + types.length * 20); bytes.set([71, 82, 65, 84, 1, 2]);
  const view = new DataView(bytes.buffer); view.setUint32(6, types.length, true); view.setUint32(10, 1, true);
  types.forEach((type, id) => view.setUint32(30 + id * 20, type, true)); return bytes;
}

describe('source Sage terrain wall mask', () => {
  it('separates walls from cliffs without changing existing actor walkability', () => {
    const grid = decodeGat('fixture', cellGat([0, 1, 5, 0x80000000]), 'b'.repeat(64));
    expect(Array.from((grid as any).wall ?? [])).toEqual([10]);
    expect([0, 1, 2, 3].map(x => gridWalkable(grid, { x, y: 0 }))).toEqual([true, false, false, true]);
  });
  it('matches source CELL_CHKWALL outside the map and on its overridden final row/column', () => {
    const bytes = new Uint8Array(14 + 9 * 20); bytes.set([71, 82, 65, 84, 1, 2]);
    const view = new DataView(bytes.buffer); view.setUint32(6, 3, true); view.setUint32(10, 3, true);
    for (let id = 0; id < 9; id++) view.setUint32(30 + id * 20, 1, true);
    const grid = decodeGat('fixture', bytes, 'b'.repeat(64));
    expect(gridWall(grid, { x: 1, y: 1 })).toBe(true);
    expect(gridWall(grid, { x: -1, y: 1 })).toBe(false);
    expect(gridWall(grid, { x: 2, y: 1 })).toBe(false);
    expect(gridWall(grid, { x: 1, y: 2 })).toBe(false);
  });
});
describe('source Sage exact cells and contribution ownership', () => {
  it('enumerates49 integer map cells with nonaligned map-origin offset', () => {
    const cells = api.sageFieldCells?.(center, { x: 94.74, y: 192.7 });
    expect(cells).toHaveLength(49);
    expect(cells?.[0]).toEqual({ x: 97, y: 197 });
    expect(cells?.at(-1)).toEqual({ x: 103, y: 203 });
  });
  it('clips occupied cells and sampled walls but permits a clear diagonal across blocked cardinal neighbors', () => {
    const walls = new Set(['11,10', '10,11']);
    const cells = api.sageFieldCells?.({ x: 10.5 / 12, y: 10.5 / 12 }, { x: 0, y: 0 },
      (p: { x: number; y: number }) => !walls.has(`${p.x},${p.y}`), [{ x: 9, y: 9 }]);
    expect(cells).toContainEqual({ x: 11, y: 11 });
    expect(cells).not.toContainEqual({ x: 12, y: 10 });
    expect(cells).not.toContainEqual({ x: 9, y: 9 });
  });
  it('rejects a cliff as a unit destination but permits the source path to cross it', () => {
    const cliff = { x: 11, y: 10 }, origin = { x: 10.5 / 12, y: 10.5 / 12 };
    const cells = api.sageFieldCells(origin, { x: 0, y: 0 }, p => p.x !== cliff.x || p.y !== cliff.y, [], () => true);
    expect(cells).not.toContainEqual(cliff); expect(cells).toContainEqual({ x: 12, y: 10 });
  });
  it.each([1, 2, 3, 4, 5])('captures independent Fire-defense WATK+10lv for player and monster at level%s', level => {
    const { s, c, enemy } = setup('fire'); const before = derivedStats(s, c);
    expect(place(s, c, 'sa_volcano', level)).toBe(true);
    expect(modifiers(s, s.id)).toMatchObject({ weaponAttack: 10 * level, element: 'fire',
      elementBonusPercent: [10, 14, 17, 19, 20][level - 1] });
    expect(modifiers(s, enemy.id)).toMatchObject({ weaponAttack: 10 * level });
    const after = derivedStats(s, c);
    expect(after.weaponAttack).toBe(before.weaponAttack! + 10 * level);
    expect(after.baseAttack).toBe(before.baseAttack); expect(after.attributes).toEqual(before.attributes);
  });
  it('keeps attack-element bonus on neutral defense while withholding conditional WATK', () => {
    const { s, c } = setup(); place(s, c);
    expect(modifiers(s, s.id)).toMatchObject({ weaponAttack: 0, elementBonusPercent: 20 });
  });
  it('snapshots defensive element until actual exit and reentry; no same-cell refresh/RNG draws', () => {
    const { s, c, enemy } = setup('fire'); place(s, c); const group = (s as any).elementalField;
    const entry = structuredClone(group?.occupants?.[enemy.id]), rng = s.rngState;
    c.monsters[1002].element = 'water'; api.syncSageField?.(s, c, 1000);
    expect(modifiers(s, enemy.id, 1000)?.weaponAttack).toBe(50);
    expect((s as any).elementalField?.occupants?.[enemy.id]).toEqual(entry); expect(s.rngState).toBe(rng);
    enemy.position = { x: center.x + 1, y: center.y }; enemy.approachFrom = enemy.position; api.syncSageField?.(s, c, 2000);
    expect(modifiers(s, enemy.id, 2000)?.weaponAttack).toBe(0);
    enemy.position = center; enemy.approachFrom = center; api.syncSageField?.(s, c, 3000);
    expect(modifiers(s, enemy.id, 3000)?.weaponAttack).toBe(0);
    expect((s as any).elementalField?.occupants?.[enemy.id]?.enteredAt).toBe(3000);
  });
  it('adds Gale Flee without changing AGI/ASPD, and removes contribution immediately outside', () => {
    const { s, c } = setup('wind'); const before = derivedStats(s, c); place(s, c, 'sa_violentgale');
    expect(derivedStats(s, c).flee).toBe(before.flee + 15);
    expect(derivedStats(s, c).aspd).toBe(before.aspd);
    s.fieldHero!.position = { x: center.x + 1, y: center.y }; s.fieldHero!.from = s.fieldHero!.position;
    // Pure projections must not expose stale entry bonuses before next mutation.
    expect(derivedStats(s, c).flee).toBe(before.flee);
  });
  it.each([1, 2, 3, 4, 5])('uses sequential Deluge HP at level%s, never heals and never compounds monster maxHP', level => {
    const { s, c, enemy } = setup('water');
    s.buffs.fixture = { expiresAt: 600000, effects: { hpPct: 30 } };
    const baseHp = derivedStats(s, c).maxHp, hp = s.hp;
    place(s, c, 'sa_deluge', level); const pct = [5, 9, 12, 14, 15][level - 1];
    expect(derivedStats(s, c).maxHp).toBe(baseHp + Math.trunc(baseHp * pct / 100)); expect(s.hp).toBe(hp);
    expect(enemy.maxHp).toBe(50 + Math.trunc(50 * pct / 100)); expect(enemy.hp).toBe(40);
    api.syncSageField?.(s, c, 1000); expect(enemy.maxHp).toBe(50 + Math.trunc(50 * pct / 100));
    enemy.hp = enemy.maxHp; enemy.position = { x: center.x + 1, y: center.y }; api.syncSageField?.(s, c, 2000);
    expect(enemy.maxHp).toBe(50); expect(enemy.hp).toBe(50);
  });
  it('carries remaining group lifetime on replacement and does not refresh even with another level', () => {
    const { s, c } = setup(); place(s, c, 'sa_volcano', 1);
    expect(place(s, c, 'sa_deluge', 5, 20000)).toBe(true);
    expect((s as any).elementalField).toMatchObject({ sourceName: 'SA_DELUGE', placedAt: 20000, expiresAt: 60000, durationMs: 40000 });
  });
  it('retains group between battles and gives a respawn a new entry, clearing on scene transfer/owner death', () => {
    const { s, c, enemy } = setup(); place(s, c); const groupId = (s as any).elementalField?.id;
    enemy.hp = 0; api.syncSageField?.(s, c, 1000); expect((s as any).elementalField?.occupants?.[enemy.id]).toBeUndefined();
    const next = { ...enemy, id: 'respawn', hp: 50 }; s.fieldPopulation!.enemies = [next]; api.syncSageField?.(s, c, 2000);
    expect((s as any).elementalField?.id).toBe(groupId); expect((s as any).elementalField?.occupants?.respawn?.enteredAt).toBe(2000);
    s.areaId = 'another_map'; api.syncSageField?.(s, c, 3000); expect((s as any).elementalField).toBeUndefined();
    s.areaId = s.fieldHero!.areaId; place(s, c); s.hp = 0; api.syncSageField?.(s, c, 4000);
    expect((s as any).elementalField).toBeUndefined();
  });
  it('expires before same-time damage, restores monster baseHP and clamps currentHP without healing', () => {
    const { s, c, enemy } = setup('water'); place(s, c, 'sa_deluge', 1);
    enemy.hp = enemy.maxHp; api.syncSageField?.(s, c, 60000);
    expect((s as any).elementalField).toBeUndefined(); expect(enemy.maxHp).toBe(50); expect(enemy.hp).toBe(50);
  });
  it('adds percentage points to element ratio, permits source immunity change and honors IgnoreElement', () => {
    const { s, c } = setup(); place(s, c); const modifier = modifiers(s, s.id);
    expect(api.sageFieldElementRate?.(1.5, modifier, 'fire')).toBe(1.7);
    expect(api.sageFieldElementRate?.(0, modifier, 'fire')).toBe(.2);
    expect(api.sageFieldElementRate?.(-.25, modifier, 'fire')).toBeCloseTo(-.05);
    expect(api.sageFieldElementRate?.(1.5, modifier, 'water')).toBe(1.5);
    expect(api.sageFieldElementRate?.(1.5, modifier, 'fire', true)).toBe(1);
  });
  it('rejects invalid level/nonfield/NaN without changing state', () => {
    const { s, c } = setup(), before = structuredClone(s);
    expect(place(s, c, 'sa_volcano', 0)).toBe(false);
    expect(place(s, c, 'sa_volcano', 6)).toBe(false);
    expect(place(s, c, 'nv_firstaid')).toBe(false);
    expect(place(s, c, 'sa_volcano', 5, NaN)).toBe(false); expect(s).toEqual(before);
  });
  it('captures Freeze before armor conversion and delayed Stone only after petrification', () => {
    const { s, c, enemy } = setup('fire');
    enemy.statuses = { SC_FREEZE: { level: 1, expiresAt: 20000 },
      SC_ARMOR_PROPERTY: { level: 1, expiresAt: 30000, element: 'fire', elementLevel: 1 } };
    place(s, c, 'sa_deluge'); expect(modifiers(s, enemy.id).hpPercent).toBe(15);
    delete enemy.statuses.SC_FREEZE;
    place(s, c, 'sa_volcano'); expect(modifiers(s, enemy.id).weaponAttack).toBe(50);
    enemy.statuses.SC_STONE = { level: 1, startsAt: 0, expiresAt: 30000 };
    place(s, c, 'sa_volcano', 5, 4000); expect(modifiers(s, enemy.id, 4000).weaponAttack).toBe(50);
    place(s, c, 'sa_volcano', 5, 5000); expect(modifiers(s, enemy.id, 5000).weaponAttack).toBe(0);
  });
  it('projects invalid entry data as inert instead of poisoning derived stats', () => {
    const { s, c } = setup('fire'), before = derivedStats(s, c); place(s, c);
    s.elementalField!.occupants[s.id].weaponAttack = NaN;
    expect(derivedStats(s, c).weaponAttack).toBe(before.weaponAttack);
  });
  it('finds exact future occupancy changes along a saved route, not every internal cell', () => {
    const { s, c } = setup(); place(s, c);
    s.fieldPopulation!.enemies = [];
    Object.assign(s.fieldHero!, { from: { x: 1.08, y: center.y }, position: center,
      startedAt: 0, arrivedAt: 600, movementRoute: [{ x: 1.08, y: center.y }, center] });
    const nextBoundary = (fieldApi as unknown as { nextSageFieldBoundary?: (s: GameState, at: number) => number | undefined }).nextSageFieldBoundary;
    expect(nextBoundary?.(s, 0)).toBe(331);
    expect(nextBoundary?.(s, 331)).toBe(300000);
  });
});
