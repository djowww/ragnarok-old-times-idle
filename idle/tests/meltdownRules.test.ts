import { describe, expect, it, vi } from 'vitest';
import {
  meltdownBuffDurationMs,
  resolveMeltdownAdditionalEffects,
  type MeltdownAdditionalEffectsInput,
  type MeltdownSlot,
} from '../engine/meltdownRules.js';

const input = (patch: Partial<MeltdownAdditionalEffectsInput> = {}): MeltdownAdditionalEffectsInput => ({
  capturedBuffLevel: 1,
  attackKind: 'weapon',
  damage: 1,
  targetAlive: true,
  bossImmune: false,
  weaponProtected: false,
  armorProtected: false,
  ...patch,
});

const levels = Array.from({ length: 10 }, (_, index) => index + 1);

describe('Hercules pre-re Meltdown additional effects', () => {
  it.each(levels)('uses strict source chance boundaries at buff level %i', level => {
    const startStrip = vi.fn((_slot: MeltdownSlot) => true);
    const below = vi.fn()
      .mockReturnValueOnce(100 * level - 1)
      .mockReturnValueOnce(70 * level - 1);
    expect(resolveMeltdownAdditionalEffects(input({ capturedBuffLevel: level }), below, startStrip))
      .toEqual({ weapon: 'applied', armor: 'applied' });
    expect(startStrip.mock.calls.map(call => call[0])).toEqual(['weapon', 'armor']);
    expect(below).toHaveBeenCalledTimes(2);

    startStrip.mockClear();
    const exact = vi.fn()
      .mockReturnValueOnce(100 * level)
      .mockReturnValueOnce(70 * level);
    expect(resolveMeltdownAdditionalEffects(input({ capturedBuffLevel: level }), exact, startStrip))
      .toEqual({ weapon: 'miss', armor: 'miss' });
    expect(startStrip).not.toHaveBeenCalled();
    expect(exact).toHaveBeenCalledTimes(2);
  });

  it('finishes the weapon status callback before drawing for armor', () => {
    const trace: string[] = [];
    const values = [0, 314, 0, 271];
    const roll = () => {
      const value = values.shift()!;
      trace.push(`roll:${value}`);
      return value;
    };
    const startStrip = (slot: MeltdownSlot) => {
      trace.push(`start:${slot}`);
      // The native status_start owns this guaranteed-status draw, not the helper.
      roll();
      return true;
    };
    expect(resolveMeltdownAdditionalEffects(input(), roll, startStrip))
      .toEqual({ weapon: 'applied', armor: 'applied' });
    expect(trace).toEqual(['roll:0', 'start:weapon', 'roll:314', 'roll:0', 'start:armor', 'roll:271']);
    expect(values).toEqual([]);
  });

  it.each([
    { weaponProtected: true, armorProtected: false, expected: { weapon: 'protected', armor: 'applied' }, slots: ['armor'], draws: 1 },
    { weaponProtected: false, armorProtected: true, expected: { weapon: 'applied', armor: 'protected' }, slots: ['weapon'], draws: 1 },
    { weaponProtected: true, armorProtected: true, expected: { weapon: 'protected', armor: 'protected' }, slots: [], draws: 0 },
  ])('skips only protected slot draws: $weaponProtected/$armorProtected', row => {
    const roll = vi.fn(() => 0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
    expect(resolveMeltdownAdditionalEffects(input(row), roll, startStrip)).toEqual(row.expected);
    expect(roll).toHaveBeenCalledTimes(row.draws);
    expect(startStrip.mock.calls.map(call => call[0])).toEqual(row.slots);
  });

  it('consumes both boss break draws without calling native status_start', () => {
    const roll = vi.fn(() => 0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
    expect(resolveMeltdownAdditionalEffects(input({ bossImmune: true }), roll, startStrip))
      .toEqual({ weapon: 'boss-immune', armor: 'boss-immune' });
    expect(roll).toHaveBeenCalledTimes(2);
    expect(startStrip).not.toHaveBeenCalled();
  });

  it('checks boss immunity after each proc roll instead of suppressing chance misses', () => {
    const roll = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
    expect(resolveMeltdownAdditionalEffects(input({ bossImmune: true }), roll, startStrip))
      .toEqual({ weapon: 'miss', armor: 'boss-immune' });
    expect(roll).toHaveBeenCalledTimes(2);
    expect(startStrip).not.toHaveBeenCalled();
  });

  it('checks protection before the boss break draw', () => {
    const roll = vi.fn(() => 0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
    expect(resolveMeltdownAdditionalEffects(input({ bossImmune: true, weaponProtected: true }), roll, startStrip))
      .toEqual({ weapon: 'protected', armor: 'boss-immune' });
    expect(roll).toHaveBeenCalledTimes(1);
    expect(startStrip).not.toHaveBeenCalled();
  });

  it('delegates rejection and refresh to the status callback without inventing extra draws', () => {
    const roll = vi.fn(() => 0);
    const startStrip = vi.fn((slot: MeltdownSlot) => slot === 'armor');
    expect(resolveMeltdownAdditionalEffects(input(), roll, startStrip))
      .toEqual({ weapon: 'status-rejected', armor: 'applied' });
    expect(roll).toHaveBeenCalledTimes(2);
    expect(startStrip.mock.calls.map(call => call[0])).toEqual(['weapon', 'armor']);
  });

  it.each([undefined, 'SM_BASH', 'TF_DOUBLE', 'MO_TRIPLEATTACK', 'HT_POWER'])
    ('accepts eligible normal or BF_WEAPON skill phase %s', skillSourceName => {
      const roll = vi.fn(() => 0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
      expect(resolveMeltdownAdditionalEffects(input({ skillSourceName }), roll, startStrip))
        .toEqual({ weapon: 'applied', armor: 'applied' });
      expect(roll).toHaveBeenCalledTimes(2);
    });

  it.each(['WS_CARTTERMINATION', 'ITM_TOMAHAWK', 'CR_REFLECTSHIELD'])
    ('excludes the source skill %s before any break draw', skillSourceName => {
      const roll = vi.fn(() => 0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
      expect(resolveMeltdownAdditionalEffects(input({ skillSourceName }), roll, startStrip))
        .toEqual({ weapon: 'ineligible', armor: 'ineligible' });
      expect(roll).not.toHaveBeenCalled();
      expect(startStrip).not.toHaveBeenCalled();
    });

  it.each<Partial<MeltdownAdditionalEffectsInput>>([
    { attackKind: 'magic' }, { attackKind: 'misc' }, { damage: 0 }, { damage: -1 },
    { damage: Number.NaN }, { damage: Number.POSITIVE_INFINITY },
    { targetAlive: false }, { capturedBuffLevel: 0 }, { capturedBuffLevel: -1 },
    { capturedBuffLevel: 11 }, { capturedBuffLevel: 1.5 }, { capturedBuffLevel: Number.NaN },
  ])('does not run a break phase for ineligible input %j', patch => {
    const roll = vi.fn(() => 0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
    expect(resolveMeltdownAdditionalEffects(input(patch), roll, startStrip))
      .toEqual({ weapon: 'ineligible', armor: 'ineligible' });
    expect(roll).not.toHaveBeenCalled();
    expect(startStrip).not.toHaveBeenCalled();
  });

  it('does not proc on a killing strike even when the resolved damage was positive', () => {
    const roll = vi.fn(() => 0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
    resolveMeltdownAdditionalEffects(input({ damage: 9999, targetAlive: false }), roll, startStrip);
    expect(roll).not.toHaveBeenCalled();
    expect(startStrip).not.toHaveBeenCalled();
  });

  it('runs one phase per target, independent of aggregated multi-hit damage', () => {
    for (const damage of [1, 2, 3, 9999]) {
      const roll = vi.fn(() => 0), startStrip = vi.fn((_slot: MeltdownSlot) => true);
      resolveMeltdownAdditionalEffects(input({ damage }), roll, startStrip);
      expect(roll).toHaveBeenCalledTimes(2);
      expect(startStrip).toHaveBeenCalledTimes(2);
    }
  });

  it('never changes the captured input', () => {
    const captured = Object.freeze(input({ capturedBuffLevel: 10 }));
    const before = structuredClone(captured);
    resolveMeltdownAdditionalEffects(captured, () => 0, () => true);
    expect(captured).toEqual(before);
  });

  it.each([-1, 10000, 0.5, Number.NaN, Number.POSITIVE_INFINITY])
    ('rejects malformed RNG output %s without starting a status', value => {
      const roll = vi.fn(() => value), startStrip = vi.fn((_slot: MeltdownSlot) => true);
      expect(resolveMeltdownAdditionalEffects(input(), roll, startStrip))
        .toEqual({ weapon: 'miss', armor: 'miss' });
      expect(roll).toHaveBeenCalledTimes(2);
      expect(startStrip).not.toHaveBeenCalled();
    });
});

describe('Hercules Meltdown buff duration', () => {
  it.each(levels)('uses SkillData1, not the 5 s SkillData2, at level %i', level => {
    expect(meltdownBuffDurationMs(level)).toBe(15000 + 5000 * (level - 1));
  });
  it.each([0, -1, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
    ('does not silently clamp an invalid captured level %s', level => {
      expect(meltdownBuffDurationMs(level)).toBeUndefined();
    });
});
