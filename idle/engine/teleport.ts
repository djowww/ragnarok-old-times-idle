/** Hercules 410b9738 skill.c8488/12289, pc.c6200; GPL-3.0-or-later. */
import type { Catalog, GameState } from '../shared/types.js';
import { battleHeroAt, enemyPositionAt, stopHeroMovement, stopEnemyMovement } from '../shared/battleSpatial.js';
import { herculesCellPassable } from '../shared/fieldNavigation.js';
import { classSkills, inventoryLoad } from './stats.js';
import { canPaySkillResources, paySkillResources } from './skillResources.js';
import { classicBuffActive, cancelClassicBuff, clearClassicGrounds } from './classicBuffs.js';
import { clearSageField } from './sageFields.js';
import { clearBladeStop } from './bladeStop.js';
import { clearCloseConfine } from './rgCloseConfine.js';
import { event, random, requireRule } from './state.js';
import type { SimulationContext } from './fieldNavigation.js';

export type TeleportDestination = 'random' | 'save';

/** Shared UI predicate; the server separately requires authoritative navigation. */
export function teleportAvailable(s: GameState, c: Catalog, destination: TeleportDestination, at: number): boolean {
  const skill = c.skills.al_teleport, level = s.learnedSkills.al_teleport ?? 0;
  const map = c.areas.find(area => area.id === s.areaId)?.map;
  if (!skill || skill.sourceName !== 'AL_TELEPORT' || skill.herculesId !== 26 || skill.manualUse !== 'teleport' ||
      skill.implementation !== 'supported' || !Number.isSafeInteger(level) || level < 1 || level > 2 ||
      !['random', 'save'].includes(destination) || destination === 'save' && level < 2 ||
      !classSkills(c, s.job).includes(skill.id) || (s.learnedSkills.al_ruwach ?? 0) < 1 ||
      s.status !== 'hunting' || !map || s.fieldHero?.areaId !== s.areaId || s.hp <= 0 ||
      !Array.isArray(c.teleportBlockedMaps) || c.teleportBlockedMaps.includes(map) ||
      s.supportCast || s.battle?.cast || (s.battle?.playerActionReadyAt ?? 0) > at ||
      s.combatEffects?.bladeStopLink ||
      Object.entries(s.playerStatuses ?? {}).some(([name, status]) =>
        ['SC_SILENCE', 'SC_STASIS', 'SC_KG_KAGEHUMI'].includes(name) && status.startsAt <= at && status.expiresAt > at) ||
      ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'ST_CHASEWALK', 'SC_INVISIBILITY', 'NV_TRICKDEAD', 'KN_AUTOCOUNTER']
        .some(source => classicBuffActive(s, c, source, at))) return false;
  const load = inventoryLoad(s, c);
  return load.weight * 10 < load.maxWeight * 9 && canPaySkillResources(s, c, skill, level, at);
}

/** No client coordinates: destination is sampled against the server's GAT mask. */
export function applyTeleport(s: GameState, c: Catalog, destination: TeleportDestination, at: number,
  context?: SimulationContext): void {
  requireRule(teleportAvailable(s, c, destination, at), 'TELEPORT_UNAVAILABLE',
    'Esteja na caça, livre para agir e com SP suficiente para usar Teleporte.');
  const navigation = context?.navigation, areaId = s.areaId!;
  requireRule(navigation && navigation.areaIds.includes(areaId), 'NAVIGATION_UNAVAILABLE',
    'Aguarde o mapa carregar antes de usar Teleporte.');
  const area = navigation.area(areaId), { grid, component } = area;
  requireRule(grid.width > 2 && grid.height > 2 && component.some(byte => byte !== 0), 'NAVIGATION_UNAVAILABLE',
    'Não há células de destino disponíveis neste mapa.');
  const skill = c.skills.al_teleport, level = s.learnedSkills[skill.id];
  const start = battleHeroAt(s, at);
  requireRule(navigation.isWalkableBattlePoint(areaId, start), 'NAVIGATION_UNAVAILABLE',
    'A posição atual não está em uma célula passável.');
  requireRule(paySkillResources(s, c, skill, level, at), 'SP_REQUIRED', 'Tenha SP suficiente para usar Teleporte.');
  let landing: { x: number; y: number } | undefined;
  if (destination === 'random') {
    // Source uses paired draws in interior cells with a bounded search. Idle
    // additionally keeps the current population's connected component.
    for (let attempt = 0; attempt < 1000; attempt++) {
      const x = 1 + Math.floor(random(s) * (grid.width - 2)), y = 1 + Math.floor(random(s) * (grid.height - 2));
      const id = y * grid.width + x;
      if (herculesCellPassable(grid, { x, y }) && (component[id >> 3] & (1 << (id & 7)))) {
        landing = navigation.toBattlePoint(areaId, { x: x + .5, y: y + .5 }); break;
      }
    }
    if (!landing) {
      event(s, at, 'cast-failed', 'Teleporte não encontrou uma célula de destino.', undefined, 'player',
        { skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
      return;
    }
  }
  clearBladeStop(s, at); clearCloseConfine(s, at);
  cancelClassicBuff(s, c, 'AS_CLOAKING');
  clearClassicGrounds(s, c); clearSageField(s);
  for (const enemy of new Set([...(s.battle?.enemies ?? []), ...(s.fieldPopulation?.enemies ?? [])])) {
    stopEnemyMovement(enemy, enemyPositionAt(enemy, at), at);
    enemy.engaged = false; enemy.hostile = false;
    delete enemy.approachPausedAt;
    if (enemy.npcCombat) { delete enemy.npcCombat.cast; delete enemy.npcCombat.lastReceivedSkillId; }
    // These owner-bound effects lose their active unit/encounter on warp.
    for (const name of ['SC_SPLASHER', 'SC_SPIDERWEB']) if (enemy.statuses) delete enemy.statuses[name];
  }
  s.battle = null; s.pendingAreaId = null; s.nextEncounterAt = at + 1;
  const hero = s.fieldHero!;
  stopHeroMovement(hero, landing ?? start, at);
  delete hero.targetId; delete hero.moveBlockedUntil;
  hero.phase = destination === 'random' ? 'seeking' : 'waiting';
  if (destination === 'save') {
    s.status = 'town'; s.areaId = null; s.autoResume = false; s.restUntil = 0; delete s.restMode;
  }
  event(s, at, 'teleport', destination === 'save' ? 'Teleporte: retorno a Prontera.' : 'Teleporte: nova posição no mapa.',
    undefined, 'player', { skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id,
      actionId: `teleport-${s.id}-${at}-${s.nextEventId}`, actorAction: 'none', areaId,
      actionSourcePosition: { ...start }, ...(landing && { movementDestination: { ...landing } }) });
}
