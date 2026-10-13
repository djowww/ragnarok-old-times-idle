import { describe, expect, it } from 'vitest';
import { battleHeroAt, enemyPositionAt } from '../shared/battleSpatial';
import type { BattleEnemy, GameState } from '../shared/types';
import { battleRouteTangent, projectBattlePoint, type MapProjection } from '../web/assets/mapProjection';

const origin = { x: 199, y: 199 };
const route = [{ x: 0.48, y: 0.65 }, { x: 0.48 + 1 / 12, y: 0.65 }];
const hero = {
  status: 'hunting', areaId: 'field', lastSimulatedAt: 0,
  fieldHero: { areaId: 'field', from: route[0], position: route[1], movementRoute: route, startedAt: 1000, arrivedAt: 2500 },
} as unknown as GameState;
const enemy = {
  id: 'enemy-1', position: route[1], approachFrom: route[0], movementRoute: route,
  startedAt: 1000, arrivedAt: 2500, spawnDirection: 0,
} as BattleEnemy;
function camera(focus: [number, number, number], heights?: number[]): MapProjection {
  return { map: 'prt_fild08', modelView: Array(16).fill(0), projection: Array(16).fill(0), focus,
    viewport: { width: 800, height: 600 }, ground: heights ? { x: 199, y: 199, size: 3, heights, walkable: Array(9).fill(1) } : undefined };
}

describe('authoritative field actor presentation', () => {
  it.each([0, 0.5, 1])('projects the shared hero and enemy route at fraction %s without route replanning', fraction => {
    const at = 1000 + 1500 * fraction;
    const heroPoint = battleHeroAt(hero, at);
    const enemyPoint = enemyPositionAt(enemy, at);
    const map = camera([199.5, 0, 199.5]);
    expect(projectBattlePoint(map, heroPoint, origin)).toEqual([
      199.5 + fraction, 0, 199.5,
    ]);
    expect(projectBattlePoint(map, enemyPoint, origin)).toEqual([
      199.5 + fraction, 0, 199.5,
    ]);
  });

  it('faces the next authoritative waypoint and keeps horizontal position and deadlines through height refresh', () => {
    const midpoint = battleHeroAt(hero, 1750);
    const firstSample = projectBattlePoint(camera([199.5, 4, 199.5], Array(9).fill(2)), midpoint, origin);
    const refreshedSample = projectBattlePoint(camera([200.5, 9, 199.5], Array(9).fill(8)), midpoint, origin);
    expect(firstSample).toEqual([200, 2, 199.5]);
    expect(refreshedSample).toEqual([200, 8, 199.5]);
    expect(battleRouteTangent(camera([199.5, 0, 199.5]), route, 0.5, origin)).toEqual([200.5, 0, 199.5]);
    expect(hero.fieldHero).toMatchObject({ startedAt: 1000, arrivedAt: 2500 });
    expect(enemy).toMatchObject({ startedAt: 1000, arrivedAt: 2500 });
  });

  it('keeps the same route position after pause and reconnect resumption', () => {
    const pausedHero = { ...hero, status: 'paused', pausedAt: 1750 } as GameState;
    const pausedEnemy = { ...enemy, approachPausedAt: 1750 };
    const expected = [200, 0, 199.5];
    const map = camera([199.5, 0, 199.5]);
    expect(projectBattlePoint(map, battleHeroAt(pausedHero, 9000), origin)).toEqual(expected);
    expect(projectBattlePoint(map, enemyPositionAt(pausedEnemy, 9000), origin)).toEqual(expected);
    expect(pausedHero.fieldHero).toMatchObject({ startedAt: 1000, arrivedAt: 2500 });
    expect(pausedEnemy).toMatchObject({ startedAt: 1000, arrivedAt: 2500, approachPausedAt: 1750 });
  });
});
