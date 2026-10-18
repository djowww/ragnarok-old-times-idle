import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../../shared/battleSpatial.js';
import { gridRouteLength, type GridPoint } from '../../shared/fieldNavigation.js';

/** Camera and terrain data from the pinned roBrowser map renderer. */
export interface MapProjection {
  map: string;
  modelView: number[];
  projection: number[];
  focus: [number, number, number];
  /** Stable map origin while the native camera follows a field actor. */
  sceneFocus?: [number, number, number];
  viewport: { width: number; height: number };
  direction?: number;
  ground?: { x: number; y: number; size: number; heights: number[]; walkable?: number[] };
}

export type WorldPoint = [number, number, number];
export type FieldMapOrigin = { x: number; y: number };
const finiteArray = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));

export function readMapProjection(data: Record<string, unknown>): MapProjection | null {
  const viewport = data.viewport as MapProjection["viewport"] | undefined;
  if (typeof data.map !== "string" || !finiteArray(data.modelView, 16) || !finiteArray(data.projection, 16) ||
    !finiteArray(data.focus, 3) || !viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
    viewport.width <= 0 || viewport.height <= 0) return null;
  const ground = data.ground as MapProjection["ground"];
  const validGround = ground && Number.isInteger(ground.size) && ground.size > 1 && ground.size <= 65 &&
    Number.isFinite(ground.x) && Number.isFinite(ground.y) && finiteArray(ground.heights, ground.size * ground.size);
  const validWalkable = validGround && Array.isArray(ground.walkable) && ground.walkable.length === ground.size * ground.size &&
    ground.walkable.every(cell => cell === 0 || cell === 1);
  return {
    map: data.map, modelView: data.modelView, projection: data.projection,
    focus: data.focus as WorldPoint, viewport,
    ...(finiteArray(data.sceneFocus, 3) ? { sceneFocus: data.sceneFocus as WorldPoint } : {}),
    ...(Number.isInteger(data.direction) && Number(data.direction) >= 0 && Number(data.direction) <= 7 ? { direction: Number(data.direction) } : {}),
    ...(validGround ? { ground: { x: ground.x, y: ground.y, size: ground.size, heights: ground.heights,
      ...(validWalkable ? { walkable: ground.walkable } : {}) } } : {}),
  };
}

function transform(matrix: number[], value: number[]): number[] {
  return [0, 1, 2, 3].map((row) =>
    matrix[row] * value[0] + matrix[4 + row] * value[1] + matrix[8 + row] * value[2] + matrix[12 + row] * value[3],
  );
}

/** GAT heights use the opposite vertical sign from mesh world coordinates. */
export function mapGroundHeight(camera: MapProjection, x: number, y: number): number {
  const ground = camera.ground;
  if (!ground) return camera.focus[1];
  const localX = x - ground.x;
  const localY = y - ground.y;
  if (localX < 0 || localY < 0 || localX >= ground.size - 1 || localY >= ground.size - 1) return camera.focus[1];
  const cellX = Math.floor(localX);
  const cellY = Math.floor(localY);
  const fractionX = localX - cellX;
  const fractionY = localY - cellY;
  const row = cellY * ground.size + cellX;
  const top = ground.heights[row] * (1 - fractionX) + ground.heights[row + 1] * fractionX;
  const bottom = ground.heights[row + ground.size] * (1 - fractionX) + ground.heights[row + ground.size + 1] * fractionX;
  return top * (1 - fractionY) + bottom * fractionY;
}

/** Source GAT walkable mask. Missing or outside sampled terrain is not a safe route. */
export function mapGroundWalkable(camera: MapProjection, x: number, y: number): boolean {
  const ground = camera.ground;
  if (!ground?.walkable) return false;
  const column = Math.floor(x) - ground.x;
  const row = Math.floor(y) - ground.y;
  return column >= 0 && row >= 0 && column < ground.size && row < ground.size &&
    ground.walkable[row * ground.size + column] === 1;
}

