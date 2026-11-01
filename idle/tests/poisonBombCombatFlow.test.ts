import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

function setup(sourceName = 'AS_POISONREACT') {
  vi.spyOn(stateTools, 'random').mockReturnValue(.1);
  const c = fixture(), source = catalogJson as unknown as Catalog;
  for (const name of ['AS_POISONREACT', 'AS_SPLASHER', 'TF_POISON']) {
    const skill = structuredClone(Object.values(source.skills).find(s => s.sourceName === name)!);
    skill.implementation = 'supported';
    if (name === 'AS_POISONREACT') skill.kind = 'buff';
    skill.castTimeMs = Array(skill.maxLevel).fill(0);
    c.skills[skill.id] = skill; c.classes.novice.skills.push(skill.id);
  }
  c.classes.novice.hp.fill(10000); c.classes.novice.sp.fill(1000);
  Object.assign(c.monsters[1002], { hp: 100000, attack: [10, 10], attackRange: 1, boss: false,
    element: 'neutral', def: 0, mdef: 0, baseExp: 0, jobExp: 0,
    stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 100, luk: 0 } });
  c.items[716] = structuredClone(source.items[716]);
  const s = createInitialState(c, 0); s.status = 'challenge'; s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.equipment = {}; s.stats.dex = 150; s.stats.vit = 0; s.sp = 1000; s.hp = 10000;
  stateTools.addItem(s, c, 716, 10);
  const skill = Object.values(c.skills).find(s => s.sourceName === sourceName)!;
  s.learnedSkills[skill.id] = sourceName === 'AS_SPLASHER' ? 3 : 10; s.rotation = [skill.id];
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  enemy.position = enemy.approachFrom = { x: .48, y: .65 }; enemy.arrivedAt = 0; enemy.enemyNextAttackAt = 999999;
  if (sourceName === 'AS_SPLASHER') enemy.hp = 75000;
  s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 1000;
  return { c, s, skill, enemy };
}
function quiet(s: GameState) {
  s.rotation = []; s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999999;
}
afterEach(() => vi.restoreAllMocks());

describe('Poison React incoming normal attacks', () => {
  it('activates as a self buff without a hit and pays once', () => {
    const { c, s, skill } = setup(), next = advanceState(s, c, 1000);
    expect(next.sp).toBe(955); expect(next.buffs[skill.id].expiresAt).toBe(66000);
    expect(next.combatEffects?.poisonReact?.charges).toBe(6);
    expect(next.battle!.enemies![0].hp).toBe(100000);
    expect(next.events.filter(e => e.kind === 'damage')).toHaveLength(0);
  });
  it('launches Envenom5 at no extra SP cost, decrements and persists its charges', () => {
    const ctx = setup(), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    active.battle!.enemies![0].enemyNextAttackAt = 1100;
    const hit = advanceState(active, ctx.c, 1250);
    const envenom = Object.values(ctx.c.skills).find(s => s.sourceName === 'TF_POISON')!;
    expect(hit.events.find(e => e.kind === 'damage' && e.skillId === envenom.id)).toMatchObject({ skillLevel: 5 });
    expect(hit.sp).toBe(955); expect(hit.combatEffects!.poisonReact!.charges).toBe(5);
    const resumed = advanceState(JSON.parse(JSON.stringify(hit)), ctx.c, 1500);
    expect(resumed.combatEffects!.poisonReact!.charges).toBe(5);
  });
  it('still evaluates a counter through Safety Wall without deducting damage from the player', () => {
    const ctx = setup(), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    active.combatEffects!.safetyWallHits = 10; active.battle!.enemies![0].enemyNextAttackAt = 1100;
    const hit = advanceState(active, ctx.c, 1250);
    expect(hit.hp).toBe(10000); expect(hit.combatEffects!.poisonReact!.charges).toBe(5);
    expect(hit.battle!.enemies![0].hp).toBeLessThan(100000);
  });
  it('consumes the entire buff against poison BODY even when the incoming and counter hit miss', () => {
    const ctx = setup(), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    ctx.c.monsters[1002].element = 'poison'; vi.mocked(stateTools.random).mockReturnValue(.999);
    active.battle!.enemies![0].enemyNextAttackAt = 1100;
    const hit = advanceState(active, ctx.c, 1250);
    expect(hit.hp).toBe(10000); expect(hit.buffs[ctx.skill.id]).toBeUndefined();
    expect(hit.combatEffects?.poisonReact).toBeUndefined();
    expect(hit.events.some(e => e.skillId === ctx.skill.id && e.kind === 'miss')).toBe(true);
  });
  it('does not reinitialize counter charges while the buff is active and clears them at expiry', () => {
    const ctx = setup(), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    active.combatEffects!.poisonReact!.charges = 2;
    expect(advanceState(active, ctx.c, 2000).combatEffects!.poisonReact!.charges).toBe(2);
    const end = advanceState(active, ctx.c, 66000);
    expect(end.buffs[ctx.skill.id]).toBeUndefined(); expect(end.combatEffects?.poisonReact).toBeUndefined();
  });
  it('allows the final counter attempt and then clears the buff on player defeat', () => {
    const ctx = setup(), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    active.hp = 5; active.battle!.enemies![0].enemyNextAttackAt = 1100;
    const dead = advanceState(active, ctx.c, 1250);
    expect(dead.events.some(e => e.kind === 'damage' && e.target === 'enemy')).toBe(true);
    expect(dead.totals.deaths).toBe(1); expect(dead.hp).toBe(0);
    expect(dead.buffs[ctx.skill.id]).toBeUndefined(); expect(dead.combatEffects?.poisonReact).toBeUndefined();
  });
});

