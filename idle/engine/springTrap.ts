import type { Catalog, GameState, Skill } from '../shared/types.js';
import { battleHeroAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { classSkills, derivedStats } from './stats.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classicBuffActive } from './classicBuffs.js';
import { overweightForCombat } from './itemCapacity.js';
import { canPaySkillResources, paySkillResources } from './skillResources.js';
import { beginSkillAction, finishSkillAction } from './skillActionClock.js';
import { event, requireRule } from './state.js';
import { isHunterTrapSkill, hunterTrapSpec, type HunterTrapSkill } from './hunterTraps.js';
import { isFalconEquipped } from './falcon.js';

function nearestSpringableTrap(s: GameState, c: Catalog, skill: Skill, level: number, at: number) {
  if (!s.battle) return undefined;
  const hero = battleHeroAt(s, at), range = skill.range?.[level - 1] ?? 0;
  return (s.battle.traps ?? []).filter(trap => {
    const sourceName = c.skills[trap.skillId]?.sourceName ?? '';
    return isHunterTrapSkill(sourceName) && trap.placedAt <= at && trap.expiresAt > at &&
      trap.triggeredAt === undefined && !(sourceName === 'HT_ANKLESNARE' && trap.capturedEnemyId) &&
      playerBattleDistance(hero, trap.position) <= range;
  }).sort((a, b) => playerBattleDistance(hero, a.position) - playerBattleDistance(hero, b.position) ||
    a.placedAt - b.placedAt || a.id.localeCompare(b.id))[0];
}

export function springTrapCanStart(s: GameState, c: Catalog, skill: Skill | undefined, level: number, at: number) {
  return !!skill && skill.sourceName === 'HT_SPRINGTRAP' && skill.manualUse === 'springTrap' &&
    skill.implementation === 'supported' && Number.isSafeInteger(level) && level >= 1 && level <= skill.maxLevel &&
    s.learnedSkills[skill.id] === level && classSkills(c, s.job).includes(skill.id) &&
    (s.status === 'hunting' || s.status === 'challenge') && s.hp > 0 && isFalconEquipped(s, c) &&
    !!s.battle && !s.battle.cast && !s.supportCast && (s.playerCanActAt ?? 0) <= at &&
    (s.skillReadyAt[skill.id] ?? 0) <= at && !activePlayerStatus(s, 'SC_SILENCE', at) &&
    !overweightForCombat(s, c) && !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING',
      'KN_AUTOCOUNTER', 'NV_TRICKDEAD', 'ST_CHASEWALK'].some(source => classicBuffActive(s, c, source, at)) &&
    canPaySkillResources(s, c, skill, level, at) && !!nearestSpringableTrap(s, c, skill, level, at);
}

export function springHunterTrap(s: GameState, c: Catalog, skill: Skill | undefined, level: number, at: number) {
  requireRule(springTrapCanStart(s, c, skill, level, at), 'TRAP_UNAVAILABLE',
    'Aprenda Spring Trap, equipe seu falcão e tenha SP suficiente e uma armadilha ativa em alcance.');
  const trap = nearestSpringableTrap(s, c, skill!, level, at)!;
  const hero = battleHeroAt(s, at);
  requireRule(paySkillResources(s, c, skill!, level, at), 'SP_REQUIRED', 'Tenha SP suficiente para usar Spring Trap.');
  const motion = derivedStats(s, c).attackMotionMs;
  beginSkillAction(s, at, 0, motion);
  finishSkillAction(s, at, skill!.afterCastDelayMs?.[level - 1] ?? 0);

  // Hercules marks a sprung trap as used for 1.5 seconds; it cannot trigger or
  // return a reagent during that visual cleanup window.
  trap.triggeredAt = at;
  trap.expiresAt = at + hunterTrapSpec(c.skills[trap.skillId]!.sourceName as HunterTrapSkill, trap.level).usedLifetimeMs;
  s.skillReadyAt[skill!.id] = at + Math.max(0, skill!.cooldownMs);
  s.battle!.supportNeedsOffense = true;
  const actionId = `spring-trap-${s.id}-${at}-${s.nextEventId}`;
  event(s, at, 'skill', 'Spring Trap desarmou uma armadilha.', undefined, 'player', {
    skillId: skill!.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id, actionId, actorAction: 'none',
    actionMotionMs: 0, castMs: 0, actionSourcePosition: hero, movementDestination: hero, areaId: s.areaId ?? undefined,
  });
}
