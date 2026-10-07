import type { BattleEnemy, GameState } from './types.js';

export type BattlePoint = { x: number; y: number };
export const BATTLE_HERO: Readonly<BattlePoint> = { x: 0.48, y: 0.65 };
export const BATTLE_CELLS_PER_UNIT = 12;

/** Persisted movement shared by seeking, chasing and combat projection. */
export function battleHeroAt(state: GameState, at: number): BattlePoint {
  const hero = state.status !== 'town' && state.status !== 'challenge' && state.fieldHero?.areaId === state.areaId
    ? state.fieldHero : undefined;
  if (!hero) return { ...BATTLE_HERO };
  const time = state.status === 'paused' ? state.pausedAt ?? state.lastSimulatedAt : at;
  const progress = Math.max(0, Math.min(1, (time - hero.startedAt) / Math.max(1, hero.arrivedAt - hero.startedAt)));
  return { x: hero.from.x + (hero.position.x - hero.from.x) * progress,
    y: hero.from.y + (hero.position.y - hero.from.y) * progress };
}

export function fieldHeroWalking(state: GameState, at: number): boolean {
  const hero = state.fieldHero;
  return state.status === 'hunting' && hero?.areaId === state.areaId &&
    at < hero.arrivedAt && battleDistance(hero.from, hero.position) > 0;
}

/** Square map-cell distance, Hercules path.c:distance without CIRCULAR_AREA. */
export function battleDistance(a: BattlePoint, b: BattlePoint): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * BATTLE_CELLS_PER_UNIT;
}

/** Player attack/skill range, Hercules path.c:distance_client: integer sqrt -.0625. */
export function playerBattleDistance(a: BattlePoint, b: BattlePoint): number {
  return Math.floor(Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) * BATTLE_CELLS_PER_UNIT - 0.0625));
}

export function enemyApproachProgress(enemy: BattleEnemy, at: number): number {
  const time = enemy.approachPausedAt ?? at;
  return Math.max(0, Math.min(1, (time - enemy.startedAt) / Math.max(1, enemy.arrivedAt - enemy.startedAt)));
}

/** One arrival timeline shared by combat and projection; old arrived saves remain valid. */
export function enemyPositionAt(enemy: BattleEnemy, at: number): BattlePoint {
  const progress = enemyApproachProgress(enemy, at);
  if (progress >= 1) return { ...enemy.position };
  const angle = (enemy.spawnDirection * 45 - 90) * Math.PI / 180;
  const from = enemy.approachFrom ?? {
    x: BATTLE_HERO.x + Math.cos(angle),
    y: BATTLE_HERO.y + Math.sin(angle),
  };
  return {
    x: from.x + (enemy.position.x - from.x) * progress,
    y: from.y + (enemy.position.y - from.y) * progress,
  };
}

export function enemyDistanceAt(enemy: BattleEnemy, at: number, hero: BattlePoint = BATTLE_HERO): number {
  return battleDistance(hero, enemyPositionAt(enemy, at));
}
