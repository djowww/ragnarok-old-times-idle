/** Pang Voice solo hunt behavior, pinned to Hercules pre-renewal 410b9738. */
import type { BattleEnemy, Catalog, GameEvent, GameState, Skill } from '../shared/types.js';
import { battleHeroAt, enemyPositionAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { classicStatusResistance, effectiveMonsterStatus } from './classicStatuses.js';
import { releaseMonsterAttackTarget } from './priestSoloControl.js';
import { classSkills } from './stats.js';
import { event, random } from './state.js';

const SOURCE = 'BA_PANGVOICE';
const CONFUSION = 'SC_CONFUSION';
const sourceSkill = (catalog: Catalog) => Object.values(catalog.skills).find(skill => skill.sourceName === SOURCE);
const activeConfusion = (enemy: BattleEnemy, at: number) => (enemy.statuses?.[CONFUSION]?.expiresAt ?? 0) > at;

export function pangVoiceEligible(s: GameState, c: Catalog, skill: Skill, level: number, enemy: BattleEnemy, at: number) {
  const source = c.monsters[enemy.monsterId];
  return skill.sourceName === SOURCE && s.hp > 0 && level > 0 && level <= skill.maxLevel &&
    s.learnedSkills[skill.id] === level && skill.implementation === 'supported' &&
    classSkills(c, s.job).includes(skill.id) && s.status === 'hunting' &&
    enemy.hp > 0 && !!s.battle?.enemies?.some(entry => entry.id === enemy.id) && enemy.startedAt <= at &&
    !!source && !source.boss && !activeConfusion(enemy, at) &&
    playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(enemy, at)) <= (skill.range?.[level - 1] ?? 9);
}

export function pangVoiceTarget(s: GameState, c: Catalog, at: number) {
  const skill = sourceSkill(c);
  const level = skill && s.learnedSkills[skill.id];
  if (!skill || !level) return undefined;
  return s.battle?.enemies?.filter(enemy => pangVoiceEligible(s, c, skill, level, enemy, at))
    .sort((a, b) => playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(a, at)) -
      playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(b, at)) || a.id.localeCompare(b.id))[0];
}

export function resolvePangVoice(s: GameState, c: Catalog, skill: Skill, level: number,
  enemy: BattleEnemy, at: number, action: Partial<GameEvent> = {}) {
  if (!pangVoiceEligible(s, c, skill, level, enemy, at)) return false;
  const base = c.monsters[enemy.monsterId];
  const monster = effectiveMonsterStatus(base, enemy.statuses, at).monster;
  const resistance = classicStatusResistance(monster, 'SC_CONFUSION',
    skill.statusChance?.[level - 1] ?? 50, skill.statusDurationMs?.[level - 1] ?? 17000,
    { level: s.baseLevel, luk: 0 });
  const applied = Math.floor(random(s) * 10000) < Math.trunc(resistance.chancePct * 100);
  if (applied && !base.boss && !activeConfusion(enemy, at)) {
    const expiresAt = at + resistance.durationMs;
    (enemy.statuses ??= {})[CONFUSION] = { startsAt: at, expiresAt, level,
      skillId: skill.id, sourceActorId: s.id, sourceActionId: action.actionId };
    releaseMonsterAttackTarget(s, c, enemy, at, { ...action, skillId: skill.id, skillLevel: level });
    if (enemy.npcCombat) enemy.npcCombat.nextTargetCheckAt = expiresAt;
    enemy.confusionWalkAt = at;
    event(s, at, 'status-start', 'O monstro ficou confuso.', undefined, 'enemy', {
      ...action, statusName: CONFUSION, skillId: skill.id, skillLevel: level,
      sourceActorId: s.id, targetActorId: enemy.id, enemyId: enemy.id, monsterId: enemy.monsterId,
      actorAction: 'none',
    });
  }
  return true;
}

export function expirePangVoice(s: GameState, enemy: BattleEnemy, at: number) {
  const status = enemy.statuses?.[CONFUSION];
  if (!status || status.expiresAt > at || status.skillId !== 'ba_pangvoice') return false;
  delete enemy.statuses![CONFUSION];
  delete enemy.confusionWalkAt;
  event(s, at, 'status-end', 'A confusão passou.', undefined, 'enemy', {
    statusName: CONFUSION, skillId: status.skillId, skillLevel: status.level,
    sourceActorId: status.sourceActorId, targetActorId: enemy.id, enemyId: enemy.id,
    monsterId: enemy.monsterId, actionId: status.sourceActionId, actorAction: 'none',
  });
  return true;
}