describe('Splasher delayed bomb lifecycle', () => {
  it('charges once at application, keeps HP unchanged and detonates only at its real timer', () => {
    const ctx = setup('AS_SPLASHER'), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    expect(active.battle!.enemies![0].hp).toBe(75000);
    expect(active.battle!.enemies![0].statuses?.SC_SPLASHER).toMatchObject({ level: 3, startsAt: 1000, expiresAt: 7500 });
    expect(active.inventory.find(i => i.itemId === 716)?.quantity).toBe(9);
    expect(active.sp).toBe(984); expect(active.skillReadyAt[ctx.skill.id]).toBe(10000);
    const before = advanceState(active, ctx.c, 7499);
    expect(before.events.some(e => e.kind === 'damage' && e.skillId === ctx.skill.id)).toBe(false);
    const exploded = advanceState(before, ctx.c, 7500);
    expect(exploded.events.filter(e => e.kind === 'damage' && e.skillId === ctx.skill.id)).toHaveLength(1);
    expect(exploded.battle!.enemies![0].statuses?.SC_SPLASHER).toBeUndefined();
    expect(exploded.inventory.find(i => i.itemId === 716)?.quantity).toBe(9);
    expect(exploded.events.find(e => e.kind === 'damage' && e.skillId === ctx.skill.id)).toMatchObject({ actorAction: 'none' });
  });
  it.each(['boss', 'overHp'] as const)('avoids automatic invalid target %s without reagent or SP cost', condition => {
    const ctx = setup('AS_SPLASHER');
    if (condition === 'boss') ctx.c.monsters[1002].boss = true; else ctx.enemy.hp = 75001;
    const next = advanceState(ctx.s, ctx.c, 1000);
    expect(next.battle!.enemies![0].statuses?.SC_SPLASHER).toBeUndefined();
    expect(next.inventory.find(i => i.itemId === 716)?.quantity).toBe(10); expect(next.sp).toBe(1000);
  });
  it('preserves the armed clock through reconnect and shifts it once on pause', () => {
    const ctx = setup('AS_SPLASHER'), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    const loaded = JSON.parse(JSON.stringify(active)) as GameState;
    expect(advanceState(loaded, ctx.c, 7000).battle!.enemies![0].statuses!.SC_SPLASHER.expiresAt).toBe(7500);
    loaded.status = 'paused'; loaded.pausedStatus = 'challenge'; loaded.pausedAt = loaded.lastSimulatedAt = 1000;
    const resumed = applyCommand(loaded, ctx.c, { type: 'setHuntFocus', areaId: ctx.c.areas[0].id, focus: 'any' }, 6000);
    expect(resumed.battle!.enemies![0].statuses!.SC_SPLASHER.expiresAt).toBe(12500);
    expect(resumed.skillReadyAt[ctx.skill.id]).toBe(15000);
  });
  it('explodes at the current target position and does not split damage in the pinned source', () => {
    const ctx = setup('AS_SPLASHER'), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    const primary = active.battle!.enemies![0]; primary.position = primary.approachFrom = { x: .5, y: .5 };
    primary.statuses!.SC_STUN = { level: 1, expiresAt: 100000 };
    active.battle!.enemies!.push({ ...structuredClone(primary), id: 'splash-near', position: { x: .5 + 2 / 12, y: .5 }, approachFrom: undefined,
      statuses: { SC_STUN: { level: 1, expiresAt: 100000 } } },
      { ...structuredClone(primary), id: 'splash-far', position: { x: .5 + 3 / 12, y: .5 }, approachFrom: undefined,
      statuses: { SC_STUN: { level: 1, expiresAt: 100000 } } });
    const hit = advanceState(active, ctx.c, 7500), damage = hit.events.filter(e => e.kind === 'damage' && e.skillId === ctx.skill.id);
    expect(damage.map(e => e.enemyId)).toEqual([primary.id, 'splash-near']);
    expect(damage[0].amount).toBeGreaterThan(0); expect(damage[1].amount).toBe(damage[0].amount);
  });
  it('does not detonate after the armed victim has been killed or left the encounter', () => {
    const ctx = setup('AS_SPLASHER'), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    active.battle!.enemies = []; const next = advanceState(active, ctx.c, 10000);
    expect(next.events.some(e => e.kind === 'damage' && e.skillId === ctx.skill.id)).toBe(false);
  });
  it('lets the dedicated bomb timer detonate in a persistent hunting population', () => {
    const ctx = setup('AS_SPLASHER'), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    active.status = 'hunting'; active.areaId = ctx.c.areas[0].id;
    delete active.battle!.challengeId; delete active.battle!.attemptId;
    const target = active.battle!.enemies![0]; target.fieldSlot = 0; target.engaged = true;
    active.fieldPopulation = { areaId: active.areaId, generation: 1, enemies: [target], respawns: [] };
    const next = advanceState(active, ctx.c, 7500);
    expect(next.events.some(e => e.kind === 'damage' && e.skillId === ctx.skill.id && e.enemyId === target.id)).toBe(true);
  });
  it('cancels orphaned field bombs after defeat instead of exploding them in a later hunt', () => {
    const ctx = setup('AS_SPLASHER'), active = advanceState(ctx.s, ctx.c, 1000); quiet(active);
    active.status = 'hunting'; active.areaId = ctx.c.areas[0].id;
    delete active.battle!.challengeId; delete active.battle!.attemptId;
    const target = active.battle!.enemies![0]; target.fieldSlot = 0; target.engaged = target.hostile = true;
    target.enemyNextAttackAt = 1100; active.hp = 5;
    active.fieldPopulation = { areaId: active.areaId, generation: 1, enemies: [target], respawns: [] };
    const dead = advanceState(active, ctx.c, 1250);
    expect(dead.totals.deaths).toBe(1); expect(dead.battle).toBeNull();
    const recovered = advanceState(dead, ctx.c, 9000);
    expect(recovered.fieldPopulation!.enemies.find(e => e.id === target.id)!.statuses?.SC_SPLASHER).toBeUndefined();
    const resumed = advanceState({ ...recovered, status: 'hunting', nextEncounterAt: 9001 }, ctx.c, 9500);
    expect(resumed.events.some(e => e.kind === 'damage' && e.skillId === ctx.skill.id)).toBe(false);
  });
});
