/** Hercules 410b9738 skill.c castend_map AL_WARP and pc.c pc_memo. */
import type { Catalog, GameState } from '../shared/types.js';
import { battleHeroAt, stopHeroMovement } from '../shared/battleSpatial.js';
import { classSkills } from './stats.js';
import { classicBuffActive } from './classicBuffs.js';
import { overweightForCombat } from './itemCapacity.js';
import { canPaySkillResources, paySkillResources } from './skillResources.js';
import { event, requireRule } from './state.js';
import type { SimulationContext } from './fieldNavigation.js';
import { startOwnCast } from './ownCast.js';
import { resolveOwnSkillAction } from './skillActionClock.js';

export type WarpPortalDestination = 'memo1' | 'memo2' | 'memo3';
const unlockedMemos = (level: number) => Math.max(0, Math.min(3, level - 1));
function restrictedActionState(s: GameState, c: Catalog, at: number) {
  const blockedStatus = Object.entries(s.playerStatuses ?? {}).some(([name, status]) =>
    ['SC_SILENCE', 'SC_STASIS', 'SC_KG_KAGEHUMI', 'SC_OBLIVIONCURSE'].includes(name) &&
    (status.startsAt ?? 0) <= at && status.expiresAt > at);
  const blockedPosture = ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'ST_CHASEWALK',
    'SC_INVISIBILITY', 'NV_TRICKDEAD', 'KN_AUTOCOUNTER']
    .some(source => classicBuffActive(s, c, source, at));
  return blockedStatus || blockedPosture || !!s.combatEffects?.bladeStopLink ||
    overweightForCombat(s, c) ||
    (s.carryReturnRequestedAt !== undefined && s.carryReturnRequestedAt <= at);
}
function skillState(s: GameState, c: Catalog, at: number, starting = true) {
  const skill = c.skills.al_warp, level = s.learnedSkills.al_warp ?? 0;
  const map = c.areas.find(area => area.id === s.areaId)?.map;
  const prerequisites = skill?.prerequisitesByClass?.[s.job] ?? skill?.prerequisites ?? [];
  const prerequisitesMet = prerequisites.every(p => (s.learnedSkills[p.skillId] ?? 0) >= p.level);
  const eligible = !!skill && skill.sourceName === 'AL_WARP' && skill.herculesId === 27 &&
    skill.manualUse === 'warpPortal' && skill.implementation === 'supported' &&
    prerequisitesMet && Number.isSafeInteger(level) && level >= 1 && level <= 4 &&
    classSkills(c, s.job).includes(skill.id) && s.status === 'hunting' && !!map &&
    s.fieldHero?.areaId === s.areaId && s.hp > 0 &&
    (!starting || (!s.supportCast && !s.battle?.cast && (s.playerCanActAt ?? 0) <= at)) &&
    (s.skillReadyAt[skill.id] ?? 0) <= at && !restrictedActionState(s, c, at);
  return { skill, level, map, eligible };
}
export function warpMemoAvailable(s: GameState, c: Catalog, at: number): boolean {
  const { level, map, eligible } = skillState(s, c, at);
  return !!eligible && level >= 2 && !c.warpMemoBlockedMaps?.includes(map!) &&
    !!s.areaId && !!s.fieldHero;
}
function validPortalDestination(s: GameState, c: Catalog, destination: WarpPortalDestination,
  level: number, map?: string) {
  if (!['memo1', 'memo2', 'memo3'].includes(destination) || !map ||
      c.warpBlockedMaps?.includes(map)) return undefined;
  const index = Number(destination.slice(4)) - 1;
  const memo = s.warpMemos?.[index];
  if (index >= unlockedMemos(level) || !memo || c.warpDestinationBlockedMaps?.includes(memo.map))
    return undefined;
  const area = c.areas.find(entry => entry.id === memo.areaId);
  return area?.map === memo.map && s.baseLevel >= area.minLevel ? memo : undefined;
}
export function warpPortalAvailable(s: GameState, c: Catalog, destination: WarpPortalDestination, at: number): boolean {
  const { skill, level, map, eligible } = skillState(s, c, at);
  return !!eligible && !!validPortalDestination(s, c, destination, level, map) &&
    canPaySkillResources(s, c, skill!, level, at);
}
function assertNavigation(context?: SimulationContext) {
  requireRule(!!context?.navigation, 'NAVIGATION_UNAVAILABLE', 'Aguarde o mapa carregar antes de usar Portal.');
  return context!.navigation!;
}
function resolvePortalDestination(s: GameState, c: Catalog, destination: WarpPortalDestination,
  level: number, map: string | undefined, context?: SimulationContext) {
  const nav = assertNavigation(context);
  const memo = validPortalDestination(s, c, destination, level, map);
  requireRule(!!memo, 'WARP_UNAVAILABLE', 'Esse ponto de Portal não está disponível ou o mapa bloqueia a habilidade.');
  requireRule(nav.areaIds.includes(memo.areaId), 'NAVIGATION_UNAVAILABLE', 'O mapa memorizado não carregou.');
  const landing = nav.resolveActorPoint(memo.areaId, { x: memo.x, y: memo.y }, false);
  requireRule(landing !== null, 'WARP_DESTINATION_UNAVAILABLE', 'A posição memorizada não está mais passável.');
  return { nav, memo, landing };
}
export function applyWarpMemo(s: GameState, c: Catalog, at: number, context?: SimulationContext): void {
  requireRule(warpMemoAvailable(s, c, at), 'WARP_MEMO_UNAVAILABLE', 'Aprenda Portal nível 2 e esteja em um mapa permitido.');
  const nav = assertNavigation(context), areaId = s.areaId!, area = nav.area(areaId), map = area.map;
  const areaName = c.areas.find(entry => entry.id === areaId)?.name ?? map;
  const point = battleHeroAt(s, at);
  requireRule(nav.isWalkableBattlePoint(areaId, point) && !!nav.resolveActorPoint(areaId, point, false),
    'WARP_MEMO_UNAVAILABLE', 'Memorize uma posição passável da caça.');
  const level = s.learnedSkills.al_warp, max = unlockedMemos(level);
  const memo = { areaId, map, x: point.x, y: point.y };
  const previous = s.warpMemos ?? [];
  s.warpMemos = [memo, ...previous.filter(entry => entry.map !== map)].slice(0, max);
  event(s, at, 'warp', `Ponto memorizado: ${areaName}.`, undefined, 'player', { skillId: 'al_warp', skillLevel: level, areaId });
}
export function applyWarpPortal(s: GameState, c: Catalog, destination: WarpPortalDestination, at: number,
  context?: SimulationContext): void {
  requireRule(warpPortalAvailable(s, c, destination, at), 'WARP_UNAVAILABLE', 'Este ponto de Portal não está disponível ou o mapa bloqueia a habilidade.');
  const { skill, level, map } = skillState(s, c, at);
  // Validate the destination at cast begin; the cast-end resolver rechecks map flags and passability.
  resolvePortalDestination(s, c, destination, level, map, context);
  startOwnCast(s, c, skill!, level, at);
  s.supportCast!.warpDestination = destination;
}
export function resolveWarpPortalCast(s: GameState, c: Catalog, at: number,
  context?: SimulationContext): boolean {
  const cast = s.supportCast, skill = cast && c.skills[cast.skillId];
  const destination = cast?.warpDestination;
  if (!cast || !skill || skill.sourceName !== 'AL_WARP' || !destination || cast.endsAt > at) return false;
  delete s.supportCast;
  return resolveOwnSkillAction(s, c, cast, at, () => {
    const { level, map, eligible } = skillState(s, c, at, false);
    if (!eligible || (s.learnedSkills[skill.id] ?? 0) < cast.level || cast.level !== level ||
        !classSkills(c, s.job).includes(skill.id)) {
      event(s, at, 'cast-failed', 'A conjuração de Portal foi interrompida.', undefined, 'player',
        { skillId: skill.id, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
          actionId: cast.actionId, actorAction: 'none' });
      return false;
    }
    let resolved: ReturnType<typeof resolvePortalDestination>;
    try {
      resolved = resolvePortalDestination(s, c, destination, cast.level, map, context);
    } catch {
      event(s, at, 'cast-failed', 'O destino memorizado não está mais disponível.', undefined, 'player',
        { skillId: skill.id, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
          actionId: cast.actionId, actorAction: 'none' });
      return false;
    }
    if (!paySkillResources(s, c, skill, cast.level, at)) {
      event(s, at, 'cast-failed', 'SP ou Gema Azul indisponível ao concluir a conjuração.', undefined, 'player',
        { skillId: skill.id, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
          actionId: cast.actionId, actorAction: 'none' });
      return false;
    }
    const start = battleHeroAt(s, at), { memo, landing } = resolved;
    s.battle = null; s.pendingAreaId = null; s.nextEncounterAt = at + 1; s.fieldPopulation = undefined;
    const hero = s.fieldHero!; stopHeroMovement(hero, landing, at); delete hero.targetId; delete hero.moveBlockedUntil;
    hero.areaId = memo.areaId; hero.phase = 'seeking'; s.areaId = memo.areaId; s.status = 'hunting';
    s.skillReadyAt[skill.id] = at + Math.max(0, skill.cooldownMs);
    event(s, at, 'warp', `Portal: chegada a ${c.areas.find(area => area.id === memo.areaId)?.name ?? memo.map}.`,
      undefined, 'player', { skillId: skill.id, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
        actionId: cast.actionId, actorAction: 'none', areaId: memo.areaId,
        actionSourcePosition: { ...start }, movementDestination: { ...landing } });
    return true;
  });
}
