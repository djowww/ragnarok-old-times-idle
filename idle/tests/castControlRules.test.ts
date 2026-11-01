import { describe, expect, it } from 'vitest';
import * as rules from '../engine/castControlRules';

describe('Hercules Cast Cancel raw additional SP', () => {
  it.each([[1, 22], [2, 17], [3, 12], [4, 7], [5, 2]])(
    'truncates canceled base SP 25 at level %i to %i, separate from normal SP2',
    (level, extra) => {
      expect(rules.castCancelAdditionalSp(25, level)).toBe(extra);
    },
  );
  it('returns only the raw source percentage, without adding the normal cost', () => {
    expect(rules.castCancelAdditionalSp(100, 1)).toBe(90);
    expect(rules.castCancelAdditionalSp(100, 5)).toBe(10);
  });
  it.each([1, 2, 3, 4, 5])('does not charge extra for a zero-SP cast at level %i', (level) => {
    expect(rules.castCancelAdditionalSp(0, level)).toBe(0);
  });
  it('truncates fractional SP downward instead of rounding or forcing one', () => {
    expect(rules.castCancelAdditionalSp(1, 1)).toBe(0);
    expect(rules.castCancelAdditionalSp(11, 5)).toBe(1);
    expect(rules.castCancelAdditionalSp(19, 2)).toBe(13);
  });
});

describe('Hercules Spell Breaker effects on monsters without Magic Rod', () => {
  it.each([[1, 0], [2, 6], [3, 12], [4, 18], [5, 25]])(
    'always succeeds on a normal monster and recovers source SP at level %i',
    (level, spHeal) => {
      expect(rules.spellBreakerEffects({ boss: false, level, targetMaxHp: 1234, canceledSkillBaseSp: 25 }))
        .toEqual({ success: true, hpDamage: 24, hpHeal: level === 5 ? 12 : 0, spHeal });
    },
  );
  it.each([1, 2, 3, 4, 5])('returns no SP from NPC Poison base SP0 at level %i', (level) => {
    expect(rules.spellBreakerEffects({ boss: false, level, targetMaxHp: 1234, canceledSkillBaseSp: 0 }))
      .toEqual({ success: true, hpDamage: 24, hpHeal: level === 5 ? 12 : 0, spHeal: 0 });
  });
  it('uses half the calculated integer 2 percent at level five, independent of current HP', () => {
    expect(rules.spellBreakerEffects({ boss: false, level: 5, targetMaxHp: 1299, canceledSkillBaseSp: 0 }))
      .toEqual({ success: true, hpDamage: 25, hpHeal: 12, spHeal: 0 });
    expect(rules.spellBreakerEffects({ boss: false, level: 5, targetMaxHp: 49, canceledSkillBaseSp: 0 }))
      .toEqual({ success: true, hpDamage: 0, hpHeal: 0, spHeal: 0 });
  });
  it.each([1, 2, 3, 4, 5])('rejects a boss roll 89 and accepts 90 at level %i without HP effects', (level) => {
    expect(rules.spellBreakerEffects({ boss: true, level, targetMaxHp: 1234, canceledSkillBaseSp: 25, bossRoll: 89 }))
      .toEqual({ success: false, hpDamage: 0, hpHeal: 0, spHeal: 0 });
    expect(rules.spellBreakerEffects({ boss: true, level, targetMaxHp: 1234, canceledSkillBaseSp: 25, bossRoll: 90 }))
      .toEqual({ success: true, hpDamage: 0, hpHeal: 0, spHeal: [0, 6, 12, 18, 25][level - 1] });
  });
  it('fails a boss attempt with no supplied roll instead of generating RNG', () => {
    expect(rules.spellBreakerEffects({ boss: true, level: 5, targetMaxHp: 1234, canceledSkillBaseSp: 25 }))
      .toEqual({ success: false, hpDamage: 0, hpHeal: 0, spHeal: 0 });
  });
  it('ignores a supplied roll for a normal monster and preserves its input', () => {
    const input = Object.freeze({ boss: false, level: 5, targetMaxHp: 1234, canceledSkillBaseSp: 25, bossRoll: 0 });
    expect(rules.spellBreakerEffects(input)).toEqual({ success: true, hpDamage: 24, hpHeal: 12, spHeal: 25 });
    expect(input).toEqual({ boss: false, level: 5, targetMaxHp: 1234, canceledSkillBaseSp: 25, bossRoll: 0 });
    expect(rules.spellBreakerEffects(input)).toEqual({ success: true, hpDamage: 24, hpHeal: 12, spHeal: 25 });
  });
});
