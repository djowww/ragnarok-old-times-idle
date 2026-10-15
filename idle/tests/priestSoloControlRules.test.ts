import { describe, expect, it } from 'vitest';
import type { Monster } from '../shared/types.js';
import {
  priestControlAttemptStages, priestControlStatusResistance,
  recoveryTargetsUndead, recoveryUndeadInput,
} from '../engine/priestSoloControlRules.js';

const zombie: Monster = {
  id: 1015, name: 'Zombie', aegisName: 'ZOMBIE', sprite: { spr: '', act: '' },
  level: 15, hp: 534, attack: [67, 79], def: 0, mdef: 10,
  stats: { str: 0, agi: 8, vit: 7, int: 0, dex: 15, luk: 0 },
  baseExp: 50, jobExp: 33, attackDelay: 2612,
  element: 'undead', elementLevel: 1, size: 'medium', race: 'undead', drops: [],
};
const source = { level: 15 };

describe('pinned pre-renewal Priest monster control rules', () => {
  it('derives Recovery Zombie raw98 percent29100ms then final94.6 percent28082ms', () => {
    const raw = recoveryUndeadInput(zombie.stats);
    expect(raw).toEqual({ chanceBp: 9800, durationMs: 29100 });
    expect(priestControlStatusResistance(zombie, 'SC_BLIND', raw.chanceBp, raw.durationMs, source))
      .toEqual({ chanceBp: 9460, durationMs: 28082 });
  });
  it('truncates the three initial stat divisions separately and sums INT VIT before duration division', () => {
    expect(recoveryUndeadInput({ int: 5, vit: 8, luk: 19 }))
      .toEqual({ chanceBp: 9500, durationMs: 28200 });
    expect(recoveryUndeadInput({ int: 250, vit: 0, luk: 0 }))
      .toEqual({ chanceBp: -2500, durationMs: -7500 });
  });
  it('branches on the effective undead element and ignores undead race after element changes', () => {
    const bruteUndead = { ...zombie, race: 'brute' };
    expect(recoveryTargetsUndead(zombie)).toBe(true);
    expect(recoveryTargetsUndead(bruteUndead)).toBe(true);
    expect(recoveryTargetsUndead({ ...zombie, element: 'water' })).toBe(false);
    expect(recoveryTargetsUndead({ ...zombie, element: 'earth' })).toBe(false);
  });
  it('uses effective INT VIT for Blind and separate LUK and level chance terms', () => {
    const target = { ...zombie, level: 25, stats: { ...zombie.stats, vit: 11, int: 20, luk: 3 } };
    expect(priestControlStatusResistance(target, 'SC_BLIND', 8000, 30001, { level: 20 }))
      .toEqual({ chanceBp: 6680, durationMs: 25321 });
    expect(priestControlStatusResistance({ ...target, mdef: 999 }, 'SC_BLIND', 8000, 30001, { level: 20 }))
      .toEqual({ chanceBp: 6680, durationMs: 25321 });
    expect(priestControlStatusResistance({ ...target, stats: { ...target.stats, int: 16, vit: 9 } }, 'SC_BLIND', 8000, 30001, { level: 20 }))
      .toEqual({ chanceBp: 6920, durationMs: 26221 });
  });
  it('resists Silence with VIT and LUK while MDEF INT and caster LUK are immaterial', () => {
    const target = { ...zombie, level: 25, stats: { ...zombie.stats, vit: 11, int: 20, luk: 3 } };
    const luckyCaster = { level: 20, luk: 999 };
    expect(priestControlStatusResistance(target, 'SC_SILENCE', 8000, 30001, { level: 20 }))
      .toEqual({ chanceBp: 7040, durationMs: 26671 });
    expect(priestControlStatusResistance({ ...target, mdef: 999, stats: { ...target.stats, int: 999 } }, 'SC_SILENCE', 8000, 30001, { level: 20 }))
      .toEqual({ chanceBp: 7040, durationMs: 26671 });
    expect(priestControlStatusResistance(target, 'SC_SILENCE', 8000, 30001, luckyCaster))
      .toEqual({ chanceBp: 7040, durationMs: 26671 });
  });
  it.each([
    [30000, 27900], [35000, 32550], [40000, 37200], [45000, 41850], [50000, 46500],
    [60000, 55800],
  ])('applies Silence source duration %i as resisted duration %i', (initial, final) => {
    expect(priestControlStatusResistance(zombie, 'SC_SILENCE', 10000, initial, source))
      .toEqual({ chanceBp: 9300, durationMs: final });
  });
  it('caps target and caster levels independently at99 and leaves level out of duration', () => {
    const target = { ...zombie, level: 150, stats: { ...zombie.stats, vit: 0 } };
    expect(priestControlStatusResistance(target, 'SC_SILENCE', 6000, 30000, { level: 120 }))
      .toEqual({ chanceBp: 6000, durationMs: 30000 });
    expect(priestControlStatusResistance(target, 'SC_SILENCE', 6000, 30000, { level: 50 }))
      .toEqual({ chanceBp: 5510, durationMs: 30000 });
  });
  it('truncates proportional reductions then rounds positive chance upward to0.1percent', () => {
    const target = { ...zombie, stats: { ...zombie.stats, vit: 1 } };
    for (const chance of [499, 500, 501]) {
      expect(priestControlStatusResistance(target, 'SC_SILENCE', chance, 30001, source))
        .toEqual({ chanceBp: 500, durationMs: 29701 });
    }
    expect(priestControlStatusResistance(target, 'SC_SILENCE', 1, 30001, source).chanceBp).toBe(10);
  });
  it('keeps min1ms potential duration even for zero chance and does not invent VIT immunity', () => {
    const target = { ...zombie, stats: { ...zombie.stats, vit: 200 } };
    expect(priestControlStatusResistance(target, 'SC_SILENCE', 6000, 30000, source))
      .toEqual({ chanceBp: 0, durationMs: 1 });
    expect(priestControlStatusResistance({ ...target, level: 1 }, 'SC_SILENCE', 6000, 30000, { level: 99 }))
      .toEqual({ chanceBp: 980, durationMs: 1 });
    expect(priestControlStatusResistance(zombie, 'SC_BLIND', 0, 29100, source))
      .toEqual({ chanceBp: 0, durationMs: 28082 });
  });
  it('defers boss rejection so boss arithmetic and overlap still reach the resistance roll', () => {
    expect(priestControlStatusResistance({ ...zombie, boss: true }, 'SC_BLIND', 9800, 29100, source))
      .toEqual({ chanceBp: 9460, durationMs: 28082 });
    expect(priestControlAttemptStages('SC_BLIND', { boss: true }))
      .toEqual({ action: 'start', rollResistance: true, rejectAfterRoll: true });
    expect(priestControlAttemptStages('SC_BLIND', { alreadyActive: true }))
      .toEqual({ action: 'start', rollResistance: true, rejectAfterRoll: true });
    expect(priestControlAttemptStages('SC_SILENCE', { boss: true }))
      .toEqual({ action: 'start', rollResistance: true, rejectAfterRoll: true });
    expect(priestControlAttemptStages('SC_BLIND'))
      .toEqual({ action: 'start', rollResistance: true, rejectAfterRoll: false });
  });
  it('rejects Recovery handler immunity before RNG and toggles existing Silence before resistance', () => {
    expect(priestControlAttemptStages('SC_BLIND', { handlerImmune: true, alreadyActive: true, boss: true }))
      .toEqual({ action: 'reject', rollResistance: false, rejectAfterRoll: false });
    expect(priestControlAttemptStages('SC_SILENCE', { alreadyActive: true, boss: true }))
      .toEqual({ action: 'remove', rollResistance: false, rejectAfterRoll: false });
  });
  it('honors fixed rate duration and noAvoid independently without consuming RNG or mutating input', () => {
    const target = Object.freeze({ ...zombie, stats: Object.freeze({ ...zombie.stats, luk: 3 }) });
    expect(priestControlStatusResistance(target, 'SC_BLIND', 9800, 29100, { ...source, fixedRate: true }))
      .toEqual({ chanceBp: 9800, durationMs: 28052 });
    expect(priestControlStatusResistance(target, 'SC_BLIND', 9800, 29100, { ...source, fixedDuration: true }))
      .toEqual({ chanceBp: 9430, durationMs: 29100 });
    expect(priestControlStatusResistance(target, 'SC_BLIND', 0, 0, { ...source, noAvoid: true }))
      .toEqual({ chanceBp: 10000, durationMs: 1 });
    expect(priestControlStatusResistance(target, 'SC_SILENCE', 0, 30000, null))
      .toEqual({ chanceBp: 10000, durationMs: 30000 });
    expect(priestControlAttemptStages('SC_BLIND', { noAvoid: true, boss: true }))
      .toEqual({ action: 'start', rollResistance: false, rejectAfterRoll: false });
    expect(priestControlAttemptStages('SC_BLIND', { noAvoid: true, alreadyActive: true }))
      .toEqual({ action: 'start', rollResistance: false, rejectAfterRoll: true });
    expect(priestControlAttemptStages('SC_BLIND', { sourcePresent: false, boss: true }))
      .toEqual({ action: 'start', rollResistance: false, rejectAfterRoll: true });
    expect(target.stats.luk).toBe(3);
  });
});
