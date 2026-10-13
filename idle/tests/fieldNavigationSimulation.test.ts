import { describe, expect, it } from 'vitest';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO, battleDistance, battleHeroAt, enemyPositionAt, playerBattleDistance } from '../shared/battleSpatial.js';
import type { BattleEnemy, GameState } from '../shared/types.js';
import { canSearchExactSquareRangeZeroGoal, createFieldNavigationRuntime, routeGoalOctileHeuristic,
  landmarkGoalLowerBound, type FieldNavigationAreaSpec } from '../engine/fieldNavigation.js';
import { advanceState, applyCommand, createInitialState } from '../engine/index.js';
import { migrateFieldNavigationState } from '../engine/fieldNavigationMigration.js';
import { addItem } from '../engine/state.js';
import { startSageEnchantCast } from '../engine/sageEnchantments.js';
import { playerWalkSpeed, tick } from '../engine/encounters.js';
import { connectedCells, gridWalkable, nearestConnectedCell, type FieldNavigationGrid } from '../shared/fieldNavigation.js';
import catalogJSON from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';

const catalog = catalogJSON as unknown as Catalog;

function grid(width = 7, height = 7, blocked: Array<[number, number]> = []): FieldNavigationGrid {
  const walkable = new Uint8Array(Math.ceil(width * height / 8));
  for (let id = 0; id < width * height; id++) walkable[id >> 3] |= 1 << (id & 7);
  for (const [x, y] of blocked) {
    const id = y * width + x;
    walkable[id >> 3] &= ~(1 << (id & 7));
  }
  return { map: 'test_field', width, height, walkable, sourceSha256: 'a'.repeat(64) };
}

const area: FieldNavigationAreaSpec = {
  areaId: 'test_area', map: 'test_field', origin: { x: 3, y: 3 },
  homeOffsets: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }],
};

function battleAtCell(x: number, y: number) {
  return { x: BATTLE_HERO.x + (x + 0.5 - (area.origin.x + 0.5)) / BATTLE_CELLS_PER_UNIT,
    y: BATTLE_HERO.y + (y + 0.5 - (area.origin.y + 0.5)) / BATTLE_CELLS_PER_UNIT };
}

const ROUTE_OFFSETS = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

function referenceDijkstraRouteToRange(runtime: ReturnType<typeof createFieldNavigationRuntime>, grid: FieldNavigationGrid,
  from: { x: number; y: number }, target: { x: number; y: number }, range: number,
  metric: 'player' | 'square') {
  const gridFrom = runtime.toGridPoint('test_area', from), gridTarget = runtime.toGridPoint('test_area', target);
  if (!gridWalkable(grid, gridFrom)) return null;
  const start = Math.floor(gridFrom.y) * grid.width + Math.floor(gridFrom.x), count = grid.width * grid.height;
  const costs = new Float64Array(count); costs.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(count); previous.fill(-1);
  const settled = new Uint8Array(count);
  const startCenter = { x: start % grid.width + 0.5, y: Math.floor(start / grid.width) + 0.5 };
  costs[start] = Math.hypot(gridFrom.x - startCenter.x, gridFrom.y - startCenter.y);
  const queue = [{ id: start, distance: costs[start] }];
  let found = -1;
  while (queue.length) {
    queue.sort((a, b) => a.distance - b.distance || a.id - b.id);
    const current = queue.shift()!;
    if (settled[current.id] || current.distance !== costs[current.id]) continue;
    settled[current.id] = 1;
    const x = current.id % grid.width + 0.5, y = Math.floor(current.id / grid.width) + 0.5;
    const battlePoint = runtime.toBattlePoint('test_area', { x, y });
    if ((metric === 'player' ? playerBattleDistance(battlePoint, target) : battleDistance(battlePoint, target)) <= range) {
      found = current.id; break;
    }
    const cellX = current.id % grid.width, cellY = Math.floor(current.id / grid.width);
    for (const [dx, dy] of ROUTE_OFFSETS) {
      const nx = cellX + dx, ny = cellY + dy;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      const next = ny * grid.width + nx;
      if (!gridWalkable(grid, { x: nx + 0.5, y: ny + 0.5 })) continue;
      if (dx && dy && (!gridWalkable(grid, { x: nx + 0.5, y: cellY + 0.5 }) ||
        !gridWalkable(grid, { x: cellX + 0.5, y: ny + 0.5 }))) continue;
      const candidate = current.distance + (dx && dy ? Math.SQRT2 : 1);
      if (candidate >= costs[next]) continue;
      costs[next] = candidate; previous[next] = current.id;
      queue.push({ id: next, distance: candidate });
    }
  }
  if (found < 0) {
    const component = connectedCells(grid, gridFrom);
    const closest = nearestConnectedCell(grid, gridTarget, component);
    if (!closest) return null;
    const route = runtime.route('test_area', from, runtime.toBattlePoint('test_area', closest));
    return route ? { route, withinRange: false } : null;
  }
  const ids: number[] = [];
  for (let id = found; id >= 0; id = previous[id]) { ids.push(id); if (id === start) break; }
  if (ids.at(-1) !== start) return null;
  ids.reverse();
  const points: { x: number; y: number }[] = [{ ...gridFrom }];
  const append = (point: { x: number; y: number }) => {
    const last = points.at(-1)!;
    if (last.x !== point.x || last.y !== point.y) points.push(point);
  };
  if (gridFrom.x !== startCenter.x || gridFrom.y !== startCenter.y) append(startCenter);
  for (const id of ids.slice(1)) append({ x: id % grid.width + 0.5, y: Math.floor(id / grid.width) + 0.5 });
  return { route: { points: points.map(point => runtime.toBattlePoint('test_area', point)), distanceCells: costs[found] }, withinRange: true };
}

