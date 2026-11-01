import { describe, expect, it } from 'vitest';
import {
  TRICK_DEAD_BASE_SP_COST,
  TRICK_DEAD_DURATION_MS,
  TRICK_DEAD_PERSISTED,
  resolveTrickDeadToggle,
  trickDeadActionAllowed,
  trickDeadIncomingHit,
  trickDeadLifecycle,
} from '../engine/trickDeadRules.js';

describe('pinned pre-renewal Trick Dead rules', () => {
  it('uses the five SP base cost and has no finite effective expiry', () => {
    expect(TRICK_DEAD_BASE_SP_COST).toBe(5);
    expect(TRICK_DEAD_DURATION_MS).toBe(Number.POSITIVE_INFINITY);
    expect(TRICK_DEAD_PERSISTED).toBe(false);
  });

  it('activates only for a learned living Novice or High Novice in the field', () => {
    const base = { active: false, learned: true, classKey: 'novice', inField: true, alive: true, sp: 20, modifiedSpCost: 5 };
    expect(resolveTrickDeadToggle(base)).toEqual({ accepted: true, active: true, sp: 15, activationRolls: 1 });
    expect(resolveTrickDeadToggle({ ...base, classKey: 'high_novice' }).accepted).toBe(true);
    for (const classKey of ['super_novice', 'super_baby', 'swordsman']) {
      expect(resolveTrickDeadToggle({ ...base, classKey }).accepted).toBe(false);
    }
    expect(resolveTrickDeadToggle({ ...base, learned: false }).accepted).toBe(false);
    expect(resolveTrickDeadToggle({ ...base, inField: false }).accepted).toBe(false);
    expect(resolveTrickDeadToggle({ ...base, alive: false }).accepted).toBe(false);
    expect(resolveTrickDeadToggle({ ...base, sp: 4 }).accepted).toBe(false);
  });

  it('charges the already modified SP cost once and requests one activation status roll', () => {
    expect(resolveTrickDeadToggle({ active: false, learned: true, classKey: 'novice', inField: true, alive: true, sp: 10, modifiedSpCost: 3 }))
      .toEqual({ accepted: true, active: true, sp: 7, activationRolls: 1 });
  });

  it('turns off for free with no activation roll', () => {
    expect(resolveTrickDeadToggle({ active: true, learned: true, classKey: 'novice', inField: false, alive: true, sp: 2, modifiedSpCost: 5 }))
      .toEqual({ accepted: true, active: false, sp: 2, activationRolls: 0 });
  });

  it('allows only the manual toggle while active', () => {
    expect(trickDeadActionAllowed(true, 'toggle')).toBe(true);
    for (const action of ['move', 'item', 'skill', 'basicAttack', 'cast', 'recoverHp', 'recoverSp'] as const) {
      expect(trickDeadActionAllowed(true, action)).toBe(false);
    }
    expect(trickDeadActionAllowed(false, 'move')).toBe(true);
  });

  it('blocks basic and skill hits before damage without consuming the status', () => {
    expect(trickDeadIncomingHit(true, 'basic')).toEqual({ blocked: true, consumeStatus: false });
    expect(trickDeadIncomingHit(true, 'skill')).toEqual({ blocked: true, consumeStatus: false });
    expect(trickDeadIncomingHit(false, 'basic')).toEqual({ blocked: false, consumeStatus: false });
    expect(trickDeadIncomingHit(false, 'skill')).toEqual({ blocked: false, consumeStatus: false });
  });

  it('retains the status through reads and ordinary ticks, and clears at required boundaries', () => {
    for (const event of ['poll', 'tick', 'pause', 'save'] as const) {
      expect(trickDeadLifecycle(true, event)).toBe(true);
    }
    for (const event of ['sessionEnd', 'death', 'warp', 'classIneligible'] as const) {
      expect(trickDeadLifecycle(true, event)).toBe(false);
    }
    expect(trickDeadLifecycle(false, 'tick')).toBe(false);
  });
});
