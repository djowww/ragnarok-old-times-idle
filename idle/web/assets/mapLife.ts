/** Original NPC scenery. Hunt monsters come from the persisted server population. */
import type { Area, Catalog, SpriteAsset } from "../../shared/types";
import type { DecodedActor } from "./renderer";
import {
  mapCellPoint, mapGroundWalkable, projectMapPoint, screenGroundPoint,
  type MapProjection, type WorldPoint,
} from "./mapProjection";

export type MapLifePoint = { x: number; y: number };
export interface MapLifeActor {
  id: string;
  kind: "npc" | "monster";
  label: string;
  asset: SpriteAsset;
  /** Preferred viewport ground position; prepareMapLife converts it to map cells. */
  point: MapLifePoint;
  roamCells: number;
  speed: number;
  direction: number;
  phaseMs: number;
}
type RouteStep = {
  from: MapLifePoint;
  to: MapLifePoint;
  durationMs: number;
  pauseMs: number;
  direction: number;
};
export interface MapLifeRoute extends MapLifeActor {
  /** Prepared points use Scene's formation coordinates, on walkable native cells. */
  waypoints: readonly MapLifePoint[];
  steps: readonly RouteStep[];
  cycleMs: number;
}
export interface MapLifePose {
  point: MapLifePoint;
  action: 0 | 8;
  elapsed: number;
  direction: number;
  walking: boolean;
}

const npcAsset = (name: string): SpriteAsset => ({
  spr: `data/sprite/npc/${name}.spr`, act: `data/sprite/npc/${name}.act`,
});
// Original NPCs from the local GRF. Only the soldier supplies walking actions.
const SOLDIER = npcAsset("8w_soldier");
const GUIDE = npcAsset("4_f_kafra1");
const TRAVELER = npcAsset("4_m_01");
const EXPLORER = npcAsset("4_m_04");
const TOWN_POINTS = [{ x: 0.22, y: 0.54 }, { x: 0.75, y: 0.48 }, { x: 0.35, y: 0.32 }, { x: 0.83, y: 0.34 }];
const DUNGEON_MAPS = new Set(["prt_sewb1", "pay_dun00", "iz_dun01", "moc_pryd02", "gef_dun02", "gl_knt01"]);
const walkActionCache = new WeakMap<DecodedActor, boolean>();

/** Never move an NPC with the renderer's idle fallback for a missing walk ACT. */
export function mapLifeCanWalk(actor: DecodedActor): boolean {
  const cached = walkActionCache.get(actor);
  if (cached !== undefined) return cached;
  const canWalk = !actor.fallback && !!actor.body && Array.from({ length: 8 }, (_, direction) => {
    const action = actor.body!.action.actions[8 + direction];
    return !!action && action.frames.length > 1 && action.frames.some(frame =>
      frame.layers.some(layer => layer.index >= 0 && !!actor.body!.sprite.frames[
        layer.index + (layer.type === 1 ? actor.body!.sprite.indexedCount : 0)]));
  }).every(Boolean);
  walkActionCache.set(actor, canWalk);
  return canWalk;
}

function seedOf(value: string): number {
  let seed = 0;
  for (let index = 0; index < value.length; index++) seed = (seed * 31 + value.charCodeAt(index)) >>> 0;
  return seed;
}
function npc(map: string, role: string, label: string, asset: SpriteAsset, point: MapLifePoint, roamCells = 0): MapLifeActor {
  const seed = seedOf(`${map}:${role}`);
  return { id: `life:${map}:${role}`, kind: "npc", label, asset, point,
    roamCells, speed: 0.7, direction: seed % 8, phaseMs: seed % 23000 };
}

/** Descriptors are stable for a map/catalog and share loadActor's existing cache. */
export function getMapLife(mapName: string, area: Area | undefined, _catalog: Catalog): MapLifeActor[] {
  if (mapName === "prontera") return [
    npc(mapName, "guard", "Guarda de Prontera", SOLDIER, TOWN_POINTS[0], 2.5),
    npc(mapName, "guide", "Funcionária Kafra", GUIDE, TOWN_POINTS[1]),
    npc(mapName, "traveler", "Viajante", TRAVELER, TOWN_POINTS[2]),
    npc(mapName, "resident", "Morador de Prontera", EXPLORER, TOWN_POINTS[3]),
  ];
  if (!area || area.map !== mapName) return [];
  const dungeon = DUNGEON_MAPS.has(mapName);
  const result: MapLifeActor[] = [];
  if (!dungeon && area.scene !== "orc") {
    result.push(npc(mapName, "explorer", "Explorador", EXPLORER, { x: 0.17, y: 0.58 }));
    if (mapName === "prt_fild08")
      result.push(npc(mapName, "guard", "Guarda da estrada", SOLDIER, { x: 0.82, y: 0.58 }, 2));
  }
  return result;
}

