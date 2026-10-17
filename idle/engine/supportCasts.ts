import type { Catalog, GameState } from '../shared/types.js';
import { resolveSageEnchantCast } from './sageEnchantments.js';
import { resolveSoloAlchemyCast } from './soloAlchemy.js';
import { configurableSkillUseLevel } from '../shared/skillUseLevels.js';
import { resolveChasewalkCast } from './chasewalk.js';
import { resolveSageFieldCast } from './sageFieldCasting.js';
import { sageFieldSource } from './sageFields.js';
import { resolveSuffragiumCast } from './suffragium.js';
import { resolveProvidenceCast } from './providence.js';
import type { SimulationContext } from './fieldNavigation.js';
export function resolveSupportCast(s: GameState, c: Catalog, at: number, context?: SimulationContext): boolean {
  if (c.skills[s.supportCast?.skillId ?? '']?.sourceName === 'PR_SUFFRAGIUM')
    return resolveSuffragiumCast(s, c, at);
  if (c.skills[s.supportCast?.skillId ?? '']?.sourceName === 'CR_PROVIDENCE')
    return resolveProvidenceCast(s, c, at);
  if (configurableSkillUseLevel(c.skills[s.supportCast?.skillId ?? ''])) return resolveSoloAlchemyCast(s, c, at);
  if (sageFieldSource(c.skills[s.supportCast?.skillId ?? '']?.sourceName)) return resolveSageFieldCast(s, c, at, context);
  return c.skills[s.supportCast?.skillId ?? '']?.sourceName === 'ST_CHASEWALK'
    ? resolveChasewalkCast(s, c, at) : resolveSageEnchantCast(s, c, at);
}
