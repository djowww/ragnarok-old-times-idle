import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameCommand } from '../shared/types';
import { createInitialState, advanceState, applyCommand, getSnapshot } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import Build from '../web/panels/Build';
import { recoverResources } from '../engine/recovery';
import { derivedStats, inventoryLoad, classSkills } from '../engine/stats';
import { fixture } from './engine-fixture';

function setup() {
 const c = fixture(), source = catalogJson as unknown as Catalog;
 c.source.files.push('db/pre-re/skill_tree.conf');
 for (const name of ['MO_SPIRITSRECOVERY', 'LK_TENSIONRELAX', 'SM_RECOVERY', 'MG_SRECOVERY', 'LK_BERSERK', 'MO_EXPLOSIONSPIRITS', 'MO_EXTREMITYFIST', 'BS_MAXIMIZE', 'TF_HIDING', 'AS_CLOAKING']) {
  const skill = structuredClone(Object.values(source.skills).find(s => s.sourceName === name)!);
  if (name === 'LK_TENSIONRELAX') skill.manualUse = 'rest' as typeof skill.manualUse;
  skill.implementation = 'supported'; c.skills[skill.id] = skill; c.classes.novice.skills.push(skill.id);
 }
 c.classes.novice.hp.fill(834); c.classes.novice.sp.fill(385);
 c.classes.lord_knight = { ...c.classes.novice, id: 'lord_knight', family: 'swordsman', parent: 'swordsman', tier: 2 };
 const s = createInitialState(c, 0); s.stats.vit = 20; s.stats.int = 30;
 Object.assign(s, { status: 'resting', restMode: 'field', areaId: 'prontera', restUntil: 30000, hp: 100, sp: 100, autoResume: false, learnedSkills: {}, rotation: [], inventory: [], equipment: {} });
 expect(derivedStats(s, c)).toMatchObject({ maxHp: 1000, maxSp: 500 });
 const skill = (name: string) => Object.values(c.skills).find(skill => skill.sourceName === name)!;
 const learn = (name: string, level: number) => { s.learnedSkills[skill(name).id] = level; };
 const buff = (name: string) => { s.buffs[skill(name).id] = { expiresAt: 999999, effects: {} }; };
 return { c, s, skill, learn, buff };
}
const use = (id: string) => ({ type: 'useSkill', skillId: id }) as unknown as GameCommand;

