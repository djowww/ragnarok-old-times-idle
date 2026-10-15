import type { Catalog, GameState, LootOrigin } from '../shared/types.js';
import { addItem, createInventoryEntries, event, requireRule } from './state.js';
import { canReceiveItem, inventoryWeightUnits, itemWeightUnits, maxWeightUnits, overweightForCombat } from './itemCapacity.js';

/** Retain every found item; rolls and IDs are assigned only at acquisition time. */
export function pickupItem(s: GameState, c: Catalog, itemId: number, quantity: number,
  at: number, origin: LootOrigin, reward = true) {
  requireRule(c.items[itemId] && Number.isSafeInteger(quantity) && quantity > 0, 'INVALID_ITEM', 'Item ou quantidade inválida.');
  const equipment = c.items[itemId].type === 'equipment';
  let collected = 0, pending = 0;
  for (let n = 0; n < (equipment ? quantity : 1); n++) {
    const count = equipment ? 1 : quantity;
    if (canReceiveItem(s, c, itemId, count)) {
      addItem(s, c, itemId, count, reward); collected += count;
    } else {
      for (const entry of createInventoryEntries(s, c, itemId, count, reward))
        (s.pendingLoot ??= []).push({ ...origin, entry, acquiredAt: at });
      if (reward) s.totals.items[itemId] = (s.totals.items[itemId] ?? 0) + count;
      pending += count;
    }
  }
  if (pending) event(s, at, 'loot-pending', 'Item guardado: falta espaço na mochila.', undefined, undefined,
    { itemId, quantity: pending, areaId: origin.areaId, enemyId: origin.enemyId,
      monsterId: origin.monsterId, enemyPosition: origin.position });
  if ((s.status === 'hunting' || s.status === 'challenge') && (pending || overweightForCombat(s, c)))
    s.carryReturnRequestedAt = Math.min(s.carryReturnRequestedAt ?? at, at);
  return { collected, pending };
}

/** Move pending entries as-is, atomically selecting the entries that fit first. */
export function collectPendingLoot(s: GameState, c: Catalog, at: number) {
  const queue = s.pendingLoot ?? [];
  if (!queue.length) return { collected: 0, pending: 0 };
  const uids = new Set(s.inventory.map(entry => entry.uid));
  for (const row of queue) {
    requireRule(!uids.has(row.entry.uid), 'PENDING_LOOT_INVALID', 'A identidade deste item precisa ser conferida.');
    uids.add(row.entry.uid);
  }
  let weight = inventoryWeightUnits(s, c);
  const max = maxWeightUnits(s, c), accepted = [], remaining = [];
  for (const row of queue) {
    const next = weight + itemWeightUnits(c, row.entry.itemId, row.entry.quantity);
    if (c.items[row.entry.itemId] && Number.isSafeInteger(row.entry.quantity) && row.entry.quantity > 0 && next <= max) {
      accepted.push(row); weight = next;
    } else remaining.push(row);
  }
  requireRule(accepted.length, 'WEIGHT_LIMIT', 'Libere espaço na mochila antes de recolher os itens.');
  for (const row of accepted) {
    s.inventory.push(row.entry);
    event(s, at, 'pickup', 'Item recolhido para a mochila.', undefined, undefined,
      { itemId: row.entry.itemId, quantity: row.entry.quantity });
  }
  if (remaining.length) s.pendingLoot = remaining;
  else delete s.pendingLoot;
  return { collected: accepted.reduce((sum, row) => sum + row.entry.quantity, 0), pending: remaining.length };
}
