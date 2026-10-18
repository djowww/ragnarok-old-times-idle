import {
  connectedCells,
  findGridRoute,
  gridDisplacement,
  gridRouteLength,
  gridWalkable,
  gridWater,
  nextRouteSearchGeneration,
  nearestConnectedCell,
  type FieldNavigationGrid,
  type GridPoint,
} from '../shared/fieldNavigation.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO, type BattlePoint } from '../shared/battleSpatial.js';
import { battleDistance, playerBattleDistance } from '../shared/battleSpatial.js';

export interface FieldNavigationAreaSpec {
  areaId: string;
  map: string;
  origin: { x: number; y: number };
  /** Four integer offsets from the origin cell, in source GAT cells. */
  homeOffsets: readonly GridPoint[];
  originRemapped?: boolean;
  remappedHomeSlots?: readonly number[];
}

export interface FieldNavigationRoute {
  points: BattlePoint[];
  distanceCells: number;
}
export interface FieldApproachRoute { route: FieldNavigationRoute; withinRange: boolean }

export function canSearchExactSquareRangeZeroGoal(targetCellWalkable: boolean, target: BattlePoint,
  targetCellCenter: BattlePoint): boolean {
  return targetCellWalkable && battleDistance(targetCellCenter, target) === 0;
}

export interface FieldNavigationAreaRuntime extends FieldNavigationAreaSpec {
  homes: readonly GridPoint[];
  readonly grid: FieldNavigationGrid;
  readonly originPoint: GridPoint;
  readonly component: Uint8Array;
}

export class FieldNavigationError extends Error {
  readonly code = 'FIELD_NAVIGATION_UNAVAILABLE';
  constructor(message: string) { super(message); this.name = 'FieldNavigationError'; }
}

interface GoalRouteHeap {
  ids: Int32Array; distances: Float64Array; priorities: Float64Array; length: number;
  poppedId: number; poppedDistance: number; poppedPriority: number;
}
interface GoalRouteScratch {
  costs: Float64Array; previous: Int32Array; seenAt: Uint32Array; settledAt: Uint32Array;
  generation: number; open: GoalRouteHeap;
}
let sharedGoalRouteScratch: GoalRouteScratch | undefined;
const GOAL_ROUTE_OFFSETS = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
interface LandmarkDistanceCache {
  grid: FieldNavigationGrid;
  component: Uint8Array;
  originId: number;
  landmarkIds: number[];
  distances: Float64Array[];
  maxDistances: number[];
}
const LANDMARK_COUNT = 4;
const LANDMARK_CACHE_GRIDS = 2;
let landmarkDistanceCache: LandmarkDistanceCache[] = [];

function goalRouteScratch(count: number): GoalRouteScratch {
  let scratch = sharedGoalRouteScratch;
  if (!scratch || scratch.costs.length < count) {
    scratch = { costs: new Float64Array(count), previous: new Int32Array(count),
      seenAt: new Uint32Array(count), settledAt: new Uint32Array(count), generation: 0,
      open: { ids: new Int32Array(64), distances: new Float64Array(64), priorities: new Float64Array(64),
        length: 0, poppedId: -1, poppedDistance: 0, poppedPriority: 0 } };
    sharedGoalRouteScratch = scratch;
  }
  scratch.generation = nextRouteSearchGeneration(scratch.generation, scratch.seenAt, scratch.settledAt);
  scratch.open.length = 0;
  return scratch;
}

