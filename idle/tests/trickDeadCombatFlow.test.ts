import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../shared/types.js';
import rawCatalog from '../content/catalog.json';
import { BATTLE_HERO, battleHeroAt } from '../shared/battleSpatial.js';
import { advanceState, applyCommand, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { derivedStats } from '../engine/stats.js';
import * as stateTools from '../engine/state.js';
import { recoverResources } from '../engine/recovery.js';
import { trickDeadActive } from '../engine/trickDead.js';

const sourceSkill = (c: Catalog, source: string) => Object.values(c.skills).find(skill => skill.sourceName === source)!;

function setup() {
  const c = structuredClone(rawCatalog) as unknown as Catalog;
  const skill = sourceSkill(c, 'NV_TRICKDEAD');
  skill.implementation = 'supported';
  skill.manualUse = 'toggle';
  c.classes.novice.skills.push(skill.id);
  c.classes.high_novice.skills.push(skill.id);
  c.classes.novice.sp[0] = 1000;
  const s = createInitialState(c, 0, 'trick-dead-test');
  s.learnedSkills[skill.id] = 1;
  s.skillPoints = 0;
  s.status = 'hunting'; s.areaId = 'prontera-field'; s.rotation = [];
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  Object.assign(c.monsters[1002], { hp: 100000, attack: [100, 100], attackDelay: 1000, attackRange: 1, baseExp: 0, jobExp: 0 });
  beginBattle(s, c, 1002, 0);
  const enemy = s.battle!.enemies![0];
  s.battle!.enemies = [enemy];
  c.monsters[1002].aggressive = false;
  Object.assign(enemy, { hp: 100000, maxHp: 100000, position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0, startedAt: 0, enemyNextAttackAt: Number.MAX_SAFE_INTEGER });
  enemy.hostile = false;
  for (const other of s.battle!.enemies!) {
    other.hostile = false;
    other.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  }
  s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
  return { c, s, skill, enemy };
}

function activate(s: ReturnType<typeof setup>['s'], c: Catalog, skillId: string, at = 0) {
  return applyCommand(s, c, { type: 'toggleBuff', skillId }, at);
}

afterEach(() => vi.restoreAllMocks());

describe('NV_TRICKDEAD combat flow', () => {
  it('manually activates in field for one modified cost and one status roll while retaining the active encounter', () => {
    const { c, s, skill, enemy } = setup();
    s.sp = 30;
    const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0.5);
    s.lastSimulatedAt = 250;
    s.fieldHero = { areaId: s.areaId!, from: { x: BATTLE_HERO.x - 1, y: BATTLE_HERO.y }, position: { ...BATTLE_HERO }, startedAt: 0, arrivedAt: 1000, routeIndex: 4, phase: 'chasing', targetId: enemy.id };

    const next = activate(s, c, skill.id, 250);

    expect(next.sp).toBe(25);
    expect(next.buffs[skill.id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(next.battle?.targetId).toBe(enemy.id);
    expect(next.battle?.enemies?.[0]?.id).toBe(enemy.id);
    expect(next.events.some(event => event.kind === 'posture' && event.statusName === 'NV_TRICKDEAD' && event.skillId === skill.id)).toBe(true);
    expect(next.fieldHero).toMatchObject({ position: battleHeroAt(s, 250), from: battleHeroAt(s, 250), startedAt: 250, arrivedAt: 250, targetId: enemy.id });
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('can activate in an area between encounters without deleting the saved population', () => {
    const { c, s, skill } = setup();
    s.battle = null;
    s.sp = 30;
    s.fieldPopulation = { areaId: s.areaId!, generation: 2, enemies: [], respawns: [{ slot: 1, at: 5000 }] };
    const before = structuredClone(s.fieldPopulation);

    const next = activate(s, c, skill.id, 0);

    expect(next.buffs[skill.id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(next.fieldPopulation).toEqual(before);
    expect(next.status).toBe('hunting');
    expect(next.battle).toBeNull();
  });

  it('accepts the High Novice class when the skill is learned in its current tree', () => {
    const { c, s, skill } = setup();
    c.classes.high_novice.sp[0] = 1000;
    s.job = 'high_novice'; s.sp = 30;

    const next = activate(s, c, skill.id, 0);

    expect(next.sp).toBe(25);
    expect(next.buffs[skill.id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects town, wrong class, unlearned, dead, and insufficient-SP activation without charge or RNG', () => {
    const invalid: Array<(fixture: ReturnType<typeof setup>) => void> = [
      ({ s }) => { s.status = 'town'; s.areaId = null; s.battle = null; },
      ({ s }) => { s.job = 'super_novice'; },
      ({ s, skill }) => { delete s.learnedSkills[skill.id]; },
      ({ s }) => { s.hp = 0; },
      ({ s }) => { s.sp = 0; },
    ];
    for (const prepare of invalid) {
      const fixture = setup();
      fixture.s.sp = 30;
      prepare(fixture);
      const before = structuredClone(fixture.s);
      const rng = vi.spyOn(stateTools, 'random');
      expect(() => activate(fixture.s, fixture.c, fixture.skill.id)).toThrow();
      expect(fixture.s.sp).toBe(before.sp);
      expect(fixture.s.buffs[fixture.skill.id]).toBeUndefined();
      expect(rng).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('cannot enter an automatic rotation', () => {
    const { c, s, skill } = setup();
    expect(() => applyCommand(s, c, { type: 'setRotation', skillIds: [skill.id] }, 0)).toThrow();
  });

  it('toggle-off is free and consumes no activation roll', () => {
    const { c, s, skill } = setup();
    s.buffs[skill.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    s.sp = 0;
    const rng = vi.spyOn(stateTools, 'random');

    const next = activate(s, c, skill.id, 100);

    expect(next.buffs[skill.id]).toBeUndefined();
    expect(next.sp).toBe(0);
    expect(next.events.some(event => event.kind === 'posture-ended' && event.statusName === 'NV_TRICKDEAD')).toBe(true);
    expect(rng).not.toHaveBeenCalled();
  });

  it('cancels the owned player cast and freezes the hero without clearing its target', () => {
    const { c, s, skill, enemy } = setup();
    s.sp = 30;
    s.lastSimulatedAt = 250;
    s.battle!.cast = { skillId: 'fire_bolt', level: 1, targetId: enemy.id, startedAt: 0, endsAt: 900, actionId: 'cast-live' };
    s.battle!.playerActionReadyAt = 900;
    s.battle!.playerNextSkillAt = 900;
    s.fieldHero = { areaId: s.areaId!, from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO }, startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'fighting', targetId: enemy.id, moveBlockedUntil: 900 };

    const next = activate(s, c, skill.id, 250);

    expect(next.battle?.cast).toBeUndefined();
    expect(next.events.some(event => event.kind === 'cast-interrupted' && event.actionId === 'cast-live')).toBe(true);
    expect(next.fieldHero).toMatchObject({ phase: 'waiting', targetId: enemy.id });
    expect(next.fieldHero?.moveBlockedUntil).toBeUndefined();
    expect(next.battle?.targetId).toBe(enemy.id);
  });

  it('blocks incoming basic attacks before damage or RNG and advances enemy cadence without a player-action burst', () => {
    const { c, s, skill, enemy } = setup();
    s.buffs[skill.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    enemy.hostile = true;
    enemy.enemyNextAttackAt = 250;
    s.battle!.playerNextAttackAt = 250;
    enemy.hostile = true;
    enemy.hp = 100000;
    enemy.maxHp = 100000;
    s.hp = Math.floor(derivedStats(s, c).maxHp / 2);
    const beforeHp = s.hp;
    expect(trickDeadActive(s, c, 250)).toBe(true);
    const rng = vi.spyOn(stateTools, 'random');

    const next = advanceState(s, c, 500);

    expect(next.hp).toBe(beforeHp);
    expect(next.buffs[skill.id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(next.battle?.enemies?.[0]?.enemyNextAttackAt).toBeGreaterThan(250);
    expect(next.battle?.enemies?.[0]?.hp).toBe(100000);
    expect(next.battle?.playerNextAttackAt).toBe(250);
    expect(rng).not.toHaveBeenCalled();
  });

  it('blocks an already-cast NPC skill before damage, status, or RNG', () => {
    const { c, s, skill, enemy } = setup();
    s.buffs[skill.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    s.hp = Math.floor(derivedStats(s, c).maxHp / 2);
    const beforeHp = s.hp;
    enemy.hostile = true;
    c.monsters[enemy.monsterId].npcStatusSkills = [{
      skillId: 176, sourceName: 'NPC_POISON', level: 1, rate: 10000, castTimeMs: 0,
      delayMs: 1000, range: 1, cancelable: true, status: 'SC_POISON', durationMs: 3000,
      damageType: 'magic', baseSp: 0,
    }];
    enemy.npcCombat = { firstAttackDone: true, readyAt: {}, cast: {
      skillId: 176, level: 1, targetActorId: s.id, startedAt: 0, endsAt: 250,
      areaId: s.areaId, actionId: 'npc-poison-live', baseSp: 0,
    } };
    const rng = vi.spyOn(stateTools, 'random');

    const next = advanceState(s, c, 500);

    expect(next.hp).toBe(beforeHp);
    expect(next.playerStatuses?.SC_POISON).toBeUndefined();
    expect(next.buffs[skill.id]).toBeDefined();
    expect(rng).not.toHaveBeenCalled();
  });

  it('blocks manual skills, movement, item use, and auto-potions while leaving status active', () => {
    const { c, s, skill } = setup();
    s.buffs[skill.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    const relax = sourceSkill(c, 'LK_TENSIONRELAX');
    relax.implementation = 'supported'; relax.manualUse = 'rest';
    c.classes.novice.skills.push(relax.id); s.learnedSkills[relax.id] = 1;
    s.hp = Math.floor(derivedStats(s, c).maxHp / 2);
    s.sp = Math.floor(derivedStats(s, c).maxSp / 2);
    s.autoPotion = { hpThreshold: 100, spThreshold: 0 };
    const hp = s.hp, sp = s.sp;
    const potion = s.inventory.find(entry => c.items[entry.itemId]?.type === 'consumable' && (c.items[entry.itemId].healHP ?? 0) > 0)!;
    const potionCount = potion.quantity;
    const rng = vi.spyOn(stateTools, 'random');
    recoverResources(s, c, 1000, 1000);
    const advanced = advanceState(s, c, 1000);
    expect(advanced.hp).toBe(hp);
    expect(advanced.sp).toBe(sp);
    expect(advanced.inventory.find(entry => entry.uid === potion.uid)?.quantity).toBe(potionCount);
    expect(advanced.buffs[skill.id]).toBeDefined();
    expect(rng).not.toHaveBeenCalled();
    expect(() => applyCommand(s, c, { type: 'rest' }, 0)).toThrow();
    expect(() => applyCommand(s, c, { type: 'startHunt', areaId: c.areas.find(area => area.id !== s.areaId)!.id }, 0)).toThrow();
    expect(() => applyCommand(s, c, { type: 'useSkill', skillId: relax.id }, 0)).toThrow();
    expect(() => applyCommand(s, c, { type: 'identify', uid: s.inventory[0].uid, method: 'magnifier' }, 0)).toThrow();
  });

  it('preserves the infinite session status across pause and clears it at the field exit boundary', () => {
    const { c, s, skill } = setup();
    s.buffs[skill.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    s.status = 'paused'; s.pausedStatus = 'hunting'; s.pausedAt = 0;

    const paused = advanceState(s, c, 5000);
    expect(paused.buffs[skill.id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    paused.status = 'hunting';
    const stopped = applyCommand(paused, c, { type: 'stop' }, 5000);
    expect(stopped.buffs[skill.id]).toBeUndefined();
    expect(stopped.events.some(event => event.kind === 'posture-ended' && event.statusName === 'NV_TRICKDEAD')).toBe(true);
  });

  it('clears Trick Dead when a lethal resolution has brought HP to zero', () => {
    const { c, s, skill } = setup();
    s.buffs[skill.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    s.hp = 0;
    s.playerStatuses = { SC_POISON: { startsAt: 0, expiresAt: 1000, level: 1, nextTickAt: 250, remainingTicks: 1, tickDamage: 999 } };

    const next = advanceState(s, c, 500);

    expect(next.hp).toBe(0);
    expect(next.buffs[skill.id]).toBeUndefined();
    expect(next.events.some(event => event.kind === 'posture-ended' && event.statusName === 'NV_TRICKDEAD')).toBe(true);
  });
});
