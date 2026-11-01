import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { createInitialState, advanceState, applyCommand } from '../engine';
import { beginBattle } from '../engine/encounters';
import { derivedStats, inventoryLoad } from '../engine/stats';
import * as stateTools from '../engine/state';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { fixture } from './engine-fixture';

const catalog = rawCatalog as unknown as Catalog;
const count = (s: GameState) => s.inventory.filter(item => item.itemId === 7049).reduce((n, item) => n + item.quantity, 0);
function setup(reverse = false, sp = 50, dex = 0) {
  const c = fixture(); c.source = structuredClone(catalog.source);
  for (const id of ['tf_pickstone', 'tf_throwstone']) c.skills[id] = structuredClone(catalog.skills[id]);
  c.classes.thief = { ...structuredClone(catalog.classes.thief), hp: Array(99).fill(1000), sp: Array(99).fill(100), jobBonuses: {} };
  c.items[7049] = structuredClone(catalog.items[7049]);
  Object.assign(c.monsters[1002], { hp: 2000, attack: [0, 0], baseExp: 0, jobExp: 0,
    stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 }, def: 0, mdef: 0, canMove: false, drops: [] });
  let s = createInitialState(c, 0); s.job = 'thief'; s.jobLevel = 1; s.skillPoints = 2;
  s.stats = { str: 0, agi: 1, vit: 0, int: 0, dex, luk: 0 };
  for (const skillId of ['tf_pickstone', 'tf_throwstone']) s = applyCommand(s, c, { type: 'learnSkill', skillId }, 0);
  s = applyCommand(s, c, { type: 'setRotation', skillIds: reverse ? ['tf_throwstone', 'tf_pickstone'] : ['tf_pickstone', 'tf_throwstone'] }, 0);
  s.hp = derivedStats(s, c).maxHp; s.sp = sp;
  s.status = 'challenge'; s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0], position = { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y };
  Object.assign(enemy, { hp: 2000, maxHp: 2000, position, approachFrom: { ...position }, homePosition: { ...position },
    startedAt: 0, arrivedAt: 0, enemyNextAttackAt: 999999, hostile: false });
  s.battle!.targetId = enemy.id; s.battle!.playerNextAttackAt = 999999;
  s.battle!.playerNextSkillAt = s.battle!.playerActionReadyAt = 1000;
  return { c, s, enemy };
}
afterEach(() => vi.restoreAllMocks());

