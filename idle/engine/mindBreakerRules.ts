import type { BattleEnemy, Monster } from '../shared/types.js';

export interface MindBreakerValues {
  magicAttackPct: number;
  mdefPercent: number;
}

function sourceLevel(level: number) {
  return Math.max(1, Math.min(5, Number.isFinite(level) ? Math.trunc(level) : 1));
}

/** skill.c PF_MINDBREAKER: 55 + 5 * skill level percent. */
export function mindBreakerChancePct(level: number) {
  return 55 + 5 * sourceLevel(level);
}

/** status.c SC_MINDBREAKER: +20% MATK and -12% soft MDEF per level. */
export function mindBreakerValues(level: number): MindBreakerValues {
  const validLevel = sourceLevel(level);
  return { magicAttackPct: 20 * validLevel, mdefPercent: 100 - 12 * validLevel };
}

/** skill.c rejects boss and undead targets and silently fails on an active copy. */
export function mindBreakerTargetEligible(
  monster: Pick<Monster, 'boss' | 'race' | 'element'>,
  enemy: Pick<BattleEnemy, 'statuses'>,
  at: number,
) {
  const undead = monster.race.toLowerCase() === 'undead' || monster.element.toLowerCase() === 'undead';
  return !monster.boss && !undead && (enemy.statuses?.SC_MINDBREAKER?.expiresAt ?? 0) <= at;
}