export function mapCellPoint(camera: MapProjection, x: number, y: number): WorldPoint {
  return [x + 0.5, mapGroundHeight(camera, x, y), y + 0.5];
}

/** Convert an authoritative battle coordinate to its native GAT world position. */
export function projectBattlePoint(camera: MapProjection, point: { x: number; y: number }, origin: FieldMapOrigin): WorldPoint {
  const x = origin.x + 0.5 + (point.x - BATTLE_HERO.x) * BATTLE_CELLS_PER_UNIT;
  const y = origin.y + 0.5 + (point.y - BATTLE_HERO.y) * BATTLE_CELLS_PER_UNIT;
  return [x, mapGroundHeight(camera, x - 0.5, y - 0.5), y];
}

/** Nearest progress on the authoritative source route; used to resume from a rendered point without cutting across bends. */
export function nearestGridRouteProgress(route: readonly GridPoint[], point: GridPoint): { progress: number; distance: number } {
  if (!route.length || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return { progress: 0, distance: Infinity };
  if (route.length === 1) return { progress: 0, distance: Math.hypot(point.x - route[0].x, point.y - route[0].y) };
  const total = gridRouteLength(route);
  if (total <= 0) return { progress: 0, distance: Math.hypot(point.x - route[0].x, point.y - route[0].y) };
  let traversed = 0, bestDistance = Infinity, bestProgress = 0;
  for (let index = 1; index < route.length; index++) {
    const a = route[index - 1], b = route[index], dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy, length = Math.sqrt(lengthSquared);
    if (lengthSquared > 0) {
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
      const distance = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
      if (distance < bestDistance) { bestDistance = distance; bestProgress = (traversed + length * t) / total; }
    }
    traversed += length;
  }
  return { progress: bestProgress, distance: bestDistance };
}

/** Cap visual route catch-up at the source route's own progress rate. */
export function advanceGridRouteProgress(progress: number, authoritative: number, elapsedMs: number, sourceDurationMs: number): number {
  const from = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const target = Math.max(from, Math.max(0, Math.min(1, Number.isFinite(authoritative) ? authoritative : from)));
  const advance = Math.max(0, elapsedMs) / Math.max(1, sourceDurationMs);
  return Math.min(target, from + advance);
}

/** Return the next shared route waypoint for tangent facing, with terrain height sampled by the viewer. */
export function battleRouteTangent(camera: MapProjection, route: readonly GridPoint[], fraction: number, origin: FieldMapOrigin): WorldPoint {
  if (!route.length) return camera.focus as WorldPoint;
  const length = gridRouteLength(route) * BATTLE_CELLS_PER_UNIT;
  let distance = Math.max(0, Math.min(1, fraction)) * length;
  for (let index = 1; index < route.length; index++) {
    const previous = route[index - 1], next = route[index];
    const segment = Math.hypot(next.x - previous.x, next.y - previous.y) * BATTLE_CELLS_PER_UNIT;
    if (segment > 0 && distance < segment) return projectBattlePoint(camera, next, origin);
    distance -= segment;
  }
  return projectBattlePoint(camera, route.at(-1)!, origin);
}

/** Engine formation coordinates become local map cell offsets around the focus. */
export function sceneGroundPoint(camera: MapProjection, point: { x: number; y: number }, anchor: { x: number; y: number }): WorldPoint {
  const origin = camera.sceneFocus ?? camera.focus;
  const x = origin[0] - 0.5 + (point.x - anchor.x) * 22;
  const y = origin[2] - 0.5 + (point.y - anchor.y) * 18;
  return mapCellPoint(camera, x, y);
}

/** Place formation actors on a nearby native GAT cell, including narrow maps. */
export function walkableSceneGroundPoint(camera: MapProjection, point: { x: number; y: number }, anchor: { x: number; y: number }): WorldPoint {
  const desired = sceneGroundPoint(camera, point, anchor);
  const x = desired[0] - 0.5, y = desired[2] - 0.5;
  if (!camera.ground?.walkable || mapGroundWalkable(camera, x, y)) return desired;
  let best: { x: number; y: number; distance: number } | undefined;
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    const cellX = Math.floor(x) + dx, cellY = Math.floor(y) + dy;
    if (!mapGroundWalkable(camera, cellX, cellY)) continue;
    const distance = Math.hypot(cellX - x, cellY - y);
    if (!best || distance < best.distance) best = { x: cellX, y: cellY, distance };
  }
  if (!best) {
    const ground = camera.ground;
    const walkable = ground.walkable!;
    for (let row = 0; row < ground.size; row++) for (let column = 0; column < ground.size; column++) {
      if (!walkable[row * ground.size + column]) continue;
      const cellX = ground.x + column, cellY = ground.y + row;
      const distance = Math.hypot(cellX - x, cellY - y);
      if (!best || distance < best.distance) best = { x: cellX, y: cellY, distance };
    }
  }
  return best ? mapCellPoint(camera, best.x, best.y) : desired;
}

