/** Source skill.c15613/17019/12470: begin/end validation and replacement phases. */
import type { Catalog, GameState, Skill } from '../shared/types.js';
import { battleHeroAt } from '../shared/battleSpatial.js';
import { classicCastTime } from './classic.js';
import { classicBuffActive, classicGroundSceneKey } from './classicBuffs.js';
import { canBeginSkillResources, runSkillResourcePhases } from './skillResources.js';
import { classSkills, derivedStats, inventoryLoad } from './stats.js';
import { activePlayerStatus } from './playerStatuses.js';
import { startOwnCast } from './ownCast.js';
import { memorizeCastStart } from './sageCasting.js';
import { event } from './state.js';
import { placeSageField, sageFieldIsActive, sageFieldSource } from './sageFields.js';
import type { SimulationContext } from './fieldNavigation.js';
import type { GridPoint } from '../shared/fieldNavigation.js';
import { occupiedGroundCells } from './groundUnitOccupancy.js';

export function sageFieldCanStart(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  const load = inventoryLoad(s, c);
  return !!sageFieldSource(skill.sourceName) && skill.implementation === 'supported' &&
    Number.isSafeInteger(level) && level >= 1 && level <= 5 && s.learnedSkills[skill.id] === level &&
    classSkills(c, s.job).includes(skill.id) && ['town', 'hunting', 'challenge'].includes(s.status) &&
    s.hp > 0 && !s.supportCast && !s.battle?.cast && load.weight * 10 < load.maxWeight * 9 &&
    !activePlayerStatus(s, 'SC_SILENCE', at) &&
    !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'ST_CHASEWALK', 'NV_TRICKDEAD', 'KN_AUTOCOUNTER']
      .some(source => classicBuffActive(s, c, source, at)) && canBeginSkillResources(s, c, skill, level, at);
}
export function startSageFieldCast(s: GameState, c: Catalog, skill: Skill, level: number, at: number,
  context?: SimulationContext): boolean {
  if (!sageFieldCanStart(s, c, skill, level, at)) return false;
  const projection = at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at }, d = derivedStats(projection, c);
  const base = skill.castTimeMs?.[level - 1] ?? 0;
  const reduced = Math.floor((skill.ignoresDex ? base : classicCastTime(base, d.attributes?.dex ?? s.stats.dex)) *
    (1 - Math.min(100, d.effects.castReductionPct ?? 0) / 100));
  const memorized = memorizeCastStart({ remaining: classicBuffActive(s, c, 'PF_MEMORIZE', at)
    ? s.combatEffects?.memorizeCharges ?? 0 : 0, castTimeMs: reduced, started: true, ignoresStatusEffects: !!skill.ignoresStatusEffects });
  const position = battleHeroAt(s, at), sceneKey = classicGroundSceneKey(s);
  startOwnCast(s, c, skill, level, at, memorized.castTimeMs);
  s.supportCast!.position = position; s.supportCast!.sceneKey = sceneKey;
  if (s.combatEffects?.memorizeCharges !== undefined) s.combatEffects.memorizeCharges = memorized.remaining;
  if (s.supportCast!.endsAt <= at) resolveSageFieldCast(s, c, at, context);
  return true;
}
export function resolveSageFieldCast(s: GameState, c: Catalog, at: number, context?: SimulationContext,
  occupied: readonly GridPoint[] = []): boolean {
  const cast = s.supportCast, skill = c.skills[cast?.skillId ?? ''];
  if (!cast || cast.endsAt > at || !skill || !sageFieldSource(skill.sourceName)) return false;
  delete s.supportCast;
  if (s.hp <= 0 || skill.implementation !== 'supported' || !cast.position || cast.sceneKey !== classicGroundSceneKey(s)) return false;
  if (occupiedGroundCells(s, c, at, context).unresolved) {
    event(s, at, 'cast-failed', 'Aguarde o efeito antigo no chão terminar para conjurar o campo.',
      undefined, 'player', { skillId: skill.id, actionId: cast.actionId });
    return false;
  }
  const replacing = sageFieldIsActive(s, at);
  const result = runSkillResourcePhases(s, c, skill, cast.level, at,
    () => placeSageField(s, c, skill, cast.level, at, cast.position!, context, occupied), !replacing);
  if (!result.paid || !result.result) {
    event(s, at, 'cast-failed', result.paid ? 'As células do campo estão bloqueadas.' : 'SP ou Gema Amarela insuficientes.',
      undefined, 'player', { skillId: skill.id, actionId: cast.actionId });
    return false;
  }
  if (s.battle) s.battle.supportNeedsOffense = true;
  s.skillReadyAt[skill.id] = at + Math.max(0, skill.cooldownMs);
  event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: cast.level,
    sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none', actionSourcePosition: cast.position });
  return true;
}
