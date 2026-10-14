import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog, GameState } from '../shared/types';
import catalogJson from '../content/catalog.json';
import { BATTLE_HERO, enemyPositionAt } from '../shared/battleSpatial';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { derivedStats } from '../engine/stats';
import { captureSpiderWeb, spiderWebFire, groundDepartureAt } from '../engine/groundSolo';
import { effectiveMonsterStatus } from '../engine/classicStatuses';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

function setup(source = 'AS_VENOMDUST') {
  vi.spyOn(stateTools, 'random').mockReturnValue(.25);
  const c = fixture(), imported = Object.values((catalogJson as unknown as Catalog).skills).find(s => s.sourceName === source)!;
  const skill = c.skills[imported.id] = { ...structuredClone(imported), implementation: 'supported' };
  c.classes.novice.skills.push(skill.id);
  Object.assign(c.monsters[1002], { hp: 100000, attack: [10, 10], attackRange: 1, baseExp: 0, jobExp: 0, boss: false,
    stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 } });
  const s = createInitialState(c, 0);
  s.status = 'challenge'; s.rotation = [skill.id]; s.learnedSkills[skill.id] = Math.min(5, skill.maxLevel);
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.stats.int = 99;
  s.sp = derivedStats(s, c).maxSp; s.hp = derivedStats(s, c).maxHp;
  for (const reagent of skill.itemCostByLevel![0]) {
    c.items[reagent.itemId] = structuredClone((catalogJson as unknown as Catalog).items[reagent.itemId]);
    stateTools.addItem(s, c, reagent.itemId, 20);
  }
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  enemy.position = enemy.approachFrom = { x: (6.5) / 12, y: (7.5) / 12 };
  enemy.arrivedAt = 0; enemy.enemyNextAttackAt = 999999;
  s.battle!.playerNextAttackAt = 1000;
  return { c, s, skill, enemy };
}
function quiet(s: GameState) {
  s.rotation = []; s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999999;
}
const units = (s: GameState) => s.battle?.skillUnits ?? [];
afterEach(() => vi.restoreAllMocks());

