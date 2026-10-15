import type { Catalog, GameState } from '../shared/types.js';
import { resolveSageEnchantCast } from './sageEnchantments.js';
import { resolveChasewalkCast } from './chasewalk.js';
export function resolveSupportCast(s: GameState, c: Catalog, at: number): boolean {
  return c.skills[s.supportCast?.skillId ?? '']?.sourceName === 'ST_CHASEWALK'
    ? resolveChasewalkCast(s, c, at) : resolveSageEnchantCast(s, c, at);
}
