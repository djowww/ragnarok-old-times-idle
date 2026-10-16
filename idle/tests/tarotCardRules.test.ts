import { describe, expect, it } from 'vitest';
import { resolveTarotCardDraw, type TarotCardEffect } from '../engine/tarotCard.js';

describe('Hercules pre-renewal Tarot Card draw rules', () => {
  it('uses the source 8-percent-per-level success boundary', () => {
    expect(resolveTarotCardDraw(1, 8, () => 0).success).toBe(true);
    expect(resolveTarotCardDraw(1, 9, () => 0)).toEqual({ success: false, effects: [] });
    expect(resolveTarotCardDraw(5, 40, () => 0).success).toBe(true);
    expect(resolveTarotCardDraw(5, 41, () => 0)).toEqual({ success: false, effects: [] });
  });

  it('returns the selected ordinary card effect after a successful roll', () => {
    expect(resolveTarotCardDraw(5, 0, () => 11)).toEqual({
      success: true, effects: ['fixed-damage-4444'],
    });
  });

  it('card 6 draws two more cards and every later 6 adds one more draw', () => {
    const draws = [6, 6, 1, 2, 3];
    const result = resolveTarotCardDraw(5, 0, () => draws.shift()!);
    expect(result.effects).toEqual<TarotCardEffect[]>([
      'halve-target-magic-attack', 'clear-target-buffs',
    ]);
    expect(draws).toEqual([3]);
  });

  it('rolls the card 7 control and applies each effect before drawing the next card', () => {
    const trace: string[] = [];
    const draws = [6, 7, 2, 1];
    const result = resolveTarotCardDraw(5, 0, upperBound => {
      trace.push('draw-' + upperBound);
      return draws.shift()!;
    }, effect => trace.push('apply-' + effect));
    expect(result.effects).toEqual<TarotCardEffect[]>(['stone-target', 'halve-target-magic-attack']);
    expect(trace).toEqual([
      'draw-14', 'draw-14', 'draw-3', 'apply-stone-target',
      'draw-14', 'apply-halve-target-magic-attack',
    ]);
    expect(draws).toEqual([]);
  });

});