type RoutedPose = { world: WorldPoint; tangent: WorldPoint };
type MovementRoute = { key: string; points: WorldPoint[]; length: number; last: WorldPoint; observedProgress: number;
  distanceTraveled?: number; lastAt?: number };
/** Opt-in resumption clock; speed is horizontal world units per millisecond. */
export type MovementBudget = { now: number; maxSpeed: number };

function budgetDistance(route: MovementRoute, budget: MovementBudget): number {
  const delta = Math.max(0, Math.min(100, budget.now - (route.lastAt ?? budget.now)));
  route.lastAt = Math.max(route.lastAt ?? budget.now, budget.now);
  route.distanceTraveled = Math.min(route.length, (route.distanceTraveled ?? 0) + delta * Math.max(0, budget.maxSpeed));
  return route.distanceTraveled;
}

/** Presentation routes stay inside the starting GAT component; server timing remains authoritative. */
export class ConnectedMapMovement {
  private map = '';
  private ground: MapProjection['ground'];
  private routes = new Map<string, MovementRoute>();

  project(camera: MapProjection, actorId: string, segment: string, from: WorldPoint, to: WorldPoint, progress: number, budget?: MovementBudget): RoutedPose {
    const fraction = Math.max(0, Math.min(1, progress));
    if (this.map !== camera.map || this.ground !== camera.ground) {
      this.map = camera.map; this.ground = camera.ground; this.routes.clear();
    }
    const ground = camera.ground;
    let route = this.routes.get(actorId);
    if (!ground?.walkable) {
      if (!budget) {
        const world: WorldPoint = [from[0] + (to[0] - from[0]) * fraction,
          from[1] + (to[1] - from[1]) * fraction, from[2] + (to[2] - from[2]) * fraction];
        this.routes.set(actorId, { key: segment, points: [world], length: 0, last: world, observedProgress: 0 });
        if (this.routes.size > 160) this.routes.delete(this.routes.keys().next().value!);
        return { world, tangent: to };
      }
      if (!route || route.key !== segment || route.lastAt === undefined) {
        const start = route?.last ?? from;
        const stationary = from[0] === to[0] && from[2] === to[2];
        route = { key: segment, points: stationary ? [start] : [start, to],
          length: stationary ? 0 : Math.hypot(to[0] - start[0], to[2] - start[2]),
          last: start, observedProgress: 0, distanceTraveled: 0, lastAt: budget.now };
        this.routes.set(actorId, route);
        if (this.routes.size > 160) this.routes.delete(this.routes.keys().next().value!);
      }
      const amount = route.length ? budgetDistance(route, budget) / route.length : 0;
      const start = route.points[0], end = route.points.at(-1)!;
      route.last = amount >= 1 ? end : [start[0] + (end[0] - start[0]) * amount,
        start[1] + (end[1] - start[1]) * amount, start[2] + (end[2] - start[2]) * amount];
      return { world: route.last, tangent: end };
    }
    const walkable = ground.walkable;
    if (!route || route.key !== segment || (budget && route.lastAt === undefined)) {
      const start = route?.last ?? from;
      // Engine stops/casts replace motion with a zero-length segment at its
      // straight-line position. Keep the last connected presentation position.
      if (route && from[0] === to[0] && from[2] === to[2]) {
        route = { key: segment, points: [start], length: 0, last: start, observedProgress: 0 };
        this.routes.set(actorId, route);
        return { world: start, tangent: start };
      }
      // A genuinely moving segment first observed after arrival catches up to
      // its connected endpoint; only stationary replacements freeze in place.
      const observedProgress = route && fraction < 1 ? fraction : 0;
      const indexAt = (point: WorldPoint) => (Math.floor(point[2] - .5) - ground.y) * ground.size + Math.floor(point[0] - .5) - ground.x;
      const worldAt = (index: number) => mapCellPoint(camera, ground.x + index % ground.size, ground.y + Math.floor(index / ground.size));
      let startIndex = indexAt(start);
      if (!mapGroundWalkable(camera, start[0] - .5, start[2] - .5)) {
        let distance = Infinity;
        startIndex = -1;
        walkable.forEach((cell, index) => {
          if (!cell) return;
          const world = worldAt(index), next = Math.hypot(world[0] - start[0], world[2] - start[2]);
          if (next < distance) { distance = next; startIndex = index; }
        });
      }
      const parents = new Int32Array(ground.size * ground.size).fill(-2);
      const queue: number[] = startIndex < 0 ? [] : [startIndex];
      if (startIndex >= 0) parents[startIndex] = -1;
      let endpoint = startIndex, nearest = Infinity;
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head], world = worldAt(index);
        const distance = Math.hypot(world[0] - to[0], world[2] - to[2]);
        if (distance < nearest) { nearest = distance; endpoint = index; }
        const x = index % ground.size, y = Math.floor(index / ground.size);
        // Eight-neighbor routes retain open diagonals without cutting wall corners.
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]) {
          const nx = x + dx, ny = y + dy, next = ny * ground.size + nx;
          if (nx < 0 || ny < 0 || nx >= ground.size || ny >= ground.size || !walkable[next] || parents[next] !== -2) continue;
          if (dx && dy && (!walkable[y * ground.size + nx] || !walkable[ny * ground.size + x])) continue;
          parents[next] = index; queue.push(next);
        }
      }
      const targetIndex = indexAt(to);
      if (mapGroundWalkable(camera, to[0] - .5, to[2] - .5) && parents[targetIndex] !== -2) endpoint = targetIndex;
      const indices: number[] = [];
      for (let index = endpoint; index >= 0; index = parents[index]) indices.push(index);
      const points = indices.reverse().map(worldAt);
      if (points.length) {
        if (mapGroundWalkable(camera, start[0] - .5, start[2] - .5)) points[0] = start;
        if (mapGroundWalkable(camera, to[0] - .5, to[2] - .5) && targetIndex === endpoint) points.push(to);
      } else points.push(start);
      const length = points.reduce((total, point, index) => index ? total + Math.hypot(point[0] - points[index - 1][0], point[2] - points[index - 1][2]) : 0, 0);
      route = { key: segment, points, length, last: points[0], observedProgress,
        ...(budget ? { distanceTraveled: 0, lastAt: budget.now } : {}) };
      this.routes.set(actorId, route);
      if (this.routes.size > 160) this.routes.delete(this.routes.keys().next().value!);
    }
    let remaining = budget ? budgetDistance(route, budget)
      : route.length * Math.max(0, (fraction - route.observedProgress) / Math.max(.000001, 1 - route.observedProgress));
    for (let index = 1; index < route.points.length; index++) {
      const a = route.points[index - 1], b = route.points[index];
      const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (length > 0 && remaining < length) {
        const x = a[0] + (b[0] - a[0]) * remaining / length;
        const y = a[2] + (b[2] - a[2]) * remaining / length;
        route.last = [x, mapGroundHeight(camera, x - .5, y - .5), y];
        return { world: route.last, tangent: b };
      }
      remaining -= length;
    }
    route.last = route.points.at(-1)!;
    return { world: route.last, tangent: route.last };
  }
}