function priorityLess(aPriority: number, aDistance: number, aId: number,
  bPriority: number, bDistance: number, bId: number): boolean {
  return aPriority < bPriority || aPriority === bPriority &&
    (aDistance < bDistance || aDistance === bDistance && aId < bId);
}
function heapValueLess(priority: number, distance: number, id: number, heap: GoalRouteHeap, index: number): boolean {
  return priorityLess(priority, distance, id, heap.priorities[index], heap.distances[index], heap.ids[index]);
}
function queuePush(heap: GoalRouteHeap, id: number, distance: number, priority: number): void {
  if (heap.length === heap.ids.length) {
    const capacity = Math.max(64, heap.length * 2);
    const ids = new Int32Array(capacity), distances = new Float64Array(capacity), priorities = new Float64Array(capacity);
    ids.set(heap.ids); distances.set(heap.distances); priorities.set(heap.priorities);
    heap.ids = ids; heap.distances = distances; heap.priorities = priorities;
  }
  let i = heap.length++;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!heapValueLess(priority, distance, id, heap, parent)) break;
    heap.ids[i] = heap.ids[parent]; heap.distances[i] = heap.distances[parent];
    heap.priorities[i] = heap.priorities[parent]; i = parent;
  }
  heap.ids[i] = id; heap.distances[i] = distance; heap.priorities[i] = priority;
}
function queuePop(heap: GoalRouteHeap): void {
  const length = --heap.length;
  heap.poppedId = heap.ids[0]; heap.poppedDistance = heap.distances[0]; heap.poppedPriority = heap.priorities[0];
  if (length > 0) {
    const lastId = heap.ids[length], lastDistance = heap.distances[length], lastPriority = heap.priorities[length];
    let i = 0;
    while (true) {
      const left = i * 2 + 1, right = left + 1;
      if (left >= length) break;
      const child = right < length && heapValueLess(heap.priorities[right], heap.distances[right], heap.ids[right], heap, left)
        ? right : left;
      if (!priorityLess(heap.priorities[child], heap.distances[child], heap.ids[child],
        lastPriority, lastDistance, lastId)) break;
      heap.ids[i] = heap.ids[child]; heap.distances[i] = heap.distances[child];
      heap.priorities[i] = heap.priorities[child]; i = child;
    }
    heap.ids[i] = lastId; heap.distances[i] = lastDistance; heap.priorities[i] = lastPriority;
  }
}

function createRouteGoalOctileHeuristic(target: GridPoint, range: number,
  metric: 'player' | 'square'): (point: GridPoint) => number {
  const radius = range + (metric === 'player' ? 1.0625 : 0) + 1e-7;
  const left = target.x - radius, right = target.x + radius;
  const top = target.y - radius, bottom = target.y + radius;
  return point => {
    const dx = Math.max(left - point.x, 0, point.x - right);
    const dy = Math.max(top - point.y, 0, point.y - bottom);
    const lowerBound = Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    return Math.max(0, lowerBound - 1e-10);
  };
}

export function routeGoalOctileHeuristic(point: GridPoint, target: GridPoint, range: number,
  metric: 'player' | 'square'): number {
  return createRouteGoalOctileHeuristic(target, range, metric)(point);
}

export function landmarkGoalLowerBound(nodeDistance: number, minGoalDistance: number, maxGoalDistance: number): number {
  if (!Number.isFinite(nodeDistance) || !Number.isFinite(minGoalDistance) || !Number.isFinite(maxGoalDistance) ||
      minGoalDistance < 0 || maxGoalDistance < minGoalDistance) return 0;
  const raw = nodeDistance < minGoalDistance ? minGoalDistance - nodeDistance
    : nodeDistance > maxGoalDistance ? nodeDistance - maxGoalDistance : 0;
  const slack = Number.EPSILON * 32 * Math.max(1, Math.abs(nodeDistance), Math.abs(minGoalDistance), Math.abs(maxGoalDistance));
  return Math.max(0, raw - slack);
}

