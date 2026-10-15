/** battle.c pre-renewal SC_FOGWALL defense for the attacks modeled by Idle. */
import type { Catalog, GameState } from '../shared/types.js';
import { battleHeroAt } from '../shared/battleSpatial.js';
import { classicBuffActive } from './classicBuffs.js';
import { activeGroundPlacements, groundPlacementContains } from './groundUnitOccupancy.js';

export function fogWallDefending(s: GameState, c: Catalog, at: number): boolean {
  const recorded = (s.groundPlacements ?? []).some(g => g.sourceName === 'PF_FOGWALL');
  if (!recorded) return classicBuffActive(s, c, 'PF_FOGWALL', at); // Legacy self adaptation.
  return activeGroundPlacements(s, at).some(g => g.sourceName === 'PF_FOGWALL' && groundPlacementContains(g, battleHeroAt(s, at), at));
}
export function fogWallHitChance(
  hitRatePct: number,
  active: boolean,
  ranged: boolean,
  skillAttack: boolean,
) {
  const adjustedPct = hitRatePct - (active && ranged && !skillAttack ? 50 : 0);
  return Math.min(.95, Math.max(.05, adjustedPct / 100));
}

/** Long weapon autos are quartered; supported direct skill hits lose 25%. */
export function fogWallDamage(
  damage: number,
  active: boolean,
  rangedBasicAttack: boolean,
  skillAttack: boolean,
) {
  if (!active) return damage;
  if (skillAttack) return Math.max(0, Math.floor(damage * .75));
  if (rangedBasicAttack) return Math.max(0, Math.floor(damage / 4));
  return damage;
}
