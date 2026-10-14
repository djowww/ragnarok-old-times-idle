import type { Catalog, GameState, GroundPlacement, Skill } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, battleHeroAt, type BattlePoint } from '../shared/battleSpatial.js';
import { gridWall, herculesCellPassable, type GridPoint } from '../shared/fieldNavigation.js';
import { classicGroundSceneKey, cancelClassicBuff } from './classicBuffs.js';
import type { SimulationContext } from './fieldNavigation.js';
import { groundSceneFrame } from './groundSceneFrame.js';
import { sourceGroundPath, sourceGroundShape } from './groundUnitGeometry.js';
import { clearSageField, sageFieldIsActive } from './sageFields.js';
import { clampResources } from './stats.js';
import { isTownScene } from '../shared/worldScene.js';

function frame(s: GameState, c: Catalog, context?: SimulationContext) {
  return context ? groundSceneFrame(s, c, context) : { map: isTownScene(s) ? 'prontera' : c.areas.find(a=>a.id===s.areaId)?.map || 'prontera',
    cellOffset: {x:0,y:0}, grid: undefined };
}
const cell = (point: BattlePoint, offset: BattlePoint): GridPoint => ({
  x: Math.floor(point.x * BATTLE_CELLS_PER_UNIT + offset.x), y: Math.floor(point.y * BATTLE_CELLS_PER_UNIT + offset.y),
});
function active(s: GameState, group: GroundPlacement, at: number): boolean {
  if (s.hp <= 0 || group.ownerActorId !== s.id || group.sceneKey !== classicGroundSceneKey(s) ||
    !Number.isFinite(group.placedAt) || !Number.isFinite(group.expiresAt) || group.placedAt > at || group.expiresAt <= at ||
    !Number.isSafeInteger(group.range) || group.range < 0 || group.range > 3 || !group.cells.length || group.cells.length > 121 ||
    !group.cells.every(p=>Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y))) return false;
  // A replaced encounter cannot tell us a unit was depleted; its fixed source
  // footprint lasts until the recorded group limit. Within the same encounter,
  // the actual processor is authoritative for destruction/partial removal.
  const battle = s.battle;
  if (group.binding === 'defensiveGround') return !!s.combatEffects?.defensiveGrounds?.some(g=>
    g.groundPlacementId===group.id&&g.expiresAt>at&&(g.kind!=='safetyWallGround'||(g.hits??0)>0));
  if (!group.binding || !battle || battle.startedAt !== group.battleStartedAt) return true;
  if (group.binding === 'groundEffect') return !!battle.groundEffects?.some(g=>
    g.groundPlacementId===group.id&&g.expiresAt>at&&(g.remainingHits??1)>0);
  if (group.binding === 'skillUnit') return !!battle.skillUnits?.some(g=>g.groundPlacementId===group.id&&g.expiresAt>at&&g.cells.length);
  return !!battle.traps?.some(g=>g.groundPlacementId===group.id&&g.expiresAt>at);
}

