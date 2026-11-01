import type { BattleEnemy, Catalog, GameEvent, GameState, Skill } from '../shared/types.js';
import { event, random } from './state.js';
import { mindBreakerChancePct, mindBreakerTargetEligible, mindBreakerValues } from './mindBreakerRules.js';

type Action = Pick<GameEvent, 'sourceActorId' | 'actionId' | 'actorAction' | 'actionStartedAt' | 'actionMotionMs' | 'actionSourcePosition' | 'areaId'>;

export function mindBreakerEligible(catalog: Catalog, enemy: BattleEnemy, at: number) {
  const monster = catalog.monsters[enemy.monsterId];
  return !!monster && enemy.hp > 0 && enemy.hostile !== false &&
    mindBreakerTargetEligible(monster, enemy, at);
}

export function resolveMindBreaker(
  state: GameState,
  catalog: Catalog,
  skill: Skill,
  level: number,
  enemy: BattleEnemy,
  at: number,
  action: Action,
) {
  if (!mindBreakerEligible(catalog, enemy, at)) return false;
  const monster = catalog.monsters[enemy.monsterId];
  const skillAction = { ...action, actorAction: 'none' as const, actionMotionMs: 0 };
  const metadata = { skillId: skill.id, skillLevel: level, enemyId: enemy.id, monsterId: enemy.monsterId,
    sourceActorId: state.id, targetActorId: enemy.id, ...skillAction, castMs: 0 };
  event(state, at, 'skill', skill.name, undefined, 'enemy', metadata);

  if (random(state) * 100 >= mindBreakerChancePct(level)) return true;

  // The source unit::skillcastcancel interrupts an active target cast.
  if (enemy.npcCombat?.cast) {
    const interrupted = enemy.npcCombat.cast;
    delete enemy.npcCombat.cast;
    event(state, at, 'cast-interrupted', 'Conjuração do monstro interrompida.', undefined, 'enemy', {
      skillId: skill.id, skillLevel: level, enemyId: enemy.id, monsterId: enemy.monsterId,
      sourceActorId: state.id, targetActorId: enemy.id, actionId: interrupted.actionId, actorAction: 'none',
    });
  }

  for (const statusName of ['SC_FREEZE', 'SC_STONE', 'SC_SLEEP']) {
    if (!enemy.statuses?.[statusName]) continue;
    delete enemy.statuses[statusName];
    event(state, at, 'status-end', `${statusName} encerrado por Quebra-Mente.`, undefined, 'enemy', {
      statusName, skillId: skill.id, skillLevel: level, enemyId: enemy.id, monsterId: enemy.monsterId,
      sourceActorId: state.id, targetActorId: enemy.id, ...skillAction,
    });
  }

  const values = mindBreakerValues(level);
  const durationMs = skill.statusDurationMs?.[level - 1] ?? skill.durationMs ?? 30_000;
  (enemy.statuses ??= {}).SC_MINDBREAKER = {
    startsAt: at,
    expiresAt: at + durationMs,
    level,
    skillId: skill.id,
    sourceActorId: state.id,
    sourceActionId: action.actionId,
    ...values,
  };
  event(state, at, 'status-start', 'Quebra-Mente', undefined, 'enemy', {
    statusName: 'SC_MINDBREAKER', skillId: skill.id, skillLevel: level, enemyId: enemy.id,
    monsterId: monster.id, sourceActorId: state.id, targetActorId: enemy.id, ...skillAction,
  });
  return true;
}
