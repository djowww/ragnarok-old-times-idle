/** battle.c pre-renewal SC_FOGWALL defense for the attacks modeled by Idle. */
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