describe('field sitting source recovery', () => {
 it('uses independent 3s HP and 4s SP channels, with no full heal at thirty seconds', () => {
  const { c, s } = setup();
  recoverResources(s, c, 2999, 2999); expect([s.hp, s.sp]).toEqual([100, 100]);
  recoverResources(s, c, 3000, 1); expect([s.hp, s.sp]).toEqual([110, 100]);
  recoverResources(s, c, 4000, 1000); expect([s.hp, s.sp]).toEqual([110, 111]);
  const x = setup(), next = advanceState(x.s, x.c, 30000);
  expect([next.hp, next.sp]).toEqual([200, 177]); expect(next.status).toBe('resting');
 });
 it('Spirit Recovery works only learned and sitting, despite the post-Frenzy natural mask', () => {
  const { c, s, learn } = setup(); learn('MO_SPIRITSRECOVERY', 3);
  s.combatEffects = { regenBlockedUntil: 999999 };
  recoverResources(s, c, 9999, 9999); expect([s.hp, s.sp]).toEqual([100, 100]);
  recoverResources(s, c, 10000, 1); expect([s.hp, s.sp]).toEqual([118, 109]);
  s.status = 'hunting'; recoverResources(s, c, 20000, 10000); expect([s.hp, s.sp]).toEqual([118, 109]);
  const unlearned = setup(); unlearned.s.combatEffects = { regenBlockedUntil: 999999 };
  recoverResources(unlearned.s, unlearned.c, 10000, 10000); expect([unlearned.s.hp, unlearned.s.sp]).toEqual([100, 100]);
 });
 it('at exactly fifty percent weight only Spirit Recovery survives, at twenty seconds', () => {
  const { c, s, learn } = setup(); learn('MO_SPIRITSRECOVERY', 3); learn('SM_RECOVERY', 2); learn('MG_SRECOVERY', 2);
  c.items[909].weight = inventoryLoad(s, c).maxWeight / 2;
  s.inventory = [{ uid: 'weight', itemId: 909, quantity: 1, refine: 0, cards: [], favorite: false }];
  expect(inventoryLoad(s, c).recoveryBlocked).toBe(true);
  recoverResources(s, c, 19999, 19999); expect([s.hp, s.sp]).toEqual([100, 100]);
  recoverResources(s, c, 20000, 1); expect([s.hp, s.sp]).toEqual([118, 109]);
  const under = setup(); under.c.items[909].weight = inventoryLoad(under.s, under.c).maxWeight / 2 - .1;
  under.s.inventory = structuredClone(s.inventory);
  expect(inventoryLoad(under.s, under.c).recoveryBlocked).toBe(false);
  recoverResources(under.s, under.c, 4000, 4000); expect([under.s.hp, under.s.sp]).toEqual([110, 111]);
 });
 it('does not borrow sitting HP time from SP, and standing resets only sitting channels', () => {
  const { c, s, learn } = setup(); learn('MO_SPIRITSRECOVERY', 3); s.hp = 1000;
  recoverResources(s, c, 9000, 9000); s.hp = 100;
  recoverResources(s, c, 10000, 1000); expect([s.hp, s.sp]).toEqual([100, 131]);
  s.lastSimulatedAt = 10000;
  const stood = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 10000);
  const sat = applyCommand(stood, c, { type: 'rest' }, 10000);
  recoverResources(sat, c, 11000, 1000); expect(sat.hp).toBe(100);
 });
 it.each(['LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING'])('blocks all six channels during %s', name => {
  const { c, s, learn, buff } = setup(); learn('MO_SPIRITSRECOVERY', 3); learn('SM_RECOVERY', 2); learn('MG_SRECOVERY', 2); buff(name);
  recoverResources(s, c, 20000, 20000); expect([s.hp, s.sp]).toEqual([100, 100]);
 });
 it.each(['MO_EXTREMITYFIST', 'MO_EXPLOSIONSPIRITS', 'BS_MAXIMIZE'])('%s blocks natural SP, allowing skill and sitting SP', name => {
  const { c, s, learn, buff } = setup(); learn('MG_SRECOVERY', 2); learn('MO_SPIRITSRECOVERY', 3); buff(name);
  recoverResources(s, c, 10000, 10000); expect(s.sp).toBe(117);
 });
 it('allows immediate standing, and autoresume requires both actual resources to be full', () => {
  const { c, s } = setup();
  expect(applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0).status).toBe('hunting');
  s.autoResume = true; expect(advanceState(s, c, 30000).status).toBe('resting');
  s.hp = 990; s.sp = 489;
  expect(advanceState(s, c, 4000).status).toBe('hunting');
 });
 it('keeps city/death acceleration separate and resets every channel on death', () => {
  const { c, s, learn } = setup(); learn('MO_SPIRITSRECOVERY', 3); learn('SM_RECOVERY', 2);
  Object.assign(s, { status: 'town', restMode: undefined, areaId: null });
  expect(advanceState(s, c, 1000).hp).toBe(134);
  s.recovery = { hpMs: 1000, spMs: 2000, skillMs: 3000, skillHpMs: 4000, skillSpMs: 5000, sittingHpMs: 6000, sittingSpMs: 7000 };
  s.hp = 0; recoverResources(s, c, 1000, 1000);
  expect(Object.values(s.recovery!)).toEqual([0, 0, 0, 0, 0, 0, 0]);
 });
 it('preserves full-resource skill clocks when post-Frenzy has removed the natural flags', () => {
  const { c, s, learn } = setup(); learn('SM_RECOVERY', 10); learn('MG_SRECOVERY', 2); learn('MO_SPIRITSRECOVERY', 3);
  s.hp = 1000; s.sp = 500; s.combatEffects = { regenBlockedUntil: 999999 };
  recoverResources(s, c, 9000, 9000); s.hp = 900; s.sp = 400;
  recoverResources(s, c, 10000, 1000); expect([s.hp, s.sp]).toEqual([988, 417]);
 });
 it('clears all accumulated recovery clocks on actual lethal combat damage', () => {
  const { c, s } = setup(); s.status = 'challenge'; s.restMode = undefined;
  c.monsters[1002].attack = [10000, 10000]; c.monsters[1002].stats.dex = 1000;
  beginBattle(s, c, 1002, 0, 'mastering');
  Object.assign(s.battle!.enemies![0], { position: { x: .48, y: .65 }, approachFrom: { x: .48, y: .65 }, arrivedAt: 0, enemyNextAttackAt: 1100, fieldSlot: 0, hostile: true, engaged: true });
  s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999999;
  s.recovery = { hpMs: 1000, spMs: 2000, skillMs: 0, skillHpMs: 4000, skillSpMs: 5000, sittingHpMs: 6000, sittingSpMs: 7000 };
  const dead = advanceState(s, c, 1250); expect(dead.hp).toBe(0); expect(dead.restMode).toBe('recovery');
  expect(Object.values(dead.recovery!)).toEqual([0, 0, 0, 0, 0, 0, 0]);
 });
});

