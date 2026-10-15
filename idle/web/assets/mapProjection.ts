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

/** Intersect a viewport ray with the GAT surface near the camera focus. */
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
