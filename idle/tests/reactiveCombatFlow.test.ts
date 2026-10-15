import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameCommand, Skill } from '../shared/types';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { derivedStats } from '../engine/stats';
import { classicPhysicalDamage, classicStrippedMonster, classicPlayerVitDefense } from '../engine/classic';
import { effectiveMonsterStatus } from '../engine/classicStatuses';
import { parseCommandRequest } from '../server/validation';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

function setup() {
  vi.spyOn(stateTools, 'random').mockReturnValue(.1);
  const c = fixture(), source = catalogJson as unknown as Catalog;
  for (const name of ['ST_FULLSTRIP', 'ST_REJECTSWORD', 'SM_AUTOBERSERK', 'RG_STRIPWEAPON']) {
    const skill = structuredClone(Object.values(source.skills).find(skill => skill.sourceName === name)!);
    skill.implementation = 'supported';
    if (name === 'SM_AUTOBERSERK') skill.manualUse = 'toggle' as Skill['manualUse'];
    c.skills[skill.id] = skill; c.classes.novice.skills.push(skill.id);
  }
  c.classes.novice.hp.fill(10000); c.classes.novice.sp.fill(1000);
  c.monsters[1002] = { ...c.monsters[1002], hp: 100000, attack: [101, 101], boss: false, baseExp: 0, jobExp: 0,
    element: 'neutral', def: 40, mdef: 0, stats: { str: 1, agi: 0, vit: 11, int: 11, dex: 100, luk: 0 } };
  const s = createInitialState(c, 0); s.status = 'challenge'; s.rotation = []; s.learnedSkills = {};
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.stats.dex = 100; s.stats.vit = 0;
  s.equipment = {}; s.hp = 10000;
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0]; enemy.enemyNextAttackAt = 999999;
  enemy.arrivedAt = 0; enemy.position = { x: .48, y: .65 }; enemy.approachFrom = { ...enemy.position };
  const skill = (name: string) => Object.values(c.skills).find(skill => skill.sourceName === name)!;
  return { c, s, enemy, skill };
}
afterEach(() => vi.restoreAllMocks());

