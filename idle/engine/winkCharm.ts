/** DC_WINKCHARM solo-hunt behavior, pinned to Hercules pre-renewal 410b9738. */
import type { BattleEnemy, Catalog, GameEvent, GameState, Skill } from '../shared/types.js';
import { battleHeroAt, enemyPositionAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { classSkills } from './stats.js';
import { event, random } from './state.js';

const SOURCE = 'DC_WINKCHARM';
const STATUS = 'SC_DC_WINKCHARM';
const acceptedRaces = new Set(['demon', 'demihuman', 'angel']);
const normalizedRace = (race: string) => race.toLowerCase().replace(/[^a-z]/g, '');
const active = (enemy: BattleEnemy, at: number) => (enemy.statuses?.[STATUS]?.expiresAt ?? 0) > at;
const sourceSkill = (catalog: Catalog) => Object.values(catalog.skills).find(skill => skill.sourceName === SOURCE);

/** skill.c:8267..8278; auto policy avoids spending SP if there is no modeled mob skill to suppress. */
export function winkCharmEligible(s: GameState, c: Catalog, skill: Skill, level: number, enemy: BattleEnemy, at: number) {
  const monster = c.monsters[enemy.monsterId];
  return skill.sourceName === SOURCE && s.hp > 0 && level === 1 && s.learnedSkills[skill.id] === level &&
    skill.implementation === 'supported' && classSkills(c, s.job).includes(skill.id) && s.status === 'hunting' &&
    enemy.hp > 0 && !!s.battle?.enemies?.some(entry => entry.id === enemy.id) && enemy.startedAt <= at &&
    !!monster && !monster.boss && s.baseLevel > monster.level && acceptedRaces.has(normalizedRace(monster.race)) &&
    !!monster.npcStatusSkills?.length && !active(enemy, at) &&
    playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(enemy, at)) <= (skill.range?.[level - 1] ?? 9);
}

/** The farthest eligible target still in cast range is selected to preserve distance. */
export function winkCharmTarget(s: GameState, c: Catalog, at: number) {
  const skill = sourceSkill(c), level = skill && s.learnedSkills[skill.id];
  if (!skill || !level) return undefined;
  return s.battle?.enemies?.filter(enemy => winkCharmEligible(s, c, skill, level, enemy, at))
    .sort((a, b) => playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(b, at)) -
      playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(a, at)) || a.id.localeCompare(b.id))[0];
}

/** skill.c:8267..8278: 70% success, 10s on qualifying monsters; no status resistance in this source path. */
export function resolveWinkCharm(s: GameState, c: Catalog, skill: Skill, level: number,
  enemy: BattleEnemy, at: number, action: Partial<GameEvent> = {}) {
  if (!winkCharmEligible(s, c, skill, level, enemy, at)) return false;
  if (Math.floor(random(s) * 10000) >= Math.trunc((skill.statusChance?.[level - 1] ?? 70) * 100)) return true;
  const expiresAt = at + (skill.statusDurationMs?.[level - 1] ?? 10000);
  (enemy.statuses ??= {})[STATUS] = { startsAt: at, expiresAt, level,
    skillId: skill.id, sourceActorId: s.id, sourceActionId: action.actionId };
  event(s, at, 'status-start', 'O monstro ficou encantado.', undefined, 'enemy', {
    ...action, statusName: STATUS, skillId: skill.id, skillLevel: level,
    sourceActorId: s.id, targetActorId: enemy.id, enemyId: enemy.id, monsterId: enemy.monsterId,
    actorAction: 'none',
  });
  return true;
}

export function expireWinkCharm(s: GameState, enemy: BattleEnemy, at: number) {
  const status = enemy.statuses?.[STATUS];
  if (!status || status.expiresAt > at || status.skillId !== 'dc_winkcharm') return false;
  delete enemy.statuses![STATUS];
  event(s, at, 'status-end', 'O encanto passou.', undefined, 'enemy', {
    statusName: STATUS, skillId: status.skillId, skillLevel: status.level,
    sourceActorId: status.sourceActorId, targetActorId: enemy.id, enemyId: enemy.id,
    monsterId: enemy.monsterId, actionId: status.sourceActionId, actorAction: 'none',
  });
  return true;
}