/** Intersect a viewport ray with the GAT surface near the camera focus. */
/** Convert a native world position to the battle-space center of its map cell. */
export function battleCellFromWorldPoint(world: WorldPoint, origin: FieldMapOrigin): { x: number; y: number } {
  return {
    x: BATTLE_HERO.x + (Math.floor(world[0]) - origin.x) / BATTLE_CELLS_PER_UNIT,
    y: BATTLE_HERO.y + (Math.floor(world[2]) - origin.y) / BATTLE_CELLS_PER_UNIT,
  };
}

/** Convert a screen click to the battle-space center of its native map cell. */
export function screenBattleCell(camera: MapProjection, point: { x: number; y: number }, origin: FieldMapOrigin): { x: number; y: number } {
  return battleCellFromWorldPoint(screenGroundPoint(camera, point), origin);
}

export function screenGroundPoint(camera: MapProjection, point: { x: number; y: number }): WorldPoint {
  const combined = Array.from({ length: 16 }, (_, index) => {
    const row = index % 4;
    const column = Math.floor(index / 4);
    return [0, 1, 2, 3].reduce((sum, entry) =>
      sum + camera.projection[entry * 4 + row] * camera.modelView[column * 4 + entry], 0);
  });
  const nx = point.x * 2 - 1;
  const ny = 1 - point.y * 2;
  let result: WorldPoint = [...camera.focus];
  for (let attempt = 0; attempt < 3; attempt++) {
    const vertical = result[1];
    const a = combined[0] - nx * combined[3];
    const b = combined[8] - nx * combined[11];
    const c = -(combined[4] - nx * combined[7]) * vertical - combined[12] + nx * combined[15];
    const d = combined[1] - ny * combined[3];
    const e = combined[9] - ny * combined[11];
    const f = -(combined[5] - ny * combined[7]) * vertical - combined[13] + ny * combined[15];
    const determinant = a * e - b * d;
    if (Math.abs(determinant) < 0.00001) return result;
    const x = (c * e - b * f) / determinant;
    const y = (a * f - c * d) / determinant;
    result = [x, mapGroundHeight(camera, x - 0.5, y - 0.5), y];
  }
  return result;
}

