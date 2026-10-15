import type { Catalog, GameState, Skill } from './types.js';

// Only these flagged spells have an actual incoming NPC producer in the solo engine.
export const NPC_COPY_SOURCES: ReadonlySet<string> = new Set([
  'MG_FIREBOLT', 'MG_COLDBOLT', 'MG_LIGHTNINGBOLT', 'MG_SOULSTRIKE',
]);
export function plagiarismLevel(s: GameState, c: Catalog): number {
  const skill = c.skills.rg_plagiarism?.sourceName === 'RG_PLAGIARISM' ? c.skills.rg_plagiarism
    : Object.keys(s.learnedSkills).map(id => c.skills[id]).find(candidate => candidate?.sourceName === 'RG_PLAGIARISM');
  const level = skill ? s.learnedSkills[skill.id] : 0;
  return skill?.implementation === 'supported' && Number.isSafeInteger(level) && level > 0
    ? Math.min(level, skill.maxLevel) : 0;
}
export function copiedSpell(s: GameState, c: Catalog): { skill: Skill; level: number } | undefined {
  const copy = s.copiedSkill;
  if (!copy) return;
  const cap = plagiarismLevel(s, c), skill = c.skills[copy.skillId];
  if (!cap || !copy || !Number.isSafeInteger(copy.level) || copy.level <= 0 || !skill ||
    !skill.allowPlagiarism || skill.implementation !== 'supported' || !NPC_COPY_SOURCES.has(skill.sourceName ?? '')) return;
  return { skill, level: Math.min(copy.level, cap, skill.maxLevel) };
}
export function effectiveSkillLevel(s: GameState, c: Catalog, id: string): number {
  const own = s.learnedSkills[id] ?? 0;
  if (s.copiedSkill?.skillId !== id) return own;
  const copy = copiedSpell(s, c);
  return copy ? Math.max(own, copy.level) : own;
}
