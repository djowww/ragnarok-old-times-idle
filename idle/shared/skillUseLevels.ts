import type { Catalog, GameState, Skill } from './types.js';
import { effectiveSkillLevel } from './copiedSkills.js';

/** Only skills with a complete level-aware handler expose this preference. */
export function configurableSkillUseLevel(skill: Skill | undefined): boolean {
  return !!skill && ['WS_MELTDOWN', 'AM_POTIONPITCHER', 'CR_SLIMPITCHER'].includes(skill.sourceName ?? '');
}

/** Learned/passive/prerequisite levels never use this optional cast preference. */
export function skillUseLevel(state: GameState, catalog: Catalog, id: string): number {
  const skill = catalog.skills[id], learned = effectiveSkillLevel(state, catalog, id);
  if (!configurableSkillUseLevel(skill)) return learned;
  const cap = Math.max(0, Math.min(skill.maxLevel, Number.isSafeInteger(learned) ? learned : 0));
  const preferred = Object.hasOwn(state.skillUseLevels ?? {}, id) ? state.skillUseLevels?.[id] : undefined;
  return Number.isSafeInteger(preferred) && preferred! > 0 ? Math.min(preferred!, cap) : cap;
}
