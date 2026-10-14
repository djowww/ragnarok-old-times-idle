/** Hercules410b9738: skill.c14019,15153,13508; status.c8007; battle.c395.
 * Fixed ground groups and source entry snapshots, never a global self buff.
 */
import type { BattleEnemy, Catalog, ElementalField, GameState, SageFieldSource, Skill } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, battleHeroAt, enemyPositionAt, type BattlePoint } from '../shared/battleSpatial.js';
import { gridWall, herculesCellPassable, type GridPoint } from '../shared/fieldNavigation.js';
import type { SimulationContext } from './fieldNavigation.js';
import { classicGroundSceneKey } from './classicBuffs.js';
import { isItemIdentified } from '../shared/loot.js';
import { random } from './state.js';
import { clampResources } from './stats.js';
import { effectiveMonsterStatus } from './classicStatuses.js';
import { groundSceneFrame } from './groundSceneFrame.js';
import { sourceGroundPath } from './groundUnitGeometry.js';
import { occupiedGroundCells, reserveGroundPlacementSlot } from './groundUnitOccupancy.js';
import { isTownScene } from '../shared/worldScene.js';

export function sageFieldSource(source: string | undefined): SageFieldSource | undefined {
  return source === 'SA_VOLCANO' || source === 'SA_DELUGE' || source === 'SA_VIOLENTGALE' ? source : undefined;
}
const elementFor = (source: SageFieldSource) => source === 'SA_VOLCANO' ? 'fire' : source === 'SA_DELUGE' ? 'water' : 'wind';
const pointValid = (p: BattlePoint) => Number.isFinite(p.x) && Number.isFinite(p.y);
const fieldCell = (point: BattlePoint, offset: BattlePoint): GridPoint => ({
  x: Math.floor(point.x * BATTLE_CELLS_PER_UNIT + offset.x),
  y: Math.floor(point.y * BATTLE_CELLS_PER_UNIT + offset.y),
});

/** path.c121..182: source weighted Bresenham; no orthogonal corner veto.
 * Source swaps endpoints when dx<0 and samples after each step, not the start.
 */
