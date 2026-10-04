import { describe, expect, it } from 'vitest';
import { advanceState, applyCommand, createInitialState, getSnapshot } from '../engine/index.js';
import { fixture } from './engine-fixture.js';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
describe('authoritative clock and combat', () => {
  it('starts with usable novice equipment and supplies without mutating snapshots', () => {
    const c = fixture(); const s = createInitialState(c, 1234);
    expect(s.zeny).toBe(200); expect(s.statPoints).toBe(20); expect(s.hp).toBeGreaterThan(0);
    expect(s.inventory.find(i => i.itemId === 501)?.quantity).toBe(20);
    expect(s.inventory.find(i => i.itemId === 505)?.quantity).toBe(5);
    expect(s.equipment.weapon).toBeTruthy(); expect(s.learnedSkills.firstaid).toBe(1);
    const snap = getSnapshot(s, c, 1234); snap.state.zeny = 0; expect(s.zeny).toBe(200);
  });
  it('produces identical battles, drops and progression in 600 segmented or offline ticks', () => {
    const c = fixture(); const s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0);
    let continuous = s; for (let t = 1000; t <= 600000; t += 1000) continuous = advanceState(continuous, c, t);
    const offline = advanceState(s, c, 600000);
    expect(offline).toEqual(continuous); expect(offline.totals.kills).toBeGreaterThan(0);
    expect(advanceState(offline, c, 600000)).toEqual(offline); expect(s.totals.kills).toBe(0);
  });
  it('preserves fractional ticks and caps offline time from last browser contact across restart', () => {
    const c = fixture(); const s = createInitialState(c, 250);
    const partial = advanceState(s, c, 1749); expect(partial.lastSimulatedAt).toBe(1500);
    const done = advanceState(partial, c, 2250); expect(done.totals.elapsedMs).toBe(2000);
    const capped = advanceState(s, c, 13 * 3600000 + 250);
    expect(capped.totals.elapsedMs).toBe(12 * 3600000); expect(capped.status).toBe('paused');
    expect(capped.lastSeenAt).toBe(250);
    const restart = JSON.parse(JSON.stringify(capped)); expect(advanceState(restart, c, 14 * 3600000)).toEqual(capped);
  });
  it('uses real potions and falls back to basic attacks without skill SP', () => {
    const c = fixture(); let s = createInitialState(c, 0); s.hp = 1; s.sp = 0;
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0);
    const next = advanceState(s, c, 20000);
    expect(next.totals.potions).toBeGreaterThan(0); expect(next.totals.kills).toBeGreaterThan(0);
    expect(next.inventory.find(i => i.itemId === 501)!.quantity).toBeLessThan(20);
  });
  it('defeat never awards a kill and recovers in town with bounded history', () => {
    const c = fixture(); c.monsters[1002].attack = [10000, 10000]; c.monsters[1002].hp = 100000; c.monsters[1002].stats.dex = 999;
    let s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0); s.inventory = s.inventory.filter(i => i.itemId !== 501);
    s = advanceState(s, c, 100000); expect(s.totals.deaths).toBe(1); expect(s.totals.kills).toBe(0); expect(s.status).toBe('town'); expect(s.hp).toBeGreaterThan(0); expect(s.events.length).toBeLessThanOrEqual(60);
  });
  it('supports DEX bow damage and INT magic / VIT health builds', () => {
    const c = fixture(); const s = createInitialState(c, 0); s.job = 'archer'; s.equipment.weapon = 'bow'; s.inventory.push({ uid: 'bow', itemId: 1701, quantity: 1, refine: 0, cards: [], favorite: false });
    const low = getSnapshot(s, c, 0).stats; s.stats.dex = 50; s.stats.int = 50; s.stats.vit = 50;
    const high = getSnapshot(s, c, 0).stats; expect(high.attack).toBeGreaterThan(low.attack + 40); expect(high.magicAttack[0]).toBeGreaterThan(low.magicAttack[1]); expect(high.maxHp).toBeGreaterThan(low.maxHp);
  });
  it('reads catalog elemental and weapon size adjustments as percentages', () => {
    const c = fixture(); c.monsters[1002].hp = 10000; c.monsters[1002].def = 0; c.monsters[1002].stats = { ...c.monsters[1002].stats, vit: 0, agi: 0 }; c.monsters[1002].element = 'Neutral';
    c.elementModifiers = { neutral: { Neutral: [100, 100, 100, 100] } }; c.sizeModifiers = { dagger: { medium: 75 } }; c.items[1201].effects.crit = 100;
    let s = createInitialState(c, 0); s.baseLevel = 15; s.stats.dex = 99; s.stats.luk = 99; s.rotation = [];
    s = applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 0);
    s = advanceState(s, c, 3000);
    // Classic size modifies weapon ATK: floor(20 * .75) + 1 + 19 + 19 = 54.
    // A pre-renewal critical bypasses defense without a 1.4 damage multiplier.
    expect(s.events.find(e => e.kind === 'damage' && e.target === 'enemy')?.amount).toBe(54);
  });
  it('uses attack skills only with their declared SP, zeny, reagent and weapon', () => {
    const c = fixture(); c.monsters[1002].hp = 10000;
    c.skills.costly = { id: 'costly', name: 'Costly', description: '', kind: 'physical', maxLevel: 1, spCost: [5], power: [200], cooldownMs: 3000, zenyCost: [20], itemCost: { itemId: 909, quantity: 1 }, requiredWeapon: ['dagger'] };
    let s = createInitialState(c, 0); s.baseLevel = 15; s.learnedSkills.costly = 1; s.rotation = ['costly']; s.autoPotion.spThreshold = 0;
    s = applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 0);
    const absent = advanceState(s, c, 3000); expect(absent.zeny).toBe(200); expect(absent.sp).toBe(s.sp); expect(absent.events.some(e => e.text === 'Costly')).toBe(false);
    s.inventory.push({ uid: 'reagent', itemId: 909, quantity: 1, refine: 0, cards: [], favorite: false });
    const used = advanceState(s, c, 3000); expect(used.zeny).toBe(180); expect(used.sp).toBe(s.sp - 5); expect(used.inventory.some(e => e.uid === 'reagent')).toBe(false);
    expect(advanceState(used, c, 4000).zeny).toBe(180);
  });
  it('applies learned passive levels and expires active buffs without recasting early', () => {
    const c = fixture(); c.monsters[1002].hp = 10000;
    c.skills.passive = { id: 'passive', name: 'Passive', description: '', kind: 'passive', maxLevel: 5, spCost: [], power: [], cooldownMs: 0, effects: { str: 2 } };
    c.skills.buff = { id: 'buff', name: 'Buff', description: '', kind: 'buff', maxLevel: 5, spCost: [3,3], power: [0,0], cooldownMs: 10000, effects: { dex: 2 }, durationMs: 2000 };
    let s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0); s.learnedSkills = { passive: 3, buff: 2 }; s.rotation = ['buff'];
    const used = advanceState(s, c, 2000); expect(getSnapshot(used, c, 2000).stats.effects.str).toBe(6); expect(getSnapshot(used, c, 2000).stats.effects.dex).toBe(4); expect(used.sp).toBe(s.sp - 3);
    const expired = advanceState(used, c, 4000); expect(expired.buffs.buff).toBeUndefined(); expect(expired.sp).toBe(used.sp);
  });
  it('uses a distinct transcendental base EXP curve after rebirth', () => {
    const c = fixture(); c.exp.base = [0, ...Array(99).fill(1)]; c.exp.baseTrans = [0, ...Array(99).fill(200)]; c.monsters[1002].hp = 1;
    let s = createInitialState(c, 0); s.reborn = true; s.job = 'high_novice'; s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0); s = advanceState(s, c, 5000);
    expect(s.totals.kills).toBe(2); expect(s.baseLevel).toBe(1); expect(s.baseExp).toBe(16);
  });
  it('clamps HP after a health buff expires', () => {
    const c = fixture(); c.monsters[1002].hp = 100000; let s = createInitialState(c, 0); s.hp = 1000; s.buffs.health = { expiresAt: 2000, effects: { hp: 1000 } };
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0); s = advanceState(s, c, 2000);
    expect(s.hp).toBeLessThanOrEqual(getSnapshot(s, c, 2000).stats.maxHp);
  });
  it('discards capped time while paused even after browser contact is refreshed', () => {
    const c = fixture(); let s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0);
    s = advanceState(s, c, 13 * 3600000); const before = structuredClone(s.totals); s.lastSeenAt = 14 * 3600000;
    s = advanceState(s, c, 14 * 3600000 + 10000); expect(s.totals).toEqual(before); expect(s.status).toBe('paused');
    const restarted = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 14 * 3600000 + 10000);
    const next = advanceState(restarted, c, 14 * 3600000 + 12000); expect(next.totals.elapsedMs - before.elapsedMs).toBe(2000); expect(next.totals.kills - before.kills).toBeLessThanOrEqual(1);
  });
  it('regenerates hunting SP on elapsed ticks even when creation time is not a whole second', () => {
    const c = fixture(); c.monsters[1002].hp = 100000; let s = createInitialState(c, 250); s.sp = 0; s.rotation = []; s.autoPotion.spThreshold = 0;
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 250);
    s = advanceState(s, c, 8249); expect(s.sp).toBe(0);
    s = advanceState(s, c, 8250); expect(s.sp).toBe(1);
  });
  it('falls back to a basic attack when a skill requires a missing equipment slot', () => {
    const c = fixture(); c.monsters[1002].hp = 100000;
    c.skills.shield = { id: 'shield', name: 'Shield', description: '', kind: 'physical', maxLevel: 1, spCost: [3], power: [200], cooldownMs: 1000, requiredSlot: 'shield' };
    let s = createInitialState(c, 0); s.learnedSkills.shield = 1; s.rotation = ['shield']; s.autoPotion.spThreshold = 0;
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0); s = advanceState(s, c, 2000);
    expect(s.sp).toBe(50); expect(s.events.some(e => e.text === 'Shield')).toBe(false); expect(s.events.some(e => e.target === 'enemy')).toBe(true);
  });
  it.each([[1,9,1990], [50,11,1598], [99,15,1206]])('preserves attack interval remainder for AGI %i (%i attacks in twenty seconds, %i ms apart)', (agi, count, interval) => {
    const c = fixture(); c.monsters[1002].hp = 1000000; c.monsters[1002].attackDelay = 1000000; c.items[1201].effects.crit = 100;
    let s = createInitialState(c, 0); s.baseLevel = 15; s.stats.agi = agi; s.rotation = [];
    s = applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 0);
    const offline = advanceState(s, c, 20000); let segmented = s; for (let t = 1000; t <= 20000; t += 1000) segmented = advanceState(segmented, c, t);
    expect(offline).toEqual(segmented);
    const hits = offline.events.filter(e => e.kind === 'damage' && e.target === 'enemy');
    expect(hits).toHaveLength(count); expect(hits[0].at).toBe(2750);
    expect(hits.slice(1).map((hit, index) => hit.at - hits[index].at)).toEqual(Array(count - 1).fill(interval));
    expect(offline.battle!.playerNextAttackAt).toBeGreaterThan(20000);
  });
  it('uses a blue potion when HP is low and all red potions have run out', () => {
    const c = fixture(); let s = createInitialState(c, 0); s.hp = 1; s.sp = 0; s.rotation = []; s.inventory = s.inventory.filter(e => e.itemId !== 501);
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0); s = advanceState(s, c, 1000);
    expect(s.sp).toBe(40); expect(s.totals.potions).toBe(1); expect(s.inventory.find(e => e.itemId === 505)!.quantity).toBe(4); expect(s.potionReadyAt).toBe(2250);
    const next = advanceState(s, c, 2000); expect(next.totals.potions).toBe(1);
  });
  it.each([0,-100])('deals zero damage against an elemental coefficient of %i without healing the target', coefficient => {
    const c = fixture(); c.monsters[1002].hp = 10000; c.monsters[1002].mdef = 70; c.monsters[1002].stats.int = 75; c.monsters[1002].element = 'Holy'; c.monsters[1002].elementLevel = 4;
    c.elementModifiers = { holy: { holy: [100,100,100,coefficient] } }; c.skills.firebolt.element = 'Holy';
    let s = createInitialState(c, 0); s.baseLevel = 15; s.learnedSkills.firebolt = 1; s.rotation = ['firebolt'];
    s = applyCommand(s,c,{type:'challenge',challengeId:'mastering'},0); s = advanceState(s,c,1000);
    expect(s.events.find(e => e.kind === 'damage' && e.target === 'enemy' && e.skillId === 'firebolt')?.amount).toBe(0); expect(s.battle!.hp).toBe(10000);
  });
  it.each([1,40,99])('Holy Light against actual Holy4 Angeling never turns defense into damage at INT %i', int => {
    const c = catalogJson as unknown as Catalog; let s = createInitialState(c,0); s.job = 'priest'; s.baseLevel = 40; s.stats.int = int; s.stats.dex = 99; s.sp = 100; s.learnedSkills.holy_light = 1; s.rotation = ['holy_light'];
    // DEX99 completes the source 2s cast in 680ms, before Angeling reaches melee.
    s = applyCommand(s,c,{type:'challenge',challengeId:'angeling'},0); const beforeHp = s.battle!.hp; s = advanceState(s,c,2000);
    expect(s.events.find(e => e.kind === 'damage' && e.target === 'enemy' && e.skillId === 'holy_light')?.amount).toBe(0); expect(s.battle!.hp).toBe(beforeHp);
  });
});