function landmarkFields(area: FieldNavigationAreaRuntime): LandmarkDistanceCache {
  const { grid, component } = area;
  const originId = Math.floor(area.originPoint.y) * grid.width + Math.floor(area.originPoint.x);
  const cacheIndex = landmarkDistanceCache.findIndex(entry => entry.grid === grid && entry.component === component &&
    entry.originId === originId);
  if (cacheIndex >= 0) {
    const [cached] = landmarkDistanceCache.splice(cacheIndex, 1);
    landmarkDistanceCache.unshift(cached);
    return cached;
  }

  const count = grid.width * grid.height;
  const componentIds: number[] = [];
  for (let id = 0; id < count; id++) if (componentHas(component, id)) componentIds.push(id);
  const landmarkIds: number[] = [originId];
  const distances: Float64Array[] = [];
  const maxDistances: number[] = [];
  const runField = (source: number): { field: Float64Array; maxDistance: number } => {
    const scratch = goalRouteScratch(count), { costs, seenAt, settledAt, open } = scratch;
    const generation = scratch.generation;
    seenAt[source] = generation; costs[source] = 0;
    queuePush(open, source, 0, 0);
    const point = { x: 0, y: 0 };
    while (open.length) {
      queuePop(open);
      const currentId = open.poppedId, currentDistance = open.poppedDistance;
      if (settledAt[currentId] === generation || seenAt[currentId] !== generation || currentDistance !== costs[currentId]) continue;
      settledAt[currentId] = generation;
      const x = currentId % grid.width, y = Math.floor(currentId / grid.width);
      for (const [dx, dy] of GOAL_ROUTE_OFFSETS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
        const next = ny * grid.width + nx;
        if (!componentHas(component, next)) continue;
        point.x = nx + 0.5; point.y = ny + 0.5;
        if (!gridWalkable(grid, point)) continue;
        if (dx && dy) {
          point.x = nx + 0.5; point.y = y + 0.5;
          if (!gridWalkable(grid, point)) continue;
          point.x = x + 0.5; point.y = ny + 0.5;
          if (!gridWalkable(grid, point)) continue;
        }
        const candidate = currentDistance + (dx && dy ? Math.SQRT2 : 1);
        if (seenAt[next] === generation && candidate >= costs[next]) continue;
        seenAt[next] = generation; costs[next] = candidate;
        if (settledAt[next] === generation) settledAt[next] = 0;
        queuePush(open, next, candidate, candidate);
      }
    }
    const field = new Float64Array(count);
    field.fill(Number.POSITIVE_INFINITY);
    let maxDistance = 0;
    for (const id of componentIds) if (seenAt[id] === generation) {
      field[id] = costs[id];
      maxDistance = Math.max(maxDistance, costs[id]);
    }
    open.length = 0;
    return { field, maxDistance };
  };

  for (let index = 0; index < LANDMARK_COUNT; index++) {
    const source = landmarkIds[index];
    const { field, maxDistance } = runField(source);
    distances.push(field);
    maxDistances.push(maxDistance);
    if (index + 1 < LANDMARK_COUNT) {
      let farthestId = -1, farthestDistance = -1;
      for (const id of componentIds) {
        if (landmarkIds.includes(id)) continue;
        const distance = field[id];
        if (Number.isFinite(distance) && (distance > farthestDistance || distance === farthestDistance && id < farthestId)) {
          farthestId = id; farthestDistance = distance;
        }
      }
      if (farthestId < 0) break;
      landmarkIds.push(farthestId);
    }
  }
  const built = { grid, component, originId, landmarkIds, distances, maxDistances };
  landmarkDistanceCache.unshift(built);
  if (landmarkDistanceCache.length > LANDMARK_CACHE_GRIDS) landmarkDistanceCache.length = LANDMARK_CACHE_GRIDS;
  return built;
}

function landmarkRangeHeuristic(area: FieldNavigationAreaRuntime, target: GridPoint, range: number,
  metric: 'player' | 'square', geometricHeuristic: (point: GridPoint) => number,
  inRange: (point: GridPoint) => boolean, fields: LandmarkDistanceCache):
  { heuristic: (point: GridPoint) => number; goalIds?: ReadonlySet<number> } {
  const radius = range + (metric === 'player' ? 1.0625 : 0) + 1e-7;
  const minX = Math.max(0, Math.ceil(target.x - radius - 0.5));
  const maxX = Math.min(area.grid.width - 1, Math.floor(target.x + radius - 0.5));
  const minY = Math.max(0, Math.ceil(target.y - radius - 0.5));
  const maxY = Math.min(area.grid.height - 1, Math.floor(target.y + radius - 0.5));
  const count = (maxX - minX + 1) * (maxY - minY + 1);
  if (count <= 0 || count > 1024)
    return { heuristic: geometricHeuristic };
  const goals: number[] = [];
  const point = { x: 0, y: 0 };
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const id = y * area.grid.width + x;
    if (!componentHas(area.component, id)) continue;
    point.x = x + 0.5; point.y = y + 0.5;
    if (gridWalkable(area.grid, point) && inRange(point)) goals.push(id);
  }
  const goalIds = new Set(goals);
  if (!goals.length) return { heuristic: geometricHeuristic, goalIds };
  const intervals: Array<{ min: number; max: number; slack: number; field: Float64Array }> = [];
  for (let index = 0; index < fields.distances.length; index++) {
    const field = fields.distances[index];
    let minGoalDistance = Number.POSITIVE_INFINITY, maxGoalDistance = Number.NEGATIVE_INFINITY;
    for (const goal of goals) {
      const distance = field[goal];
      if (!Number.isFinite(distance))
        return { heuristic: geometricHeuristic, goalIds };
      minGoalDistance = Math.min(minGoalDistance, distance);
      maxGoalDistance = Math.max(maxGoalDistance, distance);
    }
    const slack = Number.EPSILON * 32 * Math.max(1, fields.maxDistances[index], Math.abs(minGoalDistance), Math.abs(maxGoalDistance));
    intervals.push({ min: minGoalDistance, max: maxGoalDistance, slack, field });
  }
  const heuristic = (point: GridPoint) => {
    let lowerBound = geometricHeuristic(point);
    const id = Math.floor(point.y) * area.grid.width + Math.floor(point.x);
    for (const interval of intervals) {
      const distance = interval.field[id];
      if (!Number.isFinite(distance)) continue;
      const raw = distance < interval.min ? interval.min - distance
        : distance > interval.max ? distance - interval.max : 0;
      lowerBound = Math.max(lowerBound, Math.max(0, raw - interval.slack));
    }
    return lowerBound;
  };
  return { heuristic, goalIds };
}

