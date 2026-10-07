import type { Catalog, GameEvent, GameState, InventoryEntry, RewardSummary } from '../shared/types.js';
import { rollEquipmentLoot } from '../shared/loot.js';
export class GameError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'GameError'; }
}
export function requireRule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new GameError(code, message);
}
export const emptySummary = (): RewardSummary => ({ elapsedMs: 0, kills: 0, deaths: 0, baseExp: 0, jobExp: 0, zeny: 0, items: {}, potions: 0, baseLevels: 0, jobLevels: 0 });
export function random(s: GameState): number {
  // Persisted uint32 LCG: the same number of combat decisions always consumes the same stream.
  s.rngState = (Math.imul(s.rngState, 1664525) + 1013904223) >>> 0;
  return s.rngState / 4294967296;
}
export function event(s: GameState, at: number, kind: string, text: string, amount?: number, target?: GameEvent['target'], metadata?: Partial<Pick<GameEvent, 'skillId' | 'critical' | 'itemId' | 'quantity' | 'skillLevel' | 'enemyId' | 'enemyPosition' | 'areaId' | 'monsterId' | 'castMs' | 'hitCount' | 'sourceActorId' | 'targetActorId' | 'actionId' | 'actorAction' | 'actionStartedAt' | 'actionMotionMs' | 'hitMotionMs'>>) {
  s.events.push({ id: s.nextEventId++, at, kind, text, ...(amount === undefined ? {} : { amount }), ...(target ? { target } : {}), ...metadata });
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
}
export function addItem(s: GameState, c: Catalog, itemId: number, quantity: number, reward = false): InventoryEntry {
  requireRule(c.items[itemId] && Number.isSafeInteger(quantity) && quantity > 0, 'INVALID_ITEM', 'Item ou quantidade inválida.');
  const equipment = c.items[itemId].type === 'equipment';
  let entry = equipment ? undefined : s.inventory.find(i => i.itemId === itemId && !i.favorite && !i.cards.length && !i.refine);
  if (entry) entry.quantity += quantity;
  else {
    for (let n = 0; n < (equipment ? quantity : 1); n++) {
      const created: InventoryEntry = {
        uid: `item-${s.nextItemId++}`, itemId, quantity: equipment ? 1 : quantity,
        refine: 0, cards: [], favorite: false,
        ...(equipment ? reward ? rollEquipmentLoot(() => random(s)) : { identified: true, rarity: 'common' as const } : {}),
      };
      s.inventory.push(created);
      entry ??= created;
    }
  }
  if (reward) s.totals.items[itemId] = (s.totals.items[itemId] ?? 0) + quantity;
  return entry!;
}
export function owned(s: GameState, uid: string): InventoryEntry {
  const e = s.inventory.find(i => i.uid === uid); requireRule(e, 'NOT_OWNED', 'Este item não está na mochila.'); return e;
}
export function consume(s: GameState, entry: InventoryEntry, quantity: number) {
  requireRule(Number.isSafeInteger(quantity) && quantity > 0 && entry.quantity >= quantity, 'INSUFFICIENT_ITEM', 'Quantidade indisponível.');
  entry.quantity -= quantity; if (!entry.quantity) s.inventory.splice(s.inventory.indexOf(entry), 1);
}
export function spend(s: GameState, cost: number) {
  requireRule(Number.isSafeInteger(cost) && cost >= 0 && s.zeny >= cost, 'INSUFFICIENT_ZENY', 'Zeny insuficiente.'); s.zeny -= cost;
}
export function isProtected(s: GameState, e: InventoryEntry) { return e.favorite || e.refine > 0 || e.cards.length > 0 || Object.values(s.equipment).includes(e.uid); }
