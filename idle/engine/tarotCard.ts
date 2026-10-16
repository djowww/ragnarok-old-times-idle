export type TarotCardEffect =
  | 'drain-target-sp'
  | 'halve-target-magic-attack'
  | 'clear-target-buffs'
  | 'fixed-damage-1000'
  | 'halve-target-attack'
  | 'heal-caster-and-teleport-target'
  | 'stop-target'
  | 'freeze-target'
  | 'stone-target'
  | 'curse-coma-poison-target'
  | 'confuse-target'
  | 'fixed-damage-6666-and-debuff-target'
  | 'fixed-damage-4444'
  | 'stun-target'
  | 'weaken-target-combat-stats';

export interface TarotCardDraw {
  success: boolean;
  effects: TarotCardEffect[];
}

const ORDINARY_CARDS: readonly (TarotCardEffect | null)[] = [
  'drain-target-sp',
  'halve-target-magic-attack',
  'clear-target-buffs',
  'fixed-damage-1000',
  'halve-target-attack',
  'heal-caster-and-teleport-target',
  null,
  null,
  'curse-coma-poison-target',
  'confuse-target',
  'fixed-damage-6666-and-debuff-target',
  'fixed-damage-4444',
  'stun-target',
  'weaken-target-combat-stats',
];

/** Hercules skill.c: a 0..99 roll succeeds through skillLevel * 8 inclusive. */
export function tarotCardSuccess(level: number, rollPercent: number): boolean {
  const skillLevel = Math.max(1, Math.min(5, Math.trunc(level)));
  return rollPercent >= 0 && rollPercent <= 99 && rollPercent <= skillLevel * 8;
}

/**
 * Resolves the source's do/while card chain. The first Fool (card 6) adds two
 * draws; each later Fool adds one more draw. Card 7 consumes another RNG draw
 * to choose Stop, Freeze, or Stone Curse.
 */
export function resolveTarotCardDraw(
  level: number,
  rollPercent: number,
  drawRandom: (upperBound: 3 | 14) => number,
  applyEffect?: (effect: TarotCardEffect) => void,
): TarotCardDraw {
  if (!tarotCardSuccess(level, rollPercent)) return { success: false, effects: [] };
  const effects: TarotCardEffect[] = [];
  let drawsRemaining = 1;
  let drawCount = 0;
  const maxDraws = 256;
  while (drawsRemaining > 0) {
    if (++drawCount > maxDraws)
      throw new RangeError('Tarot Fool chain exceeded the deterministic draw limit.');
    const card = drawRandom(14);
    if (!Number.isInteger(card) || card < 0 || card >= ORDINARY_CARDS.length)
      throw new RangeError('Tarot card draw must be an integer from 0 through 13.');
    const firstDraw = drawCount === 1;
    drawsRemaining -= 1;
    if (card === 6) {
      drawsRemaining += firstDraw ? 2 : 1;
      continue;
    }
    let effect = ORDINARY_CARDS[card];
    if (card === 7) {
      const control = drawRandom(3);
      if (!Number.isInteger(control) || control < 0 || control >= 3)
        throw new RangeError('Tarot control draw must be an integer from 0 through 2.');
      effect = (['stop-target', 'freeze-target', 'stone-target'] as const)[control];
    }
    if (effect) {
      effects.push(effect);
      applyEffect?.(effect);
    }
  }
  return { success: true, effects };
}
