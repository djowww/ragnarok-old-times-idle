import type { Catalog, GameState } from '../shared/types.js';
import { isPecoMounted } from './mountedPeco.js';

/** Catalog weights are Hercules Weight/10; sum source integers before exposing UI units. */
export function itemWeightUnits(c: Catalog, itemId: number, quantity = 1): number {
  return Math.round((c.items[itemId]?.weight ?? 0) * 10) * quantity;
}
export function inventoryWeightUnits(s: GameState, c: Catalog): number {
  return s.inventory.reduce((sum, entry) => sum + itemWeightUnits(c, entry.itemId, entry.quantity), 0);
}
export function maxWeightUnits(s: GameState, c: Catalog): number {
  let carryLevel = 0;
  for (const [id, level] of Object.entries(s.learnedSkills)) {
    const skill = c.skills[id];
    if (skill?.implementation !== 'unsupported' &&
        ['MC_INCCARRY', 'ALL_INCCARRY'].includes(skill?.sourceName ?? ''))
      carryLevel += Math.max(0, Math.min(skill.maxLevel, Math.floor(level)));
  }
  return Math.round(((c.classes[s.job]?.baseWeight ?? 2000) + s.stats.str * 30 +
    200 * carryLevel + (isPecoMounted(s, c) ? 1000 : 0)) * 10);
}
export function inventoryCapacity(s: GameState, c: Catalog) {
  const weight = inventoryWeightUnits(s, c), max = maxWeightUnits(s, c);
  return { weight: weight / 10, maxWeight: max / 10, recoveryBlocked: weight * 2 >= max };
}
export function overweightForCombat(s: GameState, c: Catalog): boolean {
  return inventoryWeightUnits(s, c) * 10 >= maxWeightUnits(s, c) * 9;
}
export function canReceiveItem(s: GameState, c: Catalog, itemId: number, quantity: number): boolean {
  return !!c.items[itemId] && Number.isSafeInteger(quantity) && quantity > 0 &&
    inventoryWeightUnits(s, c) + itemWeightUnits(c, itemId, quantity) <= maxWeightUnits(s, c);
}
