import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog, Skill } from '../shared/types';
import catalogJson from '../content/catalog.json';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { derivedStats } from '../engine/stats';
import { classicPhysicalDamage } from '../engine/classic';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

function setup(sources: string[]) {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = fixture();
  const imported = catalogJson as unknown as Catalog;
  for (const source of sources) {
    const skill = structuredClone(Object.values(imported.skills).find(skill => skill.sourceName === source)!);
    skill.implementation = 'supported';
    c.skills[skill.id] = skill;
    c.classes.novice.skills.push(skill.id);
  }
  c.classes.novice.sp.fill(1000);
  c.items[678] = structuredClone(imported.items[678]);
  c.monsters[1002] = { ...c.monsters[1002], hp: 100000, baseExp: 0, jobExp: 0,
    boss: false, element: 'neutral', stats: { str: 1, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 } };
  const s = createInitialState(c, 0);
  s.status = 'challenge';
  s.learnedSkills = {};
  s.rotation = [];
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.stats.dex = 150;
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  enemy.enemyNextAttackAt = 999999;
  enemy.arrivedAt = 0;
  enemy.position = { x: .48, y: .65 };
  enemy.approachFrom = { ...enemy.position };
  const skill = (source: string) => Object.values(c.skills).find(skill => skill.sourceName === source)!;
  return { c, s, skill };
}
afterEach(() => vi.restoreAllMocks());