describe('Venom Dust and Spider Web source units', () => {
  it('places five persistent Venom Dust units, charges once and does not deal an instant weapon hit', () => {
    const { c, s, skill } = setup();
    const next = advanceState(s, c, 1000), group = units(next)[0];
    expect(group).toMatchObject({ skillId: skill.id, placedAt: 1000, nextTickAt: 1100, expiresAt: 26000 });
    expect(group.cells).toHaveLength(5);
    expect(next.buffs[skill.id]).toBeUndefined();
    expect(next.battle!.enemies![0].hp).toBe(100000);
    expect(next.inventory.find(i => i.itemId === 716)?.quantity).toBe(19);
    expect(next.events.filter(e => e.kind === 'ground-placed')).toHaveLength(1);
  });
  it('Venom Dust covers range one around each of the five cells, not just the cross centers', () => {
    const ctx = setup(), cast = advanceState(ctx.s, ctx.c, 1000); quiet(cast);
    const center = units(cast)[0].position;
    const original = cast.battle!.enemies![0];
    (original.statuses ??= {}).SC_STUN = { level: 1, expiresAt: 100000 };
    original.position = original.approachFrom = { x: center.x + 2 / 12, y: center.y + 1 / 12 };
    cast.battle!.enemies!.push({ ...structuredClone(original), id: 'outside',
      position: { x: center.x + 2 / 12, y: center.y + 2 / 12 }, approachFrom: undefined });
    delete cast.battle!.enemies![1].statuses!.SC_POISON;
    const next = advanceState(cast, ctx.c, 2000);
    expect(next.battle!.enemies![0].statuses?.SC_POISON).toBeDefined();
    expect(next.battle!.enemies![1].statuses?.SC_POISON).toBeUndefined();
    expect(next.inventory.find(i => i.itemId === 716)?.quantity).toBe(19);
  });
  it('does not refresh active Poison or charge an automatic duplicate field', () => {
    const ctx = setup(), cast = advanceState(ctx.s, ctx.c, 1000);
    const next = advanceState(cast, ctx.c, 3000);
    expect(next.events.filter(e => e.kind === 'ground-placed')).toHaveLength(1);
    expect(next.inventory.find(i => i.itemId === 716)?.quantity).toBe(19);
    expect(next.battle!.enemies![0].statuses?.SC_POISON?.startsAt).toBe(1100);
  });
  it('evaluates a newly entering target on the next 100ms timer, independently of other targets', () => {
    const ctx = setup(), cast = advanceState(ctx.s, ctx.c, 1000); quiet(cast);
    const enemy = cast.battle!.enemies![0];
    enemy.position = enemy.approachFrom = { x: .95, y: .95 };
    enemy.statuses = { SC_STUN: { level: 1, expiresAt: 100000 } };
    const outside = advanceState(cast, ctx.c, 1250);
    expect(outside.battle!.enemies![0].statuses?.SC_POISON).toBeUndefined();
    outside.battle!.enemies![0].position = outside.battle!.enemies![0].approachFrom = units(outside)[0].position;
    const entered = advanceState(outside, ctx.c, 1500);
    expect(entered.battle!.enemies![0].statuses?.SC_POISON?.startsAt).toBe(1300);
  });
  it('Spider Web binds a boss to a unit for eight seconds, halves FLEE and still allows its attack', () => {
    const ctx = setup('PF_SPIDERWEB'); ctx.c.monsters[1002].boss = true;
    ctx.enemy.enemyNextAttackAt = 1000;
    const next = advanceState(ctx.s, ctx.c, 1000), web = units(next)[0];
    expect(web).toMatchObject({ capturedEnemyId: ctx.enemy.id, expiresAt: 9000 });
    expect(next.battle!.enemies![0].statuses?.SC_SPIDERWEB).toMatchObject({ startsAt: 1000, expiresAt: 9000,
      groundId: web.id, webCharges: 1, webHeld: true });
    expect(next.events.some(e => e.kind === 'damage' && e.target === 'player')).toBe(true);
    expect(next.inventory.find(i => i.itemId === 1025)?.quantity).toBe(19);
  });
  it('automatic rotation does not waste another web or extend the eight-second timer', () => {
    const ctx = setup('PF_SPIDERWEB'), cast = advanceState(ctx.s, ctx.c, 1000);
    const next = advanceState(cast, ctx.c, 2000);
    expect(units(next)).toHaveLength(1);
    expect(next.battle!.enemies![0].statuses?.SC_SPIDERWEB).toMatchObject({ webCharges: 1, expiresAt: 9000 });
  });
  it('a fire hit doubles damage once, releases movement and consumes one charge', () => {
    const ctx = setup('PF_SPIDERWEB'), cast = advanceState(ctx.s, ctx.c, 1000); quiet(cast);
    const fire = Object.values((catalogJson as unknown as Catalog).skills).find(s => s.sourceName === 'MG_FIREBOLT')!;
    ctx.c.skills[fire.id] = { ...structuredClone(fire), castTimeMs: [0] };
    ctx.c.classes.novice.skills.push(fire.id); cast.learnedSkills[fire.id] = 1; cast.rotation = [fire.id];
    const fireAt = cast.playerCanActAt!;
    cast.battle!.playerNextAttackAt = cast.battle!.playerNextSkillAt = cast.battle!.playerActionReadyAt = fireAt;
    const control = structuredClone(cast); delete control.battle!.enemies![0].statuses!.SC_SPIDERWEB;
    const normal = advanceState(control, ctx.c, Math.ceil(fireAt / 250) * 250), doubled = advanceState(cast, ctx.c, Math.ceil(fireAt / 250) * 250);
    expect(doubled.events.find(e => e.kind === 'damage' && e.skillId === fire.id)?.amount)
      .toBe(normal.events.find(e => e.kind === 'damage' && e.skillId === fire.id)!.amount! * 2);
    expect(doubled.battle!.enemies![0].statuses?.SC_SPIDERWEB).toBeUndefined();
    expect(units(doubled)).toHaveLength(1);
  });
  it('leaving the captured cell after fire removes residual charges and shortens only its bound unit', () => {
    const ctx = setup('PF_SPIDERWEB'), cast = advanceState(ctx.s, ctx.c, 1000); quiet(cast);
    const unit = units(cast)[0], enemy = cast.battle!.enemies![0];
    enemy.statuses!.SC_SPIDERWEB.webHeld = false; enemy.statuses!.SC_SPIDERWEB.webCharges = 2;
    enemy.approachFrom = { ...unit.position }; enemy.position = { x: unit.position.x + 2 / 12, y: unit.position.y };
    enemy.startedAt = 1000; enemy.arrivedAt = 2000; delete enemy.approachPausedAt;
    const next = advanceState(cast, ctx.c, 1500);
    expect(next.battle!.enemies![0].statuses?.SC_SPIDERWEB).toBeUndefined();
    expect(units(next)[0].expiresAt).toBeGreaterThanOrEqual(2250);
    expect(units(next)[0].expiresAt).toBeLessThanOrEqual(2251);
    expect(units(next)[0].capturedEnemyId).toBeUndefined();
  });
  it('expires ground units, preserves exact clocks through reconnect and shifts pause clocks once', () => {
    const ctx = setup(), cast = advanceState(ctx.s, ctx.c, 1000); quiet(cast);
    const reloaded = JSON.parse(JSON.stringify(cast)) as GameState;
    expect(units(advanceState(reloaded, ctx.c, 25999))).toHaveLength(1);
    expect(units(advanceState(reloaded, ctx.c, 26000))).toHaveLength(0);
    reloaded.status = 'paused'; reloaded.pausedStatus = 'challenge'; reloaded.pausedAt = reloaded.lastSimulatedAt = 1000;
    const resumed = applyCommand(reloaded, ctx.c, { type: 'setHuntFocus', areaId: ctx.c.areas[0].id, focus: 'any' }, 6000);
    expect(units(resumed)[0]).toMatchObject({ placedAt: 6000, nextTickAt: 6100, expiresAt: 31000 });
    expect(units(applyCommand(cast, ctx.c, { type: 'stop' }, 1000))).toHaveLength(0);
  });
  it('does not exceed three active web groups or spend a reagent for a fourth', () => {
    const ctx = setup('PF_SPIDERWEB');
    ctx.s.battle!.skillUnits = Array.from({ length: 3 }, (_, i) => ({ id: `web-${i}`, skillId: ctx.skill.id,
      level: 1, position: { x: .2, y: .2 }, cells: [{ x: .2, y: .2 }], placedAt: 0, nextTickAt: 30000, expiresAt: 30000 }));
    const next = advanceState(ctx.s, ctx.c, 1000);
    expect(units(next)).toHaveLength(3); expect(next.inventory.find(i => i.itemId === 1025)?.quantity).toBe(20);
  });
  it('removing a defeated victim from the cell leaves its bound web for only one more second', () => {
    const ctx = setup('PF_SPIDERWEB'), cast = advanceState(ctx.s, ctx.c, 1000);
    const fire = Object.values((catalogJson as unknown as Catalog).skills).find(s => s.sourceName === 'MG_FIREBOLT')!;
    ctx.c.skills[fire.id] = { ...structuredClone(fire), castTimeMs: [0] }; ctx.c.classes.novice.skills.push(fire.id);
    cast.learnedSkills[fire.id] = 1; cast.rotation = [fire.id];
    cast.battle!.enemies!.push({ ...structuredClone(cast.battle!.enemies![0]), id: 'other', statuses: {}, hp: 100000 });
    cast.battle!.enemies![0].hp = 1;
    const fireAt = cast.playerCanActAt!;
    cast.battle!.playerNextAttackAt = cast.battle!.playerNextSkillAt = cast.battle!.playerActionReadyAt = fireAt;
    const next = advanceState(cast, ctx.c, Math.ceil(fireAt / 250) * 250);
    expect(units(next)[0].expiresAt).toBe(fireAt + 1000);
    expect(units(next)[0].capturedEnemyId).toBeUndefined();
  });
  it('retains web ownership and timer on added charges, and starts a new capture after fire', () => {
    const first = captureSpiderWeb(undefined, 'first', 1000);
    const stacked = captureSpiderWeb(first, 'second', 8000);
    expect(stacked).toMatchObject({ groundId: 'first', startsAt: 1000, expiresAt: 9000, webCharges: 2 });
    const fire = spiderWebFire(stacked, 'fire', 8001);
    expect(fire).toMatchObject({ multiplier: 2, status: { webHeld: false, webCharges: 1, expiresAt: 9000 } });
    expect(captureSpiderWeb(fire.status, 'third', 8002)).toMatchObject({ groundId: 'third', startsAt: 8002, expiresAt: 16002, webCharges: 1 });
    expect(spiderWebFire(stacked, 'fire', 9000).multiplier).toBe(1);
  });
  it('web halves FLEE while held and cell departure is detected at the saved movement boundary', () => {
    const ctx = setup('PF_SPIDERWEB'), status = captureSpiderWeb(undefined, 'web', 0);
    expect(effectiveMonsterStatus(ctx.c.monsters[1002], { SC_SPIDERWEB: status }, 1000).flee)
      .toBe(Math.ceil((ctx.c.monsters[1002].level + ctx.c.monsters[1002].stats.agi) / 2));
    expect(groundDepartureAt({ x: .5, y: .5 }, { x: .7, y: .5 }, 0, 1000, { x: .5, y: .5 }, 0)).toBe(417);
    expect(groundDepartureAt({ x: .5, y: .5 }, { x: .3, y: .5 }, 0, 1000, { x: .5, y: .5 }, 0)).toBe(1);
  });
});