function routeToGoalCell(area: FieldNavigationAreaRuntime, from: GridPoint,
  goal: (point: GridPoint) => boolean,
  heuristic: (point: GridPoint) => number, goalIds?: ReadonlySet<number>, blockedCells?: ReadonlySet<string>): { points: GridPoint[]; distance: number } | null {
  const { grid } = area;
  if (!gridWalkable(grid, from)) return null;
  const start = Math.floor(from.y) * grid.width + Math.floor(from.x);
  const isBlocked = (id: number) => blockedCells?.has(`${id % grid.width},${Math.floor(id / grid.width)}`) ?? false;
  if (isBlocked(start)) return null;
  const scratch = goalRouteScratch(grid.width * grid.height), { costs, previous, seenAt, settledAt, open } = scratch;
  const generation = scratch.generation;
  const startCenter = { x: start % grid.width + 0.5, y: Math.floor(start / grid.width) + 0.5 };
  seenAt[start] = generation; costs[start] = Math.hypot(from.x - startCenter.x, from.y - startCenter.y);
  queuePush(open, start, costs[start], costs[start] + heuristic(startCenter));
  const walkPoint = { x: 0, y: 0 };
  const center = { x: 0, y: 0 };
  let found = -1;
  let foundDistance = Number.POSITIVE_INFINITY;
  while (open.length) {
    queuePop(open);
    const currentId = open.poppedId, currentDistance = open.poppedDistance;
    if (settledAt[currentId] === generation || seenAt[currentId] !== generation || currentDistance !== costs[currentId]) continue;
    if (open.poppedPriority > foundDistance) break;
    settledAt[currentId] = generation;
    const isGoal = goalIds ? goalIds.has(currentId) : (
      (center.x = currentId % grid.width + 0.5, center.y = Math.floor(currentId / grid.width) + 0.5, goal(center)));
    if (isGoal) {
      if (currentDistance < foundDistance || currentDistance === foundDistance && (found < 0 || currentId < found)) {
        found = currentId;
        foundDistance = currentDistance;
      }
      continue;
    }
    const x = currentId % grid.width, y = Math.floor(currentId / grid.width);
    for (const [dx, dy] of GOAL_ROUTE_OFFSETS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
      const next = ny * grid.width + nx;
      walkPoint.x = nx + 0.5; walkPoint.y = ny + 0.5;
      if (isBlocked(next) || !gridWalkable(grid, walkPoint)) continue;
      if (dx && dy) {
        walkPoint.x = nx + 0.5; walkPoint.y = y + 0.5;
        if (!gridWalkable(grid, walkPoint)) continue;
        walkPoint.x = x + 0.5; walkPoint.y = ny + 0.5;
        if (!gridWalkable(grid, walkPoint)) continue;
      }
      const candidate = currentDistance + (dx && dy ? Math.SQRT2 : 1);
      if (seenAt[next] === generation && candidate > costs[next]) continue;
      if (seenAt[next] === generation && candidate === costs[next]) {
        const oldParent = previous[next], oldParentDistance = oldParent >= 0 ? costs[oldParent] : Number.POSITIVE_INFINITY;
        if (currentDistance < oldParentDistance || currentDistance === oldParentDistance && currentId < oldParent) {
          previous[next] = currentId;
        }
        continue;
      }
      seenAt[next] = generation; costs[next] = candidate; previous[next] = currentId;
      if (settledAt[next] === generation) settledAt[next] = 0;
      walkPoint.x = nx + 0.5; walkPoint.y = ny + 0.5;
      queuePush(open, next, candidate, candidate + heuristic(walkPoint));
    }
  }
  if (found < 0) return null;
  const ids: number[] = [];
  for (let id = found; id >= 0 && seenAt[id] === generation; id = previous[id]) { ids.push(id); if (id === start) break; }
  if (ids.at(-1) !== start) return null;
  ids.reverse();
  const points: GridPoint[] = [{ ...from }];
  const append = (point: GridPoint) => {
    const last = points.at(-1)!;
    if (last.x !== point.x || last.y !== point.y) points.push(point);
  };
  if (from.x !== startCenter.x || from.y !== startCenter.y) append(startCenter);
  for (const id of ids.slice(1)) append({ x: id % grid.width + 0.5, y: Math.floor(id / grid.width) + 0.5 });
  open.length = 0;
  return { points, distance: costs[found] };
}