describe('solo stances in authoritative combat', () => {
  it('Steel Body consumes 200 SP and five spheres, fixes hard defenses and blocks subsequent skills', () => {
    const { c, s, skill } = setup(['MO_STEELBODY', 'SM_BASH']);
    const steel = skill('MO_STEELBODY'), bash = skill('SM_BASH');
    s.learnedSkills = { [steel.id]: 5, [bash.id]: 10 };
    s.rotation = [steel.id, bash.id];
    s.combatEffects = { spiritSpheres: 5 };
    const next = advanceState(s, c, 3000);
    const stats = derivedStats(next, c);
    expect(next.sp).toBe(s.sp - 200);
    expect(next.combatEffects?.spiritSpheres).toBe(0);
    expect(stats.def).toBe(90);
    expect(stats.hardMdef).toBe(90);
    expect(stats.softMdef).toBe(1);
    expect(stats.attackIntervalMs).toBeGreaterThan(derivedStats(s, c).attackIntervalMs);
    expect(next.events.some(event => event.kind === 'skill' && event.skillId === bash.id)).toBe(false);
    expect(next.events.some(event => event.kind === 'damage' && !event.skillId)).toBe(true);
  });
  it('Steel Body waits for its DEX-reduced cast and does not pay without five spheres', () => {
    const { c, s, skill } = setup(['MO_STEELBODY']);
    const steel = skill('MO_STEELBODY');
    s.learnedSkills[steel.id] = 5; s.rotation = [steel.id]; s.stats.dex = 0;
    s.combatEffects = { spiritSpheres: 5 };
    const casting = advanceState(s, c, 4000);
    expect(casting.battle?.cast?.endsAt).toBe(6000);
    expect(casting.sp).toBe(s.sp);
    expect(advanceState(casting, c, 6000).buffs[steel.id]?.expiresAt).toBe(156000);
    s.combatEffects.spiritSpheres = 4;
    const rejected = advanceState(s, c, 6500);
    expect(rejected.buffs[steel.id]).toBeUndefined();
    expect(rejected.sp).toBe(s.sp);
  });
  it('Berserk triples maximum HP, heals on activation, empties SP and removes defenses', () => {
    const { c, s, skill } = setup(['LK_BERSERK', 'SM_BASH']);
    const frenzy = skill('LK_BERSERK');
    s.learnedSkills[frenzy.id] = 1; s.rotation = [frenzy.id, skill('SM_BASH').id];
    s.learnedSkills[skill('SM_BASH').id] = 10; s.hp = 10;
    const baseline = derivedStats(s, c);
    const next = advanceState(s, c, 1000), stats = derivedStats(next, c);
    expect(stats.maxHp).toBe(baseline.maxHp * 3);
    expect(next.hp).toBe(stats.maxHp);
    expect(next.sp).toBe(0);
    expect(stats).toMatchObject({ def: 0, softDef: 0, hardMdef: 0, softMdef: 0, mdef: 0 });
    expect(stats.flee).toBe(baseline.flee - Math.trunc(baseline.flee / 2));
    expect(stats.attackIntervalMs).toBeLessThan(baseline.attackIntervalMs);
    expect(next.combatEffects?.berserk?.nextTickAt).toBe(16000);
  });
  it('Berserk timer persists through JSON and ends at low HP with a source regeneration block', () => {
    const { c, s, skill } = setup(['LK_BERSERK']);
    const frenzy = skill('LK_BERSERK');
    s.learnedSkills[frenzy.id] = 1; s.rotation = [frenzy.id];
    let next = advanceState(s, c, 1000);
    next = JSON.parse(JSON.stringify(next));
    const drain = next.combatEffects!.berserk!.drainHp;
    const hp = next.hp;
    next = advanceState(next, c, 16000);
    expect(next.hp).toBe(hp - drain);
    expect(next.sp).toBe(0);
    next.hp = 101;
    next = advanceState(next, c, 31000);
    expect(next.buffs[frenzy.id]).toBeUndefined();
    expect(next.hp).toBe(101 - drain);
    expect(next.combatEffects?.regenBlockedUntil).toBe(331000);
    next = advanceState(next, c, 40000);
    expect(next.hp).toBe(101 - drain);
    expect(next.sp).toBe(0);
  });
  it('Berserk blocks potions, Lupa, equipment changes and manual skills until it ends', () => {
    const { c, s, skill } = setup(['LK_BERSERK']);
    const frenzy = skill('LK_BERSERK');
    s.learnedSkills[frenzy.id] = 1; s.rotation = [frenzy.id];
    const active = advanceState(s, c, 1000);
    active.hp = 200;
    active.autoPotion = { hpThreshold: 99, spThreshold: 99 };
    const next = advanceState(active, c, 2000);
    expect(next.totals.potions).toBe(0);
    const weapon = next.equipment.weapon!;
    expect(() => applyCommand(next, c, { type: 'unequip', slot: 'weapon' }, 2000)).toThrow(/Frenesi/);
    expect(() => applyCommand(next, c, { type: 'equip', uid: weapon }, 2000)).toThrow(/Frenesi/);
  });
  it('Berserk grants no damage motion on an incoming hit and ends immediately below 100 HP', () => {
    const { c, s, skill } = setup(['LK_BERSERK']);
    const frenzy = skill('LK_BERSERK');
    s.learnedSkills[frenzy.id] = 1; s.rotation = [frenzy.id];
    const next = advanceState(s, c, 1000);
    next.hp = 101; next.battle!.enemies![0].enemyNextAttackAt = 1100;
    c.monsters[1002].attack = [10, 10];
    vi.spyOn(stateTools, 'random').mockReturnValue(.1);
    const hit = advanceState(next, c, 1250);
    expect(hit.events.find(event => event.kind === 'damage' && event.target === 'player')?.hitMotionMs).toBe(0);
    expect(hit.buffs[frenzy.id]).toBeUndefined();
    expect(hit.combatEffects?.regenBlockedUntil).toBe(301100);
  });
  it('post-Berserk blocks only natural recovery while learned recovery skills keep their own timers', () => {
    const { c, s, skill } = setup(['SM_RECOVERY', 'MG_SRECOVERY']);
    s.learnedSkills = { [skill('SM_RECOVERY').id]: 10, [skill('MG_SRECOVERY').id]: 10 };
    s.hp = 50; s.sp = 0;
    s.combatEffects = { regenBlockedUntil: 300000 };
    s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999999;
    const beforeSkill = advanceState(s, c, 8000);
    expect(beforeSkill.hp).toBe(50); expect(beforeSkill.sp).toBe(0);
    const next = advanceState(beforeSkill, c, 10000);
    expect(next.hp).toBe(101); expect(next.sp).toBe(50);
  });
  it('migrates an older Frenzy status without refreshing its drain clock or healing the avatar', () => {
    const { c, s, skill } = setup(['LK_BERSERK']);
    const frenzy = skill('LK_BERSERK');
    s.buffs[frenzy.id] = { expiresAt: 301000, effects: {} };
    s.lastSimulatedAt = 5000; s.hp = 200;
    s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999999;
    const next = advanceState(s, c, 5250);
    expect(next.hp).toBe(200);
    expect(next.combatEffects?.berserk).toMatchObject({ nextTickAt: 16000, drainHp: 15, remainingTicks: 20 });
  });
});

