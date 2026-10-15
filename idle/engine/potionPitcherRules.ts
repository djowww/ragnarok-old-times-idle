/**
 * Potion Pitcher arithmetic from Hercules 410b9738, src/map/skill.c:8673-8742.
 * Source SHA-256: 1987348fa5003e6e6b4e74700ff44c5bb10cf60247d29872ad269f74c3b0e0e3.
 * The caller supplies script recovery values and already-aggregated item/caster/
 * target bonuses. Non-player targets pass zero Recovery levels; selected item data
 * is resolved by usedPitcherLevel outside this pure calculation.
 */
export interface PotionPitcherRecoveryCommonInput {
  /** Use-level selects the potion/script values; the native multiplier uses the learned level. */
  usedPitcherLevel: number;
  learnedPitcherLevel: number;
  learningPotionLevel: number;
  maxHP: number;
  maxSP: number;
  targetVIT: number;
  targetINT: number;
  targetHPRecoveryLevel: number;
  targetSPRecoveryLevel: number;
  baseLevel: number;
  soulLinkAlchemist: boolean;
  /** Aggregated itemhealrate for the selected potion ID. */
  itemHealRatePct: number;
  /** skillheal_bonus(caster, AM_POTIONPITCHER). */
  casterSkillHealBonusPct: number;
  /** skillheal2_bonus(target, AM_POTIONPITCHER); zero for a non-player target. */
  targetSkillHeal2BonusPct: number;
  criticalWoundPct: number;
  deathHurt: boolean;
  waterInsigniaLevel: number;
  noRecover: boolean;
}

export type PotionPitcherRecoveryInput = PotionPitcherRecoveryCommonInput & (
  | { mode: 'fixed'; baseHP: number; baseSP: number; percentHP?: number; percentSP?: number }
  | { mode: 'percent'; percentHP: number; percentSP: number; baseHP?: number; baseSP?: number }
);

export interface PotionPitcherRecovery { hp: number; sp: number }

const truncDiv = (numerator: number, denominator: number): number => Math.trunc(numerator / denominator);
const addPercent = (value: number, rate: number): number => value + truncDiv(value * rate, 100);

/** Return pre-clamp recovery amounts, preserving C integer division at each native stage. */
export function calculatePotionPitcherRecovery(input: PotionPitcherRecoveryInput): PotionPitcherRecovery {
  const learnedBonus = 100 + input.learnedPitcherLevel * 10 + input.learningPotionLevel * 5;
  const soulLinkBonus = 100 + (input.soulLinkAlchemist ? input.baseLevel : 0);
  let hp: number;
  let sp: number;

  if (input.mode === 'percent') {
    hp = truncDiv(input.maxHP * input.percentHP, 100);
    sp = truncDiv(input.maxSP * input.percentSP, 100);
    hp = truncDiv(hp * learnedBonus * soulLinkBonus, 10_000);
    sp = truncDiv(sp * learnedBonus * soulLinkBonus, 10_000);
  } else {
    hp = input.baseHP > 0 ? truncDiv(input.baseHP * learnedBonus * soulLinkBonus, 10_000) : 0;
    sp = input.baseSP > 0 ? truncDiv(input.baseSP * learnedBonus * soulLinkBonus, 10_000) : 0;
    if (input.baseHP > 0) {
      hp = truncDiv(hp * (100 + input.targetVIT * 2), 100);
      hp = truncDiv(hp * (100 + input.targetHPRecoveryLevel * 10), 100);
    }
    if (input.baseSP > 0) {
      sp = truncDiv(sp * (100 + input.targetINT * 2), 100);
      sp = truncDiv(sp * (100 + input.targetSPRecoveryLevel * 10), 100);
    }
  }

  hp = addPercent(hp, input.itemHealRatePct);
  sp = addPercent(sp, input.itemHealRatePct);
  hp = addPercent(hp, input.casterSkillHealBonusPct);
  sp = addPercent(sp, input.casterSkillHealBonusPct);
  hp = addPercent(hp, input.targetSkillHeal2BonusPct);
  sp = addPercent(sp, input.targetSkillHeal2BonusPct);

  hp -= truncDiv(hp * input.criticalWoundPct, 100);
  sp -= truncDiv(sp * input.criticalWoundPct, 100);
  if (input.deathHurt) {
    hp -= truncDiv(hp * 20, 100);
    sp -= truncDiv(sp * 20, 100);
  }
  if (input.waterInsigniaLevel === 2) {
    hp += truncDiv(hp, 10);
    sp += truncDiv(sp, 10);
  }
  if (input.noRecover) { hp = 0; sp = 0; }
  return { hp, sp };
}
