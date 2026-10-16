import type { Catalog, GameState, Skill } from '../shared/types.js';
import { classicCastTime } from './classic.js';
import { consumeSuffragiumForCast } from './classicBuffs.js';
import { derivedStats, learnedFreeCastLevel } from './stats.js';
import { event } from './state.js';
import { battleHeroAt, stopHeroMovement } from '../shared/battleSpatial.js';
import { beginSkillAction, cancelSkillAction } from './skillActionClock.js';

/** Common clocks for a validated self-target cast; payment belongs to its handler. */
export function startOwnCast(s: GameState, c: Catalog, skill: Skill, level: number, at: number, resolvedCastTimeMs?: number): void {
  const stats = derivedStats(s, c), base = skill.castTimeMs?.[level - 1] ?? 0;
  const dexCast = skill.ignoresDex ? base : classicCastTime(base, stats.attributes?.dex ?? s.stats.dex);
  const castMs = resolvedCastTimeMs ?? Math.floor(dexCast * (1 - Math.min(100, stats.effects.castReductionPct ?? 0) / 100));
  consumeSuffragiumForCast(s, c, skill, at);
  const actionId = `own-cast-${s.id}-${at}-${s.nextEventId}`, battle = s.battle;
  const motion = stats.attackMotionMs, sourceDelay = skill.afterCastDelayMs?.[level - 1] ?? 0;
  const delay = sourceDelay < 0 ? -sourceDelay + motion : sourceDelay;
  const afterCastDelay = Math.max(0, Math.floor(delay *
    (1 - Math.min(100, stats.effects.afterCastReductionPct ?? 0) / 100)));
  const actionReadyAt = at + castMs + Math.max(motion, afterCastDelay);
  const sourceClock = beginSkillAction(s, at, castMs, motion);
  s.supportCast = { skillId: skill.id, level, startedAt: at, endsAt: at + castMs, actionId,
    skillClockOwnership: sourceClock,
    ...(battle && { battleClockOwnership: {
      actionReadyAt: battle.playerActionReadyAt, nextSkillAt: battle.playerNextSkillAt,
      nextAttackAt: battle.playerNextAttackAt, ownedActionReadyAt: actionReadyAt, ownedNextSkillAt: sourceClock.readyAt,
      battleIdentity: { startedAt: battle.startedAt, attemptId: battle.attemptId,
        challengeId: battle.challengeId, areaId: s.areaId },
    } }) };
  if (battle) { battle.playerActionReadyAt = actionReadyAt; battle.playerNextSkillAt = sourceClock.readyAt; }
  if (!learnedFreeCastLevel(s, c) && s.status === 'hunting' && s.fieldHero?.areaId === s.areaId) {
    stopHeroMovement(s.fieldHero, battleHeroAt(s, at), at); s.fieldHero.phase = 'fighting';
  }
  event(s, at, 'cast', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
    sourceActorId: s.id, targetActorId: s.id, actionId, actorAction: 'none', castMs });
}

export function clearOwnCast(s: GameState, c: Catalog, at: number, reason: string): boolean {
  const cast = s.supportCast;
  if (!cast) return false;
  delete s.supportCast;
  cancelSkillAction(s, cast.skillClockOwnership, at);
  const identity = cast.battleClockOwnership?.battleIdentity;
  const matches = !!identity && !!s.battle && identity.startedAt === s.battle.startedAt &&
    identity.attemptId === s.battle.attemptId && identity.challengeId === s.battle.challengeId && identity.areaId === s.areaId;
  if (matches && s.battle && cast.battleClockOwnership) {
    const clocks = cast.battleClockOwnership;
    if (clocks.ownedActionReadyAt !== undefined && s.battle.playerActionReadyAt === clocks.ownedActionReadyAt) {
      if (clocks.actionReadyAt === undefined) delete s.battle.playerActionReadyAt;
      else s.battle.playerActionReadyAt = clocks.actionReadyAt;
    }
    if (clocks.ownedNextSkillAt !== undefined && s.battle.playerNextSkillAt === clocks.ownedNextSkillAt) {
      if (clocks.nextSkillAt === undefined) delete s.battle.playerNextSkillAt;
      else s.battle.playerNextSkillAt = clocks.nextSkillAt;
    }
    s.battle.supportNeedsOffense = true;
  }
  event(s, at, 'cast-interrupted', reason, undefined, 'player', { skillId: cast.skillId,
    skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none' });
  return true;
}