export function groundPlacementCellsAt(group: GroundPlacement, at: number): GridPoint[] {
  return group.cells.filter(point => (group.cellExpiresAt?.[`${point.x},${point.y}`] ?? group.expiresAt) > at);
}
function livePlacementCells(s: GameState, group: GroundPlacement, at: number): GridPoint[] {
  const cells = groundPlacementCellsAt(group, at);
  if (group.binding !== 'skillUnit' || s.battle?.startedAt !== group.battleStartedAt) return cells;
  const unit = s.battle?.skillUnits?.find(g => g.groundPlacementId === group.id);
  if (!unit) return [];
  const offset = group.logicalCellOffset ?? {
    x: Math.floor(unit.position.x * 12 + group.cellOffset.x) - Math.floor(unit.position.x * 12),
    y: Math.floor(unit.position.y * 12 + group.cellOffset.y) - Math.floor(unit.position.y * 12),
  };
  const remaining = new Set(unit.cells.map(p => `${Math.floor(p.x * 12) + offset.x},${Math.floor(p.y * 12) + offset.y}`));
  return cells.filter(p => remaining.has(`${p.x},${p.y}`));
}
export function activeGroundPlacements(s: GameState, at: number): GroundPlacement[] {
  return (s.groundPlacements ?? []).filter(group => active(s, group, at));
}
export function groundPlacementContains(group: GroundPlacement, point: BattlePoint, at: number): boolean {
  const target = cell(point, group.cellOffset);
  return groundPlacementCellsAt(group, at).some(p => p.x === target.x && p.y === target.y);
}
type LegacyGroundSlot = { placedAt: number; allocationOrder: number; remove: () => void };
function legacyGroundSlots(s: GameState, c: Catalog, at: number): LegacyGroundSlot[] {
  const known = new Set((s.groundPlacements ?? []).map(g => g.id)), slots: LegacyGroundSlot[] = [];
  const valid = (id: string, placement: string | undefined, expiresAt: number) => expiresAt > at &&
    (!placement || !known.has(placement)) && !!sourceGroundShape(c.skills[id]?.sourceName ?? '', { x: 0, y: 0 });
  const started = (id: string, level: number, expiresAt: number) =>
    Math.max(0, expiresAt - (c.skills[id]?.groundDurationMs?.[level - 1] ?? 0));
  const add = (placedAt: number, remove: () => void) => slots.push({ placedAt, allocationOrder: slots.length, remove });
  const battle = s.battle;
  if (battle) {
    for (const g of battle.groundEffects ?? []) if (valid(g.skillId, g.groundPlacementId, g.expiresAt) && (g.remainingHits ?? 1) > 0)
      add(started(g.skillId, g.level, g.expiresAt), () => { battle.groundEffects = battle.groundEffects?.filter(entry => entry !== g); });
    for (const g of battle.skillUnits ?? []) if (valid(g.skillId, g.groundPlacementId, g.expiresAt) && g.cells.length)
      add(g.placedAt, () => {
        for (const enemy of [...(battle.enemies ?? []), ...(s.fieldPopulation?.enemies ?? [])])
          if (enemy.statuses?.SC_SPIDERWEB?.groundId === g.id) delete enemy.statuses.SC_SPIDERWEB;
        battle.skillUnits = battle.skillUnits?.filter(entry => entry !== g); battle.fieldDecisionAt = at;
      });
    for (const g of battle.traps ?? []) if (valid(g.skillId, g.groundPlacementId, g.expiresAt))
      add(g.placedAt, () => { battle.traps = battle.traps?.filter(entry => entry !== g); });
  }
  const effects = s.combatEffects;
  const defenses: NonNullable<NonNullable<GameState['combatEffects']>['defensiveGrounds']> = effects?.defensiveGrounds ?? [
    ...(effects?.pneumaGround ? [{ ...effects.pneumaGround, kind: 'pneumaGround' as const }] : []),
    ...(effects?.safetyWallGround ? [{ ...effects.safetyWallGround, kind: 'safetyWallGround' as const, hits: effects.safetyWallHits }] : []),
  ];
  for (const g of defenses) {
    const source = g.kind === 'pneumaGround' ? 'AL_PNEUMA' : 'MG_SAFETYWALL';
    const skill = Object.values(c.skills).find(candidate => candidate.sourceName === source);
    if (!effects || !skill || g.sceneKey !== classicGroundSceneKey(s) || !valid(skill.id, g.groundPlacementId, g.expiresAt) ||
      g.kind === 'safetyWallGround' && (g.hits ?? 0) <= 0) continue;
    const level = effects.buffLevels?.[skill.id] ?? s.learnedSkills[skill.id] ?? 1;
    add(started(skill.id, level, g.expiresAt), () => {
      if (effects.defensiveGrounds) effects.defensiveGrounds = effects.defensiveGrounds.filter(entry => entry !== g);
      else { delete effects[g.kind]; if (g.kind === 'safetyWallGround') effects.safetyWallHits = 0; }
    });
  }
  return slots;
}

