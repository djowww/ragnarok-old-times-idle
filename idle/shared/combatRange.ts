import type { BattleEnemy, Catalog, GameState, Skill } from './types.js';
import {
  battleHeroAt,
  battleDistance,
  playerBattleDistance,
  enemyPositionAt,
} from './battleSpatial.js';

const val = (values: number[] | undefined, level: number, fallback = 0) =>
  values?.[level - 1] ?? values?.at(-1) ?? fallback;
const learnedBySource = (s: GameState, c: Catalog) =>
  Object.fromEntries(Object.entries(s.learnedSkills).map(([id, level]) => [
    c.skills[id]?.sourceName ?? id,
    level,
  ]));

export function offensiveSkill(skill: Skill): boolean {
  if(["SA_ELEMENTWATER","SA_ELEMENTGROUND","SA_ELEMENTFIRE","SA_ELEMENTWIND"].includes(skill.sourceName??""))return false;
  return ['physical', 'magical', 'steal'].includes(skill.kind) ||
    (!!skill.statusEffect && ['enemy', 'ground'].includes(skill.targetType ?? '')) ||
    ['WZ_QUAGMIRE', 'BA_FROSTJOKE', 'DC_SCREAM', 'HT_SKIDTRAP'].includes(skill.sourceName ?? '');
}

export function basicAttackRange(s: GameState, c: Catalog): number {
  const entry = s.inventory.find(e => e.uid === s.equipment.weapon);
  const weapon = entry ? c.items[entry.itemId] : undefined;
  const vulture = weapon?.weaponType === 'bow' ? learnedBySource(s, c).AC_VULTURE ?? 0 : 0;
  return Math.max(1, weapon?.attackRange ?? (weapon?.weaponType === 'bow' ? 5 : 1)) + vulture;
}

export function skillAttackRange(s: GameState, c: Catalog, skill: Skill, level: number): number {
  const sourceRange = val(skill.range, level, skill.kind === 'magical' ? 9 : 1);
  // skill.c:1096..1115: negative range is absolute under source defaults;
  // RangeModByVulture adds the learned passive to eligible skills only.
  const vulture = skill.rangeBonusByVulture ? learnedBySource(s, c).AC_VULTURE ?? 0 : 0;
  if (sourceRange === 0 && skill.targetType === 'self') return val(skill.aoeRadius, level);
  return Math.max(0, Math.abs(sourceRange)) + vulture;
}

export function skillTargetInRange(s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy, at: number): boolean {
  if (skill.sourceName === 'MO_BODYRELOCATION') {
    const battle = s.battle;
    const isSelectedLivingTarget = battle?.targetId === target.id &&
      battle.enemies?.some(enemy => enemy.id === target.id && enemy.hp > 0);
    if (s.status !== 'hunting' || battle?.challengeId || !isSelectedLivingTarget ||
      s.fieldHero?.areaId !== s.areaId) return false;
    const distance = playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(target, at));
    // Snap is an approach action. Do not spend a sphere when a normal attack can
    // already reach this target, and do not treat the ground-target skill as
    // globally in range like ordinary self buffs.
    return distance > basicAttackRange(s, c) && distance <= skillAttackRange(s, c, skill, level);
  }
  // Hunter traps target a free nearby cell, independently of the enemy's range.
  // The authoritative placer validates the chosen cell at start and cast end.
  if (['HT_SKIDTRAP', 'HT_ANKLESNARE', 'HT_SANDMAN', 'HT_FLASHER'].includes(skill.sourceName ?? '')) return true;
  if (!offensiveSkill(skill) && !['PF_SOULCHANGE','SA_SPELLBREAKER','PR_STRECOVERY','PR_LEXDIVINA','SA_ELEMENTWATER','SA_ELEMENTGROUND','SA_ELEMENTFIRE','SA_ELEMENTWIND'].includes(skill.sourceName ?? '')) return true;
  const point = enemyPositionAt(target, at);
  const hero = battleHeroAt(s, at);
  const range = skillAttackRange(s, c, skill, level);
  return skill.targetType === 'self' && val(skill.range, level) === 0
    ? battleDistance(hero, point) <= range
    : playerBattleDistance(hero, point) <= range;
}
