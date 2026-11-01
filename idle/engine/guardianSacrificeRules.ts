export const SACRIFICE_CHARGES = 5;
export const SHRINK_DURATION_MS = 300_000;
export const SACRIFICE_AFK_EXPIRES_AT = Number.MAX_SAFE_INTEGER;

const AUTO_GUARD_CHANCES = [5, 10, 14, 18, 21, 24, 26, 28, 29, 30] as const;
const SACRIFICE_RATIOS = [100, 110, 120, 130, 140] as const;

function requireIntegerRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
}

function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

export function autoGuardChance(level: number): number {
  requireIntegerRange(level, 1, 10, 'Auto Guard level');
  return AUTO_GUARD_CHANCES[level - 1];
}

export function autoGuardWalkDelayMs(level: number): number {
  requireIntegerRange(level, 1, 10, 'Auto Guard level');
  if (level === 10) return 100;
  return level >= 6 ? 200 : 300;
}

export function shrinkRollAccepted(autoGuardLevel: number, roll0To99: number): boolean {
  requireIntegerRange(autoGuardLevel, 1, 10, 'Auto Guard level');
  requireIntegerRange(roll0To99, 0, 99, 'Shrink roll');
  return roll0To99 < autoGuardLevel * 5;
}

export function sacrificeHpCost(maxHp: number): number {
  requirePositiveSafeInteger(maxHp, 'Maximum HP');
  return Math.floor(maxHp / 100) * 9 + Math.floor((maxHp % 100) * 9 / 100);
}

export function sacrificeRatio(level: number): number {
  requireIntegerRange(level, 1, 5, 'Sacrifice level');
  return SACRIFICE_RATIOS[level - 1];
}

export function sacrificeBaseDamage(maxHp: number, level: number): number {
  const baseDamage = sacrificeHpCost(maxHp);
  const ratio = sacrificeRatio(level);
  return Math.floor(baseDamage / 100) * ratio + Math.floor((baseDamage % 100) * ratio / 100);
}
