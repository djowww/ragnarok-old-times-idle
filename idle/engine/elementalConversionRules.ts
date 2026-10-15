/**
 * Hercules pre-renewal SC_ARMOR_PROPERTY, pinned at
 * 410b9738c049ab1825d67b36b072d837c1d0b33a. GPL-3.0-or-later.
 * status.c SHA256: 74d8626486cbfcf38d5eed1a49f76d3e8d400d6ee3ed47eb5c1c9bd9f3df0b26.
 * Callers own active-status selection, expiry, RNG and mutation.
 */
export type ConversionElement = 'water' | 'earth' | 'fire' | 'wind';
export type ConversionElementLevel = 1 | 2 | 3 | 4;
export interface ConversionSpec { element: ConversionElement; reagentItemId: number }
export interface ConversionAttemptFlags { boss?: boolean; existingLevel?: number; incomingSkillLevel?: number }
export interface ConversionAttemptStages {
  action: 'reject' | 'keep' | 'apply'; statusRolls: 0 | 1; levelRolls: 0 | 1;
}
export interface ConvertedElement { element: string; elementLevel: number }
export interface ConversionProjectionOptions {
  conversion?: { element: string; level: number };
  freeze: boolean; stonePetrified: boolean;
}

/** skill_db.conf:18636..18665,18867..18962; sc_config.conf:2011..2026. */
export const ELEMENTAL_CONVERSION_DURATION_MS = 1800000;
export const ELEMENTAL_CONVERSION_DISPEL_REMOVABLE = false;

/** skill.c:8996..9017 and skill_db.conf's four reagent requirements.
 * Fresh objects prevent callers from modifying later lookups. */
export function conversionSpec(source: string): ConversionSpec | undefined {
  switch (source) {
    case 'SA_ELEMENTWATER': return { element: 'water', reagentItemId: 12115 };
    case 'SA_ELEMENTGROUND': return { element: 'earth', reagentItemId: 12116 };
    case 'SA_ELEMENTFIRE': return { element: 'fire', reagentItemId: 12114 };
    case 'SA_ELEMENTWIND': return { element: 'wind', reagentItemId: 12117 };
    default: return undefined;
  }
}

/** status.c:7955..7956: caller supplies rnd()%4 after the status roll.
 * The RangeError guards the public pure helper's input contract. */
export function conversionElementLevel(roll0To3: number): ConversionElementLevel {
  if (!Number.isInteger(roll0To3) || roll0To3 < 0 || roll0To3 > 3)
    throw new RangeError('Elemental conversion roll must be an integer from 0 to 3');
  return (1 + roll0To3) as ConversionElementLevel;
}

/** status.c:7828..7830 compares old val1 with incoming skill val1 BEFORE
 * randomizing the new level. Keep means successful animation but no new
 * element, level, duration or expiry; caller preserves the entire status. */
export function conversionOverlap(existingLevel: number | undefined, incomingSkillLevel = 1): 'keep' | 'apply' {
  return existingLevel !== undefined && existingLevel > incomingSkillLevel ? 'keep' : 'apply';
}

/** skill.c:9002..9003 rejects bosses before status.c:7097's default
 * resistance roll. That roll occurs even at guaranteed 10000 rate and
 * precedes overlap. Only an accepted level1 skill reaches rnd()%4.
 * This contract covers the four selected, nonzero elemental skills. */
export function conversionAttemptStages(flags: ConversionAttemptFlags = {}): ConversionAttemptStages {
  if (flags.boss) return { action: 'reject', statusRolls: 0, levelRolls: 0 };
  const incomingSkillLevel = flags.incomingSkillLevel ?? 1;
  const action = conversionOverlap(flags.existingLevel, incomingSkillLevel);
  return { action, statusRolls: 1, levelRolls: action === 'apply' && incomingSkillLevel === 1 ? 1 : 0 };
}

/** status.c:6084..6114: Freeze takes precedence over petrified Stone,
 * both level1, then the active conversion. Caller omits expired conversion
 * and distinguishes Stone's waiting phase from actual petrification. */
export function effectiveConvertedElement(base: ConvertedElement, options: ConversionProjectionOptions): ConvertedElement {
  if (options.freeze) return { element: 'water', elementLevel: 1 };
  if (options.stonePetrified) return { element: 'earth', elementLevel: 1 };
  if (options.conversion) return { element: options.conversion.element, elementLevel: options.conversion.level };
  return { ...base };
}
