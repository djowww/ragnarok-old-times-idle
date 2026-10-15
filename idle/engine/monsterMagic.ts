import type { Catalog } from '../shared/types.js';

/** Pre-renewal incoming NPC magic arithmetic, pinned to status.c/battle.c. */
const floor = Math.floor;

export function monsterMagicElementRate(c: Catalog, attack: string, defense = 'neutral', defenseLevel = 1) {
  return (c.elementModifiers?.[attack.toLowerCase()]?.[defense.toLowerCase()]?.[Math.max(0, defenseLevel - 1)] ?? 100) / 100;
}

/** status_base_matk_min/max: the upper rnd endpoint is excluded by callers. */
export function monsterMagicAttack(intelligence: number, magicAttackPct = 0): [number, number] {
  const int = Math.max(0, floor(intelligence));
  const min = int + floor(int / 7) ** 2;
  const max = int + floor(int / 5) ** 2;
  return [floor(min * (100 + magicAttackPct) / 100), floor(max * (100 + magicAttackPct) / 100)];
}

export function monsterMagicDamage(input: {
  matk: number;
  hardMdef: number;
  softMdef: number;
  elementRate: number;
  hitCount?: number;
}): number {
  if (input.elementRate <= 0) return 0;
  const reduced = Math.max(1, floor(input.matk * (100 - Math.min(100, input.hardMdef)) / 100) - input.softMdef);
  return Math.max(0, floor(floor(reduced * input.elementRate) * Math.max(1, input.hitCount ?? 1)));
}

/** Energy Coat's source SP band and floor ordering (skill.c:3345..3355). */
export function energyCoatMagicDamage(damage: number, sp: number, maxSp: number) {
  if (damage <= 0 || maxSp <= 0) return { damage, spCost: 0 };
  const band = Math.max(0, Math.min(4, floor((100 * sp / maxSp - 1) / 20)));
  return {
    damage: Math.max(0, damage - floor(damage * (6 * (band + 1)) / 100)),
    spCost: floor(maxSp * (1 + 0.5 * band) / 100),
  };
}

/** Magic Rod restores a level-dependent fraction of the intercepted spell's base SP. */
export function magicRodRefund(baseSp: number, level: number) {
  return floor(Math.max(0, baseSp) * Math.max(0, Math.min(5, level)) * 20 / 100);
}

export function magicRodWindow(level: number) {
  return 200 + 200 * Math.max(1, Math.min(5, floor(level)));
}

export function magicRodAcceptsCast(input: { startsAt: number; endsAt: number; armedAt: number; expiresAt: number }) {
  return input.endsAt >= input.armedAt && input.endsAt < input.expiresAt;
}