const NPC_LINES: Record<string, readonly string[]> = {
  guide: ["Posso guardar seus pertences.", "Boa viagem, aventureiro!"],
  guard: ["A estrada está tranquila.", "Cuidado com os monstros lá fora."],
  traveler: ["Prontera sempre me recebe bem.", "Ainda há muito para explorar."],
  resident: ["Bom dia, aventureiro!", "Que belo dia em Prontera."],
  explorer: ["Leve algumas poções.", "Os campos guardam muitas surpresas."],
};
/** Only one NPC speaks at a time, with a long quiet interval between cues. */
export function mapLifeSpeechAt(actors: readonly MapLifeActor[], id: string, time: number, reducedMotion = false): { text: string; emotion: number; elapsed: number } | null {
  if (reducedMotion || !actors.length) return null;
  const elapsedTime = Math.max(0, time) + seedOf(actors[0].id.split(":")[1] ?? "map") % 5000;
  const cycle = Math.floor(elapsedTime / 29000);
  const elapsed = elapsedTime % 29000;
  if (elapsed < 9000 || elapsed >= 12400 || actors[cycle % actors.length].id !== id) return null;
  const role = id.split(":").at(-1) ?? "explorer";
  const lines = NPC_LINES[role] ?? NPC_LINES.explorer;
  return { text: lines[cycle % lines.length], emotion: [0, 1, 18, 21][cycle % 4], elapsed: elapsed - 9000 };
}

function direction(from: MapLifePoint, to: MapLifePoint): number {
  return (6 + Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) + 8) % 8;
}
function formationPoint(world: WorldPoint, camera: MapProjection, anchor: MapLifePoint): MapLifePoint {
  const origin = camera.sceneFocus ?? camera.focus;
  return { x: anchor.x + (world[0] - origin[0]) / 22,
    y: anchor.y + (world[2] - origin[2]) / 18 };
}
function clearCell(camera: MapProjection, x: number, y: number): boolean {
  return [[0, 0], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]
    .every(([dx, dy]) => mapGroundWalkable(camera, x + dx, y + dy));
}
function clearSegment(camera: MapProjection, from: WorldPoint, to: WorldPoint): boolean {
  const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const samples = Math.max(1, Math.ceil(distance * 4));
  for (let index = 0; index <= samples; index++) {
    const progress = index / samples;
    if (!clearCell(camera, from[0] - 0.5 + (to[0] - from[0]) * progress,
      from[2] - 0.5 + (to[2] - from[2]) * progress)) return false;
  }
  return true;
}

const routeCache = new WeakMap<readonly MapLifeActor[], { key: string; routes: MapLifeRoute[] }>();

