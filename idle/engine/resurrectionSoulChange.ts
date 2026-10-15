import type { BattleEnemy, Monster } from '../shared/types.js';

/** Hercules default undead_detect_type=0 checks the defensive element only. */
export function resurrectionMonsterEligible(monster: Pick<Monster, 'element'>): boolean {
  return monster.element.toLowerCase() === 'undead';
}

export function soulChangeMonsterEligible(
  enemy: Pick<BattleEnemy, 'hp'> & { soulChangeUsed?: boolean },
  monster: Pick<Monster, 'boss'>,
): boolean {
  return enemy.hp > 0 && !monster.boss && !enemy.soulChangeUsed;
}

/** Raw pre-renewal damage; the magic pipeline still applies MDEF and element. */
export function resurrectionBaseDamage(input: {
  level: number; baseLevel: number; intelligence: number; luck: number;
  targetHp: number; targetMaxHp: number; boss: boolean;
}, rng: () => number): number {
  const chance = Math.min(700,
    20 * input.level + input.luck + input.intelligence + input.baseLevel + 200
    - Math.floor(200 * input.targetHp / input.targetMaxHp));
  // battle.c rolls before checking MD_BOSS and bypasses the random MATK branch.
  const roll = Math.floor(rng() * 1000);
  return roll < chance && !input.boss
    ? input.targetHp
    : input.baseLevel + input.intelligence + 10 * input.level;
}

export function soulChangeRecovery(maxSp: number): number {
  return Math.floor(maxSp * 3 / 100);
}