export function sageFieldCells(center: BattlePoint, offset: BattlePoint,
  clear: (p: GridPoint) => boolean = () => true, occupied: readonly GridPoint[] = [], pathClear = clear): GridPoint[] {
  if (!pointValid(center) || !pointValid(offset)) return [];
  const origin = fieldCell(center, offset), cells: GridPoint[] = [];
  const blocked = new Set(occupied.map(p => `${p.x},${p.y}`));
  for (let y = origin.y - 3; y <= origin.y + 3; y++) for (let x = origin.x - 3; x <= origin.x + 3; x++) {
    const candidate = { x, y };
    if (clear(candidate) && sourceGroundPath(candidate, origin, pathClear) && !blocked.has(`${x},${y}`)) cells.push(candidate);
  }
  return cells;
}
export function fieldContains(group: ElementalField, point: BattlePoint): boolean {
  if (!pointValid(point) || !pointValid(group.cellOffset)) return false;
  const cell = fieldCell(point, group.cellOffset);
  return group.cells.some(other => other.x === cell.x && other.y === cell.y);
}
export function playerDefenseElement(s: GameState, c: Catalog): string {
  let element = 'neutral';
  for (const uid of Object.values(s.equipment)) {
    const entry = s.inventory.find(e => e.uid === uid);
    if (!entry || entry.broken || !isItemIdentified(entry)) continue;
    for (const id of [entry.itemId, ...entry.cards]) {
      const property = c.items[id]?.defenseElement;
      if (property) element = property.toLowerCase();
    }
  }
  return element;
}
function fieldEnemies(s: GameState): BattleEnemy[] {
  return [...(s.battle?.enemies ?? []), ...(s.fieldPopulation?.enemies ?? [])];
}
function defenseElement(c: Catalog, enemy: BattleEnemy, at: number): string {
  const monster = c.monsters[enemy.monsterId];
  return monster ? effectiveMonsterStatus(monster, enemy.statuses, at).monster.element.toLowerCase() : 'neutral';
}
function activeField(s: GameState, at: number): ElementalField | undefined {
  const field = s.elementalField;
  return field && field.ownerActorId === s.id && field.sceneKey === classicGroundSceneKey(s) &&
    sageFieldSource(field.sourceName) && Number.isSafeInteger(field.level) && field.level >= 1 && field.level <= 5 &&
    Number.isFinite(field.expiresAt) && Number.isFinite(field.placedAt) && field.placedAt <= at && field.expiresAt > at &&
    Number.isFinite(field.durationMs) && field.durationMs > 0 && field.cells.length > 0 && field.cells.length <= 49 &&
    field.cells.every(cell => Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y)) && s.hp > 0 ? field : undefined;
}
export function sageFieldIsActive(s: GameState, at: number): boolean { return !!activeField(s, at); }
export interface SageFieldModifiers { weaponAttack: number; flee: number; hpPercent: number; element: string; elementBonusPercent: number }
const empty = (): SageFieldModifiers => ({ weaponAttack: 0, flee: 0, hpPercent: 0, element: '', elementBonusPercent: 0 });
export function sageFieldModifiers(s: GameState, actorId: string, at: number): SageFieldModifiers {
  const field = activeField(s, at), entry = field?.occupants[actorId];
  if (!field || !entry || entry.statusExpiresAt <= at || entry.enteredAt > at ||
    ![entry.enteredAt, entry.statusExpiresAt, entry.weaponAttack, entry.flee, entry.hpPercent].every(Number.isFinite) ||
    entry.weaponAttack < 0 || entry.weaponAttack > 50 || entry.flee < 0 || entry.flee > 15 || entry.hpPercent < 0 || entry.hpPercent > 15) return empty();
  const enemy = actorId === s.id ? undefined : fieldEnemies(s).find(e => e.id === actorId && e.hp > 0);
  if (actorId !== s.id && !enemy || !fieldContains(field, enemy ? enemyPositionAt(enemy, at) : battleHeroAt(s, at))) return empty();
  return { weaponAttack: entry.weaponAttack, flee: entry.flee, hpPercent: entry.hpPercent,
    element: elementFor(field.sourceName), elementBonusPercent: [10, 14, 17, 19, 20][field.level - 1] };
}
/** battle.c395: add percentage points, not multiply the finished damage. */
export function sageFieldElementRate(base: number, modifier: SageFieldModifiers, attackElement: string, ignoreElement = false): number {
  return ignoreElement ? 1 : base + (attackElement.toLowerCase() === modifier.element ? modifier.elementBonusPercent / 100 : 0);
}
export function restoreSageFieldEnemyHp(enemy: BattleEnemy): void {
  if (enemy.elementalFieldBaseMaxHp === undefined) return;
  enemy.maxHp = enemy.elementalFieldBaseMaxHp;
  enemy.hp = Math.min(enemy.hp, enemy.maxHp);
  delete enemy.elementalFieldBaseMaxHp;
}
export function clearSageField(s: GameState): void {
  delete s.elementalField;
  for (const enemy of fieldEnemies(s)) restoreSageFieldEnemyHp(enemy);
}
export function syncSageField(s: GameState, c: Catalog, at: number): void {
  const group = activeField(s, at);
  if (!group) { clearSageField(s); clampResources(s, c); return; }
  const actors = new Map<string, { point: BattlePoint; defense: string }>();
  actors.set(s.id, { point: battleHeroAt(s, at), defense: playerDefenseElement(s, c) });
  for (const enemy of fieldEnemies(s)) if (enemy.hp > 0)
    actors.set(enemy.id, { point: enemyPositionAt(enemy, at), defense: defenseElement(c, enemy, at) });
  for (const id of Object.keys(group.occupants)) {
    const actor = actors.get(id);
    if (!actor || !fieldContains(group, actor.point)) delete group.occupants[id];
  }
  for (const [id, actor] of actors) {
    if (!fieldContains(group, actor.point) || group.occupants[id]) continue;
    const matching = actor.defense === elementFor(group.sourceName);
    group.occupants[id] = { enteredAt: at, statusExpiresAt: at + group.durationMs, defenseElement: actor.defense,
      weaponAttack: group.sourceName === 'SA_VOLCANO' && matching ? group.level * 10 : 0,
      flee: group.sourceName === 'SA_VIOLENTGALE' && matching ? group.level * 3 : 0,
      hpPercent: group.sourceName === 'SA_DELUGE' && matching ? [5, 9, 12, 14, 15][group.level - 1] : 0 };
    random(s); // Source status_start100% still consumes its application roll.
  }
  for (const enemy of fieldEnemies(s)) {
    const percent = sageFieldModifiers(s, enemy.id, at).hpPercent;
    if (percent > 0) {
      enemy.elementalFieldBaseMaxHp ??= enemy.maxHp;
      enemy.maxHp = enemy.elementalFieldBaseMaxHp + Math.trunc(enemy.elementalFieldBaseMaxHp * percent / 100);
      enemy.hp = Math.min(enemy.hp, enemy.maxHp);
    } else restoreSageFieldEnemyHp(enemy);
  }
  // Project at the event clock; caller's persisted simulation clock is unchanged.
  const projection = at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at };
  clampResources(projection, c); s.hp = projection.hp; s.sp = projection.sp;
}
export function placeSageField(s: GameState, c: Catalog, skill: Skill | undefined, level: number, at: number,
  center: BattlePoint, context?: SimulationContext, occupied: readonly GridPoint[] = []): boolean {
  const source = sageFieldSource(skill?.sourceName);
  if (!skill || !source || !Number.isSafeInteger(level) || level < 1 || level > 5 || !Number.isFinite(at) || !pointValid(center)) return false;
  const actual = occupiedGroundCells(s, c, at, context);
  if (actual.unresolved) return false;
  let map = isTownScene(s) ? 'prontera' : c.areas.find(area => area.id === s.areaId)?.map || 'prontera';
  let offset: BattlePoint = { x: 0, y: 0 }, clear: ((p: GridPoint) => boolean) | undefined, pathClear = clear;
  if (context) {
    const frame = groundSceneFrame(s, c, context);
    map = frame.map;
    offset = frame.cellOffset;
    pathClear = p => !gridWall(frame.grid, p);
    clear = p => herculesCellPassable(frame.grid, p) && !gridWall(frame.grid, p);
  }
  const previous = activeField(s, at);
  const durationMs = previous ? previous.expiresAt - at : skill.groundDurationMs?.[level - 1] ?? 0;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
  clearSageField(s);
  reserveGroundPlacementSlot(s, c, at);
  const retained = occupiedGroundCells(s, c, at, context);
  const cells = sageFieldCells(center, offset, clear, [...retained.cells, ...occupied], pathClear);
  if (!cells.length) { clampResources(s, c); return false; }
  s.elementalField = { id: `field-${s.id}-${at}-${s.nextEventId}`, ownerActorId: s.id, skillId: skill.id,
    allocationOrder: s.nextEventId,
    sourceName: source, level, sceneKey: classicGroundSceneKey(s), map, cellOffset: offset, cells, placedAt: at,
    expiresAt: at + durationMs, durationMs, occupants: {} };
  syncSageField(s, c, at);
  return true;
}

