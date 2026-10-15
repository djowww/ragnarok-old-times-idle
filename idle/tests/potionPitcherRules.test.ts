import { describe, expect, it } from 'vitest';
import { calculatePotionPitcherRecovery, type PotionPitcherRecoveryInput } from '../engine/potionPitcherRules.js';

const fixed: PotionPitcherRecoveryInput = {
  mode: 'fixed', baseHP: 10, baseSP: 9, maxHP: 253, maxSP: 117,
  usedPitcherLevel: 1, learnedPitcherLevel: 5, learningPotionLevel: 3,
  targetVIT: 25, targetINT: 9, targetHPRecoveryLevel: 2, targetSPRecoveryLevel: 1,
  baseLevel: 1, soulLinkAlchemist: false,
  itemHealRatePct: 15, casterSkillHealBonusPct: 10, targetSkillHeal2BonusPct: 5,
  criticalWoundPct: 25, deathHurt: true, waterInsigniaLevel: 2, noRecover: false,
};

describe('Potion Pitcher pure native recovery rules', () => {
  it('uses learned Pitcher level and preserves fixed-mode integer truncation through every stage', () => {
    // HP: 10*165% => 16; VIT => 24; recovery => 28; bonuses => 36;
    // Critical Wound => 27; Death Hurt => 22; Water Insignia => 24.
    // SP: 9*165% => 14; INT => 16; recovery => 17; bonuses => 21;
    // Critical Wound => 16; Death Hurt => 13; Water Insignia => 14.
    expect(calculatePotionPitcherRecovery(fixed)).toEqual({ hp: 24, sp: 14 });
  });

  it('uses max-stat percentages without VIT, INT, or fixed Recovery multipliers', () => {
    const input: PotionPitcherRecoveryInput = {
      ...fixed, mode: 'percent', percentHP: 33, percentSP: 21,
      itemHealRatePct: 5, casterSkillHealBonusPct: 7, targetSkillHeal2BonusPct: 3,
      criticalWoundPct: 0, deathHurt: false, waterInsigniaLevel: 0,
      targetVIT: 99, targetINT: 99, targetHPRecoveryLevel: 10, targetSPRecoveryLevel: 10,
    };
    // 253*33/100=83; then 165%=136; then separate +5%, +7%, +3%=155.
    // 117*21/100=24; then 165%=39; then separate +5%, +7%, +3%=43.
    expect(calculatePotionPitcherRecovery(input)).toEqual({ hp: 155, sp: 43 });
  });

  it('applies Alchemist Soul Link as a base-level bonus to the learned-skill multiplier', () => {
    const input: PotionPitcherRecoveryInput = {
      ...fixed, baseHP: 5, baseSP: 5, learnedPitcherLevel: 0,
      learningPotionLevel: 0, usedPitcherLevel: 5, baseLevel: 99,
      soulLinkAlchemist: true, targetVIT: 0, targetINT: 0,
      targetHPRecoveryLevel: 0, targetSPRecoveryLevel: 0,
      itemHealRatePct: 0, casterSkillHealBonusPct: 0, targetSkillHeal2BonusPct: 0,
      criticalWoundPct: 0, deathHurt: false, waterInsigniaLevel: 0,
    };
    // 5 * (100 + 99)% is truncated once after division by 100.
    expect(calculatePotionPitcherRecovery(input)).toEqual({ hp: 9, sp: 9 });
  });

  it('returns zero for zero base recovery and for No Recover after all prior stages', () => {
    const zero: PotionPitcherRecoveryInput = {
      ...fixed, baseHP: 0, baseSP: 0,
      itemHealRatePct: 0, casterSkillHealBonusPct: 0, targetSkillHeal2BonusPct: 0,
      criticalWoundPct: 0, deathHurt: false, waterInsigniaLevel: 0,
    };
    expect(calculatePotionPitcherRecovery(zero)).toEqual({ hp: 0, sp: 0 });
    expect(calculatePotionPitcherRecovery({ ...fixed, noRecover: true })).toEqual({ hp: 0, sp: 0 });
  });

  it('uses C-style truncation at percentage base and each additive bonus boundary', () => {
    const input: PotionPitcherRecoveryInput = {
      ...fixed, mode: 'percent', percentHP: 50, percentSP: 50, maxHP: 3, maxSP: 3,
      learnedPitcherLevel: 0, learningPotionLevel: 0,
      itemHealRatePct: 50, casterSkillHealBonusPct: 50, targetSkillHeal2BonusPct: 50,
      targetVIT: 100, targetINT: 100, targetHPRecoveryLevel: 10, targetSPRecoveryLevel: 10,
      criticalWoundPct: 0, deathHurt: false, waterInsigniaLevel: 0,
    };
    // 3*50/100 truncates to 1, and three successive 50% additions yield 1->1->1->1.
    expect(calculatePotionPitcherRecovery(input)).toEqual({ hp: 1, sp: 1 });
  });
});