describe('Tension Relax manual source lifecycle', () => {
 it('pays the cast cost once, freezes the hero and immediately sits; invalid casts preserve state', () => {
  const { c, s, skill, learn } = setup(), tension = skill('LK_TENSIONRELAX');
  s.status = 'hunting'; s.job = 'lord_knight'; learn('LK_TENSIONRELAX', 1);
  s.fieldHero = { areaId: 'prontera', from: { x: .4, y: .5 }, position: { x: .8, y: .5 }, startedAt: 0, arrivedAt: 1000, routeIndex: 0, phase: 'moving' as never };
  s.sp = 14; expect(() => applyCommand(s, c, use(tension.id), 0)).toThrow('SP'); expect(s.sp).toBe(14);
  s.sp = 15; const next = applyCommand(s, c, use(tension.id), 0);
  expect(next).toMatchObject({ sp: 0, status: 'resting', restMode: 'field', restUntil: 0, battle: null });
  expect(next.fieldHero?.position).toEqual(next.fieldHero?.from); expect(next.buffs[tension.id]?.expiresAt).toBe(180000);
  expect(next.events.at(-1)).toMatchObject({ kind: 'skill', actorAction: 'none', skillId: tension.id });
  delete s.learnedSkills[tension.id]; expect(() => applyCommand(s, c, use(tension.id), 0)).toThrow('disponível');
  learn('LK_TENSIONRELAX', 1); s.job = 'mage'; expect(classSkills(c, s.job)).not.toContain(tension.id);
  expect(() => applyCommand(s, c, use(tension.id), 0)).toThrow('disponível');
 });
 it('accelerates only HP natural and regular by three, preserving truncation and no recurring SP cost', () => {
  const { c, s, skill, learn } = setup(); learn('LK_TENSIONRELAX', 1); learn('SM_RECOVERY', 2); learn('MG_SRECOVERY', 2); learn('MO_SPIRITSRECOVERY', 3);
  const sat = applyCommand(s, c, use(skill('LK_TENSIONRELAX').id), 0);
  recoverResources(sat, c, 1000, 1000); expect([sat.hp, sat.sp]).toEqual([110, 85]);
  recoverResources(sat, c, 3332, 2332); expect([sat.hp, sat.sp]).toEqual([130, 85]);
  recoverResources(sat, c, 3333, 1); expect(sat.hp).toBe(144);
  const next = advanceState(applyCommand(s, c, use(skill('LK_TENSIONRELAX').id), 0), c, 10000);
  expect([next.hp, next.sp]).toEqual([260, 124]); // HP100 + natural100 + SM42 + sitting18; SP85 + natural22 + MG8 + sitting9
 });
 it('overweight restores HP without x3 and preserves twenty-second Spirit Recovery', () => {
  const { c, s, skill, learn } = setup(); learn('LK_TENSIONRELAX', 1); learn('SM_RECOVERY', 2); learn('MG_SRECOVERY', 2); learn('MO_SPIRITSRECOVERY', 3);
  c.items[909].weight = inventoryLoad(s, c).maxWeight / 2;
  s.inventory = [{ uid: 'weight', itemId: 909, quantity: 1, refine: 0, cards: [], favorite: false }];
  const sat = applyCommand(s, c, use(skill('LK_TENSIONRELAX').id), 0);
  const next = advanceState(sat, c, 20000); expect([next.hp, next.sp]).toEqual([206, 94]);
  c.items[909].weight = inventoryLoad(s, c).maxWeight * .9;
  expect(() => applyCommand(s, c, use(skill('LK_TENSIONRELAX').id), 0)).toThrow('peso');
 });
 it('ends on the next ten-second full-HP check, standing or death, without forcing standing on expiry', () => {
  const { c, s, skill, learn } = setup(), tension = skill('LK_TENSIONRELAX'); learn('LK_TENSIONRELAX', 1);
  let sat = applyCommand(s, c, use(tension.id), 0); sat.hp = 990;
  const full = advanceState(sat, c, 1000); expect(full.buffs[tension.id]).toBeDefined();
  const ended = advanceState(full, c, 10000); expect(ended.buffs[tension.id]).toBeUndefined(); expect(ended.status).toBe('resting');
  expect(applyCommand(sat, c, { type: 'startHunt', areaId: 'prontera' }, 0).buffs[tension.id]).toBeUndefined();
  sat.hp = 0; expect(advanceState(sat, c, 250).buffs[tension.id]).toBeUndefined();
  sat = applyCommand(s, c, use(tension.id), 0); s.combatEffects = { regenBlockedUntil: 999999 }; sat.combatEffects = { ...sat.combatEffects, regenBlockedUntil: 999999 };
  const expired = advanceState(sat, c, 180000); expect(expired.buffs[tension.id]).toBeUndefined(); expect(expired.status).toBe('resting');
 });
 it('retains independent deadlines across reconnect and an explicit pause', () => {
  const { c, s, skill, learn } = setup(), tension = skill('LK_TENSIONRELAX'); learn('LK_TENSIONRELAX', 1);
  const sat = advanceState(applyCommand(s, c, use(tension.id), 0), c, 9000);
  const loaded = JSON.parse(JSON.stringify(sat)); expect(advanceState(loaded, c, 9000)).toEqual(sat);
  Object.assign(loaded, { status: 'paused', pausedStatus: 'resting', pausedAt: 9000 });
  const resumed = applyCommand(loaded, c, { type: 'setHuntFocus', areaId: 'prontera', focus: 'any' }, 59000);
  expect(resumed.buffs[tension.id].expiresAt).toBe(230000);
  expect(resumed.combatEffects?.tensionRelax?.nextTickAt).toBe(60000);
 });
 it('preserves the overweight source ordering when a post-Frenzy skill flag survives', () => {
  const { c, s, skill, learn } = setup(); learn('LK_TENSIONRELAX', 1); learn('MO_SPIRITSRECOVERY', 3);
  s.combatEffects = { regenBlockedUntil: 999999 };
  c.items[909].weight = inventoryLoad(s, c).maxWeight / 2;
  s.inventory = [{ uid: 'weight', itemId: 909, quantity: 1, refine: 0, cards: [], favorite: false }];
  const sat = applyCommand(s, c, use(skill('LK_TENSIONRELAX').id), 0);
  expect(advanceState(sat, c, 3000).hp).toBe(110);
  delete s.learnedSkills[skill('MO_SPIRITSRECOVERY').id];
  expect(advanceState(applyCommand(s, c, use(skill('LK_TENSIONRELAX').id), 0), c, 3000).hp).toBe(100);
 });
 it('keeps the manual button usable at the same modified SP cost as the command', () => {
  const { c, s, skill, learn } = setup(), tension = skill('LK_TENSIONRELAX'); learn('LK_TENSIONRELAX', 1);
  s.status = 'hunting'; s.sp = 12;
  c.items[2301].effects = { spCostReductionPct: 20 };
  s.inventory = [{ uid: 'cost', itemId: 2301, quantity: 1, refine: 0, cards: [], favorite: false, identified: true }]; s.equipment.armor = 'cost';
  const html = renderToStaticMarkup(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, 0), busy: false, command: async () => true, mode: 'skills' }));
  expect(html.match(/<button([^>]*)>Sentar e relaxar<\/button>/)?.[1]).not.toContain('disabled');
  expect(applyCommand(s, c, use(tension.id), 0).sp).toBe(0);
 });
});
