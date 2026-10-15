import type { Catalog, GameState, InventoryEntry, Item } from '../shared/types.js';

const SELF_BREAK_IMMUNE_WEAPONS = new Set(['axe', 'mace', 'staff', 'book']);

/** skill.c:2960..3000: fists, axes, maces, rods, books, and Huuma resist equipment breakage. */
export function isWeaponBreakImmune(item: Item): boolean {
  return item.type === 'equipment' && item.slot === 'weapon' &&
    !!item.weaponType && SELF_BREAK_IMMUNE_WEAPONS.has(item.weaponType);
}

/** Missing broken is intact for schemaVersion 1 profiles written before condition support. */
export function isEquipmentBroken(entry: Pick<InventoryEntry, 'broken'> | null | undefined): boolean {
  return entry?.broken === true;
}

/** Applies a source break to the currently equipped, breakable weapon without replacing its record. */
export function breakEquippedWeapon(state: GameState, catalog: Catalog, uid: string): boolean {
  if (state.equipment.weapon !== uid) return false;
  const entry = state.inventory.find(candidate => candidate.uid === uid);
  const item = entry && catalog.items[entry.itemId];
  if (!entry || !item || item.slot !== 'weapon' || !item.weaponType ||
      entry.broken || isWeaponBreakImmune(item)) return false;
  entry.broken = true;
  delete state.equipment.weapon;
  return true;
}
