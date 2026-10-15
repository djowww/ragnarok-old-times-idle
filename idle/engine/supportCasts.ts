import type { Catalog, GameState } from '../shared/types.js';
import { resolveSageEnchantCast } from './sageEnchantments.js';
import { resolveChasewalkCast } from './chasewalk.js';
import { resolveSageFieldCast } from './sageFieldCasting.js';
import { sageFieldSource } from './sageFields.js';
import type { SimulationContext } from './fieldNavigation.js';
export function resolveSupportCast(s: GameState, c: Catalog, at: number, context?: SimulationContext): boolean {
  if (sageFieldSource(c.skills[s.supportCast?.skillId ?? '']?.sourceName)) return resolveSageFieldCast(s, c, at, context);
  return c.skills[s.supportCast?.skillId ?? '']?.sourceName === 'ST_CHASEWALK'
    ? resolveChasewalkCast(s, c, at) : resolveSageEnchantCast(s, c, at);
}