/** Place distant actors once per camera layout, and keep every patrol segment on GAT. */
export function prepareMapLife(actors: readonly MapLifeActor[], camera: MapProjection, anchor: MapLifePoint): MapLifeRoute[] {
  const ground = camera.ground;
  if (!ground?.walkable) return [];
  // Camera following changes matrices every frame; map actors keep their homes.
  const key = [camera.map, camera.viewport.width, camera.viewport.height, ...(camera.sceneFocus ?? camera.focus),
    camera.direction, ground.x, ground.y, ground.size, anchor.x, anchor.y].join(":");
  const cached = routeCache.get(actors);
  if (cached?.key === key) return cached.routes;
  const width = camera.viewport.width;
  const height = camera.viewport.height;
  const occupied: WorldPoint[] = [];
  const candidates: Array<{ world: WorldPoint; screen: MapLifePoint }> = [];
  // Scan once for all actors. Offscreen cells and walls never become spawn sites.
  for (let y = 1; y < ground.size - 1; y++) for (let x = 1; x < ground.size - 1; x++) {
    const cellX = ground.x + x;
    const cellY = ground.y + y;
    if (!clearCell(camera, cellX, cellY)) continue;
    const world = mapCellPoint(camera, cellX, cellY);
    const placement = projectMapPoint(camera, world, width, height);
    const screen = { x: placement.x / width, y: placement.y / height };
    if (screen.x >= 0.13 && screen.x <= 0.9 && screen.y >= 0.24 && screen.y <= 0.63)
      candidates.push({ world, screen });
  }
  const routes: MapLifeRoute[] = [];
  for (const actor of actors.slice(0, 8)) {
    const preferred = screenGroundPoint(camera, actor.point);
    const minimumDistance = actor.kind === "monster" ? 9 : 5;
    const available = candidates.filter(({ world }) =>
      Math.hypot(world[0] - camera.focus[0], world[2] - camera.focus[2]) >= minimumDistance &&
      occupied.every(point => Math.hypot(world[0] - point[0], world[2] - point[2]) >= 3));
    const home = available.reduce<WorldPoint | undefined>((best, candidate) => {
      const distance = (point: WorldPoint) => Math.hypot(point[0] - preferred[0], point[2] - preferred[2]);
      return !best || distance(candidate.world) < distance(best) ? candidate.world : best;
    }, undefined);
    if (!home) continue;
    occupied.push(home);
    const nativePoints = [home];
    if (actor.roamCells > 0) {
      const seed = seedOf(actor.id);
      for (let index = 0; index < 16 && nativePoints.length < 3; index++) {
        const angle = (index + seed % 16) * Math.PI / 8;
        const x = Math.round(home[0] - 0.5 + Math.cos(angle) * actor.roamCells);
        const y = Math.round(home[2] - 0.5 + Math.sin(angle) * actor.roamCells);
        const point = mapCellPoint(camera, x, y);
        const screen = projectMapPoint(camera, point, width, height);
        const previous = nativePoints[nativePoints.length - 1];
        if (Math.hypot(point[0] - previous[0], point[2] - previous[2]) < 1.5 ||
          Math.hypot(point[0] - camera.focus[0], point[2] - camera.focus[2]) < minimumDistance ||
          screen.x < width * 0.13 || screen.x > width * 0.9 || screen.y < height * 0.24 || screen.y > height * 0.63 ||
          !clearSegment(camera, previous, point) || !clearSegment(camera, point, home)) continue;
        nativePoints.push(point);
      }
    }
    const waypoints = nativePoints.map(point => formationPoint(point, camera, anchor));
    const steps = nativePoints.length < 2 ? [] : nativePoints.map((from, index) => {
      const nextIndex = (index + 1) % nativePoints.length;
      const to = nativePoints[nextIndex];
      const fromScreen = projectMapPoint(camera, from, width, height);
      const toScreen = projectMapPoint(camera, to, width, height);
      return { from: waypoints[index], to: waypoints[nextIndex],
        durationMs: Math.hypot(to[0] - from[0], to[2] - from[2]) / actor.speed * 1000,
        pauseMs: 2400 + (seedOf(`${actor.id}:${index}`) % 3100), direction: direction(fromScreen, toScreen) };
    });
    routes.push({ ...actor, point: waypoints[0], waypoints, steps,
      cycleMs: steps.reduce((sum, step) => sum + step.durationMs + step.pauseMs, 0) });
  }
  routeCache.set(actors, { key, routes });
  return routes;
}

/** Stateless looping walks with staggered rests; reduced motion freezes the route. */
export function mapLifePoseAt(route: MapLifeRoute, time: number, reducedMotion = false, canWalk = true): MapLifePose {
  if (reducedMotion || !canWalk || !route.steps.length || !route.cycleMs)
    return { point: route.point, action: 0, elapsed: reducedMotion ? 0 : time + route.phaseMs,
      direction: route.direction, walking: false };
  let elapsed = (Math.max(0, time) + route.phaseMs) % route.cycleMs;
  for (const step of route.steps) {
    if (elapsed < step.pauseMs)
      return { point: step.from, action: 0, elapsed, direction: step.direction, walking: false };
    elapsed -= step.pauseMs;
    if (elapsed < step.durationMs) {
      const progress = elapsed / step.durationMs;
      return { point: { x: step.from.x + (step.to.x - step.from.x) * progress,
        y: step.from.y + (step.to.y - step.from.y) * progress },
        action: 8, elapsed, direction: step.direction, walking: true };
    }
    elapsed -= step.durationMs;
  }
  return { point: route.point, action: 0, elapsed: 0, direction: route.direction, walking: false };
}
