import { describe, expect, it } from 'vitest';
import {
  freeCastAmotionAfterAspdRate,
  capPlayerAmotion,
  playerAttackDelayFromAmotion,
} from '../engine/freeCastRules.js';

describe('pinned pre-renewal Free Cast timing stages', () => {
  it('applies aspd_rate before the level-one Free Cast integer multiplier', () => {
    // Source order: floor(101 * 850 / 1000) = 85, then floor(85 * 145 / 100) = 123.
    // Reversing the stages would produce 124, so this catches a reordered formula.
    expect(freeCastAmotionAfterAspdRate(101, 850, 1, true)).toBe(123);
  });

  it.each([
    [1, 101, 146],
    [10, 101, 101],
  ])('uses Free Cast level %i integer amotion multiplier on odd input %i', (level, input, expected) => {
    expect(freeCastAmotionAfterAspdRate(input, 1000, level, true)).toBe(expected);
  });

  it('applies only the ordinary aspd_rate stage when no cast is active', () => {
    expect(freeCastAmotionAfterAspdRate(101, 850, 1, false)).toBe(85);
    expect(freeCastAmotionAfterAspdRate(101, 850, 0, true)).toBe(85);
  });

  it('applies the final PC clamp after the caller completes calc_fix_aspd', () => {
    expect(capPlayerAmotion(2000, 180)).toBe(2000);
    expect(capPlayerAmotion(100, 180)).toBe(180);
    expect(capPlayerAmotion(987, 180)).toBe(987);
  });

  it('derives adelay from the capped amotion and keeps the two clocks distinct', () => {
    const amotion = capPlayerAmotion(123, 180);
    expect(amotion).toBe(180);
    expect(playerAttackDelayFromAmotion(amotion)).toBe(360);
    expect(playerAttackDelayFromAmotion(123)).toBe(246);
  });

  it('rejects unsupported levels and non-integer source inputs instead of rounding them', () => {
    for (const level of [-1, 11, 1.5, NaN, Infinity]) {
      expect(() => freeCastAmotionAfterAspdRate(100, 1000, level, true)).toThrow(RangeError);
    }
    for (const value of [-1, 1.5, NaN, Infinity]) {
      expect(() => freeCastAmotionAfterAspdRate(value, 1000, 1, true)).toThrow(RangeError);
      expect(() => capPlayerAmotion(value, 100)).toThrow(RangeError);
    }
  });
});