describe('Full Strip authoritative integration', () => {
  it('pays once and applies all four persistent states, including on bosses', () => {
    const { c, s, skill } = setup(), full = skill('ST_FULLSTRIP');
    c.monsters[1002].boss = true; s.learnedSkills[full.id] = 5; s.rotation = [full.id];
    const next = advanceState(s, c, 1000), statuses = next.battle!.enemies![0].statuses!;
    expect(next.sp).toBe(s.sp - 30);
    for (const name of ['SC_NOEQUIPWEAPON', 'SC_NOEQUIPSHIELD', 'SC_NOEQUIPARMOR', 'SC_NOEQUIPHELM'])
      expect(statuses[name]).toMatchObject({ startsAt: 1000, expiresAt: 136000, level: 5 });
    expect(next.buffs[full.id]).toBeUndefined();
    expect(advanceState(next, c, 2000).sp).toBe(next.sp);
  });
  it('uses effective target DEX and individual chemical protection', () => {
    const { c, s, enemy, skill } = setup(), full = skill('ST_FULLSTRIP');
    s.learnedSkills[full.id] = 5; s.rotation = [full.id];
    enemy.statuses = { quagmire: { expiresAt: 999999, level: 5 }, SC_PROTECTSHIELD: { expiresAt: 999999, level: 1 } };
    const next = advanceState(s, c, 1000), statuses = next.battle!.enemies![0].statuses!;
    expect(statuses.SC_NOEQUIPWEAPON.expiresAt).toBe(161000);
    expect(statuses.SC_NOEQUIPSHIELD).toBeUndefined();
    expect(statuses.SC_NOEQUIPARMOR).toBeDefined();
    const resumed = advanceState(JSON.parse(JSON.stringify(next)), c, 1500);
    expect(resumed.battle!.enemies![0].statuses!.SC_NOEQUIPHELM.expiresAt).toBe(161000);
  });
  it('single-slot Weapon Strip also works on bosses', () => {
    const { c, s, skill } = setup(), strip = skill('RG_STRIPWEAPON');
    s.stats.dex = 150;
    c.monsters[1002].boss = true; s.learnedSkills[strip.id] = 5; s.rotation = [strip.id];
    expect(advanceState(s, c, 1000).battle!.enemies![0].statuses?.SC_NOEQUIPWEAPON).toBeDefined();
  });
  it('single-slot Weapon Strip respects active chemical protection', () => {
    const { c, s, enemy, skill } = setup(), strip = skill('RG_STRIPWEAPON');
    s.stats.dex = 150; s.learnedSkills[strip.id] = 5; s.rotation = [strip.id];
    enemy.statuses = { SC_PROTECTWEAPON: { expiresAt: 999999, level: 1 } };
    expect(advanceState(s, c, 1000).battle!.enemies![0].statuses?.SC_NOEQUIPWEAPON).toBeUndefined();
  });
  it('combines Weapon Strip additively with Provoke, while preserving catalog attributes', () => {
    const { c } = setup(), mob = c.monsters[1002]; mob.attack = [100, 100];
    const states = Object.fromEntries(['SC_NOEQUIPWEAPON', 'SC_NOEQUIPSHIELD', 'SC_NOEQUIPARMOR', 'SC_NOEQUIPHELM', 'SC_PROVOKE', 'SC_POISON']
      .map(name => [name, { expiresAt: 10000, level: name === 'SC_PROVOKE' ? 10 : 5 }]));
    const stripped = classicStrippedMonster(mob, Object.keys(states));
    const result = effectiveMonsterStatus(stripped, states, 1);
    expect(result.monster.attack).toEqual([100, 100]);
    expect(result.atkPercent).toBe(107); expect(result.defPercent).toBe(5);
    expect(result.monster.stats).toMatchObject({ vit: 7, int: 7 });
    expect(mob.stats).toMatchObject({ vit: 11, int: 11 });
  });
});