describe('authoritative field navigation runtime', () => {
  it('uses an admissible octile lower bound to the relaxed range rectangle', () => {
    expect(routeGoalOctileHeuristic({ x: 0.5, y: 0.5 }, { x: 10.5, y: 10.5 }, 2, 'square'))
      .toBeCloseTo(8 * Math.SQRT2, 6);
    const playerLowerBound = routeGoalOctileHeuristic({ x: 0.5, y: 0.5 }, { x: 10.5, y: 10.5 }, 2, 'player');
    expect(playerLowerBound).toBeCloseTo(6.9375 * Math.SQRT2, 6);
    expect(routeGoalOctileHeuristic({ x: 10.5, y: 9.5 }, { x: 10.5, y: 10.5 }, 0, 'player')).toBe(0);
  });

  it('uses the distance from a landmark interval as a downward-safe goal lower bound', () => {
    expect(landmarkGoalLowerBound(10, 18, 22)).toBeCloseTo(8, 8);
    expect(landmarkGoalLowerBound(20, 18, 22)).toBe(0);
    expect(landmarkGoalLowerBound(25, 18, 22)).toBeCloseTo(3, 8);
    expect(landmarkGoalLowerBound(25, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('matches the legacy Dijkstra route oracle across randomized interleaved grids and ranges', () => {
    let seed = 0x5eed1234;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x1_0000_0000; };
    const runtimes: Array<{ runtime: ReturnType<typeof createFieldNavigationRuntime>; grid: FieldNavigationGrid }> = [];
    for (let map = 0; map < 12; map++) {
      const blocked: Array<[number, number]> = [];
      for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
        if (x >= 2 && x <= 4 && y >= 2 && y <= 4) continue;
        if (random() < 0.22) blocked.push([x, y]);
      }
      const selectedGrid = grid(15, 15, blocked);
      runtimes.push({ grid: selectedGrid,
        runtime: createFieldNavigationRuntime([area], new Map([['test_field', selectedGrid]])) });
    }
    for (let sample = 0; sample < 120; sample++) {
      const { runtime, grid: selectedGrid } = runtimes[(sample * 7) % runtimes.length];
      const x = Math.floor(random() * 15), y = Math.floor(random() * 15);
      let from = battleAtCell(x, y);
      if (!runtime.resolveActorPoint('test_area', from, false)) from = battleAtCell(3, 3);
      from = { x: from.x + 0.23 / BATTLE_CELLS_PER_UNIT, y: from.y - 0.17 / BATTLE_CELLS_PER_UNIT };
      const target = battleAtCell(Math.floor(random() * 15), Math.floor(random() * 15));
      const fractionalTarget = { x: target.x + 0.31 / BATTLE_CELLS_PER_UNIT, y: target.y - 0.27 / BATTLE_CELLS_PER_UNIT };
      const range = sample % 4;
      const metric: 'player' | 'square' = sample % 2 ? 'player' : 'square';
      const actual = runtime.routeToRange('test_area', from, fractionalTarget, range, metric);
      const expected = referenceDijkstraRouteToRange(runtime, selectedGrid, from, fractionalTarget, range, metric);
      expect(actual, JSON.stringify({ sample, from, fractionalTarget, range, metric })).toEqual(expected);
    }
  });

  it('keeps routes exact after landmark cache eviction and recomputation', () => {
    const cases = [
      grid(9, 9, [[6, 3], [6, 4], [6, 5]]),
      grid(9, 9, [[3, 6], [4, 6], [5, 6]]),
      grid(9, 9, [[5, 1], [5, 2], [5, 3]]),
    ].map(selectedGrid => ({ selectedGrid,
      runtime: createFieldNavigationRuntime([area], new Map([['test_field', selectedGrid]])) }));
    const from = battleAtCell(3, 3), target = battleAtCell(7, 6);
    const firstExpected = referenceDijkstraRouteToRange(cases[0].runtime, cases[0].selectedGrid, from, target, 1, 'player');
    const firstActual = cases[0].runtime.routeToRange('test_area', from, target, 1, 'player');
    expect(firstActual).toEqual(firstExpected);
    for (const entry of cases.slice(1)) {
      const actual = entry.runtime.routeToRange('test_area', from, target, 1, 'player');
      expect(actual).toEqual(referenceDijkstraRouteToRange(entry.runtime, entry.selectedGrid, from, target, 1, 'player'));
    }
    expect(cases[0].runtime.routeToRange('test_area', from, target, 1, 'player')).toEqual(firstExpected);
  });

  it('skips an impossible exact square range-zero goal search', () => {
    const center = battleAtCell(4, 2);
    expect(canSearchExactSquareRangeZeroGoal(true, center, center)).toBe(true);
    expect(canSearchExactSquareRangeZeroGoal(false, center, center)).toBe(false);
    expect(canSearchExactSquareRangeZeroGoal(true, { x: center.x + 0.01, y: center.y }, center)).toBe(false);
  });

  it('returns the same legal nearest fallback for blocked and fractional square range-zero targets', () => {
    const sidecarArea = { ...area, homeOffsets: [{ x: -1, y: -1 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -1 }] };
    const blockedRuntime = createFieldNavigationRuntime([sidecarArea], new Map([['test_field', grid(7, 7, [[4, 2]])]]));
    const from = battleAtCell(2, 2), blockedTarget = battleAtCell(4, 2);
    const blockedApproach = blockedRuntime.routeToRange('test_area', from, blockedTarget, 0, 'square');
    expect(blockedApproach?.withinRange).toBe(false);
    expect(blockedRuntime.isWalkableBattlePoint('test_area', blockedApproach!.route.points.at(-1)!)).toBe(true);

    const openRuntime = createFieldNavigationRuntime([area], new Map([['test_field', grid()]]));
    const fractionalTarget = { x: blockedTarget.x + 0.01, y: blockedTarget.y };
    const fractionalApproach = openRuntime.routeToRange('test_area', from, fractionalTarget, 0, 'square');
    expect(fractionalApproach?.withinRange).toBe(false);
    expect(openRuntime.isWalkableBattlePoint('test_area', fractionalApproach!.route.points.at(-1)!)).toBe(true);
  });

  it('uses the authored integer origin with the existing half-cell transform', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid()]]));
    expect(runtime.toGridPoint('test_area', BATTLE_HERO)).toEqual({ x: 3.5, y: 3.5 });
    expect(runtime.toBattlePoint('test_area', { x: 2.5, y: 5.5 })).toEqual(battleAtCell(2, 5));
  });

  it('routes around walls with fractional endpoints and the graph route length', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid(7, 7, [[3, 2]])]]));
    const from = battleAtCell(2, 2), to = battleAtCell(4, 2);
    const route = runtime.route('test_area', from, to);
    expect(route).not.toBeNull();
    expect(route!.points[0]).toEqual(from);
    expect(route!.points.at(-1)).toEqual(to);
    expect(route!.distanceCells).toBeGreaterThan(2);
    expect(route!.points.some(point => runtime.isWalkableBattlePoint('test_area', point))).toBe(true);
  });

  it('keeps goal routes deterministic when different map runtimes interleave', () => {
    const northWall = createFieldNavigationRuntime([area], new Map([['test_field', grid(7, 7, [[3, 2]])]]));
    const southWall = createFieldNavigationRuntime([area], new Map([['test_field', grid(9, 7, [[3, 4]])]]));
    const from = battleAtCell(2, 2), target = battleAtCell(4, 2);
    const first = northWall.routeToRange('test_area', from, target, 0, 'square')!;
    const second = southWall.routeToRange('test_area', from, target, 0, 'square')!;
    expect(northWall.routeToRange('test_area', from, target, 0, 'square')).toEqual(first);
    expect(southWall.routeToRange('test_area', from, target, 0, 'square')).toEqual(second);
    expect(first.withinRange).toBe(true);
    expect(second.withinRange).toBe(true);
    expect(first.route.distanceCells).toBeGreaterThan(second.route.distanceCells);
  });

  it('resolves homes from the authored offsets and clips knockback at blocked cells', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid(7, 7, [[5, 3]])]]));
    expect(runtime.home('test_area', 0)).toEqual(battleAtCell(2, 2));
    const stopped = runtime.displace('test_area', battleAtCell(3, 3), 4, 0);
    expect(runtime.isWalkableBattlePoint('test_area', stopped)).toBe(true);
    expect(runtime.toGridPoint('test_area', stopped).x).toBeLessThan(5.5);
  });

  it('selects a reachable attack cell and returns a finite nearest approach when the target is isolated', () => {
    const sidecarArea = { ...area, homeOffsets: [{ x: -1, y: -1 }, { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: -1 }] };
    const runtime = createFieldNavigationRuntime([sidecarArea], new Map([['test_field', grid(7, 7,
      [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6]])]]));
    const start = battleAtCell(2, 3), isolated = battleAtCell(6, 3);
    const approach = runtime.routeToRange('test_area', start, isolated, 1, 'player');
    expect(approach).not.toBeNull();
    expect(approach!.withinRange).toBe(false);
    expect(approach!.route.points.at(-1)).toEqual(battleAtCell(3, 3));
    expect(approach!.route.distanceCells).toBeGreaterThan(0);
  });

  it('repairs a blocked saved actor only onto the origin component', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid(7, 7,
      [[2, 3], [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6]])]]));
    const repaired = runtime.resolveActorPoint('test_area', battleAtCell(2, 3), true);
    expect(repaired).not.toBeNull();
    expect(runtime.isWalkableBattlePoint('test_area', repaired!)).toBe(true);
    const disconnected = runtime.resolveActorPoint('test_area', battleAtCell(6, 3), true);
    expect(disconnected).not.toBeNull();
    expect(runtime.route('test_area', battleAtCell(3, 3), disconnected!)).not.toBeNull();
  });

  it('migrates blocked saved hero and enemies before replay, preserving the profile', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid(7, 7, [[2, 3]])]]));
    const state = createInitialState(catalog, 1000);
    state.status = 'hunting'; state.areaId = 'test_area';
    state.fieldHero = { areaId: 'test_area', from: battleAtCell(2, 3), position: battleAtCell(2, 3),
      startedAt: 1000, arrivedAt: 1000, routeIndex: 0 };
    const enemy: BattleEnemy = { id: 'saved', monsterId: 1002, hp: 50, maxHp: 50, startedAt: 1000, arrivedAt: 1000,
      enemyNextAttackAt: 1000, spawnDirection: 0, fieldSlot: 1, approachFrom: battleAtCell(2, 3), position: battleAtCell(2, 3) };
    state.battle = { monsterId: enemy.monsterId, hp: enemy.hp, maxHp: enemy.maxHp, startedAt: 1000,
      playerNextAttackAt: 1000, enemyNextAttackAt: 1000, enemies: [enemy] };
    const original = { id: state.id, hp: state.hp, inventory: structuredClone(state.inventory), totals: structuredClone(state.totals) };

    migrateFieldNavigationState(state, 1000, { navigation: runtime });

    expect(runtime.isWalkableBattlePoint('test_area', state.fieldHero!.position)).toBe(true);
    expect(runtime.isWalkableBattlePoint('test_area', enemy.position)).toBe(true);
    expect(enemy.homePosition).toEqual(runtime.home('test_area', 1));
    expect(state.id).toBe(original.id); expect(state.hp).toBe(original.hp);
    expect(state.inventory).toEqual(original.inventory); expect(state.totals).toEqual(original.totals);
  });

  it('rebuilds active legacy straight movement around walls and extends arrival by legal route time', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid(7, 7, [[3, 2]])]]));
    const state = createInitialState(catalog, 0);
    state.status = 'hunting'; state.areaId = 'test_area';
    state.fieldHero = { areaId: 'test_area', from: battleAtCell(2, 2), position: battleAtCell(4, 2),
      startedAt: 0, arrivedAt: 1000, routeIndex: 0 };
    const oldEffective = battleHeroAt(state, 500);

    migrateFieldNavigationState(state, 500, { navigation: runtime });

    const hero = state.fieldHero!;
    expect(runtime.isWalkableBattlePoint('test_area', oldEffective)).toBe(false);
    expect(runtime.isWalkableBattlePoint('test_area', hero.from)).toBe(true);
    expect(runtime.isWalkableBattlePoint('test_area', hero.position)).toBe(true);
    expect(hero.movementRoute!.length).toBeGreaterThan(2);
    expect(hero.movementRoute!.every(point => runtime.isWalkableBattlePoint('test_area', point))).toBe(true);
    expect(hero.arrivedAt).toBeGreaterThan(1000);
  });

  it('repairs a saved diagonal route that clips a blocked corner before replay', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid(7, 7, [[3, 2]])]]));
    const from = battleAtCell(2, 2), to = battleAtCell(3, 3);
    const state = createInitialState(catalog, 0);
    state.status = 'hunting'; state.areaId = 'test_area';
    state.fieldHero = { areaId: 'test_area', from, position: to, startedAt: 0, arrivedAt: 1000,
      routeIndex: 0, movementRoute: [from, to] };

    migrateFieldNavigationState(state, 0, { navigation: runtime });

    expect(state.fieldHero!.movementRoute!.length).toBeGreaterThan(2);
    expect(state.fieldHero!.movementRoute!.every(point => runtime.isWalkableBattlePoint('test_area', point))).toBe(true);
  });

  it('preserves a walkable fractional legacy midpoint while adding its route', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid()]]));
    const state = createInitialState(catalog, 0);
    state.status = 'hunting'; state.areaId = 'test_area';
    state.fieldHero = { areaId: 'test_area', from: battleAtCell(2, 3), position: battleAtCell(4, 3),
      startedAt: 0, arrivedAt: 1000, routeIndex: 0 };
    const effective = battleHeroAt(state, 500);

    migrateFieldNavigationState(state, 500, { navigation: runtime });

    expect(state.fieldHero!.from).toEqual(effective);
    expect(state.fieldHero!.movementRoute?.[0]).toEqual(effective);
    expect(state.fieldHero!.startedAt).toBe(500);
  });

  it('preserves the original arrival deadline when migrating hero and enemy midpoints', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid()]]));
    const from = battleAtCell(2, 3), to = battleAtCell(4, 3);
    for (const at of [250, 500, 750]) {
      const state = createInitialState(catalog, 0);
      state.status = 'hunting'; state.areaId = 'test_area';
      state.fieldHero = { areaId: 'test_area', from, position: to, startedAt: 0, arrivedAt: 1000, routeIndex: 0 };
      const enemy: BattleEnemy = { id: `legacy-${at}`, monsterId: 1002, hp: 10, maxHp: 10,
        startedAt: 0, arrivedAt: 1000, enemyNextAttackAt: 0, spawnDirection: 0, approachFrom: from, position: to };
      state.fieldPopulation = { areaId: 'test_area', generation: 1, enemies: [enemy], respawns: [] };

      migrateFieldNavigationState(state, at, { navigation: runtime });

      expect(state.fieldHero!.arrivedAt).toBe(1000);
      expect(enemy.arrivedAt).toBe(1000);
    }
  });

  it('preserves a paused enemy midpoint and its original arrival deadline during migration', () => {
    const runtime = createFieldNavigationRuntime([area], new Map([['test_field', grid()]]));
    const from = battleAtCell(2, 3), to = battleAtCell(4, 3), pausedAt = 500, at = 900;
    const state = createInitialState(catalog, 0);
    state.status = 'hunting'; state.areaId = 'test_area';
    const enemy: BattleEnemy = { id: 'paused-legacy', monsterId: 1002, hp: 10, maxHp: 10,
      startedAt: 0, arrivedAt: 1000, approachPausedAt: pausedAt, enemyNextAttackAt: 0, spawnDirection: 0,
      approachFrom: from, position: to };
    state.fieldPopulation = { areaId: 'test_area', generation: 1, enemies: [enemy], respawns: [] };

    migrateFieldNavigationState(state, at, { navigation: runtime });

    expect(enemy.approachPausedAt).toBe(pausedAt);
    expect(enemy.startedAt).toBe(pausedAt);
    expect(enemy.arrivedAt).toBe(1000);
    expect(enemyPositionAt(enemy, at)).toEqual(battleAtCell(3, 3));
  });

  it('routes a field hero around a blocked direct chase cell and preserves the route endpoints', () => {
    const navigationArea = { ...area, areaId: 'prontera_south', map: 'prt_fild08' };
    const runtime = createFieldNavigationRuntime([navigationArea], new Map([['prt_fild08', { ...grid(7, 7, [[4, 3]]), map: 'prt_fild08' }]]));
    const state = createInitialState(catalog, 0);
    state.status = 'hunting'; state.areaId = navigationArea.areaId;
    state.fieldHero = { areaId: navigationArea.areaId, from: BATTLE_HERO, position: BATTLE_HERO,
      startedAt: 0, arrivedAt: 0, routeIndex: 0 };
    const enemy: BattleEnemy = { id: 'target', monsterId: 1002, hp: 100, maxHp: 100, startedAt: 0, arrivedAt: 0,
      enemyNextAttackAt: Number.MAX_SAFE_INTEGER, spawnDirection: 0, position: battleAtCell(6, 3),
      approachFrom: battleAtCell(6, 3), fieldSlot: 1, engaged: false, hostile: false };
    state.battle = { monsterId: enemy.monsterId, hp: enemy.hp, maxHp: enemy.maxHp, startedAt: 0,
      playerNextAttackAt: Number.MAX_SAFE_INTEGER, enemyNextAttackAt: Number.MAX_SAFE_INTEGER,
      targetId: enemy.id, enemies: [enemy] };
    state.fieldPopulation = { areaId: navigationArea.areaId, generation: 1, enemies: [enemy], respawns: [] };

    tick(state, catalog, 250, 250, { navigation: runtime });

    const route = state.fieldHero!.movementRoute!;
    expect(route.length).toBeGreaterThan(2);
    expect(route[0]).toEqual(BATTLE_HERO);
    expect(route.at(-1)).toEqual(state.fieldHero!.position);
    expect(route.every(point => runtime.isWalkableBattlePoint(navigationArea.areaId, point))).toBe(true);
    expect(route.some(point => point.y !== BATTLE_HERO.y)).toBe(true);
  });

  it('retimes the remaining route when a manual Free Cast starts and ends mid-walk', () => {
    const navigationArea = { ...area, areaId: 'prontera_south', map: 'prt_fild08' };
    const runtime = createFieldNavigationRuntime([navigationArea], new Map([['prt_fild08',
      { ...grid(24, 24, [[4, 3]]), map: 'prt_fild08' }]]));
    const state = createInitialState(catalog, 0);
    state.job = 'sage'; state.baseLevel = 50; state.jobLevel = 50; state.stats.dex = 30; state.sp = 300;
    state.status = 'hunting'; state.areaId = navigationArea.areaId;
    const enchant = catalog.skills.flame_enchant!;
    const freeCast = Object.values(catalog.skills).find(entry => entry.sourceName === 'SA_FREECAST')!;
    state.learnedSkills[enchant.id] = 5; state.learnedSkills[freeCast.id] = 1;
    addItem(state, catalog, 990, 1);
    state.fieldHero = { areaId: navigationArea.areaId, from: BATTLE_HERO, position: BATTLE_HERO,
      startedAt: 0, arrivedAt: 0, routeIndex: 0 };
    const enemy: BattleEnemy = { id: 'target', monsterId: 1002, hp: 100, maxHp: 100,
      startedAt: 0, arrivedAt: 0, enemyNextAttackAt: Number.MAX_SAFE_INTEGER, spawnDirection: 0,
      position: battleAtCell(20, 20), approachFrom: battleAtCell(20, 20), fieldSlot: 1, engaged: false, hostile: false };
    state.battle = { monsterId: enemy.monsterId, hp: enemy.hp, maxHp: enemy.maxHp, startedAt: 0,
      playerNextAttackAt: Number.MAX_SAFE_INTEGER, playerNextSkillAt: Number.MAX_SAFE_INTEGER,
      playerActionReadyAt: Number.MAX_SAFE_INTEGER, enemyNextAttackAt: Number.MAX_SAFE_INTEGER,
      targetId: enemy.id, enemies: [enemy] };
    state.fieldPopulation = { areaId: navigationArea.areaId, generation: 1, enemies: [enemy], respawns: [] };

    tick(state, catalog, 250, 250, { navigation: runtime });
    const originalRoute = state.fieldHero!.movementRoute!;
    expect(originalRoute.length).toBeGreaterThan(2);
    const initialArrival = state.fieldHero!.arrivedAt;
    state.battle!.fieldDecisionAt = 275;
    tick(state, catalog, 275, 25, { navigation: runtime });
    expect(state.fieldHero!.arrivedAt).toBe(initialArrival);
    expect(state.fieldHero!.movementRoute).toEqual(originalRoute);
    const atCastStart = 300;
    const normalSpeed = playerWalkSpeed(state, catalog, atCastStart - 1);
    const castStarted = applyCommand(state, catalog, { type: 'useSkill', skillId: enchant.id }, atCastStart,
      { navigation: runtime });
    expect(castStarted.supportCast).toBeDefined();
    const slowedSpeed = playerWalkSpeed(castStarted, catalog, atCastStart + 1);
    expect(slowedSpeed).toBeGreaterThan(normalSpeed);
    const retimeAt = atCastStart + 100;
    const beforeSlowRetiming = battleHeroAt(castStarted, retimeAt);
    const originalArrival = castStarted.fieldHero!.arrivedAt;
    expect(originalArrival).toBeGreaterThan(retimeAt);
    castStarted.battle!.fieldDecisionAt = retimeAt;
    tick(castStarted, catalog, retimeAt, retimeAt - atCastStart, { navigation: runtime });
    expect(battleHeroAt(castStarted, retimeAt)).toEqual(beforeSlowRetiming);
    expect(castStarted.fieldHero!.arrivedAt).toBeGreaterThan(originalArrival);
    const slowedRoute = castStarted.fieldHero!.movementRoute!;
    expect(slowedRoute.at(-1)).toEqual(originalRoute.at(-1));
    expect(slowedRoute.every(point => runtime.isWalkableBattlePoint(navigationArea.areaId, point))).toBe(true);
    expect(slowedRoute.slice(1).every(point => originalRoute.some(original => original.x === point.x && original.y === point.y))).toBe(true);
    const slowedRemainingCells = slowedRoute.slice(1).reduce((distance, point, index) => {
      const previous = slowedRoute[index];
      return distance + Math.hypot(point.x - previous.x, point.y - previous.y) * BATTLE_CELLS_PER_UNIT;
    }, 0);
    expect(castStarted.fieldHero!.arrivedAt).toBe(retimeAt + Math.ceil(slowedRemainingCells * slowedSpeed));

    const castEnd = castStarted.supportCast!.endsAt;
    const slowArrival = castStarted.fieldHero!.arrivedAt;
    const beforeCastEnd = battleHeroAt(castStarted, castEnd);
    castStarted.battle!.fieldDecisionAt = castEnd;
    tick(castStarted, catalog, castEnd, Math.max(1, castEnd - atCastStart - 100), { navigation: runtime });
    expect(castStarted.supportCast).toBeUndefined();
    expect(battleHeroAt(castStarted, castEnd)).toEqual(beforeCastEnd);
    expect(playerWalkSpeed(castStarted, catalog, castEnd)).toBe(normalSpeed);
    expect(castStarted.fieldHero!.arrivedAt).toBeLessThan(slowArrival);
    const normalRoute = castStarted.fieldHero!.movementRoute!;
    expect(normalRoute.at(-1)).toEqual(slowedRoute.at(-1));
    const normalRemainingCells = normalRoute.slice(1).reduce((distance, point, index) => {
      const previous = normalRoute[index];
      return distance + Math.hypot(point.x - previous.x, point.y - previous.y) * BATTLE_CELLS_PER_UNIT;
    }, 0);
    expect(castStarted.fieldHero!.arrivedAt).toBe(castEnd + Math.ceil(normalRemainingCells * normalSpeed));

    const increaseAgi = Object.values(catalog.skills).find(entry => entry.sourceName === 'AL_INCAGI')!;
    const buffAt = castEnd + 100;
    castStarted.buffs[increaseAgi.id] = { expiresAt: buffAt + 5000, effects: {} };
    const buffSpeed = playerWalkSpeed(castStarted, catalog, buffAt);
    expect(buffSpeed).toBeLessThan(normalSpeed);
    const beforeBuffRetiming = battleHeroAt(castStarted, buffAt);
    castStarted.battle!.fieldDecisionAt = buffAt;
    tick(castStarted, catalog, buffAt, 100, { navigation: runtime });
    expect(battleHeroAt(castStarted, buffAt)).toEqual(beforeBuffRetiming);
    const buffRoute = castStarted.fieldHero!.movementRoute!;
    const buffRemainingCells = buffRoute.slice(1).reduce((distance, point, index) => {
      const previous = buffRoute[index];
      return distance + Math.hypot(point.x - previous.x, point.y - previous.y) * BATTLE_CELLS_PER_UNIT;
    }, 0);
    expect(castStarted.fieldHero!.arrivedAt).toBe(buffAt + Math.ceil(buffRemainingCells * buffSpeed));
  });
});

