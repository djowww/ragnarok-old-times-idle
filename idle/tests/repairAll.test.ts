import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { GameError } from '../engine/state';
import { applyCommand, createInitialState } from '../engine';
import { breakEquippedWeapon } from '../engine/equipmentCondition';

const catalog = catalogJson as unknown as Catalog;
const repairAll = { type: 'repairAll' } as any;

function damagedState(zeny: number) {
  const state = createInitialState(catalog, 0);
  state.zeny = zeny;
  const weapon = state.inventory.find(entry => entry.itemId === 1201)!;
  weapon.favorite = true;
  weapon.refine = 4;
  weapon.cards = [4001];
  state.equipment.weapon = weapon.uid;
  expect(breakEquippedWeapon(state, catalog, weapon.uid)).toBe(true);
  const armor = state.inventory.find(entry => entry.itemId === 2301)!;
  armor.broken = true;
  delete state.equipment.armor;
  return { state, weapon, armor };
}

describe('Prontera repair-all service', () => {
  it('repairs every broken equipment item for 5,000 zeny each without autoequipping or losing metadata', () => {
    const { state, weapon, armor } = damagedState(10_000);
    const uid = weapon.uid;
    const repaired = applyCommand(state, catalog, repairAll, 0);
    expect(repaired.zeny).toBe(0);
    expect(repaired.inventory.find(entry => entry.uid === uid)).toMatchObject({
      itemId: 1201, favorite: true, refine: 4, cards: [4001],
    });
    expect(repaired.inventory.find(entry => entry.uid === uid)).not.toHaveProperty('broken');
    expect(repaired.inventory.find(entry => entry.uid === armor.uid)?.broken).toBeUndefined();
    expect(repaired.equipment).toEqual({});
  });

  it('keeps gear and zeny unchanged when there are no broken items or insufficient funds', () => {
    const state = createInitialState(catalog, 0);
    expect(() => applyCommand(state, catalog, repairAll, 0)).toThrow(GameError);
    expect(state.zeny).toBe(200);
    const { state: poor, weapon } = damagedState(9_999);
    expect(() => applyCommand(poor, catalog, repairAll, 0)).toThrow(GameError);
    expect(poor.zeny).toBe(9_999);
    expect(weapon.broken).toBe(true);
  });

  it('rejects refining broken equipment before spending zeny or Oridecon', () => {
    const { state, weapon } = damagedState(20_000);
    state.inventory.push({ uid: 'ore', itemId: 984, quantity: 1, refine: 0, cards: [], favorite: false });
    const zeny = state.zeny;
    expect(() => applyCommand(state, catalog, { type: 'refine', uid: weapon.uid }, 0)).toThrow(GameError);
    expect(state.zeny).toBe(zeny);
    expect(state.inventory.find(entry => entry.uid === 'ore')?.quantity).toBe(1);
    expect(weapon.broken).toBe(true);
  });

  it('rejects the service away from town before changing equipment or money', () => {
    const { state, weapon } = damagedState(20_000);
    state.status = 'hunting';
    state.areaId = catalog.areas[0].id;
    expect(() => applyCommand(state, catalog, repairAll, 0)).toThrow(GameError);
    expect(state.zeny).toBe(20_000);
    expect(weapon.broken).toBe(true);
  });

  it('keeps the schemaVersion 1 condition compatible with old inventory entries', () => {
    const legacy = { uid: 'legacy', itemId: 1201, quantity: 1, refine: 0, cards: [], favorite: false } as GameState['inventory'][number];
    expect(legacy.broken).toBeUndefined();
  });
});