export function projectMapPoint(camera: MapProjection, point: WorldPoint, width: number, height: number): { x: number; y: number; scale: number; world: WorldPoint } {
  const view = transform(camera.modelView, [...point, 1]);
  const clip = transform(camera.projection, view);
  const depth = Math.max(0.01, -view[2]);
  const denominator = Math.abs(clip[3]) < 0.001 ? 0.001 : clip[3];
  // Entity.xSize/ySize=5 and SpriteRenderer divides native pixels by 175.
  const scaleX = width * Math.abs(camera.projection[0]) / (2 * depth * 35);
  const scaleY = height * Math.abs(camera.projection[5]) / (2 * depth * 35);
  return {
    x: (clip[0] / denominator + 1) * width / 2,
    y: (1 - clip[1] / denominator) * height / 2,
    scale: Math.max(0.05, Math.min(scaleX, scaleY)),
    world: point,
  };
}

/** A source-cell radius follows the terrain and the map's camera perspective. */
export function projectMapArea(camera: MapProjection, center: WorldPoint, radius: number, width: number, height: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 32 }, (_, index) => {
    const angle = index * Math.PI * 2 / 32;
    const x = center[0] + Math.cos(angle) * radius;
    const y = center[2] + Math.sin(angle) * radius;
    return projectMapPoint(camera, [x, mapGroundHeight(camera, x - 0.5, y - 0.5), y], width, height);
  });
}