describe('Reject Sword authoritative integration', () => {
  function ready() {
    const value = setup(), reject = value.skill('ST_REJECTSWORD');
    value.s.learnedSkills[reject.id] = 5;
    value.s.buffs[reject.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    value.s.combatEffects = { buffLevels: { [reject.id]: 5 }, rejectSword: { charges: 3 } } as typeof value.s.combatEffects;
    value.s.battle!.playerNextAttackAt = value.s.battle!.playerNextSkillAt = 999999;
    value.enemy.enemyNextAttackAt = 1100; return { ...value, reject };
  }
  it('calculates ordinary reflection before halving the hit and countering directly', () => {
    const { c, s, reject } = ready(); s.buffs[reject.id].effects.reflectPct = 20;
    const next = advanceState(s, c, 1250);
    expect(next.hp).toBe(s.hp - 50);
    expect(next.battle!.enemies![0].hp).toBe(100000 - 20 - 50);
    const counter = next.events.find(e => e.kind === 'damage' && e.skillId === reject.id)!;
    expect(counter).toMatchObject({ amount: 50, sourceActorId: s.id, targetActorId: s.battle!.enemies![0].id, actorAction: 'none' });
    expect((next.combatEffects as any).rejectSword.charges).toBe(2);
  });
  it('does not spend a charge through a fully absorbing Kyrie barrier', () => {
    const { c, s } = ready(); Object.assign(s.combatEffects!, { kyrieHp: 1000, kyrieHits: 10 });
    const next = advanceState(s, c, 1250);
    expect(next.hp).toBe(s.hp); expect((next.combatEffects as any).rejectSword.charges).toBe(3);
  });
  it('halves only the residual damage after partial Kyrie absorption', () => {
    const { c, s } = ready(); Object.assign(s.combatEffects!, { kyrieHp: 51, kyrieHits: 10 });
    const next = advanceState(s, c, 1250);
    expect(next.hp).toBe(s.hp - 25); expect(next.battle!.enemies![0].hp).toBe(99975);
    expect(next.combatEffects!.rejectSword!.charges).toBe(2);
  });
  it('retains charges on a failed chance and consumes one when a hit of one rounds to zero', () => {
    const { c, s } = ready(); vi.mocked(stateTools.random).mockReturnValue(.8);
    expect(advanceState(s, c, 1250).combatEffects!.rejectSword!.charges).toBe(3);
    vi.mocked(stateTools.random).mockReturnValue(.1); c.monsters[1002].attack = [1, 1];
    const tiny = advanceState(s, c, 1250);
    expect(tiny.hp).toBe(s.hp); expect(tiny.combatEffects!.rejectSword!.charges).toBe(2);
  });
  it('supports ranged monsters and persists remaining charges without refreshing them', () => {
    const { c, s } = ready(); c.monsters[1002].attackRange = 7;
    const hit = advanceState(s, c, 1250);
    expect(hit.hp).toBe(s.hp - 50);
    const resumed = advanceState(JSON.parse(JSON.stringify(hit)), c, 2000);
    expect((resumed.combatEffects as any).rejectSword.charges).toBe(2);
  });
  it('ends after three successful counters and rewards a counter kill only once', () => {
    const { c, s, reject } = ready();
    const third = advanceState(s, c, 5250);
    expect(third.buffs[reject.id]).toBeUndefined();
    expect((third.combatEffects as any).rejectSword).toBeUndefined();
    s.battle!.enemies![0].hp = 40;
    const killed = advanceState(s, c, 1250);
    expect(killed.events.filter(e => e.kind === 'kill')).toHaveLength(1);
    expect(killed.totals.kills).toBe(1);
  });
  it('awards a simultaneous counter kill once while keeping the defeated player dead', () => {
    const { c, s } = ready(); s.hp = 40; s.battle!.enemies![0].hp = 40;
    c.monsters[1002].baseExp = 10000;
    const killed = advanceState(s, c, 1250);
    expect(killed.totals.kills).toBe(1); expect(killed.totals.deaths).toBe(1);
    expect(killed.events.filter(e => e.kind === 'kill')).toHaveLength(1);
    expect(killed.hp).toBe(0); expect(killed.status).toBe('resting');
    const resumed = advanceState(JSON.parse(JSON.stringify(killed)), c, 1500);
    expect(resumed.totals.kills).toBe(1); expect(resumed.totals.deaths).toBe(1);
  });
  it('activation costs SP once and retains its source infinite duration', () => {
    const { c, s, skill } = setup(), reject = skill('ST_REJECTSWORD');
    s.learnedSkills[reject.id] = 5; s.rotation = [reject.id];
    const active = advanceState(s, c, 1000);
    expect(active.sp).toBe(s.sp - 30);
    expect(active.buffs[reject.id].expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    const later = advanceState(active, c, 50000);
    expect(later.events.filter(e => e.kind === 'skill' && e.skillId === reject.id)).toHaveLength(1);
    expect((later.combatEffects as any).rejectSword.charges).toBe(3);
  });
});

describe('Auto Berserk gameplay controls and damage', () => {
  const toggle = (id: string) => ({ type: 'toggleBuff', skillId: id }) as unknown as GameCommand;
  it('is a validated manual toggle, pays one SP on activation and costs nothing on cancellation', () => {
    const { c, s, skill } = setup(), auto = skill('SM_AUTOBERSERK');
    s.learnedSkills[auto.id] = 1; s.hp = 2000;
    expect(parseCommandRequest({ requestId: 'auto_1234', command: toggle(auto.id) }).command).toEqual(toggle(auto.id));
    const active = applyCommand(s, c, toggle(auto.id), 0);
    expect(active.sp).toBe(s.sp - 1); expect(active.buffs[auto.id].expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    active.sp = 0;
    const off = applyCommand(active, c, toggle(auto.id), 0);
    expect(off.sp).toBe(0); expect(off.buffs[auto.id]).toBeUndefined();
    expect(off.hp).toBe(active.hp);
  });
  it('rejects unlearned or insufficient-SP activation and excludes the toggle from rotation', () => {
    const { c, s, skill } = setup(), auto = skill('SM_AUTOBERSERK');
    expect(() => applyCommand(s, c, toggle(auto.id), 0)).toThrow();
    s.learnedSkills[auto.id] = 1; s.sp = 0;
    expect(() => applyCommand(s, c, toggle(auto.id), 0)).toThrow();
    expect(() => applyCommand(s, c, { type: 'setRotation', skillIds: [auto.id] }, 0)).toThrow();
  });
  it('updates percentages on HP changes and preserves hard DEF, including recovery and maxHP changes', () => {
    const { c, s, skill } = setup(), auto = skill('SM_AUTOBERSERK');
    s.buffs[auto.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} }; s.learnedSkills[auto.id] = 1;
    s.hp = 2499; c.items[2301].def = 40; s.equipment.armor = s.inventory.find(e => e.itemId === 2301)!.uid;
    const active = derivedStats(s, c);
    expect(active).toMatchObject({ sourceAttackPercent: 132, sourceDefensePercent: 45, def: 40 });
    s.hp = 2500;
    expect(derivedStats(s, c)).toMatchObject({ sourceAttackPercent: 100, sourceDefensePercent: 100, def: 40 });
    c.classes.novice.hp.fill(20000);
    expect(derivedStats(s, c).sourceAttackPercent).toBe(132);
  });
  it('combines Angelus additively and changes incoming VIT defense without reducing hard DEF', () => {
    const { c, s, enemy, skill } = setup(), auto = skill('SM_AUTOBERSERK');
    s.stats.vit = 20; s.hp = 1000;
    s.buffs[auto.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999999;
    enemy.enemyNextAttackAt = 1100;
    expect(derivedStats(s, c)).toMatchObject({ sourceDefensePercent: 45, softDef: 9 });
    expect(advanceState(s, c, 1250).hp).toBe(903);
    s.buffs.angelus = { expiresAt: 999999, effects: { softDefPct: 20 } };
    expect(derivedStats(s, c)).toMatchObject({ sourceDefensePercent: 65, softDef: 13 });
    expect(advanceState(s, c, 1250).hp).toBe(905);
  });
  it('uses the pre-renewal PC VIT roll and integer percentage order', () => {
    expect(classicPlayerVitDefense(20, 45, () => 0)).toBe(4);
    expect(classicPlayerVitDefense(20, 65, () => 0)).toBe(6);
    expect(classicPlayerVitDefense(100, 45, () => .9999)).toBe(47);
    const rng = vi.fn(() => .5);
    expect(classicPlayerVitDefense(0, 100, rng)).toBe(0);
    expect(rng).not.toHaveBeenCalled();
  });
  it('applies attack percent once before the skill ratio, but leaves fixed attacks and Asura unchanged', () => {
    const { c } = setup(), mob = { ...c.monsters[1002], def: 0, stats: { ...c.monsters[1002].stats, vit: 1 } };
    const stats = { attack: 100, magicAttack: [10, 10] as [number, number], baseAttack: 50, weaponAttack: 50, dex: 100, sourceAttackPercent: 132 };
    const bash = { id: 'bash', kind: 'physical', sourceName: 'SM_BASH', damageType: 'weapon', power: [200] } as Skill;
    expect(classicPhysicalDamage(stats, mob, bash, 1, () => 0)).toBe(263);
    for (const sourceName of ['TF_THROWSTONE', 'MO_EXTREMITYFIST']) {
      const attack = { id: sourceName, sourceName, kind: 'physical', damageType: sourceName === 'TF_THROWSTONE' ? 'misc' : 'weapon', power: [100] } as Skill;
      expect(classicPhysicalDamage(stats, mob, attack, 1, () => 0)).toBe(classicPhysicalDamage({ ...stats, sourceAttackPercent: 100 }, mob, attack, 1, () => 0));
    }
  });
});
