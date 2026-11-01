import { describe, expect, it } from 'vitest';
import { fullStripRules, resolveFullStrip, rejectSwordHit, autoBerserkProvoke, autoBerserkModifiers } from '../engine/reactiveSolo';

describe('Full Strip source rules', () => {
  it('uses one 15 percent attempt for all four slots at level five', () => {
    expect(fullStripRules(5, 100, 100)).toMatchObject({ chancePct: 15, durationMs: 135000 });
    expect(resolveFullStrip({ level: 5, casterDex: 100, targetDex: 100, rollPct: 14.999 }).appliedStatuses)
      .toEqual(['SC_NOEQUIPWEAPON', 'SC_NOEQUIPSHIELD', 'SC_NOEQUIPARMOR', 'SC_NOEQUIPHELM']);
    expect(resolveFullStrip({ level: 5, casterDex: 100, targetDex: 100, rollPct: 15 }).appliedStatuses).toEqual([]);
  });
  it('truncates negative DEX difference toward zero and retains the five percent floor', () => {
    expect(fullStripRules(1, 0, 4)).toMatchObject({ chancePct: 7, durationMs: 73000 });
    expect(fullStripRules(1, 0, 15)).toMatchObject({ chancePct: 5, durationMs: 67500 });
    expect(fullStripRules(1, 0, 200).durationMs).toBe(0);
  });
  it('filters each chemical protection after the joint roll', () => {
    expect(resolveFullStrip({ level: 5, casterDex: 100, targetDex: 100, rollPct: 0,
      protectedStatuses: ['SC_NOEQUIPSHIELD'] }).appliedStatuses)
      .toEqual(['SC_NOEQUIPWEAPON', 'SC_NOEQUIPARMOR', 'SC_NOEQUIPHELM']);
  });
});

describe('Reject Sword source rules', () => {
  it('halves only the first damage channel and returns that exact integer as counter damage', () => {
    expect(rejectSwordHit({ level: 5, charges: 3, damage: 5, damage2: 7, rollPct: 0 }))
      .toEqual({ damage: 2, damage2: 7, counterDamage: 2, triggered: true, remainingCharges: 2 });
  });
  it('uses an exclusive 15 percent per level chance and spends charges only on success', () => {
    expect(rejectSwordHit({ level: 1, charges: 3, damage: 100, rollPct: 15 }))
      .toMatchObject({ damage: 100, counterDamage: 0, triggered: false, remainingCharges: 3 });
    expect(rejectSwordHit({ level: 1, charges: 1, damage: 100, rollPct: 14.99 }))
      .toMatchObject({ damage: 50, counterDamage: 50, triggered: true, remainingCharges: 0 });
  });
  it('does not trigger on fully blocked hits, but damage one still consumes a charge', () => {
    expect(rejectSwordHit({ level: 5, charges: 3, damage: 0, rollPct: 0 }).remainingCharges).toBe(3);
    expect(rejectSwordHit({ level: 5, charges: 3, damage: 1, rollPct: 0 }))
      .toMatchObject({ damage: 0, counterDamage: 0, triggered: true, remainingCharges: 2 });
  });
});

describe('Auto Berserk source rules', () => {
  it.each([100, 103])('uses a strict integer quarter HP threshold for maximum %i', maxHp => {
    expect(autoBerserkProvoke({ enabled: true, hp: 24, maxHp })).toEqual({ level: 10, automatic: true });
    expect(autoBerserkProvoke({ enabled: true, hp: 25, maxHp })).toBeUndefined();
  });
  it('does not activate on dead players or a zero integer threshold', () => {
    expect(autoBerserkProvoke({ enabled: true, hp: 0, maxHp: 100 })).toBeUndefined();
    expect(autoBerserkProvoke({ enabled: true, hp: 1, maxHp: 3 })).toBeUndefined();
  });
  it('removes only its own Provoke on healing or cancellation', () => {
    const external = { level: 5, automatic: false };
    expect(autoBerserkProvoke({ enabled: false, hp: 100, maxHp: 100, provoke: external })).toEqual(external);
    expect(autoBerserkProvoke({ enabled: false, hp: 20, maxHp: 100, provoke: { level: 10, automatic: true } })).toBeUndefined();
    expect(autoBerserkProvoke({ enabled: true, hp: 20, maxHp: 100, provoke: external })).toEqual({ level: 10, automatic: true });
  });
  it('exposes source attack and soft-defense percentages separately from hard DEF and skill ratio', () => {
    expect(autoBerserkModifiers({ enabled: true, hp: 24, maxHp: 100 }))
      .toEqual({ sourceAttackPercent: 132, sourceDefensePercent: 45 });
    expect(autoBerserkModifiers({ enabled: true, hp: 25, maxHp: 100 }))
      .toEqual({ sourceAttackPercent: 100, sourceDefensePercent: 100 });
  });
});
