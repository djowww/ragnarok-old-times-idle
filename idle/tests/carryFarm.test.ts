import { describe, expect, it } from 'vitest';
import { fixture } from './engine-fixture.js';
import { createInitialState, advanceState, applyCommand } from '../engine/index.js';
import { beginBattle, tick } from '../engine/combat.js';
import { executeCommand } from '../engine/commands.js';
import { addItem } from '../engine/state.js';
import { inventoryLoad } from '../engine/stats.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';

function setup(quantity = 0) {
  const c = fixture(); c.classes.novice.baseWeight = 0;
  c.items[909].weight = .1; c.items[501].weight = .1; c.items[1201].weight = 31;
  c.monsters[1002].hp = 100000; c.monsters[1002].baseExp = 0; c.monsters[1002].jobExp = 0;
  const s = createInitialState(c, 0); s.inventory = []; s.equipment = {}; s.rotation = [];
  s.stats.dex = 99; s.baseLevel = 20; s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  addItem(s, c, 909, quantity);
  return { s, c };
}
function fight(quantity = 0) {
  const { s, c } = setup(quantity); s.status = 'challenge';
  beginBattle(s, c, 1002, 0, 'mastering');
  const b = s.battle!, enemy = b.enemies![0];
  Object.assign(enemy, { position: { ...BATTLE_HERO }, homePosition: { ...BATTLE_HERO },
    approachFrom: { ...BATTLE_HERO }, startedAt: 0, arrivedAt: 0, enemyNextAttackAt: 999999 });
  b.playerNextAttackAt = 100; b.playerNextSkillAt = 100; b.playerActionReadyAt = 100;
  return { s, c, b, enemy };
}