describe('EDP in authoritative combat', () => {
  it('requires and consumes one Poison Bottle on activation, without changing weapon element', () => {
    const { c, s, skill } = setup(['ASC_EDP']);
    const edp = skill('ASC_EDP');
    s.learnedSkills[edp.id] = 5; s.rotation = [edp.id];
    const without = advanceState(s, c, 1000);
    expect(without.buffs[edp.id]).toBeUndefined();
    stateTools.addItem(s, c, 678, 2);
    const next = advanceState(s, c, 1000);
    expect(next.buffs[edp.id]?.expiresAt).toBe(61000);
    expect(next.sp).toBe(s.sp - 100);
    expect(next.inventory.find(entry => entry.itemId === 678)?.quantity).toBe(1);
    expect(next.buffs[edp.id].effects).not.toHaveProperty('weaponPoison');
  });
  it('multiplies the weapon attack before defense, while excluding Breaker and magic', () => {
    const { c, skill } = setup(['ASC_EDP', 'ASC_BREAKER', 'AS_SONICBLOW']);
    const stats = { attack: 100, magicAttack: [10, 10] as [number, number], baseAttack: 100, weaponAttack: 0 };
    const mob = { ...c.monsters[1002], def: 50 };
    // ATK400 - hardDEF50% - softDEF1; the final damage is not simply 4x.
    expect(classicPhysicalDamage({ ...stats, activeSkillsBySource: { ASC_EDP: 5 } }, mob, undefined, 1, () => 0)).toBe(199);
    const breaker = skill('ASC_BREAKER');
    expect(classicPhysicalDamage({ ...stats, activeSkillsBySource: { ASC_EDP: 5 } }, mob, breaker, 1, () => 0))
      .toBe(classicPhysicalDamage(stats, mob, breaker, 1, () => 0));
  });
  it('normal hits apply deadly poison once, with initial HP loss and persistent damaging ticks', () => {
    const { c, s, skill } = setup(['ASC_EDP']);
    const edp = skill('ASC_EDP');
    s.learnedSkills[edp.id] = 5; s.buffs[edp.id] = { expiresAt: 99999, effects: {} };
    const next = advanceState(s, c, 1000), enemy = next.battle!.enemies![0];
    expect(enemy.statuses?.SC_DPOISON).toMatchObject({ startsAt: 1000, expiresAt: 31000, nextTickAt: 2000 });
    expect(enemy.hp).toBeLessThan(85000);
    next.battle!.playerNextAttackAt = 99999; next.battle!.playerNextSkillAt = 99999;
    const after = advanceState(JSON.parse(JSON.stringify(next)), c, 2000);
    expect(after.battle!.enemies![0].hp).toBe(enemy.hp - 1003);
    expect(after.battle!.enemies![0].statuses?.SC_DPOISON?.expiresAt).toBe(31000);
  });
  it('deadly poison can kill through its periodic damage', () => {
    const { c, s, skill } = setup(['ASC_EDP']);
    s.buffs[skill('ASC_EDP').id] = { expiresAt: 99999, effects: {} };
    s.learnedSkills[skill('ASC_EDP').id] = 5;
    const next = advanceState(s, c, 1000);
    next.battle!.enemies![0].hp = 1;
    next.battle!.playerNextAttackAt = 99999; next.battle!.playerNextSkillAt = 99999;
    const after = advanceState(next, c, 2000);
    expect(after.events.some(event => event.kind === 'kill' && event.at === 2000)).toBe(true);
  });
  it('does not proc on offensive skills or bosses, and does not refresh an existing poison', () => {
    const { c, s, skill } = setup(['ASC_EDP', 'SM_BASH']);
    const edp = skill('ASC_EDP'), bash = skill('SM_BASH');
    s.learnedSkills = { [edp.id]: 5, [bash.id]: 10 };
    s.buffs[edp.id] = { expiresAt: 99999, effects: {} };
    s.rotation = [bash.id];
    const skillHit = advanceState(s, c, 1000);
    expect(skillHit.battle!.enemies![0].statuses?.SC_DPOISON).toBeUndefined();
    s.rotation = []; c.monsters[1002].boss = true;
    expect(advanceState(s, c, 1000).battle!.enemies![0].statuses?.SC_DPOISON).toBeUndefined();
    c.monsters[1002].boss = false;
    s.battle!.enemies![0].statuses = { SC_DPOISON: { startsAt: 0, expiresAt: 99999, nextTickAt: 99999, level: 5 } };
    expect(advanceState(s, c, 1000).battle!.enemies![0].statuses?.SC_DPOISON?.expiresAt).toBe(99999);
  });
  it('retains the source primary buff duration and exposes the EDP reagent without a drinking script', () => {
    const c = catalogJson as unknown as Catalog;
    expect(c.skills.lk_berserk.statusDurationMs).toEqual([300000]);
    expect(c.skills.asc_edp.statusDurationMs).toEqual([40000, 45000, 50000, 55000, 60000]);
    expect(c.items[678]).toMatchObject({ type: 'material', shop: true, buyPrice: 5000 });
    expect(c.items[678].healHP).toBeUndefined();
  });
});
