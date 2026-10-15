export type SpellBreakerInput = {
  boss: boolean;
  level: number;
  targetMaxHp: number;
  canceledSkillBaseSp: number;
  bossRoll?: number;
};

export type SpellBreakerEffects = {
  success: boolean;
  hpDamage: number;
  hpHeal: number;
  spHeal: number;
};

/** Hercules 410b9738 skill.c:8918-8933. Learned levels are validated by the caller.
 * Uses the canceled skill's raw base SP; normal Cast Cancel SP2 and the
 * status_zap drain limited to available SP belong to the runtime.
 */
export function castCancelAdditionalSp(baseSp: number, level: number): number {
  return Math.max(0, Math.floor(baseSp * (90 - (level - 1) * 20) / 100));
}

/** Monster branch without Magic Rod, Hercules 410b9738 skill.c:8934-8976.
 * The caller owns cast eligibility, supplies the boss roll (rnd()%100), and
 * applies passive damage/drain/healing with the actors' available resources.
 * HP healing uses calculated damage, even when actual HP removed is smaller.
 */
export function spellBreakerEffects(input: SpellBreakerInput): SpellBreakerEffects {
  if (input.boss && (input.bossRoll === undefined || input.bossRoll < 90)) {
    return { success: false, hpDamage: 0, hpHeal: 0, spHeal: 0 };
  }
  const hpDamage = input.boss ? 0 : Math.floor(input.targetMaxHp / 50);
  return {
    success: true,
    hpDamage,
    hpHeal: input.level >= 5 ? Math.floor(hpDamage / 2) : 0,
    spHeal: Math.floor(input.canceledSkillBaseSp * 25 * (input.level - 1) / 100),
  };
}
