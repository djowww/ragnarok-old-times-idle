import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import {
  conversionAttemptStages, conversionElementLevel, conversionOverlap, conversionSpec,
  effectiveConvertedElement, ELEMENTAL_CONVERSION_DISPEL_REMOVABLE,
  ELEMENTAL_CONVERSION_DURATION_MS,
} from '../engine/elementalConversionRules.js';

const catalog = rawCatalog as unknown as Catalog;
const base = Object.freeze({ element: 'undead', elementLevel: 2 });
const noControl = { freeze: false, stonePetrified: false };

describe('pinned pre-renewal monster elemental conversion rules', () => {
  it.each([
    ['SA_ELEMENTWATER', 'water', 12115],
    ['SA_ELEMENTGROUND', 'earth', 12116],
    ['SA_ELEMENTFIRE', 'fire', 12114],
    ['SA_ELEMENTWIND', 'wind', 12117],
  ])('maps %s to defensive %s and converter %i', (source, element, reagentItemId) => {
    expect(conversionSpec(source)).toEqual({ element, reagentItemId });
  });
  it('does not promote production or weapon enchant as monster conversion', () => {
    for (const source of ['SA_CREATECON', 'SA_FLAMELAUNCHER', 'NPC_ATTRICHANGE', 'unknown'])
      expect(conversionSpec(source)).toBeUndefined();
  });
  it.each([[0, 1], [1, 2], [2, 3], [3, 4]])('maps source modulo roll %i to element level %i', (roll, level) => {
    expect(conversionElementLevel(roll)).toBe(level);
  });
  it('rejects non-modulo inputs instead of producing impossible elemental levels', () => {
    for (const roll of [-1, 4, 0.5, NaN, Infinity])
      expect(() => conversionElementLevel(roll)).toThrow(RangeError);
  });
  it.each([2, 3, 4])('keeps existing elemental level %i before skill-level1 randomization', (level) => {
    expect(conversionOverlap(level, 1)).toBe('keep');
    expect(conversionAttemptStages({ existingLevel: level }))
      .toEqual({ action: 'keep', statusRolls: 1, levelRolls: 0 });
  });
  it('admits missing equal and weaker status, comparing incoming skill level rather than its future roll', () => {
    expect(conversionOverlap(undefined, 1)).toBe('apply');
    expect(conversionOverlap(1, 1)).toBe('apply');
    expect(conversionOverlap(1, 2)).toBe('apply');
    expect(conversionOverlap(2, 2)).toBe('apply');
    expect(conversionOverlap(3, 2)).toBe('keep');
    expect(conversionAttemptStages({ existingLevel: 1 }))
      .toEqual({ action: 'apply', statusRolls: 1, levelRolls: 1 });
    expect(conversionAttemptStages())
      .toEqual({ action: 'apply', statusRolls: 1, levelRolls: 1 });
  });
  it('rejects bosses in the skill handler before either source roll even with strong overlap', () => {
    expect(conversionAttemptStages({ boss: true }))
      .toEqual({ action: 'reject', statusRolls: 0, levelRolls: 0 });
    expect(conversionAttemptStages({ boss: true, existingLevel: 4 }))
      .toEqual({ action: 'reject', statusRolls: 0, levelRolls: 0 });
  });
  it('does not request random level for a fixed higher incoming skill level', () => {
    expect(conversionAttemptStages({ incomingSkillLevel: 2, existingLevel: 1 }))
      .toEqual({ action: 'apply', statusRolls: 1, levelRolls: 0 });
  });
  it('pins thirty minutes and NoDispelReset without treating status as a dispellable buff', () => {
    expect(ELEMENTAL_CONVERSION_DURATION_MS).toBe(1800000);
    expect(ELEMENTAL_CONVERSION_DISPEL_REMOVABLE).toBe(false);
  });
  it('projects the converted body and then restores the original when caller removes expired status', () => {
    const conversion = Object.freeze({ element: 'water', level: 3 });
    expect(effectiveConvertedElement(base, { ...noControl, conversion }))
      .toEqual({ element: 'water', elementLevel: 3 });
    expect(effectiveConvertedElement(base, noControl)).toEqual({ element: 'undead', elementLevel: 2 });
    expect(base).toEqual({ element: 'undead', elementLevel: 2 });
    expect(conversion).toEqual({ element: 'water', level: 3 });
  });
  it('prioritizes Freeze over petrified Stone over conversion with elemental level1', () => {
    const conversion = Object.freeze({ element: 'fire', level: 4 });
    expect(effectiveConvertedElement(base, { conversion, freeze: true, stonePetrified: true }))
      .toEqual({ element: 'water', elementLevel: 1 });
    expect(effectiveConvertedElement(base, { conversion, freeze: false, stonePetrified: true }))
      .toEqual({ element: 'earth', elementLevel: 1 });
    expect(effectiveConvertedElement(base, { conversion, ...noControl }))
      .toEqual({ element: 'fire', elementLevel: 4 });
    expect(effectiveConvertedElement(base, { freeze: true, stonePetrified: false }))
      .toEqual({ element: 'water', elementLevel: 1 });
  });
  it.each([
    ['water', 'wind', [175, 175, 200, 200]],
    ['water', 'water', [25, 0, -25, -50]],
    ['water', 'fire', [50, 25, 0, 0]],
    ['earth', 'fire', [150, 175, 200, 200]],
    ['earth', 'wind', [50, 25, 0, 0]],
    ['fire', 'water', [150, 175, 200, 200]],
    ['wind', 'earth', [150, 175, 200, 200]],
  ])('feeds projected %s levels into the real catalog %s percentage row', (element, attack, percentages) => {
    const actual = [0, 1, 2, 3].map(roll => {
      const body = effectiveConvertedElement(base, {
        ...noControl, conversion: { element, level: conversionElementLevel(roll) },
      });
      return catalog.elementModifiers![attack][body.element][body.elementLevel - 1];
    });
    expect(actual).toEqual(percentages);
  });
  it('feeds Freeze and Stone precedence into real damage percentages before conversion resumes', () => {
    const options = { conversion: { element: 'water', level: 3 }, freeze: false, stonePetrified: true };
    const stone = effectiveConvertedElement(base, options);
    expect(catalog.elementModifiers!.fire[stone.element][stone.elementLevel - 1]).toBe(150);
    const thawed = effectiveConvertedElement(base, { ...options, stonePetrified: false });
    expect(catalog.elementModifiers!.fire[thawed.element][thawed.elementLevel - 1]).toBe(0);
    const frozen = effectiveConvertedElement(base, { ...options, freeze: true });
    expect(catalog.elementModifiers!.wind[frozen.element][frozen.elementLevel - 1]).toBe(175);
  });
});
