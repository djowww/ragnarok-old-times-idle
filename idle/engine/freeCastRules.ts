const MAX_AMOTION = 2000;
const MAX_SOURCE_ASPD_RATE = 32767;

function requireIntegerRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
}

/** Returns amotion after the pre-renewal aspd_rate and Free Cast stages, before calc_fix_aspd. */
export function freeCastAmotionAfterAspdRate(
  baseAmotion: number,
  aspdRate: number,
  skillLevel: number,
  castActive: boolean,
): number {
  requireIntegerRange(baseAmotion, 0, MAX_AMOTION, 'Base amotion');
  requireIntegerRange(aspdRate, 0, MAX_SOURCE_ASPD_RATE, 'ASPD rate');
  requireIntegerRange(skillLevel, 0, 10, 'Free Cast level');

  let amotion = Math.trunc(baseAmotion * aspdRate / 1000);
  if (castActive && skillLevel > 0) {
    amotion = Math.trunc(amotion * (150 - 5 * skillLevel) / 100);
  }
  return amotion;
}

/** Applies the PC clamp after the caller's source calc_fix_aspd stage. */
export function capPlayerAmotion(amotionAfterFix: number, minimumPlayerAmotion: number): number {
  requireIntegerRange(amotionAfterFix, 0, MAX_AMOTION, 'Amotion after fixed ASPD');
  requireIntegerRange(minimumPlayerAmotion, 0, MAX_AMOTION, 'Minimum player amotion');
  return Math.max(minimumPlayerAmotion, Math.min(amotionAfterFix, MAX_AMOTION));
}

/** Hercules player adelay is twice the final, PC-capped amotion. */
export function playerAttackDelayFromAmotion(cappedAmotion: number): number {
  requireIntegerRange(cappedAmotion, 0, MAX_AMOTION, 'Capped amotion');
  return 2 * cappedAmotion;
}
