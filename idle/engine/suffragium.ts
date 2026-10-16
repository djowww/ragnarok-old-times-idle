import type { Catalog, GameState, Skill } from '../shared/types.js';
import { classSkills } from './stats.js';
import { classicBuffActive, cancelClassicBuff } from './classicBuffs.js';
import { canPaySkillResources, runSkillResourcePhases } from './skillResources.js';
import { activePlayerStatus } from './playerStatuses.js';
import { event, random } from './state.js';
import { startOwnCast } from './ownCast.js';
import { resolveOwnSkillAction } from './skillActionClock.js';

const SOURCE = 'PR_SUFFRAGIUM';

export function suffragiumCanStart(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  return skill.sourceName === SOURCE && skill.implementation === 'supported' &&
    skill.manualUse === 'activate' && Number.isSafeInteger(level) && level >= 1 && level <= skill.maxLevel &&
    (s.learnedSkills[skill.id] ?? 0) >= level && classSkills(c, s.job).includes(skill.id) &&
    ['town', 'hunting', 'challenge'].includes(s.status) && s.hp > 0 &&
    !s.supportCast && !s.battle?.cast && (s.playerCanActAt ?? 0) <= at &&
    !activePlayerStatus(s, 'SC_SILENCE', at) && !classicBuffActive(s, c, SOURCE, at) &&
    canPaySkillResources(s, c, skill, level, at);
}

export function startSuffragiumCast(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  if (!suffragiumCanStart(s, c, skill, level, at)) return false;
  startOwnCast(s, c, skill, level, at);
  return true;
}

export function resolveSuffragiumCast(s: GameState, c: Catalog, at: number): boolean {
  const cast = s.supportCast;
  const skill = cast && c.skills[cast.skillId];
  if (!cast || !skill || skill.sourceName !== SOURCE || cast.endsAt > at) return false;
  delete s.supportCast;
  return resolveOwnSkillAction(s, c, cast, at, () => {
    if (skill.implementation !== 'supported' || s.hp <= 0 ||
        !Number.isSafeInteger(cast.level) || cast.level < 1 || cast.level > skill.maxLevel || (s.learnedSkills[skill.id] ?? 0) < cast.level ||
        !classSkills(c, s.job).includes(skill.id)) return false;
    const payment = runSkillResourcePhases(s, c, skill, cast.level, at, () => {
      const duration = skill.statusDurationMs?.[cast.level - 1] ?? skill.durationMs ?? 0;
      if (!Number.isFinite(duration) || duration <= 0) return false;
      cancelClassicBuff(s, c, SOURCE);
      s.buffs[skill.id] = { startsAt: at, expiresAt: at + duration,
        effects: { castReductionPct: Math.min(100, 15 * cast.level) } };
      random(s); // Hercules status_start performs a guaranteed-rate status roll.
      event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id,
        skillLevel: cast.level, statusName: skill.statusEffect, sourceActorId: s.id,
        targetActorId: s.id, actionId: cast.actionId, actorAction: 'none', castMs: 0 });
      event(s, at, 'status-start', `${skill.name}: -${15 * cast.level}% de conjuração.`, undefined,
        'player', { skillId: skill.id, skillLevel: cast.level, statusName: skill.statusEffect,
          sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId });
      return true;
    });
    return payment.paid && payment.result;
  });
}
