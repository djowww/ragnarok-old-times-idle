import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import { applyClassicBuff, cancelClassicBuff } from '../engine/classicBuffs';
import { createInitialState } from '../engine';
import { recoverResources } from '../engine/recovery';
import type { Catalog, Skill } from '../shared/types';
import { fixture } from './engine-fixture';

const exportedSkill = Object.values((catalogJson as unknown as Catalog).skills)
  .find(skill => skill.sourceName === 'PA_GOSPEL')!;

function setup(level: number) {
  const catalog = fixture();
  catalog.classes.novice.hp.fill(1000);
  catalog.classes.novice.sp.fill(500);
  const skill = structuredClone(exportedSkill) as Skill;
  skill.implementation = 'supported';
  catalog.skills[skill.id] = skill;
  const state = createInitialState(catalog, 0);
  state.status = 'hunting';
  state.areaId = 'prontera';
  state.hp = 100;
  state.sp = 100;
  state.combatEffects = { regenBlockedUntil: Number.MAX_SAFE_INTEGER };
  state.buffs[skill.id] = { startsAt: 0, expiresAt: 60_000, effects: {} };
  expect(applyClassicBuff(state, catalog, skill, level, 0)).toBe(true);
  return { catalog, state, skill };
}

describe('Battle Chant solo status', () => {
  it('is exposed as a supported self skill with the Hercules resource pulse', () => {
    expect(exportedSkill.implementation).toBe('supported');
    expect(exportedSkill.unsupportedReason).toBeUndefined();
    expect(exportedSkill.description).toContain('10 segundos');
    expect(exportedSkill.description).toContain('30 HP');
    expect(exportedSkill.description).toContain('45 HP');
    expect(exportedSkill.spCost).toEqual([80, 80, 80, 80, 80, 100, 100, 100, 100, 100]);
    expect(exportedSkill.statusDurationMs).toEqual(Array(10).fill(60_000));
  });

  it('restores 30 HP and 20 SP every ten seconds through five pulses, independent of walking', () => {
    const { catalog, state } = setup(5);
    state.fieldHero = {
      areaId: 'prontera', from: { x: 0, y: 0 }, position: { x: 0.1, y: 0 },
      startedAt: 0, arrivedAt: 100_000, routeIndex: 0, phase: 'chasing',
    };
    recoverResources(state, catalog, 9_999, 9_999);
    expect([state.hp, state.sp]).toEqual([100, 100]);
    recoverResources(state, catalog, 10_000, 1);
    expect([state.hp, state.sp]).toEqual([130, 120]);
    recoverResources(state, catalog, 50_000, 40_000);
    expect([state.hp, state.sp]).toEqual([250, 200]);
    recoverResources(state, catalog, 60_000, 10_000);
    expect([state.hp, state.sp]).toEqual([250, 200]);
  });

  it('uses the level-six pulse and clears its timer when the status is cancelled', () => {
    const { catalog, state, skill } = setup(6);
    recoverResources(state, catalog, 10_000, 10_000);
    expect([state.hp, state.sp]).toEqual([145, 135]);
    cancelClassicBuff(state, catalog, 'PA_GOSPEL');
    expect(state.buffs[skill.id]).toBeUndefined();
    expect(state.combatEffects?.battleChant).toBeUndefined();
  });
});