export interface FieldNavigationRuntime {
  readonly areaIds: readonly string[];
  readonly cacheFallbackMaps: readonly string[];
  readonly remappedOrigins: readonly string[];
  readonly remappedHomes: Readonly<Record<string, readonly number[]>>;
  readonly publicAreas: Readonly<Record<string, { map: string; origin: { x: number; y: number }; homeOffsets: readonly GridPoint[] }>>;
  area(areaId: string): FieldNavigationAreaRuntime;
  scene(map: string): { grid: FieldNavigationGrid; origin: GridPoint };
  toGridPoint(areaId: string, point: BattlePoint): GridPoint;
  toBattlePoint(areaId: string, point: GridPoint): BattlePoint;
  isWalkableBattlePoint(areaId: string, point: BattlePoint): boolean;
  isWaterBattlePoint(areaId: string, point: BattlePoint): boolean;
  resolveActorPoint(areaId: string, point: BattlePoint, repairBlocked: boolean): BattlePoint | null;
  home(areaId: string, slot: number): BattlePoint;
  route(areaId: string, from: BattlePoint, to: BattlePoint): FieldNavigationRoute | null;
  routeToRange(areaId: string, from: BattlePoint, target: BattlePoint, range: number,
    metric: 'player' | 'square', blockedCells?: ReadonlySet<string>): FieldApproachRoute | null;
  displace(areaId: string, from: BattlePoint, dxCells: number, dyCells: number): BattlePoint;
}

/** Production passes this explicitly; omitted context is reserved for legacy unit fixtures. */
export interface SimulationContext { navigation: FieldNavigationRuntime | undefined }

export function assertSimulationNavigation(state: { status: string; areaId: string | null }, context?: SimulationContext): void {
  if (context && !context.navigation && state.areaId && state.status !== 'town' && state.status !== 'challenge')
    throw new FieldNavigationError('Field simulation is unavailable because navigation has not loaded');
  if (context?.navigation && state.areaId && state.status !== 'town' && state.status !== 'challenge')
    context.navigation.area(state.areaId);
}

const validMap = /^[a-z][a-z0-9_]*$/;
const validArea = /^[a-z][a-z0-9_]*$/;

function validIntegerPoint(point: GridPoint): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y);
}

