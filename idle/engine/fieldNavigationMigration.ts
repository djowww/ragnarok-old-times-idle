import type { GameState } from '../shared/types.js';
import { BATTLE_HERO, battleHeroAt, enemyPositionAt } from '../shared/battleSpatial.js';
import type { SimulationContext } from './fieldNavigation.js';

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function distanceCells(navigation: NonNullable<SimulationContext['navigation']>, areaId: string,
  from: { x: number; y: number }, to: { x: number; y: number }): number {
  const a = navigation.toGridPoint(areaId, from), b = navigation.toGridPoint(areaId, to);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function routeDistanceCells(navigation: NonNullable<SimulationContext['navigation']>, areaId: string,
  points: readonly { x: number; y: number }[]): number {
  let distance = 0;
  for (let i = 1; i < points.length; i++) distance += distanceCells(navigation, areaId, points[i - 1], points[i]);
  return distance;
}

function enemySegmentStart(enemy: NonNullable<GameState['fieldPopulation']>['enemies'][number]): { x: number; y: number } {
  if (enemy.movementRoute?.length) return enemy.movementRoute[0];
  if (enemy.approachFrom) return enemy.approachFrom;
  const angle = (enemy.spawnDirection * 45 - 90) * Math.PI / 180;
  return { x: BATTLE_HERO.x + Math.cos(angle), y: BATTLE_HERO.y + Math.sin(angle) };
}

function safeEffectivePoint(navigation: NonNullable<SimulationContext['navigation']>, areaId: string,
  point: { x: number; y: number }): { x: number; y: number } | null {
  // Keep the exact fractional point whenever its tile is walkable, including
  // isolated islands. Snap only when the old movement placed it in a blocked tile.
  return navigation.isWalkableBattlePoint(areaId, point)
    ? { ...point }
    : navigation.resolveActorPoint(areaId, point, true);
}

function savedRouteIsLegal(navigation: NonNullable<SimulationContext['navigation']>, areaId: string,
  points: readonly { x: number; y: number }[]): boolean {
  if (points.some(point => !navigation.isWalkableBattlePoint(areaId, point))) return false;
  for (let i = 1; i < points.length; i++) {
    const direct = distanceCells(navigation, areaId, points[i - 1], points[i]);
    const route = navigation.route(areaId, points[i - 1], points[i]);
    // A longer graph route means this saved segment crosses blocked terrain or
    // clips a diagonal corner, even when both endpoint cells are walkable.
    if (!route || route.distanceCells > direct + 1e-7) return false;
  }
  return true;
}

function migrateActiveSegment(navigation: NonNullable<SimulationContext['navigation']>, areaId: string,
  at: number, startedAt: number, arrivedAt: number, sourceDistance: number, sourceMsPerCell: number | undefined,
  current: { x: number; y: number },
  end: { x: number; y: number }, write: (from: { x: number; y: number }, to: { x: number; y: number },
    route: readonly { x: number; y: number }[], arrival: number) => void): boolean {
  const safeCurrent = safeEffectivePoint(navigation, areaId, current);
  const safeEnd = safeEffectivePoint(navigation, areaId, end);
  if (!safeCurrent || !safeEnd) return false;
  const route = navigation.route(areaId, safeCurrent, safeEnd);
  if (!route) return false;
  if (route.distanceCells <= 1e-9) {
    write(safeCurrent, safeEnd, route.points, Math.max(at, arrivedAt));
    return true;
  }
  const totalDuration = Math.max(1, arrivedAt - startedAt);
  const measuredSourceDistance = Number.isFinite(sourceDistance) && sourceDistance > 1e-9
    ? sourceDistance : distanceCells(navigation, areaId, current, end);
  const millisecondsPerCell = sourceMsPerCell && Number.isFinite(sourceMsPerCell) && sourceMsPerCell > 0
    ? sourceMsPerCell : totalDuration / Math.max(measuredSourceDistance, 1e-9);
  const remainingMs = Math.max(1, Math.ceil(route.distanceCells * millisecondsPerCell));
  write(safeCurrent, safeEnd, route.points, Math.max(arrivedAt, at + remainingMs));
  return true;
}

/** Repair persisted actors before replay so a stale route cannot cross blocked terrain. */
export function migrateFieldNavigationState(state: GameState, at: number, context?: SimulationContext): void {
  const navigation = context?.navigation;
  if (!navigation || !state.areaId || state.status === 'challenge' || state.battle?.challengeId) return;
  const areaId = state.areaId;
  navigation.area(areaId);

  const hero = state.fieldHero?.areaId === areaId ? state.fieldHero : undefined;
  if (hero) {
    const movementAt = state.status === 'paused' ? state.pausedAt ?? state.lastSimulatedAt : at;
    const current = battleHeroAt(state, movementAt);
    const end = safeEffectivePoint(navigation, areaId, hero.position);
    const active = movementAt >= hero.startedAt && movementAt < hero.arrivedAt;
    const validRoute = !!hero.movementRoute?.length && savedRouteIsLegal(navigation, areaId, hero.movementRoute);
    const needsRepair = !end || !samePoint(end, hero.position) ||
      active && (!hero.movementRoute?.length || !validRoute) ||
      !active && hero.movementRoute?.length && !validRoute;
    if (needsRepair) {
      const originalRouteDistance = hero.movementRoute?.length
        ? routeDistanceCells(navigation, areaId, hero.movementRoute)
        : distanceCells(navigation, areaId, hero.from, hero.position);
      const repaired = active && migrateActiveSegment(navigation, areaId, movementAt, hero.startedAt, hero.arrivedAt,
        originalRouteDistance, hero.movementSpeedMs, current,
        end ?? hero.position, (from, to, route, arrival) => {
          Object.assign(hero, { from, position: to, movementRoute: route.map(point => ({ ...point })), startedAt: movementAt, arrivedAt: arrival });
          delete hero.movementTargetKey;
          delete hero.movementTargetWithinRange;
          delete hero.movementSpeedMs;
        });
      if (!repaired) {
        const safe = safeEffectivePoint(navigation, areaId, current) ?? navigation.home(areaId, 0);
        Object.assign(hero, { from: safe, position: safe, startedAt: at, arrivedAt: at });
        delete hero.movementRoute;
        delete hero.movementTargetKey;
        delete hero.movementTargetWithinRange;
        delete hero.movementSpeedMs;
      }
    }
  }

  const actors = new Set([...(state.fieldPopulation?.enemies ?? []), ...(state.battle?.enemies ?? [])]);
  for (const enemy of actors) {
    if (enemy.fieldSlot !== undefined) enemy.homePosition = navigation.home(areaId, enemy.fieldSlot);
    const movementAt = enemy.approachPausedAt ?? at;
    const current = enemyPositionAt(enemy, at);
    const end = safeEffectivePoint(navigation, areaId, enemy.position);
    const active = movementAt >= enemy.startedAt && movementAt < enemy.arrivedAt;
    const validRoute = !!enemy.movementRoute?.length && savedRouteIsLegal(navigation, areaId, enemy.movementRoute);
    const needsRepair = !end || !samePoint(end, enemy.position) ||
      active && (!enemy.movementRoute?.length || !validRoute) ||
      !active && enemy.movementRoute?.length && !validRoute;
    if (needsRepair) {
      const sourceStart = enemySegmentStart(enemy);
      const originalRouteDistance = enemy.movementRoute?.length
        ? routeDistanceCells(navigation, areaId, enemy.movementRoute)
        : distanceCells(navigation, areaId, sourceStart, enemy.position);
      const repaired = active && migrateActiveSegment(navigation, areaId, movementAt, enemy.startedAt, enemy.arrivedAt,
        originalRouteDistance, enemy.movementSpeedMs, current,
        end ?? enemy.position, (from, to, route, arrival) => {
          Object.assign(enemy, { approachFrom: from, position: to, movementRoute: route.map(point => ({ ...point })), startedAt: movementAt, arrivedAt: arrival });
          delete enemy.movementTargetKey;
          delete enemy.movementTargetWithinRange;
          delete enemy.movementSpeedMs;
        });
      if (!repaired) {
        const safe = safeEffectivePoint(navigation, areaId, current) ?? navigation.home(areaId, enemy.fieldSlot ?? 0);
        Object.assign(enemy, { approachFrom: safe, position: safe, startedAt: at, arrivedAt: at });
        delete enemy.movementRoute;
        delete enemy.movementTargetKey;
        delete enemy.movementTargetWithinRange;
        delete enemy.movementSpeedMs;
      }
    }
  }
}
