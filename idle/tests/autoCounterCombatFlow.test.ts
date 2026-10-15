import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog, Skill } from '../shared/types';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { canPaySkillResources, paySkillResources } from '../engine/skillResources';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';
import { autoCounterBlocks, sourceFacing } from '../engine/autoCounter';

function setup() {
  vi.spyOn(stateTools, 'random').mockReturnValue(.1);
  const c = fixture(), source = catalogJson as unknown as Catalog;
  for (const name of ['KN_AUTOCOUNTER', 'SM_BASH', 'SM_AUTOBERSERK', 'MC_IDENTIFY', 'TF_DOUBLE', 'AS_POISONREACT', 'BS_UNFAIRLYTRICK', 'MC_MAMMONITE', 'RG_TUNNELDRIVE', 'TF_HIDING']) {
    const skill = structuredClone(Object.values(source.skills).find(skill => skill.sourceName === name)!);
    skill.implementation = 'supported'; c.skills[skill.id] = skill; c.classes.novice.skills.push(skill.id);
  }
  c.classes.novice.hp.fill(10000); c.classes.novice.sp.fill(1000);
  c.monsters[1002] = { ...c.monsters[1002], hp: 100000, attack: [100, 100], attackRange: 3,
    boss: false, element: 'neutral', def: 90, baseExp: 0, jobExp: 0,
    stats: { str: 1, agi: 1000, vit: 100, int: 1, dex: 100, luk: 0 } };
  const s = createInitialState(c, 0); s.status = 'challenge'; s.rotation = []; s.learnedSkills = {};
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.hp = 10000; s.sp = 1000; s.equipment = {}; s.stats.dex = 1;
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0]; enemy.enemyNextAttackAt = 1100;
  // Fixed field actor: challenge's legacy orbit would move this directional fixture.
  Object.assign(enemy, { fieldSlot: 0, engaged: true, hostile: true });
  enemy.arrivedAt = 0; enemy.position = { x: .48 + 1 / 12, y: .65 }; enemy.approachFrom = { ...enemy.position };
  const skill = (name: string) => Object.values(c.skills).find(skill => skill.sourceName === name)!;
  return { c, s, enemy, skill };
}
function waiting() {
  const x = setup(), counter = x.skill('KN_AUTOCOUNTER');
  x.s.learnedSkills[counter.id] = 5; x.s.buffs[counter.id] = { expiresAt: 3000, effects: {} };
  x.s.combatEffects = { buffLevels: { [counter.id]: 5 } };
  Object.assign(x.s, { playerFacing: { x: 1, y: 0 } });
  x.s.battle!.playerNextAttackAt = x.s.battle!.playerNextSkillAt = 999999;
  return { ...x, counter };
}
afterEach(() => vi.restoreAllMocks());

