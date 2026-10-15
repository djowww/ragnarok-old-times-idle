import type { Catalog, GameState } from '../shared/types.js';
import { classSkills, inventoryLoad } from './stats.js';

export const PICK_STONE_ITEM_ID = 7049;
export function stoneCount(s: Pick<GameState, 'inventory'>): number {
  return s.inventory.filter(entry => entry.itemId === PICK_STONE_ITEM_ID)
    .reduce((count, entry) => count + entry.quantity, 0);
}
/** Hercules NotOverWeight uses the class natural recovery threshold (50%).
 * Check initial weight separately: the produced stone may cross that threshold.
 * Idle has no floor loot/slot overflow model, so refuse unavailable capacity.
 */
export function canPickStone(input: { weight: number; maxWeight: number; stoneWeight: number }): boolean {
  const { weight, maxWeight, stoneWeight } = input;
  return [weight, maxWeight, stoneWeight].every(Number.isFinite) && weight >= 0 &&
    maxWeight > 0 && stoneWeight >= 0 && weight * 2 < maxWeight && weight + stoneWeight <= maxWeight;
}
/** AFK produces one real reagent only for an available, learned Throw rotation. */
export function pickStoneAfkNeeded(s: GameState, c: Catalog): boolean {
  if (s.hp <= 0 || stoneCount(s) !== 0 || !c.items[PICK_STONE_ITEM_ID]) return false;
  const tree = classSkills(c, s.job);
  for (const source of ['TF_PICKSTONE', 'TF_THROWSTONE']) {
    const skill = s.rotation.map(id => c.skills[id]).find(candidate => candidate?.sourceName === source);
    if (!skill || skill.implementation !== 'supported' || skill.manualUse || skill.kind === 'passive' ||
      !tree.includes(skill.id) || s.jobLevel < (skill.minimumJobLevel ?? 0)) return false;
    const level = s.learnedSkills[skill.id];
    if (!Number.isSafeInteger(level) || level < 1 || level > skill.maxLevel ||
      !(skill.prerequisitesByClass?.[s.job] ?? skill.prerequisites ?? [])
        .every(required => (s.learnedSkills[required.skillId] ?? 0) >= required.level)) return false;
  }
  return canPickStone({ ...inventoryLoad(s, c), stoneWeight: c.items[PICK_STONE_ITEM_ID].weight });
}
