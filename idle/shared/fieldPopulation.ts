import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO, type BattlePoint } from './battleSpatial.js';

/** Fixed source-cell homes around the player; the server owns every living id. */
const FIELD_HOMES = [
  { x: -7, y: -10 }, { x: 9, y: -9 }, { x: -10, y: 2 }, { x: 10, y: 3 },
] as const;
export function fieldHome(slot: number): BattlePoint {
  const point = FIELD_HOMES[Math.max(0, slot) % FIELD_HOMES.length];
  return { x: BATTLE_HERO.x + point.x / BATTLE_CELLS_PER_UNIT,
    y: BATTLE_HERO.y + point.y / BATTLE_CELLS_PER_UNIT };
}

/** Shared deterministic patrol destination. No browser movement changes combat. */
export function fieldWanderPoint(slot: number, at: number): BattlePoint {
  const home = fieldHome(slot);
  const angle = (Math.floor(at / 5500) + slot * 3) % 8 * Math.PI / 4;
  return { x: home.x + Math.cos(angle) * 1.6 / BATTLE_CELLS_PER_UNIT,
    y: home.y + Math.sin(angle) * 1.6 / BATTLE_CELLS_PER_UNIT };
}
