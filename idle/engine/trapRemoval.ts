import type { Catalog, GameState, Skill } from '../shared/types.js';
import { battleHeroAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { classSkills, derivedStats } from './stats.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classicBuffActive } from './classicBuffs.js';
import { overweightForCombat } from './itemCapacity.js';
import { canPaySkillResources, paySkillResources } from './skillResources.js';
import { beginSkillAction, finishSkillAction } from './skillActionClock.js';
import { event, requireRule } from './state.js';
import { pickupItem } from './lootPickup.js';
import { removeGroundPlacement } from './groundUnitOccupancy.js';
import { isHunterTrapSkill } from './hunterTraps.js';
const BOOBY_TRAP = 1065;
function nearestOwnTrap(s: GameState, c: Catalog, at: number) {
  if (!s.battle) return undefined;
  const hero = battleHeroAt(s, at);
  return (s.battle.traps ?? []).filter(trap => {
    const sourceName = c.skills[trap.skillId]?.sourceName ?? '';
    return isHunterTrapSkill(sourceName) && trap.placedAt <= at && trap.expiresAt > at &&
      playerBattleDistance(hero, trap.position) <= 2;
  }).sort((a, b) => playerBattleDistance(hero, a.position) - playerBattleDistance(hero, b.position) ||
    a.placedAt - b.placedAt || a.id.localeCompare(b.id))[0];
}
export function removeTrapCanStart(s: GameState, c: Catalog, skill: Skill | undefined, level: number, at: number) {
  return !!skill && skill.sourceName === 'HT_REMOVETRAP' && skill.manualUse === 'removeTrap' &&
    skill.implementation === 'supported' && level === 1 && s.learnedSkills[skill.id] === 1 &&
    classSkills(c, s.job).includes(skill.id) && (s.status === 'hunting' || s.status === 'challenge') &&
    s.hp > 0 && !!s.battle && !s.battle.cast && !s.supportCast && (s.playerCanActAt ?? 0) <= at &&
    (s.skillReadyAt[skill.id] ?? 0) <= at && !activePlayerStatus(s, 'SC_SILENCE', at) &&
    !overweightForCombat(s, c) &&
    !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'NV_TRICKDEAD', 'ST_CHASEWALK']
      .some(source => classicBuffActive(s, c, source, at)) &&
    canPaySkillResources(s, c, skill, 1, at) && !!nearestOwnTrap(s, c, at);
}
export function removeHunterTrap(s: GameState, c: Catalog, skill: Skill, level: number, at: number) {
  requireRule(removeTrapCanStart(s, c, skill, level, at), 'TRAP_UNAVAILABLE',
    'Aprenda Remover Armadilha, tenha 5 SP e uma armadilha propria ativa a ate duas casas.');
  const trap = nearestOwnTrap(s, c, at)!;
  const hero = battleHeroAt(s, at);
  requireRule(paySkillResources(s, c, skill, 1, at), 'SP_REQUIRED', 'Tenha 5 SP para remover a armadilha.');
  const motion = derivedStats(s, c).attackMotionMs;
  beginSkillAction(s, at, 0, motion);
  finishSkillAction(s, at, skill.afterCastDelayMs?.[0] ?? 0);
  if (trap.capturedEnemyId) {
    const enemy = s.battle!.enemies?.find(candidate => candidate.id === trap.capturedEnemyId);
    if (enemy?.statuses?.SC_ANKLESNARE) {
      delete enemy.statuses.SC_ANKLESNARE;
      if (enemy.approachPausedAt !== undefined) {
        const pausedMs = Math.max(0, at - enemy.approachPausedAt);
        enemy.startedAt += pausedMs;
        enemy.arrivedAt += pausedMs;
        delete enemy.approachPausedAt;
      }
    }
  }
  if (trap.triggeredAt === undefined && !trap.capturedEnemyId && c.items[BOOBY_TRAP]) {
    pickupItem(s, c, BOOBY_TRAP, 1, at, { source: 'trap', areaId: s.areaId ?? undefined, position: hero }, false);
  }
  if (trap.groundPlacementId) removeGroundPlacement(s, trap.groundPlacementId);
  s.battle!.traps = s.battle!.traps?.filter(candidate => candidate !== trap);
  s.skillReadyAt[skill.id] = at + Math.max(0, skill.cooldownMs);
  s.battle!.supportNeedsOffense = true;
  const actionId = 'remove-trap-' + s.id + '-' + at + '-' + s.nextEventId;
  event(s, at, 'skill', skill.name, undefined, 'player', {
    skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id, actionId,
    actorAction: 'none', actionMotionMs: 0, castMs: 0,
    actionSourcePosition: hero, movementDestination: hero, areaId: s.areaId ?? undefined,
  });
}
