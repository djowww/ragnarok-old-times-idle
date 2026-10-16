import { describe, expect, it } from 'vitest';
import * as traps from '../engine/hunterTraps.js';
import { fixture } from './engine-fixture.js';

// RED: absent helpers cannot produce the pinned ground lifetime/status arithmetic.
describe('pinned Hunter trap rules', () => {
  it('keeps placement lifetime separate from triggered effects', () => {
    expect(traps.hunterTrapSpec?.('HT_SKIDTRAP', 5)).toMatchObject({ lifetimeMs: 60000, triggerRadius: 1, knockbackTiles: 10 });
    expect(traps.hunterTrapSpec?.('HT_ANKLESNARE', 1)).toMatchObject({ lifetimeMs: 250000, statusDurationMs: 4000 });
    expect(traps.hunterTrapSpec?.('HT_SANDMAN', 5)).toMatchObject({ lifetimeMs: 30000, splashRadius: 2, statusDurationMs: 20000, chancePct: 90 });
    expect(traps.hunterTrapSpec?.('HT_FLASHER', 5)).toMatchObject({ splashRadius: 1, statusDurationMs: 14000, chancePct: 80 });
  });
  it('uses Hercules lifetimes and splash sizes for damaging ground traps', () => {
    expect(traps.hunterTrapSpec('HT_LANDMINE', 5)).toMatchObject({ lifetimeMs: 40000, splashRadius: 1, usedLifetimeMs: 1500 });
    expect(traps.hunterTrapSpec('HT_FREEZINGTRAP', 5)).toMatchObject({ lifetimeMs: 30000, splashRadius: 1 });
    expect(traps.hunterTrapSpec('HT_BLASTMINE', 5)).toMatchObject({ lifetimeMs: 5000, splashRadius: 1 });
    expect(traps.hunterTrapSpec('HT_CLAYMORETRAP', 5)).toMatchObject({ lifetimeMs: 100000, splashRadius: 2 });
    expect(traps.hunterTrapSpec('HT_CLAYMORETRAP', 1, 7500).lifetimeMs).toBe(7500);
    expect(traps.isHunterTrapSkill('HT_LANDMINE')).toBe(true);
    expect(traps.hunterTrapStatus(fixture().monsters[1002], 'HT_LANDMINE', 5, { level: 1, luk: 0 })).toBeUndefined();
  });
  it('uses square trigger geometry including diagonal adjacent cells', () => {
    expect(traps.hunterTrapWithinRange?.({x:0,y:0}, {x:1,y:1}, 1)).toBe(true);
    expect(traps.hunterTrapWithinRange?.({x:0,y:0}, {x:2,y:0}, 1)).toBe(false);
  });
  it('allows bosses to be snared with boss reduction before the five second floor', () => {
    const m = structuredClone(fixture().monsters[1002]); m.boss = true; m.stats.agi = 10;
    expect(traps.hunterTrapStatus?.(m, 'HT_ANKLESNARE', 5, {level:1,luk:0})).toEqual({ status: 'SC_ANKLESNARE', chancePct: 100, durationMs: 5000, blocksWalk: true, blocksAttack: false });
    m.boss = false;
    expect(traps.hunterTrapStatus?.(m, 'HT_ANKLESNARE', 5, {level:1,luk:0})?.durationMs).toBe(19000);
  });
  it('uses existing resistance for Sleep and Blind and rejects boss status', () => {
    const m = structuredClone(fixture().monsters[1002]); m.boss = true;
    expect(traps.hunterTrapStatus?.(m, 'HT_SANDMAN', 5, {level:1,luk:0})?.chancePct).toBe(0);
    expect(traps.hunterTrapStatus?.(m, 'HT_FLASHER', 5, {level:1,luk:0})?.chancePct).toBe(0);
    expect(traps.hunterTrapStatus?.(m, 'HT_SKIDTRAP', 5, {level:1,luk:0})).toBeUndefined();
  });
});
