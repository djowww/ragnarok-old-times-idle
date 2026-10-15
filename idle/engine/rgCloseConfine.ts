import type { BattleEnemy, GameState, Skill } from '../shared/types.js';
import { battleHeroAt, enemyPositionAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { event, random } from './state.js';

export const RG_CLOSECONFINE_STATUS = 'SC_RG_CCONFINE_S';
const RG_CLOSECONFINE_SOURCE = 'RG_CLOSECONFINE';

function ownsStatus(enemy: BattleEnemy, actorId: string) {
  const status = enemy.statuses?.[RG_CLOSECONFINE_STATUS];
  return status?.skillId !== undefined && status.sourceActorId === actorId;
}

export function closeConfineActive(s: GameState, at: number) {
  if (s.status !== 'hunting' || !s.battle || s.battle.challengeId) return false;
  return s.battle.enemies?.some(enemy => enemy.hp > 0 && ownsStatus(enemy, s.id) &&
    enemy.statuses![RG_CLOSECONFINE_STATUS].expiresAt > at);
}

export function closeConfineEligible(s: GameState, skill: Skill, target: BattleEnemy, at: number) {
  if (skill.sourceName !== RG_CLOSECONFINE_SOURCE || s.status !== 'hunting' || !s.battle ||
    s.battle.challengeId || target.hp <= 0 || !s.battle.enemies?.some(enemy => enemy.id === target.id)) return false;
  if ((target.statuses?.[RG_CLOSECONFINE_STATUS]?.expiresAt ?? 0) > at) return false;
  return playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(target, at)) <= 1 + 1e-9;
}

export function applyCloseConfine(s: GameState, skill: Skill, level: number, target: BattleEnemy,
  at: number, actionId?: string) {
  if (!closeConfineEligible(s, skill, target, at)) return false;
  const duration = skill.statusDurationMs?.[level - 1] ?? skill.statusDurationMs?.at(-1) ?? 10000;
  random(s); // status_start4 consumes its 100% application roll in Hercules.
  (target.statuses ??= {})[RG_CLOSECONFINE_STATUS] = {
    level, startsAt: at, expiresAt: at + duration, skillId: skill.id,
    sourceActorId: s.id, ...(actionId && { sourceActionId: actionId }),
  };
  if (at < target.arrivedAt) target.approachPausedAt ??= at;
  event(s, at, 'skill', skill.name, undefined, 'enemy', {
    skillId: skill.id, skillLevel: level, enemyId: target.id, monsterId: target.monsterId,
    sourceActorId: s.id, targetActorId: target.id, actionId, actorAction: 'none', actionMotionMs: 0, castMs: 0,
  });
  event(s, at, 'status-start', 'Alvo preso por Confinamento.', undefined, 'enemy', {
    statusName: RG_CLOSECONFINE_STATUS, skillId: skill.id, skillLevel: level,
    enemyId: target.id, monsterId: target.monsterId, sourceActorId: s.id, targetActorId: target.id, actionId,
  });
  return true;
}

export function expireCloseConfine(s: GameState, enemy: BattleEnemy, at: number) {
  const status = enemy.statuses?.[RG_CLOSECONFINE_STATUS];
  if (!status || status.expiresAt > at || !ownsStatus(enemy, s.id)) return false;
  delete enemy.statuses![RG_CLOSECONFINE_STATUS];
  event(s, at, 'status-end', 'Confinamento terminou.', undefined, 'enemy', {
    statusName: RG_CLOSECONFINE_STATUS, skillId: status.skillId, skillLevel: status.level,
    enemyId: enemy.id, monsterId: enemy.monsterId, sourceActorId: s.id, targetActorId: enemy.id,
    actionId: status.sourceActionId,
  });
  return true;
}

export function releaseCloseConfineTarget(s: GameState, enemy: BattleEnemy, at: number) {
  const status = enemy.statuses?.[RG_CLOSECONFINE_STATUS];
  if (!status || !ownsStatus(enemy, s.id)) return false;
  delete enemy.statuses![RG_CLOSECONFINE_STATUS];
  event(s, at, 'status-end', 'Confinamento terminou.', undefined, 'enemy', {
    statusName: RG_CLOSECONFINE_STATUS, skillId: status.skillId, skillLevel: status.level,
    enemyId: enemy.id, monsterId: enemy.monsterId, sourceActorId: s.id, targetActorId: enemy.id,
    actionId: status.sourceActionId,
  });
  return true;
}

export function clearCloseConfine(s: GameState, at: number) {
  const emitted = new Set<string>();
  for (const enemy of [...(s.battle?.enemies ?? []), ...(s.fieldPopulation?.enemies ?? [])]) {
    const status = enemy.statuses?.[RG_CLOSECONFINE_STATUS];
    if (!status || !ownsStatus(enemy, s.id)) continue;
    delete enemy.statuses![RG_CLOSECONFINE_STATUS];
    if (emitted.has(enemy.id)) continue;
    emitted.add(enemy.id);
    event(s, at, 'status-end', 'Confinamento terminou.', undefined, 'enemy', {
      statusName: RG_CLOSECONFINE_STATUS, skillId: status.skillId, skillLevel: status.level,
      enemyId: enemy.id, monsterId: enemy.monsterId, sourceActorId: s.id, targetActorId: enemy.id,
      actionId: status.sourceActionId,
    });
  }
}
