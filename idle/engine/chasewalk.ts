/** Hercules410b9738: SC_CHASEWALK and its independent NoSave STR child. */
import type { Catalog, GameState, Skill } from '../shared/types.js';
import { classicBuffActive, cancelClassicBuff } from './classicBuffs.js';
import { classSkills, inventoryLoad } from './stats.js';
import { activePlayerStatus } from './playerStatuses.js';
import { canPaySkillResources, paySkillResources } from './skillResources.js';
import { event, random } from './state.js';
import { startOwnCast } from './ownCast.js';
import { resolveOwnSkillAction } from './skillActionClock.js';

export const CHASEWALK_STRENGTH_ID = 'chasewalk_strength';
export function chasewalkCanStart(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  const active = classicBuffActive(s, c, 'ST_CHASEWALK', at), load = inventoryLoad(s, c);
  return skill.sourceName === 'ST_CHASEWALK' && skill.implementation === 'supported' &&
    Number.isSafeInteger(level) && level > 0 && level <= 5 && s.learnedSkills[skill.id] === level &&
    classSkills(c, s.job).includes(skill.id) && ['town', 'hunting', 'challenge'].includes(s.status) && s.hp > 0 &&
    !s.supportCast && !s.battle?.cast && (s.playerCanActAt ?? 0) <= at && !activePlayerStatus(s, 'SC_SILENCE', at) &&
    !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'NV_TRICKDEAD']
      .some(source => classicBuffActive(s, c, source, at)) &&
    (active || load.weight * 10 < load.maxWeight * 9 && canPaySkillResources(s, c, skill, level, at));
}
export function startChasewalkCast(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  if (!chasewalkCanStart(s, c, skill, level, at)) return false;
  const active = classicBuffActive(s, c, 'ST_CHASEWALK', at);
  // unit.c:1706-1709 explicitly forces immediate cast-end for an active toggle.
  startOwnCast(s, c, active ? { ...skill, castTimeMs: [0, 0, 0, 0, 0] } : skill, level, at);
  if (active) resolveChasewalkCast(s, c, at);
  return true;
}
export function resolveChasewalkCast(s: GameState, c: Catalog, at: number): boolean {
  const cast = s.supportCast;
  if (!cast || cast.endsAt > at || c.skills[cast.skillId]?.sourceName !== 'ST_CHASEWALK') return false;
  delete s.supportCast;
  return resolveOwnSkillAction(s, c, cast, at, () => {
  const skill = c.skills[cast.skillId];
  if (s.hp <= 0 || skill.implementation !== 'supported') return false;
  const active = classicBuffActive(s, c, 'ST_CHASEWALK', at);
  if (active) cancelClassicBuff(s, c, 'ST_CHASEWALK');
  else {
    if (!paySkillResources(s, c, skill, cast.level, at)) {
      event(s, at, 'cast-failed', 'SP insuficiente para Furtividade.', undefined, 'player', { skillId: skill.id, actionId: cast.actionId });
      return false;
    }
    s.buffs[skill.id] = { startsAt: at, expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    const runtime = (s.combatEffects ??= {});
    (runtime.buffDrainAt ??= {})[skill.id] = at + 10000;
    (runtime.buffLevels ??= {})[skill.id] = cast.level;
    random(s); // Guaranteed source status application still draws a status roll.
  }
  event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: cast.level,
    sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none' });
  event(s, at, active ? 'status-end' : 'status-start', active ? 'Furtividade desativada.' : 'Furtividade ativa.',
    undefined, 'player', { skillId: skill.id, skillLevel: cast.level, statusName: 'SC_CHASEWALK' });
  return true;
  });
}
export function tickChasewalk(s: GameState, c: Catalog, at: number): void {
  const id = Object.keys(s.buffs).find(id => c.skills[id]?.sourceName === 'ST_CHASEWALK');
  if (s.hp <= 0) { cancelClassicBuff(s, c, 'ST_CHASEWALK'); delete s.buffs[CHASEWALK_STRENGTH_ID]; return; }
  if (!id) return;
  const skill = c.skills[id], runtime = (s.combatEffects ??= {}), timers = (runtime.buffDrainAt ??= {});
  if (skill.implementation !== 'supported') { cancelClassicBuff(s, c, 'ST_CHASEWALK'); return; }
  const level = Math.max(1, Math.min(5, runtime.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1));
  timers[id] ??= (s.buffs[id].startsAt ?? at) + 10000;
  while (timers[id] <= at) {
    const tick = timers[id], amount = 10 + 2 * level;
    if (s.sp < amount) {
      cancelClassicBuff(s, c, 'ST_CHASEWALK');
      event(s, tick, 'status-end', 'Furtividade encerrada: SP insuficiente.', undefined, 'player', { skillId: id, statusName: 'SC_CHASEWALK' });
      break;
    }
    s.sp -= amount;
    if (!s.buffs[CHASEWALK_STRENGTH_ID] || s.buffs[CHASEWALK_STRENGTH_ID].expiresAt <= tick) {
      s.buffs[CHASEWALK_STRENGTH_ID] = { startsAt: tick, expiresAt: tick + 30000, effects: { str: 2 ** (level - 1) } };
      random(s);
      event(s, tick, 'status-start', 'Força da Furtividade.', undefined, 'player', { skillId: id, skillLevel: level, statusName: 'SC_CHASEWALK2' });
    }
    timers[id] = tick + 10000;
  }
}