/** Build the immutable runtime consumed by simulation; grids never enter save state. */
export function createFieldNavigationRuntime(
  specs: readonly FieldNavigationAreaSpec[],
  grids: ReadonlyMap<string, FieldNavigationGrid>,
  cacheFallbackMaps: readonly string[] = [],
): FieldNavigationRuntime {
  if (!specs.length) throw new FieldNavigationError('Field navigation has no areas');
  const byArea = new Map<string, FieldNavigationAreaRuntime>();
  const nearestCells = new Map<string, GridPoint | null>();
  const publicAreas: Record<string, { map: string; origin: { x: number; y: number }; homeOffsets: readonly GridPoint[] }> = {};
  const remappedOrigins: string[] = [], remappedHomes: Record<string, readonly number[]> = {};
  for (const spec of specs) {
    if (!validArea.test(spec.areaId) || !validMap.test(spec.map) || byArea.has(spec.areaId) ||
        !validIntegerPoint(spec.origin) || !Array.isArray(spec.homeOffsets) || spec.homeOffsets.length !== 4 ||
        spec.homeOffsets.some(offset => !validIntegerPoint(offset)))
      throw new FieldNavigationError(`Invalid field navigation spec for ${spec.areaId}`);
    const grid = grids.get(spec.map);
    if (!grid || grid.map !== spec.map) throw new FieldNavigationError(`Missing navigation grid for ${spec.map}`);
    const originPoint = { x: spec.origin.x + 0.5, y: spec.origin.y + 0.5 };
    if (!gridWalkable(grid, originPoint)) throw new FieldNavigationError(`Blocked navigation origin for ${spec.areaId}`);
    const component = connectedCells(grid, originPoint);
    const homes = spec.homeOffsets.map(offset => ({ x: originPoint.x + offset.x, y: originPoint.y + offset.y }));
    const homeIds = new Set<number>();
    for (const [slot, home] of homes.entries()) {
      const id = Math.floor(home.y) * grid.width + Math.floor(home.x);
      const route = findGridRoute(grid, originPoint, home);
      if (!gridWalkable(grid, home) || !route || !componentHas(component, id) || homeIds.has(id) ||
          gridRouteLength(route) > 24 + Number.EPSILON)
        throw new FieldNavigationError(`Invalid or unreachable home ${spec.areaId}/${slot}`);
      homeIds.add(id);
    }
    const area: FieldNavigationAreaRuntime = { ...spec, homes, grid, originPoint, component };
    byArea.set(spec.areaId, area);
    publicAreas[spec.areaId] = { map: spec.map, origin: { ...spec.origin }, homeOffsets: spec.homeOffsets.map(offset => ({ ...offset })) };
    if (spec.originRemapped) remappedOrigins.push(spec.map);
    if (spec.remappedHomeSlots?.length) remappedHomes[spec.areaId] = [...spec.remappedHomeSlots];
  }
  for (const map of grids.keys()) if (map !== 'prontera' && !specs.some(spec => spec.map === map))
    throw new FieldNavigationError(`Navigation grid has no area spec: ${map}`);

  const area = (areaId: string) => {
    const value = byArea.get(areaId);
    if (!value) throw new FieldNavigationError(`Missing navigation spec for area ${areaId}`);
    return value;
  };
  const nearest = (selected: FieldNavigationAreaRuntime, point: GridPoint): GridPoint | null => {
    const x = Math.floor(point.x), y = Math.floor(point.y), key = `${selected.areaId}:${x},${y}`;
    if (nearestCells.has(key)) return nearestCells.get(key) ?? null;
    const result = nearestConnectedCell(selected.grid, point, selected.component);
    // Targets move between a small number of cells; bound this runtime cache.
    if (nearestCells.size >= 512) nearestCells.delete(nearestCells.keys().next().value!);
    nearestCells.set(key, result ? { ...result } : null);
    return result;
  };
  return Object.freeze({
    areaIds: Object.freeze([...byArea.keys()]),
    cacheFallbackMaps: Object.freeze([...cacheFallbackMaps]),
    remappedOrigins: Object.freeze(remappedOrigins),
    remappedHomes: Object.freeze(remappedHomes),
    publicAreas: Object.freeze(publicAreas),
    area,
    scene(map: string) {
      const grid = grids.get(map);
      if (!grid) throw new FieldNavigationError(`Missing scene terrain for ${map}`);
      return { grid, origin: { x: grid.width >> 1, y: grid.height >> 1 } };
    },
    toGridPoint(areaId: string, point: BattlePoint): GridPoint {
      const selected = area(areaId);
      return { x: selected.originPoint.x + (point.x - BATTLE_HERO.x) * BATTLE_CELLS_PER_UNIT,
        y: selected.originPoint.y + (point.y - BATTLE_HERO.y) * BATTLE_CELLS_PER_UNIT };
    },
    toBattlePoint(areaId: string, point: GridPoint): BattlePoint {
      const selected = area(areaId);
      return { x: BATTLE_HERO.x + (point.x - selected.originPoint.x) / BATTLE_CELLS_PER_UNIT,
        y: BATTLE_HERO.y + (point.y - selected.originPoint.y) / BATTLE_CELLS_PER_UNIT };
    },
    isWalkableBattlePoint(areaId: string, point: BattlePoint): boolean {
      return gridWalkable(area(areaId).grid, this.toGridPoint(areaId, point));
    },
    isWaterBattlePoint(areaId: string, point: BattlePoint): boolean {
      return gridWater(area(areaId).grid, this.toGridPoint(areaId, point));
    },
    resolveActorPoint(areaId: string, point: BattlePoint, repairBlocked: boolean): BattlePoint | null {
      const selected = area(areaId), gridPoint = this.toGridPoint(areaId, point);
      if (gridWalkable(selected.grid, gridPoint)) {
        const id = Math.floor(gridPoint.y) * selected.grid.width + Math.floor(gridPoint.x);
        if (componentHas(selected.component, id)) return { ...point };
        if (!repairBlocked) return null;
      }
      if (!repairBlocked) return null;
      const replacement = nearest(selected, gridPoint);
      return replacement ? this.toBattlePoint(areaId, replacement) : null;
    },
    home(areaId: string, slot: number): BattlePoint {
      const selected = area(areaId), index = ((Math.trunc(slot) % selected.homes.length) + selected.homes.length) % selected.homes.length;
      return this.toBattlePoint(areaId, selected.homes[index]);
    },
    route(areaId: string, from: BattlePoint, to: BattlePoint, blockedCells?: ReadonlySet<string>): FieldNavigationRoute | null {
      const selected = area(areaId), gridFrom = this.toGridPoint(areaId, from), gridTo = this.toGridPoint(areaId, to);
      const points = findGridRoute(selected.grid, gridFrom, gridTo, 0, blockedCells);
      return points ? { points: points.map(point => this.toBattlePoint(areaId, point)), distanceCells: gridRouteLength(points) } : null;
    },
    routeToRange(areaId: string, from: BattlePoint, target: BattlePoint, range: number,
      metric: 'player' | 'square', blockedCells?: ReadonlySet<string>): FieldApproachRoute | null {
      if (!Number.isFinite(range) || range < 0) return null;
      const selected = area(areaId), gridFrom = this.toGridPoint(areaId, from), gridTarget = this.toGridPoint(areaId, target);
      const inRange = (point: GridPoint) => {
        const battlePoint = this.toBattlePoint(areaId, point);
        return metric === 'player' ? playerBattleDistance(battlePoint, target) <= range
          : battleDistance(battlePoint, target) <= range;
      };
      const exactSquareGoalCanMatch = metric !== 'square' || range !== 0
        || canSearchExactSquareRangeZeroGoal(gridWalkable(selected.grid, gridTarget), target,
          this.toBattlePoint(areaId, { x: Math.floor(gridTarget.x) + 0.5, y: Math.floor(gridTarget.y) + 0.5 }));
      const startId = Math.floor(gridFrom.y) * selected.grid.width + Math.floor(gridFrom.x);
      const canUseLandmarks = !blockedCells?.size && exactSquareGoalCanMatch && componentHas(selected.component, startId) &&
        gridWalkable(selected.grid, gridFrom);
      const geometricHeuristic = createRouteGoalOctileHeuristic(gridTarget, range, metric);
      // Landmark preprocessing uses the route workspace, so finish it before the goal search starts.
      const fields = canUseLandmarks ? landmarkFields(selected) : undefined;
      const prepared = fields ? landmarkRangeHeuristic(selected, gridTarget, range, metric, geometricHeuristic, inRange, fields) : undefined;
      const heuristic = prepared?.heuristic ?? geometricHeuristic;
      const approach = exactSquareGoalCanMatch ? routeToGoalCell(selected, gridFrom, inRange, heuristic, prepared?.goalIds, blockedCells) : null;
      if (approach) return { route: { points: approach.points.map(point => this.toBattlePoint(areaId, point)),
        distanceCells: approach.distance }, withinRange: true };
      const closest = nearest(selected, gridTarget);
      if (!closest) return null;
      const route = this.route(areaId, from, this.toBattlePoint(areaId, closest), blockedCells);
      return route ? { route, withinRange: false } : null;
    },
    displace(areaId: string, from: BattlePoint, dxCells: number, dyCells: number): BattlePoint {
      const selected = area(areaId), gridFrom = this.toGridPoint(areaId, from);
      const resolved = gridDisplacement(selected.grid, gridFrom, dxCells, dyCells);
      return this.toBattlePoint(areaId, resolved);
    },
  });
}

function componentHas(component: Uint8Array, id: number): boolean {
  return id >= 0 && (component[id >> 3] & (1 << (id & 7))) !== 0;
}
