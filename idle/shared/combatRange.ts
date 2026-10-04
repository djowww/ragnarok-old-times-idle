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
  return ['physical', 'magical', 'steal'].includes(skill.kind) ||
    (!!skill.statusEffect && ['enemy', 'ground'].includes(skill.targetType ?? '')) ||
    ['WZ_QUAGMIRE', 'BA_FROSTJOKE', 'DC_SCREAM'].includes(skill.sourceName ?? '');
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
  if (!offensiveSkill(skill)) return true;
  const point = enemyPositionAt(target, at);
  const hero = battleHeroAt(s, at);
  const range = skillAttackRange(s, c, skill, level);
  return skill.targetType === 'self' && val(skill.range, level) === 0
    ? battleDistance(hero, point) <= range
    : playerBattleDistance(hero, point) <= range;
}