/** First integer-ms crossing of the clipped cell union along the actual route.
 * We sample only the seven-cell bounding box's boundaries, never scan the map
 * or poll status at a coarse 250ms combat window. Internal cells don't refresh.
 */
export function nextSageFieldBoundary(s: GameState, at: number): number | undefined {
  const group = activeField(s, at);
  if (!group) return s.elementalField ? at : undefined;
  let next = group.expiresAt;
  const bounds = {
    x: [Math.min(...group.cells.map(p => p.x)), Math.max(...group.cells.map(p => p.x)) + 1],
    y: [Math.min(...group.cells.map(p => p.y)), Math.max(...group.cells.map(p => p.y)) + 1],
  };
  const trace = (points: readonly BattlePoint[], startedAt: number, arrivedAt: number,
    positionAt: (time: number) => BattlePoint) => {
    if (arrivedAt <= at || arrivedAt <= startedAt || points.length < 2) return;
    const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    if (!total) return;
    let traveled = 0;
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1], to = points[i], length = lengths[i - 1];
      for (const axis of ['x', 'y'] as const) {
        const fromGrid = from[axis] * BATTLE_CELLS_PER_UNIT + group.cellOffset[axis];
        const delta = (to[axis] - from[axis]) * BATTLE_CELLS_PER_UNIT;
        if (!delta) continue;
        for (let cell = bounds[axis][0]; cell <= bounds[axis][1]; cell++) {
          const fraction = (cell - fromGrid) / delta;
          if (fraction < 0 || fraction > 1) continue;
          const time = startedAt + (traveled + length * fraction) / total * (arrivedAt - startedAt);
          const candidate = delta < 0 ? Math.floor(time) + 1 : Math.ceil(time);
          if (candidate <= at || candidate > arrivedAt || candidate >= next) continue;
          if (fieldContains(group, positionAt(candidate)) !== fieldContains(group, positionAt(candidate - 1))) next = candidate;
        }
      }
      traveled += length;
    }
  };
  const hero = s.fieldHero;
  if (hero?.areaId === s.areaId && s.status !== 'paused')
    trace(hero.movementRoute?.length ? hero.movementRoute : [hero.from, hero.position], hero.startedAt, hero.arrivedAt,
      time => battleHeroAt(s, time));
  const seen = new Set<string>();
  for (const enemy of fieldEnemies(s)) {
    if (seen.has(enemy.id) || enemy.hp <= 0 || enemy.approachPausedAt !== undefined) continue;
    seen.add(enemy.id);
    trace(enemy.movementRoute?.length ? enemy.movementRoute : [enemyPositionAt(enemy, enemy.startedAt), enemy.position],
      enemy.startedAt, enemy.arrivedAt, time => enemyPositionAt(enemy, time));
  }
  return next;
}
