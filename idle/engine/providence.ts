import type { Catalog, GameState, Skill } from '../shared/types.js';
import { classSkills } from './stats.js';
import { classicBuffActive, cancelClassicBuff } from './classicBuffs.js';
import { canPaySkillResources, runSkillResourcePhases } from './skillResources.js';
import { activePlayerStatus } from './playerStatuses.js';
import { event, random } from './state.js';
import { startOwnCast } from './ownCast.js';
import { resolveOwnSkillAction } from './skillActionClock.js';

const SOURCE = 'CR_PROVIDENCE';

export function providenceCanStart(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  at: number,
): boolean {
  return skill.sourceName === SOURCE && skill.implementation === 'supported' &&
    skill.manualUse === 'activate' && Number.isSafeInteger(level) &&
    level >= 1 && level <= skill.maxLevel &&
    (s.learnedSkills[skill.id] ?? 0) >= level && classSkills(c, s.job).includes(skill.id) &&
    ['town', 'hunting', 'challenge'].includes(s.status) && s.hp > 0 &&
    !s.supportCast && !s.battle?.cast && (s.playerCanActAt ?? 0) <= at &&
    !activePlayerStatus(s, 'SC_SILENCE', at) &&
    !classicBuffActive(s, c, SOURCE, at) &&
    canPaySkillResources(s, c, skill, level, at);
}

export function startProvidenceCast(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  at: number,
): boolean {
  if (!providenceCanStart(s, c, skill, level, at)) return false;
  startOwnCast(s, c, skill, level, at);
  return true;
}

export function resolveProvidenceCast(s: GameState, c: Catalog, at: number): boolean {
  const cast = s.supportCast;
  const skill = cast && c.skills[cast.skillId];
  if (!cast || !skill || skill.sourceName !== SOURCE || cast.endsAt > at) return false;
  delete s.supportCast;
  return resolveOwnSkillAction(s, c, cast, at, () => {
    if (skill.implementation !== 'supported' || s.hp <= 0 ||
        !Number.isSafeInteger(cast.level) || cast.level < 1 ||
        cast.level > skill.maxLevel || (s.learnedSkills[skill.id] ?? 0) < cast.level ||
        !classSkills(c, s.job).includes(skill.id)) return false;

    const payment = runSkillResourcePhases(s, c, skill, cast.level, at, () => {
      const duration = skill.statusDurationMs?.[cast.level - 1] ?? skill.durationMs ?? 0;
      if (!Number.isFinite(duration) || duration <= 0) return false;
      cancelClassicBuff(s, c, SOURCE);
      (s.combatEffects ??= {}).buffLevels ??= {};
      s.combatEffects.buffLevels[skill.id] = cast.level;
      s.buffs[skill.id] = { startsAt: at, expiresAt: at + duration, effects: {} };
      random(s); // Hercules sc_start performs its guaranteed-rate status roll.
      event(s, at, 'skill', skill.name, undefined, 'player', {
        skillId: skill.id, skillLevel: cast.level, statusName: skill.statusEffect,
        sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId,
        actorAction: 'none', castMs: 0,
      });
      event(s, at, 'status-start',
        `Providência: -${5 * cast.level}% contra demônios e dano Sagrado.`,
        undefined, 'player', {
          skillId: skill.id, skillLevel: cast.level, statusName: skill.statusEffect,
          sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId,
        });
      return true;
    });
    return payment.paid && payment.result;
  });
}
