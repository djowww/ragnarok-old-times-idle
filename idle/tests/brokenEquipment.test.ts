import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { addItem, isProtected } from '../engine/state';
import { createInitialState } from '../engine';
import { breakEquippedWeapon, isWeaponBreakImmune } from '../engine/equipmentCondition';
import { applyCommand } from '../engine';
import { GameError } from '../engine/state';

const catalog = catalogJson as unknown as Catalog;

describe('source-compatible broken equipment', () => {
  it('uses Hercules weapon-type exemptions for self break attempts', () => {
    const weapon = (type: string) => Object.values(catalog.items).find(item =>
      item.type === 'equipment' && item.weaponType === type)!;
    for (const type of ['axe', 'mace', 'staff', 'book']) expect(isWeaponBreakImmune(weapon(type)), type).toBe(true);
    for (const type of ['dagger', 'sword', 'spear', 'bow', 'katar', 'instrument', 'whip'])
      expect(isWeaponBreakImmune(weapon(type)), type).toBe(false);
  });

  it('breaks and unequips only the targeted weapon while preserving its identity and value', () => {
    const state = createInitialState(catalog, 0);
    const gear = addItem(state, catalog, 1201, 1);
    Object.assign(gear, { favorite: true, refine: 4, cards: [4001], identified: true,
      rarity: 'rare', rarityBonus: { stat: 'agi', value: 2 } });
    state.equipment.weapon = gear.uid;
    const other = addItem(state, catalog, 2301, 1);
    state.equipment.armor = other.uid;
    const uid = gear.uid;

    expect(breakEquippedWeapon(state, catalog, uid)).toBe(true);
    expect(state.inventory.find(entry => entry.uid === uid)).toEqual({
      uid, itemId: 1201, quantity: 1, favorite: true, refine: 4, cards: [4001], identified: true,
      rarity: 'rare', rarityBonus: { stat: 'agi', value: 2 }, broken: true,
    });
    expect(state.equipment.weapon).toBeUndefined();
    expect(state.equipment.armor).toBe(other.uid);
    expect(isProtected(state, state.inventory.find(entry => entry.uid === uid)!)).toBe(true);
  });

  it('does not allow a broken weapon to be equipped', () => {
    const state = createInitialState(catalog, 0);
    delete state.equipment.weapon;
    const gear = addItem(state, catalog, 1201, 1);
    gear.broken = true;
    expect(() => applyCommand(state, catalog, { type: 'equip', uid: gear.uid }, 0)).toThrow(GameError);
    expect(state.equipment.weapon).toBeUndefined();
  });
});
