import type { Catalog, GameState } from './types.js';
import { isItemIdentified } from './loot.js';

/** Convenience service priced at the classic Magnifier's base purchase value. */
export const BULK_IDENTIFICATION_UNIT_PRICE = 40;

export function unidentifiedEquipment(state: Pick<GameState, 'inventory'>, catalog: Pick<Catalog, 'items'>) {
  return state.inventory.filter(entry =>
    catalog.items[entry.itemId]?.type === 'equipment' && !isItemIdentified(entry));
}

export function bulkIdentificationQuote(state: Pick<GameState, 'inventory'>, catalog: Pick<Catalog, 'items'>) {
  const count = unidentifiedEquipment(state, catalog).length;
  return { count, unitPrice: BULK_IDENTIFICATION_UNIT_PRICE,
    totalCost: count * BULK_IDENTIFICATION_UNIT_PRICE };
}