/** skill.c19299..19323: the owner has25 slots, with the oldest group evicted. */
export function reserveGroundPlacementSlot(s: GameState, c: Catalog, at: number): void {
  pruneGroundPlacements(s, at);
  const field = s.elementalField && s.elementalField.expiresAt > at &&
    s.elementalField.sceneKey === classicGroundSceneKey(s) ? s.elementalField : undefined;
  const groups = s.groundPlacements ?? [];
  const legacy = legacyGroundSlots(s, c, at);
  if (groups.length + legacy.length + Number(!!field) < 25) return;
  const older = (a: { placedAt: number; allocationOrder?: number }, b: { placedAt: number; allocationOrder?: number }) =>
    a.placedAt < b.placedAt || a.placedAt === b.placedAt && (a.allocationOrder ?? 0) < (b.allocationOrder ?? 0);
  const oldest = groups.reduce<GroundPlacement | undefined>((old, group) =>
    !old || older(group, old) ? group : old, undefined);
  const oldestLegacy = legacy.reduce<LegacyGroundSlot | undefined>((old, slot) => !old || older(slot, old) ? slot : old, undefined);
  if (oldestLegacy && (!oldest || older(oldestLegacy, oldest)) && (!field || older(oldestLegacy, field))) {
    oldestLegacy.remove(); reserveGroundPlacementSlot(s, c, at); return;
  }
  if (field && (!oldest || older(field, oldest))) {
    clearSageField(s); clampResources(s, c); return;
  }
  if (!oldest) return;
  removeGroundPlacement(s, oldest.id);
  if (s.battle) {
    const removed = s.battle.skillUnits?.filter(g => g.groundPlacementId === oldest.id) ?? [];
    for (const unit of removed) for (const enemy of [...(s.battle.enemies ?? []), ...(s.fieldPopulation?.enemies ?? [])])
      if (enemy.statuses?.SC_SPIDERWEB?.groundId === unit.id) delete enemy.statuses.SC_SPIDERWEB;
    if (removed.length) s.battle.fieldDecisionAt = at;
    s.battle.groundEffects = s.battle.groundEffects?.filter(g=>g.groundPlacementId!==oldest.id);
    s.battle.skillUnits = s.battle.skillUnits?.filter(g=>g.groundPlacementId!==oldest.id);
    s.battle.traps = s.battle.traps?.filter(g=>g.groundPlacementId!==oldest.id);
  }
  if (s.combatEffects?.defensiveGrounds)
    s.combatEffects.defensiveGrounds = s.combatEffects.defensiveGrounds.filter(g=>g.groundPlacementId!==oldest.id);
  if (oldest.sourceName === 'PF_FOGWALL' && !activeGroundPlacements(s, at).some(g => g.sourceName === 'PF_FOGWALL'))
    cancelClassicBuff(s, c, 'PF_FOGWALL');
}

/** skill.c18753/13868: Fog cells reject Volcano/Gale; Deluge doubles their limit. */
export function previewGroundPlacement(s: GameState, c: Catalog, skill: Skill, level: number, at: number,
  center: BattlePoint, caster: BattlePoint, context?: SimulationContext) {
  if (!Number.isSafeInteger(level) || level < 1 || level > skill.maxLevel || !Number.isFinite(at)) return undefined;
  const f = frame(s, c, context), origin = cell(center, f.cellOffset);
  const shape = sourceGroundShape(skill.sourceName ?? '', origin, cell(caster, f.cellOffset));
  const duration = skill.groundDurationMs?.[level - 1] ?? 0;
  if (!shape || !Number.isFinite(duration) || duration <= 0) return undefined;
  const fog = skill.sourceName === 'PF_FOGWALL';
  if (fog && activeGroundPlacements(s, at).filter(g => g.sourceName === 'PF_FOGWALL').length >= 2) return undefined;
  const elemental = sageFieldIsActive(s, at) ? s.elementalField : undefined;
  const overlap = new Set(elemental?.cells.map(p => `${p.x},${p.y}`));
  const limits: Record<string, number> = {};
  const cells = shape.cells.filter(p => {
    if (f.grid && (!herculesCellPassable(f.grid, p) || gridWall(f.grid, p) ||
      shape.pathCheck && !sourceGroundPath(p, origin, q => !gridWall(f.grid!, q)))) return false;
    const onElemental = fog && overlap.has(`${p.x},${p.y}`);
    if (onElemental && elemental?.sourceName !== 'SA_DELUGE') return false;
    if (fog) limits[`${p.x},${p.y}`] = at + duration * (onElemental ? 2 : 1);
    return true;
  });
  if (!cells.length) return undefined;
  return { map: f.map, cellOffset: { ...f.cellOffset }, cells, range: shape.range,
    logicalCellOffset: { x: origin.x - Math.floor(center.x * 12), y: origin.y - Math.floor(center.y * 12) },
    expiresAt: fog ? Math.max(...Object.values(limits)) : at + duration,
    ...(fog ? { cellExpiresAt: limits } : {}) };
}
export function canPlaceSelfGround(s: GameState, c: Catalog, skill: Skill, level: number, at: number,
  context?: SimulationContext): boolean {
  const hero = battleHeroAt(s, at), preview = previewGroundPlacement(s, c, skill, level, at, hero, hero, context);
  if (!preview) return false;
  const target = cell(hero, preview.cellOffset);
  return preview.cells.some(p => p.x === target.x && p.y === target.y);
}