describe('Pick Stone real inventory rotation', () => {
  it('learns with two points and accepts both orders through the real rotation command', () => {
    const { c, s } = setup(); expect(s.skillPoints).toBe(0);
    for (const skillIds of [['tf_pickstone', 'tf_throwstone'], ['tf_throwstone', 'tf_pickstone']])
      expect(applyCommand(s, c, { type: 'setRotation', skillIds }, 0).rotation).toEqual(skillIds);
  });
  it.each([false, true])('casts and produces a real Stone once in reverse order %s, then Throw consumes it', reverse => {
    const { c, s } = setup(reverse), before = structuredClone(s);
    const start = advanceState(s, c, 1000);
    expect(start.battle?.cast).toMatchObject({ skillId: 'tf_pickstone', startedAt: 1000, endsAt: 1500 });
    expect(count(start)).toBe(0); expect(start.sp).toBe(50);
    const end = advanceState(start, c, 1500);
    expect(count(end)).toBe(1); expect(end.sp).toBe(47); expect(end.rngState).toBe(before.rngState);
    expect(end.buffs.tf_pickstone).toBeUndefined(); expect(end.totals).toEqual({ ...before.totals, elapsedMs: 1500 });
    expect(end.battle?.enemies?.[0]).toMatchObject({ hp: 2000, hostile: false });
    expect(end.events.filter(e => e.kind === 'skill' && e.skillId === 'tf_pickstone')).toEqual([
      expect.objectContaining({ at: 1500, text: 'Pedra coletada', amount: 1, itemId: 7049, quantity: 1,
        target: 'player', sourceActorId: s.id, targetActorId: s.id, skillLevel: 1, actorAction: 'skill',
        actionId: start.battle?.cast?.actionId, actionStartedAt: 1500 }),
    ]);
    const thrown = advanceState(end, c, Math.ceil(end.battle!.playerActionReadyAt! / 250) * 250);
    expect(count(thrown)).toBe(0); expect(thrown.sp).toBe(45);
    expect(thrown.events.some(e => e.kind === 'damage' && e.skillId === 'tf_throwstone')).toBe(true);
    const nextCast = advanceState(thrown, c, Math.ceil(thrown.battle!.playerActionReadyAt! / 250) * 250);
    expect(nextCast.battle?.cast?.skillId).toBe('tf_pickstone');
    const refill = advanceState(nextCast, c, Math.ceil(nextCast.battle!.cast!.endsAt / 250) * 250);
    expect(count(refill)).toBe(1); expect(refill.sp).toBe(42);
  });
  it('uses normal DEX casting reduction and needs only Pick Stone SP, with no reservation for Throw', () => {
    const { c, s } = setup(false, 3, 75), start = advanceState(s, c, 1000);
    expect(start.battle?.cast?.endsAt).toBe(1250);
    const end = advanceState(start, c, 1250); expect(end.sp).toBe(0); expect(count(end)).toBe(1);
    expect(end.skillReadyAt.tf_pickstone).toBe(1250);
  });
  it.each(['weight', 'sp', 'stone', 'class', 'unlearned', 'unsupported', 'missing-item', 'capacity'] as const)('revalidates %s during cast before paying', invalid => {
    const { c, s } = setup(), start = advanceState(s, c, 1000);
    expect(start.battle?.cast?.skillId).toBe('tf_pickstone');
    if (invalid === 'weight') stateTools.addItem(start, c, 909, Math.ceil(inventoryLoad(start, c).maxWeight / 2));
    if (invalid === 'sp') start.sp = 2;
    if (invalid === 'stone') stateTools.addItem(start, c, 7049, 1);
    if (invalid === 'class') start.job = 'novice';
    if (invalid === 'unlearned') delete start.learnedSkills.tf_pickstone;
    if (invalid === 'unsupported') c.skills.tf_pickstone.implementation = 'unsupported';
    if (invalid === 'missing-item') delete c.items[7049];
    if (invalid === 'capacity') c.items[7049].weight = inventoryLoad(start, c).maxWeight + 1;
    const savedSp = start.sp, end = advanceState(start, c, 1500);
    expect(end.sp).toBe(savedSp); expect(count(end)).toBe(invalid === 'stone' ? 1 : 0);
    expect(end.events.some(e => e.kind === 'skill' && e.skillId === 'tf_pickstone')).toBe(false);
  });
  it.each(['dead-target', 'removed-target'] as const)('completes self production after %s', invalid => {
    const { c, s } = setup(), start = advanceState(s, c, 1000);
    if (invalid === 'dead-target') start.battle!.enemies![0].hp = 0;
    else start.battle!.enemies = [];
    const end = advanceState(start, c, 1500); expect(count(end)).toBe(1); expect(end.sp).toBe(47);
  });
  it.each(['dead-hero', 'rest'] as const)('does not produce after %s cleanup', invalid => {
    const { c, s } = setup(); let start = advanceState(s, c, 1000);
    if (invalid === 'dead-hero') start.hp = 0;
    else {
      start.status = 'hunting'; start.areaId = 'prontera'; delete start.battle!.challengeId;
      start = applyCommand(start, c, { type: 'rest' }, 1000);
    }
    const end = advanceState(start, c, 1500); expect(count(end)).toBe(0); expect(end.sp).toBe(50);
  });
  it('does not cancel the source uninterruptible cast on a damaging hit', () => {
    const { c, s } = setup(), start = advanceState(s, c, 1000);
    vi.spyOn(stateTools, 'random').mockReturnValue(.5);
    Object.assign(c.monsters[1002], { attack: [20, 20], stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 1000, luk: 0 } });
    Object.assign(start.battle!.enemies![0], { hostile: true, enemyNextAttackAt: 1250 });
    const end = advanceState(start, c, 1500);
    expect(end.hp).toBeLessThan(start.hp); expect(count(end)).toBe(1); expect(end.sp).toBe(47);
    expect(end.events.some(e => e.kind === 'cast-interrupted' && e.skillId === 'tf_pickstone')).toBe(false);
  });
  it('retains saved progress and produces the same unique event through JSON and smaller advances', () => {
    const { c, s } = setup(); stateTools.addItem(s, c, 909, 7); s.inventory.at(-1)!.favorite = true;
    s.mounted = false;
    const one = advanceState(s, c, 1500);
    let steps = advanceState(s, c, 1000); steps = JSON.parse(JSON.stringify(steps));
    for (let at = 1100; at <= 1500; at += 100) steps = advanceState(steps, c, at);
    expect({ inventory: steps.inventory, sp: steps.sp, events: steps.events, totals: steps.totals })
      .toEqual({ inventory: one.inventory, sp: one.sp, events: one.events, totals: one.totals });
    expect(count(one)).toBe(1); expect(one.inventory.find(i => i.itemId === 909)).toMatchObject({ quantity: 7, favorite: true });
  });
  it.each(['only-pick', 'weight', 'sp', 'existing-stone'] as const)('skips collection for %s', invalid => {
    const { c, s } = setup();
    if (invalid === 'only-pick') s.rotation = ['tf_pickstone'];
    if (invalid === 'weight') stateTools.addItem(s, c, 909, Math.ceil(inventoryLoad(s, c).maxWeight / 2));
    if (invalid === 'sp') s.sp = 2;
    if (invalid === 'existing-stone') stateTools.addItem(s, c, 7049, 1);
    expect(advanceState(s, c, 1000).battle?.cast?.skillId).not.toBe('tf_pickstone');
  });
});