describe('Auto Counter source combat lifecycle', () => {
  it('does not waste a short counter posture when no enemy attack is due', () => {
    const { c, s, enemy, skill } = setup(), counter = skill('KN_AUTOCOUNTER');
    s.learnedSkills[counter.id] = 1; s.rotation = [counter.id]; enemy.enemyNextAttackAt = 999999;
    const next = advanceState(s, c, 1250);
    expect(next.events.some(e => e.actorAction === 'attack' && e.target === 'enemy' && e.actionStartedAt === 1000)).toBe(true);
    expect(next.events.some(e => e.kind === 'skill' && e.skillId === counter.id)).toBe(false);
    expect(next.buffs[counter.id]).toBeUndefined(); expect(next.sp).toBe(1000);
    enemy.position = { x: .9, y: .65 }; enemy.approachFrom = { ...enemy.position };
    expect(advanceState(s, c, 1250).sp).toBe(s.sp);
  });
  it('counters an incoming hit during the posture without bypassing the actor cast lock', () => {
    const { c, s, enemy, skill } = setup(), counter = skill('KN_AUTOCOUNTER');
    s.learnedSkills[counter.id] = 1; s.rotation = [counter.id]; enemy.enemyNextAttackAt = 1100;
    const waiting = advanceState(s, c, 1000);
    expect(waiting.buffs[counter.id]).toBeDefined(); expect(waiting.playerCanActAt).toBeGreaterThan(1100);
    const hit = advanceState(waiting, c, 1250); // Snapshot step; the incoming event must remain at 1100ms.
    expect(hit.events.find(e => e.kind === 'damage' && e.skillId === counter.id)).toMatchObject({ critical: true, at: 1100 });
    expect(hit.hp).toBe(s.hp); expect(hit.buffs[counter.id]).toBeUndefined();
  });
  it('also blocks manual skill activation while preserving free status cancellation', () => {
    const { c, s, skill } = waiting(), berserk = skill('SM_AUTOBERSERK'), identify = skill('MC_IDENTIFY');
    s.learnedSkills[berserk.id] = s.learnedSkills[identify.id] = 1;
    expect(() => applyCommand(s, c, { type: 'toggleBuff', skillId: berserk.id }, 0)).toThrow('estado atual');
    const item = s.inventory.find(e => e.itemId === 1201)!; item.identified = false;
    expect(() => applyCommand(s, c, { type: 'identify', uid: item.uid, method: 'skill' }, 0)).toThrow('estado atual');
    s.buffs[berserk.id] = { expiresAt: 999999, effects: {} };
    expect(applyCommand(s, c, { type: 'cancelBuff', skillId: berserk.id }, 0).buffs[berserk.id]).toBeUndefined();
  });
  it('uses source integer direction boundaries and accepts only front/adjacent sectors for every facing', () => {
    expect(sourceFacing(1, 3)).toEqual({ x: 0, y: 1 });
    expect(sourceFacing(3, 1)).toEqual({ x: 1, y: 1 });
    expect(sourceFacing(-3, -1)).toEqual({ x: -1, y: 0 });
    expect(sourceFacing(3, 2)).toEqual({ x: 1, y: 1 });
    const dirs = [{ x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
      { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    for (let facing = 0; facing < 8; facing++) for (let side = 0; side < 8; side++) {
      const offset = (side - facing + 8) % 8;
      expect(autoCounterBlocks({ defender: { x: 0, y: 0 }, attacker: dirs[side], facing: dirs[facing], weaponRange: 1 }))
        .toBe([0, 1, 7].includes(offset));
    }
  });
  it('blocks before dodge/barriers/React, consumes posture, then emits a critical weapon counter at half motion', () => {
    const { c, s, counter, skill } = waiting(), react = skill('AS_POISONREACT');
    s.buffs[react.id] = { expiresAt: 999999, effects: { reflectPct: 50, perfectDodge: 100 } };
    Object.assign(s.combatEffects!, { poisonReact: { charges: 6 }, endure: { level: 10, charges: 7, expiresAt: 999999 },
      kyrieHp: 1000, kyrieHits: 10, safetyWallHits: 5 });
    const next = advanceState(s, c, 1250);
    expect(next.hp).toBe(s.hp); expect(next.buffs[counter.id]).toBeUndefined();
    expect(next.combatEffects).toMatchObject({ poisonReact: { charges: 6 }, endure: { charges: 7 }, kyrieHp: 1000, kyrieHits: 10, safetyWallHits: 5 });
    const hit = next.events.find(e => e.kind === 'damage' && e.skillId === counter.id)!;
    expect(hit).toMatchObject({ actorAction: 'attack', critical: true, sourceActorId: s.id, skillLevel: 5 });
    expect(hit.amount).toBeGreaterThan(0); expect(next.battle!.enemies![0].hp).toBe(100000 - hit.amount!);
    expect(hit.actionMotionMs).toBe(497); // unarmed fixture: floor(amotion995 /2)
    expect(next.events.some(e => e.kind === 'dodge' && e.targetActorId === s.id && e.hitMotionMs === 1)).toBe(true);
    expect(next.battle!.enemies![0].enemyNextAttackAt).toBe(3100);
  });
  it.each([{ point: { x: .48 - 1 / 12, y: .65 } }, { point: { x: .48, y: .65 + 1 / 12 } },
    { point: { x: .48 + 3 / 12, y: .65 } }])('does not intercept a rear, side or out-of-weapon-range attacker: $point', ({ point }) => {
    const { c, s, enemy, counter } = waiting(); enemy.position = point; enemy.approachFrom = { ...point };
    const next = advanceState(s, c, 1250);
    expect(next.buffs[counter.id]).toBeDefined(); expect(next.hp).toBeLessThan(s.hp);
    expect(next.events.some(e => e.kind === 'damage' && e.skillId === counter.id)).toBe(false);
  });
  it('permits a ranged normal attack at the right-hand range plus one, and same-cell attacks from any direction', () => {
    const { c, s, enemy, counter } = waiting(); enemy.position.x = .48 + 2 / 12; enemy.approachFrom = { ...enemy.position };
    expect(advanceState(s, c, 1250).events.some(e => e.kind === 'damage' && e.skillId === counter.id)).toBe(true);
    enemy.position = { x: .48, y: .65 }; enemy.approachFrom = { ...enemy.position };
    Object.assign(s, { playerFacing: { x: -1, y: 0 } });
    expect(advanceState(s, c, 1250).buffs[counter.id]).toBeUndefined();
  });
  it('preserves facing/window across reconnect, expires at its deadline and grants one counter kill only', () => {
    const { c, s, enemy, counter } = waiting(); enemy.hp = 1;
    const saved = JSON.parse(JSON.stringify(s)), next = advanceState(saved, c, 1250);
    expect(next.totals.kills).toBe(1); expect(next.events.filter(e => e.kind === 'kill')).toHaveLength(1);
    expect(advanceState(next, c, 1500).totals.kills).toBe(1);
    s.buffs[counter.id].expiresAt = 1100; enemy.hp = 100000;
    expect(advanceState(s, c, 1250).events.some(e => e.kind === 'damage' && e.skillId === counter.id)).toBe(false);
  });
  it('costs three SP, permits unarmed activation, blocks other skills and delays only activation presentation by 100ms', () => {
    const { c, s, enemy, skill } = setup(), counter = skill('KN_AUTOCOUNTER'), bash = skill('SM_BASH');
    enemy.enemyNextAttackAt = 2400; enemy.position = { x: .48 + 2 / 12, y: .65 }; enemy.approachFrom = { ...enemy.position };
    s.learnedSkills = { [counter.id]: 5, [bash.id]: 10 }; s.rotation = [counter.id, bash.id];
    const next = advanceState(s, c, 1750);
    expect(next.sp).toBe(s.sp - 3); expect(next.buffs[counter.id]?.expiresAt).toBe(3000);
    expect(next.events.find(e => e.kind === 'skill' && e.skillId === counter.id)).toMatchObject({ actionStartedAt: 1100, actorAction: 'none', actionMotionMs: 0 });
    expect(next.events.some(e => e.kind === 'skill' && e.skillId === bash.id)).toBe(false);
    c.items[1201].weaponType = 'bow'; s.equipment.weapon = s.inventory.find(e => e.itemId === 1201)!.uid;
    expect(advanceState(s, c, 1250).buffs[counter.id]).toBeUndefined();
  });
  it('basic attacks consume posture through the critical branch, while Double Attack leaves it active', () => {
    const { c, s, enemy, counter, skill } = waiting(); enemy.enemyNextAttackAt = 999999;
    s.battle!.playerNextAttackAt = 1000; s.battle!.playerNextSkillAt = 999999;
    const hit = advanceState(s, c, 1250);
    expect(hit.buffs[counter.id]).toBeUndefined(); expect(hit.events.find(e => e.kind === 'damage')?.critical).toBe(true);
    c.monsters[1002].stats.agi = 0; s.equipment.weapon = s.inventory.find(e => e.itemId === 1201)!.uid;
    s.learnedSkills[skill('TF_DOUBLE').id] = 10;
    expect(advanceState(s, c, 1250).buffs[counter.id]).toBeDefined();
  });
  it('does not intercept while hidden even if a detecting monster can attack, or restore zero base CRIT', () => {
    const { c, s, counter, skill } = waiting(), hiding = skill('TF_HIDING');
    s.buffs[hiding.id] = { expiresAt: 999999, effects: {} }; s.learnedSkills[hiding.id] = 5; c.monsters[1002].detector = true;
    expect(advanceState(s, c, 1250).events.some(e => e.kind === 'damage' && e.skillId === counter.id)).toBe(false);
    delete s.buffs[hiding.id]; s.buffs.zeroCrit = { expiresAt: 999999, effects: { crit: -1.3 } };
    const next = advanceState(s, c, 1250);
    expect(next.buffs[counter.id]).toBeUndefined(); expect(next.events.some(e => e.kind === 'miss' && e.skillId === counter.id)).toBe(true);
  });
});

describe('Unfairly Trick shared resource calculation', () => {
  it('makes Mammonite affordable at ninety percent and charges that amount once, with unchanged SP and other zeny skills', () => {
    const { c, s, skill } = setup(), trick = skill('BS_UNFAIRLYTRICK'), mammonite = skill('MC_MAMMONITE');
    s.learnedSkills[trick.id] = 1; s.zeny = 900;
    expect(canPaySkillResources(s, c, mammonite, 10, 0)).toBe(true);
    expect(paySkillResources(s, c, mammonite, 10, 0)).toBe(true);
    expect(s.zeny).toBe(0); expect(s.sp).toBe(995);
    s.zeny = 89; mammonite.zenyCost = [99];
    expect(canPaySkillResources(s, c, mammonite, 1, 0)).toBe(false);
    s.zeny = 90; expect(paySkillResources(s, c, mammonite, 1, 0)).toBe(true); expect(s.zeny).toBe(0);
    s.zeny = 90; const other: Skill = { ...mammonite, sourceName: 'WS_CARTTERMINATION' };
    expect(canPaySkillResources(s, c, other, 1, 0)).toBe(false);
    trick.implementation = 'unsupported'; expect(canPaySkillResources(s, c, mammonite, 1, 0)).toBe(false);
  });
});

describe('Tunnel Drive movement while Hiding', () => {
  it.each([{ level: 1, cellMs: 321 }, { level: 5, cellMs: 285 }])('walks hidden at source rate for level $level without attacking or bypassing upkeep', ({ level, cellMs }) => {
    const { c, s, skill } = setup(), hiding = skill('TF_HIDING'), tunnel = skill('RG_TUNNELDRIVE');
    s.status = 'hunting'; s.areaId = 'prontera'; s.battle = null;
    s.learnedSkills = { [hiding.id]: 5, [tunnel.id]: level };
    s.buffs[hiding.id] = { expiresAt: 150000, effects: {} };
    s.fieldHero = { areaId: 'prontera', from: { x: .48, y: .65 }, position: { x: .48, y: .65 }, startedAt: 0, arrivedAt: 0, routeIndex: 0 };
    beginBattle(s, c, 1002, 0);
    const enemy = s.battle!.enemies![0]; enemy.position = { x: .9, y: .65 }; enemy.approachFrom = { ...enemy.position };
    enemy.arrivedAt = 0; enemy.enemyNextAttackAt = 999999;
    const next = advanceState(s, c, 250), hero = next.fieldHero!;
    const cells = Math.hypot(hero.position.x - hero.from.x, hero.position.y - hero.from.y) * 12;
    expect(hero.phase).toBe('chasing'); expect(hero.arrivedAt - hero.startedAt).toBe(Math.max(120, Math.ceil(cells * cellMs)));
    expect(next.events.some(e => e.kind === 'damage' && e.sourceActorId === s.id)).toBe(false);
    const drained = advanceState(next, c, 6500); expect(drained.sp).toBe(s.sp - 1); expect(drained.buffs[hiding.id]).toBeDefined();
    delete s.learnedSkills[tunnel.id]; expect(advanceState(s, c, 250).fieldHero!.phase).toBe('waiting');
  });
});