/** Capture only after successful resource and placement handling. No RNG draw. */
export function captureGroundPlacement(s: GameState, c: Catalog, skill: Skill, level: number, at: number,
  center: BattlePoint, caster: BattlePoint, context?: SimulationContext, slotReserved = false): GroundPlacement | undefined {
  if (!previewGroundPlacement(s, c, skill, level, at, center, caster, context)) return undefined;
  if (!slotReserved) reserveGroundPlacementSlot(s, c, at);
  const geometry = previewGroundPlacement(s, c, skill, level, at, center, caster, context);
  if (!geometry) return undefined;
  const group: GroundPlacement = {id:`occupied-${s.id}-${skill.id}-${at}-${s.nextEventId}`,ownerActorId:s.id,
    allocationOrder:s.nextEventId,
    skillId:skill.id,sourceName:skill.sourceName!,level,sceneKey:classicGroundSceneKey(s), placedAt:at, ...geometry};
  (s.groundPlacements ??= []).push(group);
  return group;
}

export function removeGroundPlacement(s: GameState, id: string | undefined): void {
  if (id) s.groundPlacements = s.groundPlacements?.filter(group => group.id !== id);
}
export function pruneGroundPlacements(s: GameState, at: number): void {
  if (!s.groundPlacements) return;
  s.groundPlacements = s.groundPlacements.filter(group => {
    if (!active(s, group, at)) return false;
    group.cells = livePlacementCells(s, group, at);
    if (group.binding === 'skillUnit' && s.battle?.startedAt === group.battleStartedAt) {
      const unit = s.battle?.skillUnits?.find(g => g.groundPlacementId === group.id);
      if (unit) group.expiresAt = Math.min(group.expiresAt, unit.expiresAt);
    }
    return group.cells.length > 0;
  });
  if (!s.groundPlacements.length) delete s.groundPlacements;
}

/** Only su.range<=0 blocks a new Sage unit (skill.c's BL_SKILL collision rule).
 * Old directional/self-buff saves lack their placement. Report that ambiguity
 * rather than inventing a direction or a field following the current caster.
 */
export function occupiedGroundCells(s: GameState,c: Catalog,at: number,context?: SimulationContext): {cells:GridPoint[];unresolved:boolean} {
  if (s.hp<=0) return {cells:[],unresolved:false};
  const f=frame(s,c,context), result=new Map<string,GridPoint>(); let unresolved=false;
  const add=(points:readonly GridPoint[])=>points.forEach(p=>result.set(`${p.x},${p.y}`,p));
  const groups=(s.groundPlacements??[]).filter(g=>active(s,g,at));
  for(const g of groups) if (g.range === 0) add(livePlacementCells(s, g, at));
  const captured=(id:string|undefined)=>!!id&&groups.some(g=>g.id===id);
  for(const g of s.battle?.groundEffects??[]) {
    if(g.expiresAt<=at||(g.remainingHits??1)<=0||captured(g.groundPlacementId)) continue;
    const source=c.skills[g.skillId]?.sourceName??'', origin=cell(g.position,f.cellOffset);
    const shape=sourceGroundShape(source,origin);
    if(!shape||shape.range>0) continue;
    if(source==='MG_FIREWALL') {unresolved=true;continue;}
    add(shape.cells);
  }
  for(const g of s.battle?.skillUnits??[]) {
    if(g.expiresAt<=at||captured(g.groundPlacementId)) continue;
    const shape=sourceGroundShape(c.skills[g.skillId]?.sourceName??'',cell(g.position,f.cellOffset));
    if(shape?.range===0) add(g.cells.map(p=>cell(p,f.cellOffset)));
  }
  const effects=s.combatEffects;
  const defenses=effects?.defensiveGrounds??[
    ...(effects?.pneumaGround?[{...effects.pneumaGround,kind:'pneumaGround' as const}]:[]),
    ...(effects?.safetyWallGround?[{...effects.safetyWallGround,kind:'safetyWallGround' as const,hits:effects.safetyWallHits}]:[]),
  ];
  for(const g of defenses) if(g.expiresAt>at&&g.sceneKey===classicGroundSceneKey(s)&&
    (g.kind!=='safetyWallGround'||(g.hits??0)>0)&&!captured('groundPlacementId' in g?g.groundPlacementId:undefined))
    add(g.cells.map(p=>({x:Math.floor(p.x+.5+f.cellOffset.x),y:Math.floor(p.y+.5+f.cellOffset.y)})));
  for(const [id,buff] of Object.entries(s.buffs)) {
    if(buff.expiresAt<=at||groups.some(g=>g.skillId===id)) continue;
    const source=c.skills[id]?.sourceName??'';
    if(source==='PF_FOGWALL'||source.startsWith('BA_')||source.startsWith('DC_')) {
      const shape=sourceGroundShape(source,{x:0,y:0});
      if(shape?.range===0) unresolved=true;
    }
  }
  return {cells:[...result.values()],unresolved};
}
