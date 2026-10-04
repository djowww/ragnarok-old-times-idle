import { describe, expect, it } from 'vitest';
import { advanceState, applyCommand, createInitialState, GameError, getSnapshot } from '../engine/index.js';
import { fixture } from './engine-fixture.js';
import type { GameCommand, GameState } from '../shared/types.js';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
const run = (s: GameState, command: GameCommand) => applyCommand(s, fixture(), command, 0);
describe('validated inventory and character commands', () => {
  it('buys real quantities, charges zeny and rejects invalid amounts without changing input', () => {
    const s = createInitialState(fixture(), 0); const next = run(s, { type: 'buy', itemId: 501, quantity: 3 });
    expect(next.zeny).toBe(170); expect(next.inventory.find(i => i.itemId === 501)!.quantity).toBe(23); expect(s.zeny).toBe(200);
    for (const quantity of [-1, 0, 1.5, 100]) expect(() => run(s, { type: 'buy', itemId: 501, quantity })).toThrow(GameError);
  });
  it('protects equipped, favorite, refined and socketed items from selling', () => {
    const s = createInitialState(fixture(), 0); const uid = s.equipment.weapon!;
    expect(() => run(s, { type: 'sell', uid, quantity: 1 })).toThrow(GameError);
    const potion = s.inventory.find(i => i.itemId === 501)!;
    const favored = run(s, { type: 'favorite', uid: potion.uid }); expect(() => run(favored, { type: 'sell', uid: potion.uid, quantity: 1 })).toThrow(GameError);
    const sold = run(s, { type: 'sell', uid: potion.uid, quantity: 2 }); expect(sold.zeny).toBe(210); expect(sold.inventory.find(i => i.itemId === 501)!.quantity).toBe(18);
    expect(() => run(s, { type: 'equip', uid: 'unowned' })).toThrow(GameError);
  });
  it('consumes socket cards exactly once and validates slots', () => {
    let s = createInitialState(fixture(), 0); s = run(s, { type: 'buy', itemId: 4001, quantity: 1 }); const card = s.inventory.find(i => i.itemId === 4001)!;
    expect(() => run(s, { type: 'socket', uid: s.equipment.weapon!, cardUid: card.uid })).toThrow(GameError);
    const next = run(s, { type: 'socket', uid: s.equipment.armor!, cardUid: card.uid }); expect(next.inventory.find(i => i.uid === s.equipment.armor)!.cards).toEqual([4001]);
    expect(next.inventory.some(i => i.uid === card.uid)).toBe(false); expect(() => run(next, { type: 'socket', uid: next.equipment.armor!, cardUid: card.uid })).toThrow(GameError);
    expect(getSnapshot(next, fixture(), 0).stats.crit).toBeGreaterThan(getSnapshot(s, fixture(), 0).stats.crit);
  });
  it('charges refinement materials and preserves +5 when +6 fails', () => {
    const s = createInitialState(fixture(), 0); s.zeny = 10000; s.rngState = 0xdeadbeef;
    const weapon = s.inventory.find(i => i.uid === s.equipment.weapon)!; weapon.refine = 5;
    s.inventory.push({ uid: 'ore', itemId: 984, quantity: 1, refine: 0, cards: [], favorite: false });
    const next = run(s, { type: 'refine', uid: weapon.uid }); expect(next.zeny).toBe(7000); expect(next.inventory.some(i => i.uid === 'ore')).toBe(false); expect(next.inventory.find(i => i.uid === weapon.uid)!.refine).toBe(5);
  });
  it('allocates stat increases using increasing costs and cap99', () => {
    const s = createInitialState(fixture(), 0); const next = run(s, { type: 'allocate', stat: 'str', amount: 10 }); expect(next.stats.str).toBe(11); expect(next.statPoints).toBe(0);
    expect(() => run(next, { type: 'allocate', stat: 'str', amount: 1 })).toThrow(GameError);
    s.stats.str = 99; expect(() => run(s, { type: 'allocate', stat: 'str', amount: 1 })).toThrow(GameError);
  });
  it('requires city/job milestones and retains learned skill points through both class changes', () => {
    let s = createInitialState(fixture(), 0); expect(() => run(s, { type: 'changeClass', classId: 'swordsman' })).toThrow(GameError);
    s.jobLevel = 10; s.skillPoints = 9; s = run(s, { type: 'changeClass', classId: 'swordsman' }); expect(s.jobLevel).toBe(1); expect(s.skillPoints).toBe(9); expect(s.family).toBe('swordsman');
    s.jobLevel = 40; s = run(s, { type: 'changeClass', classId: 'knight' }); expect(s.branch).toBe('knight'); expect(s.learnedSkills.firstaid).toBe(1); expect(s.skillPoints).toBe(9);
    expect(() => run(s, { type: 'changeClass', classId: 'hunter' })).toThrow(GameError);
  });
  it('rebirth preserves owned items/history/family/branch but resets levels and equipment', () => {
    let s = createInitialState(fixture(), 0); s.job = 'knight'; s.family = 'swordsman'; s.branch = 'knight'; s.baseLevel = 99; s.jobLevel = 50; s.zeny = 50000; s.stats.str = 80; s.bestiary[1002] = 100;
    s = run(s, { type: 'rebirth' }); expect(s.job).toBe('high_novice'); expect(s.baseLevel).toBe(1); expect(s.jobLevel).toBe(1); expect(s.stats.str).toBe(1); expect(s.statPoints).toBe(20); expect(s.zeny).toBe(0); expect(s.equipment).toEqual({}); expect(s.bestiary[1002]).toBe(100); expect(s.branch).toBe('knight');
  });
  it('learns affordable class skills, rejects passive/unknown/duplicate rotations and caps length', () => {
    let s = createInitialState(fixture(), 0); s.job = 'mage'; s.skillPoints = 1;
    s = run(s, { type: 'learnSkill', skillId: 'firebolt' }); expect(s.learnedSkills.firebolt).toBe(1); expect(s.skillPoints).toBe(0);
    expect(run(s, { type: 'setRotation', skillIds: ['firebolt'] }).rotation).toEqual(['firebolt']);
    expect(() => run(s, { type: 'setRotation', skillIds: ['firebolt', 'firebolt'] })).toThrow(GameError);
    expect(() => run(s, { type: 'learnSkill', skillId: 'firebolt' })).toThrow(GameError);
  });
  it('claims quest once and only after its condition', () => {
    const s = createInitialState(fixture(), 0); expect(() => run(s, { type: 'claimQuest', questId: 'firstkill' })).toThrow(GameError);
    s.bestiary[1002] = 1; const next = run(s, { type: 'claimQuest', questId: 'firstkill' }); expect(next.zeny).toBe(300); expect(next.quests.firstkill.claimed).toBe(true);
    expect(() => run(next, { type: 'claimQuest', questId: 'firstkill' })).toThrow(GameError);
  });
  it('challenge victory persists one attempt reward, cooldown and permanent first achievement', () => {
    const c = fixture(); let s = createInitialState(c, 0); s.baseLevel = 15; s.stats.str = 99;
    s = applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 0); s = advanceState(s, c, 30000);
    expect(s.challengeWins.mastering).toBe(1); expect(s.rewardedAttempts).toHaveLength(1); expect(s.zeny).toBe(1200); expect(s.challengeCooldowns.mastering).toBeGreaterThan(3600000);
    expect(advanceState(s, c, 30000)).toEqual(s); expect(() => applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 30000)).toThrow(GameError);
    expect(s.status).toBe('town');
  });
  it('rejects locked areas and supports stop/rest, potion settings, offline dismissal and auto resume', () => {
    let s = createInitialState(fixture(), 0); expect(() => run(s, { type: 'startHunt', areaId: 'locked' })).toThrow(GameError);
    s = run(s, { type: 'setPotions', hpThreshold: 30, spThreshold: 10 }); expect(s.autoPotion).toEqual({ hpThreshold: 30, spThreshold: 10 });
    expect(() => run(s, { type: 'setPotions', hpThreshold: 101, spThreshold: 0 })).toThrow(GameError);
    s = run(s, { type: 'setAutoResume', enabled: true }); expect(s.autoResume).toBe(true);
    s = run(s, { type: 'startHunt', areaId: 'prontera' }); s = run(s, { type: 'stop' }); expect(s.battle).toBeNull(); expect(s.status).toBe('town');
    s = run(s, { type: 'rest' }); expect(s.status).toBe('resting'); s = run(s, { type: 'dismissOffline' }); expect(s.offlineSummary).toBeNull();
  });
  it('keeps shield and two handed weapons mutually exclusive and rejects class-restricted gear', () => {
    const c = fixture(); c.items[1701].twoHanded = true; c.items[2400] = { ...c.items[2301], id: 2400, slot: 'shield' };
    let s = createInitialState(c, 0); s.job = 'archer'; s.zeny = 1000;
    s = applyCommand(s, c, { type: 'buy', itemId: 1701, quantity: 1 }, 0); s = applyCommand(s, c, { type: 'buy', itemId: 2400, quantity: 1 }, 0);
    const bow = s.inventory.find(e => e.itemId === 1701)!; const shield = s.inventory.find(e => e.itemId === 2400)!;
    s = applyCommand(s, c, { type: 'equip', uid: shield.uid }, 0); s = applyCommand(s, c, { type: 'equip', uid: bow.uid }, 0); expect(s.equipment.shield).toBeUndefined();
    s = applyCommand(s, c, { type: 'equip', uid: shield.uid }, 0); expect(s.equipment.weapon).toBeUndefined();
    s.job = 'novice'; expect(() => applyCommand(s, c, { type: 'equip', uid: bow.uid }, 0)).toThrow(GameError);
  });
  it('abandoned or timed out challenges grant no rewards or victory cooldown', () => {
    const c = fixture(); c.challenges[0].timeoutMs = 2000; c.monsters[1002].hp = 100000;
    let s = createInitialState(c, 0); s.baseLevel = 15; s = applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 0);
    const timed = advanceState(s, c, 3000); expect(timed.status).toBe('town'); expect(timed.zeny).toBe(200); expect(timed.rewardedAttempts).toEqual([]); expect(timed.challengeCooldowns.mastering).toBeUndefined();
    const stopped = applyCommand(s, c, { type: 'stop' }, 1000); expect(stopped.challengeWins.mastering).toBeUndefined(); expect(stopped.zeny).toBe(200);
  });
  it('rewards a new challenge attempt after cooldown without repeating its first achievement', () => {
    const c = fixture(); let s = createInitialState(c, 0); s.baseLevel = 15; s.stats.str = 99;
    s = advanceState(applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 0), c, 30000);
    s = applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 3700000); s = advanceState(s, c, 3730000);
    expect(s.challengeWins.mastering).toBe(2); expect(s.rewardedAttempts).toHaveLength(2); expect(s.zeny).toBe(1200); expect(s.totals.kills).toBe(2); expect(s.totals.baseExp).toBe(16);
  });
});
describe('all real catalog class routes', () => {
  it.each([
    ['swordsman','knight','lord_knight','male'], ['swordsman','crusader','paladin','male'],
    ['mage','wizard','high_wizard','male'], ['mage','sage','professor','male'],
    ['archer','hunter','sniper','male'], ['archer','bard','clown','male'], ['archer','dancer','gypsy','female'],
    ['acolyte','priest','high_priest','male'], ['acolyte','monk','champion','male'],
    ['merchant','blacksmith','whitesmith','male'], ['merchant','alchemist','creator','male'],
    ['thief','assassin','assassin_cross','male'], ['thief','rogue','stalker','male'],
  ])('progresses %s -> %s -> %s through actual EXP tables and capped hunting', (first, second, trans, gender) => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    // Controlled high EXP encounter accelerates the clock without bypassing the real engine or class curves.
    c.areas[0].monsters = [1002]; c.monsters[1002].hp = 1; c.monsters[1002].baseExp = 10000000000; c.monsters[1002].jobExp = 10000000000; c.monsters[1002].drops = [];
    let at = 0; let s = createInitialState(c, at); s = applyCommand(s, c, { type: 'setGender', gender: gender as 'male'|'female' }, at);
    const levelByHunting = () => {
      s = applyCommand(s, c, { type: 'startHunt', areaId: c.areas[0].id }, at);
      at += 10000; s = advanceState(s, c, at);
      const retreating = s.battle !== null;
      s = applyCommand(s, c, { type: 'stop' }, at);
      // Only a live encounter incurs retreat recovery before class changes.
      if (retreating) {
        expect(s.status).toBe('resting'); expect(s.restUntil).toBe(at + 10000);
        at += 10000; s = advanceState(s, c, at);
      }
      expect(s.status).toBe('town');
    };
    levelByHunting(); expect(s.jobLevel).toBe(10); expect(s.baseLevel).toBe(99); expect(s.baseExp).toBe(0); expect(s.skillPoints).toBe(9);
    s = applyCommand(s, c, { type: 'changeClass', classId: first }, at); levelByHunting(); expect(s.jobLevel).toBe(50); expect(s.jobExp).toBe(0);
    s = applyCommand(s, c, { type: 'changeClass', classId: second }, at); levelByHunting(); expect(s.jobLevel).toBe(50); expect(s.skillPoints).toBe(107);
    s.zeny = 50000; s = applyCommand(s, c, { type: 'rebirth' }, at); expect(s.job).toBe('high_novice'); expect(s.skillPoints).toBe(0);
    levelByHunting(); s = applyCommand(s, c, { type: 'changeClass', classId: `high_${first}` }, at); levelByHunting();
    expect(getSnapshot(s, c, at).availableClasses).toEqual([trans]);
    s = applyCommand(s, c, { type: 'changeClass', classId: trans }, at); levelByHunting(); expect(s.jobLevel).toBe(70); expect(s.baseLevel).toBe(99); expect(s.jobExp).toBe(0); expect(s.skillPoints).toBe(127); expect(s.branch).toBe(second);
    const skillId = c.classes[second].skills.find(id => !s.learnedSkills[id])!; s = applyCommand(s, c, { type: 'learnSkill', skillId }, at); expect(s.learnedSkills[skillId]).toBe(1);
  });
  it('offers Bard or Dancer according to avatar and locks avatar after class evolution', () => {
    const c = catalogJson as unknown as Catalog; const s = createInitialState(c, 0); s.job = 'archer'; s.family = 'archer'; s.jobLevel = 40;
    expect(getSnapshot(s,c,0).availableClasses).toContain('bard'); expect(getSnapshot(s,c,0).availableClasses).not.toContain('dancer');
    s.gender = 'female'; expect(getSnapshot(s,c,0).availableClasses).toContain('dancer'); expect(getSnapshot(s,c,0).availableClasses).not.toContain('bard');
    expect(() => applyCommand(s,c,{type:'setGender',gender:'male'},0)).toThrow(GameError);
  });
});
