/** Hercules 410b9738 skill.c castend_map AL_WARP and pc.c pc_memo. */
import type { Catalog, GameState } from '../shared/types.js';
import { battleHeroAt, stopHeroMovement } from '../shared/battleSpatial.js';
import { classSkills } from './stats.js';
import { canPaySkillResources, paySkillResources } from './skillResources.js';
import { event, requireRule } from './state.js';
import type { SimulationContext } from './fieldNavigation.js';
import { beginSkillAction, finishSkillAction } from './skillActionClock.js';
import { derivedStats } from './stats.js';

export type WarpPortalDestination = 'memo1' | 'memo2' | 'memo3';
const unlockedMemos = (level: number) => Math.max(0, Math.min(3, level - 1));
function skillState(s: GameState, c: Catalog, at: number) {
  const skill = c.skills.al_warp, level = s.learnedSkills.al_warp ?? 0;
  const map = c.areas.find(area => area.id === s.areaId)?.map;
  const prerequisites = skill?.prerequisitesByClass?.[s.job] ?? skill?.prerequisites ?? [];
  const prerequisitesMet = prerequisites.every(p => (s.learnedSkills[p.skillId] ?? 0) >= p.level);
  const eligible = !!skill && skill.sourceName === 'AL_WARP' && skill.herculesId === 27 &&
    skill.manualUse === 'warpPortal' && skill.implementation === 'supported' &&
    prerequisitesMet && Number.isSafeInteger(level) && level >= 1 && level <= 4 &&
    classSkills(c, s.job).includes(skill.id) && s.status === 'hunting' && !!map &&
    s.fieldHero?.areaId === s.areaId && s.hp > 0 && !s.supportCast && !s.battle?.cast &&
    (s.playerCanActAt ?? 0) <= at;
  return { skill, level, map, eligible };
}
export function warpMemoAvailable(s: GameState, c: Catalog, at: number): boolean {
  const { level, map, eligible } = skillState(s, c, at);
  return !!eligible && level >= 2 && !c.warpMemoBlockedMaps?.includes(map!) &&
    !!s.areaId && !!s.fieldHero;
}
export function warpPortalAvailable(s: GameState, c: Catalog, destination: WarpPortalDestination, at: number): boolean {
  const { skill, level, map, eligible } = skillState(s, c, at);
  if (!eligible || !['memo1', 'memo2', 'memo3'].includes(destination) ||
      c.warpBlockedMaps?.includes(map!)) return false;
  const index = Number(destination.slice(4)) - 1;
  const memo = s.warpMemos?.[index];
  if (index >= unlockedMemos(level) || !memo || c.warpDestinationBlockedMaps?.includes(memo.map)) return false;
  const area = c.areas.find(entry => entry.id === memo.areaId);
  if (!area || area.map !== memo.map) return false;
  return canPaySkillResources(s, c, skill!, level, at);
}
function assertNavigation(context?: SimulationContext) {
  requireRule(!!context?.navigation, 'NAVIGATION_UNAVAILABLE', 'Aguarde o mapa carregar antes de usar Portal.');
  return context!.navigation!;
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
  const nav = assertNavigation(context), { skill, level } = skillState(s, c, at);
  const start = battleHeroAt(s, at);
  let memo: NonNullable<GameState['warpMemos']>[number] | undefined;
  memo = s.warpMemos?.[Number(destination.slice(4)) - 1];
  requireRule(!!memo, 'WARP_UNAVAILABLE', 'Esse ponto ainda não foi memorizado.');
  requireRule(nav.areaIds.includes(memo.areaId), 'NAVIGATION_UNAVAILABLE', 'O mapa memorizado não carregou.');
  const landing = nav.resolveActorPoint(memo.areaId, { x: memo.x, y: memo.y }, false);
  requireRule(landing !== null, 'WARP_DESTINATION_UNAVAILABLE', 'A posição memorizada não está mais passável.');
  requireRule(paySkillResources(s, c, skill!, level, at), 'SP_REQUIRED', 'Tenha SP e uma Gema Azul para abrir Portal.');
  beginSkillAction(s, at, skill!.castTimeMs?.[level - 1] ?? 1000, derivedStats(s, c).attackMotionMs);
  finishSkillAction(s, at, skill!.castTimeMs?.[level - 1] ?? 1000);
  s.battle = null; s.pendingAreaId = null; s.nextEncounterAt = at + 1; s.fieldPopulation = undefined;
  const hero = s.fieldHero!; stopHeroMovement(hero, landing, at); delete hero.targetId; delete hero.moveBlockedUntil;
  hero.areaId = memo.areaId; hero.phase = 'seeking'; s.areaId = memo.areaId; s.status = 'hunting';
  event(s, at, 'warp', `Portal: chegada a ${c.areas.find(area => area.id === memo.areaId)?.name ?? memo.map}.`,
    undefined, 'player', { skillId: skill!.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id,
      actionId: `warp-${s.id}-${at}-${s.nextEventId}`, actorAction: 'none', areaId: memo.areaId,
      actionSourcePosition: { ...start }, movementDestination: { ...landing } });
}