describe('shared route interpolation', () => {
  it('interpolates persisted hero and enemy routes by cumulative path length', () => {
    const route = [BATTLE_HERO, { x: BATTLE_HERO.x + 1 / BATTLE_CELLS_PER_UNIT, y: BATTLE_HERO.y },
      { x: BATTLE_HERO.x + 2 / BATTLE_CELLS_PER_UNIT, y: BATTLE_HERO.y + 1 / BATTLE_CELLS_PER_UNIT }];
    const state = { status: 'hunting', areaId: 'test_area', lastSimulatedAt: 0,
      fieldHero: { areaId: 'test_area', from: BATTLE_HERO, position: route.at(-1)!, startedAt: 0, arrivedAt: 1000,
        routeIndex: 0, movementRoute: route } } as unknown as GameState;
    const enemy = { id: 'enemy', monsterId: 1002, hp: 1, maxHp: 1, startedAt: 0, arrivedAt: 1000,
      enemyNextAttackAt: 0, spawnDirection: 0, approachFrom: BATTLE_HERO, position: route.at(-1)!, movementRoute: route } as BattleEnemy;
    expect(battleHeroAt(state, 0)).toEqual(route[0]);
    expect(battleHeroAt(state, 1000)).toEqual(route.at(-1));
    expect(enemyPositionAt(enemy, 0)).toEqual(route[0]);
    expect(enemyPositionAt(enemy, 1000)).toEqual(route.at(-1));
    expect(battleHeroAt(state, 500)).toEqual(enemyPositionAt(enemy, 500));
    expect(battleHeroAt(state, 500)).not.toEqual({ x: (route[0].x + route.at(-1)!.x) / 2,
      y: (route[0].y + route.at(-1)!.y) / 2 });
  });

  it('ends the active route at its effective midpoint when an own cast freezes the hero', () => {
    const state = createInitialState(catalog, 0);
    state.job = 'sage'; state.baseLevel = 50; state.jobLevel = 50; state.stats.dex = 30; state.sp = 300;
    state.status = 'hunting'; state.areaId = 'prontera_south';
    state.learnedSkills = { flame_enchant: 5 };
    addItem(state, catalog, 990, 1);
    const skill = catalog.skills.flame_enchant!;
    const route = [BATTLE_HERO, { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y },
      { x: BATTLE_HERO.x + 2 / 12, y: BATTLE_HERO.y + 1 / 12 }];
    state.fieldHero = { areaId: state.areaId!, from: route[0], position: route.at(-1)!, startedAt: 0, arrivedAt: 1000,
      routeIndex: 0, movementRoute: route };
    const expected = battleHeroAt(state, 500);

    expect(startSageEnchantCast(state, catalog, skill, 5, 500)).toBe(true);

    expect(state.fieldHero.movementRoute).toBeUndefined();
    expect(battleHeroAt(state, 750)).toEqual(expected);
  });

  it('rejects production field simulation without navigation before changing the save', () => {
    const state = createInitialState(catalog, 1000);
    state.status = 'hunting';
    state.areaId = 'prontera_south';
    const before = JSON.stringify(state);
    expect(() => advanceState(state, catalog, 1000, { navigation: undefined })).toThrow(/navigation/i);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects a production hunt start when navigation is missing before changing town state', () => {
    const state = createInitialState(catalog, 1000);
    const before = JSON.stringify(state);
    expect(() => applyCommand(state, catalog, { type: 'startHunt', areaId: 'prontera_south' }, 1000,
      { navigation: undefined })).toThrow(/navigation/i);
    expect(JSON.stringify(state)).toBe(before);
  });
});