describe('carry limits in real combat and commands', () => {
  it('returns at exact ninety percent before any new attack, preserving legacy items', () => {
    const { s, c } = fight(270); s.autoResume = true;
    const items = structuredClone(s.inventory);
    tick(s, c, 1000, 1000);
    expect(s.status).toBe('town'); expect(s.autoResume).toBe(false); expect(s.battle).toBeNull();
    expect(s.events.filter(e => e.kind === 'damage')).toHaveLength(0);
    expect(s.inventory).toEqual(items); expect(s.carryReturnAt).toBe(0);
  });
  it('permits ordinary attacks below ninety percent', () => {
    const { s, c } = fight(269);
    tick(s, c, 1000, 1000);
    expect(s.events.some(e => e.kind === 'damage')).toBe(true); expect(s.status).toBe('challenge');
  });
  it.each(['startHunt', 'challenge'] as const)('rejects %s before mutation at ninety percent', type => {
    const { s, c } = setup(270), before = structuredClone(s);
    const command = type === 'startHunt' ? { type, areaId: 'prontera' } : { type, challengeId: 'mastering' };
    expect(() => executeCommand(s, c, command, 100)).toThrowError(expect.objectContaining({ code: 'WEIGHT_LIMIT' }));
    expect(s).toEqual(before);
  });
  it('refuses an oversized shop purchase before spending or assigning IDs', () => {
    const { s, c } = setup(295), before = structuredClone(s);
    expect(() => executeCommand(s, c, { type: 'buy', itemId: 501, quantity: 6 }, 100))
      .toThrowError(expect.objectContaining({ code: 'WEIGHT_LIMIT' }));
    expect(s).toEqual(before);
    executeCommand(s, c, { type: 'buy', itemId: 501, quantity: 5 }, 101);
    expect(inventoryLoad(s, c).weight).toBe(30);
  });
  it('stops a legacy overweight farm without deleting items or entering a recovery loop', () => {
    const { s, c } = setup(400); s.status = 'hunting'; s.areaId = 'prontera'; s.autoResume = true;
    const before = structuredClone(s.inventory);
    const after = advanceState(s, c, 12 * 3600000);
    expect(after.status).toBe('paused'); expect(after.pausedStatus).toBe('town'); expect(after.autoResume).toBe(false);
    expect(after.inventory).toEqual(before); expect(after.totals.kills).toBe(0);
  });
  it('keeps every AoE kill and challenge prize when a drop reaches the limit in the same action', () => {
    const { s, c, b, enemy } = fight(269);
    c.monsters[1002].hp = 1; enemy.hp = enemy.maxHp = 1;
    const second = structuredClone(enemy); second.id += '-second';
    b.enemies!.push(second);
    c.skills.firebolt.aoeRadius = [4]; c.skills.firebolt.range = [9];
    c.classes.novice.skills.push('firebolt'); s.learnedSkills.firebolt = 1; s.rotation = ['firebolt'];
    c.challenges[0].firstReward.items = [{ itemId: 501, quantity: 1 }, { itemId: 1201, quantity: 1 }];
    tick(s, c, 1000, 1000);
    expect(s.totals.kills).toBe(2); expect(s.challengeWins.mastering).toBe(1);
    expect(s.totals.items).toEqual({ 909: 2, 501: 1, 1201: 1 });
    expect(s.pendingLoot?.map(row => row.entry.itemId)).toEqual([1201]);
    expect(inventoryLoad(s, c).weight).toBe(27.2); expect(s.status).toBe('town');
    expect(s.pendingLoot![0].source).toBe('challenge');
    expect(s.autoResume).toBe(false);
  });
  it('finishes both already due ground hits at one timestamp before returning', () => {
    const { s, c, b, enemy } = fight(269);
    enemy.hp = enemy.maxHp = 1;
    const second = structuredClone(enemy); second.id += '-second'; b.enemies!.push(second);
    b.playerNextAttackAt = b.playerNextSkillAt = b.playerActionReadyAt = 99999;
    c.skills.firebolt.range = [9]; c.skills.firebolt.aoeRadius = [0];
    b.groundEffects = [enemy, second].map(e => ({ skillId: 'firebolt', level: 1,
      position: { ...BATTLE_HERO }, targetId: e.id, nextTickAt: 100, expiresAt: 2000, remainingHits: 1 }));
    for (const ground of b.groundEffects) ground.intervalMs = 1000;
    tick(s, c, 1000, 1000);
    expect(s.totals.kills).toBe(2); expect(s.totals.items[909]).toBe(2);
    expect(s.challengeWins.mastering).toBe(1); expect(s.status).toBe('town');
  });
  it('retains an unused heavy trap and returns even below ninety percent', () => {
    const { s, c, b } = fight(200);
    c.items[1065] = { ...c.items[909], id: 1065, weight: 31 };
    c.skills.trap = { ...c.skills.firstaid, id: 'trap', sourceName: 'HT_LANDMINE',
      itemCostByLevel: [[{ itemId: 1065, quantity: 1 }]] };
    b.playerNextAttackAt = b.playerNextSkillAt = b.playerActionReadyAt = 99999;
    b.traps = [{ id: 'unused', skillId: 'trap', level: 1, position: { x: 20, y: 20 },
      placedAt: 0, nextTickAt: 100, expiresAt: 100 }];
    tick(s, c, 1000, 1000);
    expect(s.pendingLoot?.map(row => row.entry.itemId)).toEqual([1065]);
    expect(s.pendingLoot![0].source).toBe('trap'); expect(s.pendingLoot![0].acquiredAt).toBe(100);
    expect(s.totals.items[1065]).toBeUndefined(); expect(inventoryLoad(s, c).weight).toBe(20);
    expect(s.status).toBe('town'); expect(s.carryReturnAt).toBe(100);
    const count = s.pendingLoot!.length;
    tick(s, c, 2000, 1000); expect(s.pendingLoot).toHaveLength(count);
  });
  it('keeps Pick Stone eligibility when capacity changes during its ongoing cast', () => {
    const { s, c, b, enemy } = fight(200);
    c.items[7049] = { ...c.items[909], id: 7049, weight: 11 };
    c.skills.pick = { ...c.skills.firstaid, id: 'pick', sourceName: 'TF_PICKSTONE', targetType: 'self' };
    c.skills.throw = { ...c.skills.firebolt, id: 'throw', sourceName: 'TF_THROWSTONE' };
    c.classes.novice.skills.push('pick', 'throw');
    s.learnedSkills.pick = s.learnedSkills.throw = 1; s.rotation = ['pick', 'throw'];
    b.playerNextAttackAt = b.playerNextSkillAt = b.playerActionReadyAt = 99999;
    b.cast = { skillId: 'pick', level: 1, targetId: enemy.id, startedAt: 0, endsAt: 100 };
    tick(s, c, 1000, 1000);
    expect(s.pendingLoot).toBeUndefined(); expect(s.totals.items[7049]).toBeUndefined();
    expect(s.inventory.some(row => row.itemId === 7049)).toBe(false);
    expect(inventoryLoad(s, c).weight).toBe(20); expect(s.carryReturnAt).toBeUndefined();
  });
  it('claims every quest reward once during hunting before the carry return', () => {
    const { s, c } = fight(200);
    c.quests[0].reward.items = [{ itemId: 1201, quantity: 2 }]; s.bestiary[1002] = 1;
    executeCommand(s, c, { type: 'claimQuest', questId: 'firstkill' }, 100);
    expect(s.quests.firstkill.claimed).toBe(true); expect(s.pendingLoot).toHaveLength(2);
    expect(s.pendingLoot!.every(row => row.source === 'quest' && row.questId === 'firstkill')).toBe(true);
    expect(s.totals.items[1201]).toBe(2); expect(s.status).toBe('town');
    const before = structuredClone(s);
    expect(() => executeCommand(s, c, { type: 'claimQuest', questId: 'firstkill' }, 101))
      .toThrowError(expect.objectContaining({ code: 'QUEST_NOT_READY' }));
    expect(s).toEqual(before);
  });
  it('disables recovery autoResume on legacy overload without changing death recovery', () => {
    const { s, c } = setup(400); s.status = 'resting'; s.restMode = 'recovery';
    s.restUntil = 1000; s.areaId = 'prontera'; s.autoResume = true; s.hp = 0;
    tick(s, c, 1000, 1000);
    expect(s.status).toBe('town'); expect(s.autoResume).toBe(false); expect(s.totals.deaths).toBe(0);
    expect(inventoryLoad(s, c).weight).toBe(40);
  });
  it('bounds a twelve-hour real farm after a heavy drop and agrees with segmented replay', () => {
    const { s, c } = setup(200); c.monsters[1002].hp = 1;
    c.monsters[1002].drops = [{ itemId: 1201, chance: 10000 }];
    const initial = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0);
    const offline = advanceState(initial, c, 12 * 3600000);
    let segmented = initial;
    for (let at = 60000; at <= 12 * 3600000; at += 60000) segmented = advanceState(segmented, c, at);
    expect(offline).toEqual(segmented);
    expect(offline.totals.kills).toBe(1); expect(offline.pendingLoot).toHaveLength(1);
    expect(offline.totals.items[1201]).toBe(1); expect(inventoryLoad(offline, c).weight).toBe(20);
    expect(offline.status).toBe('paused'); expect(offline.pausedStatus).toBe('town');
    expect(offline.autoResume).toBe(false);
  });
});
