import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { BattleEnemy, Catalog } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, applyCommand, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import * as stateTools from '../engine/state.js';

const source = rawCatalog as unknown as Catalog;
const skillId = 'rg_closeconfine';
function tile(dx: number, dy = 0) {
  const x = Math.floor(BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT) + dx;
  const y = Math.floor(BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT) + dy;
  return { x: (x + .5) / BATTLE_CELLS_PER_UNIT, y: (y + .5) / BATTLE_CELLS_PER_UNIT };
}

function setup(mode: 'hunting' | 'challenge' = 'hunting') {
  vi.spyOn(stateTools, 'random').mockReturnValue(.25);
  const c = structuredClone(source);
  Object.assign(c.skills[skillId], { implementation: 'supported', statusEffect: 'SC_RG_CCONFINE_S',
    statusDurationMs: [10000], range: [1], spCost: [25], kind: 'buff', targetType: 'enemy' });
  delete c.skills[skillId].unsupportedReason;
  Object.assign(c.monsters[1002], { hp: 100000, attack: [1, 1], attackRange: 1,
    attackDelay: 100000, baseExp: 0, jobExp: 0, boss: false, canMove: true,
    stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 } });
  const s = createInitialState(c, 0);
  s.job = 'rogue'; s.baseLevel = 50; s.jobLevel = 50;
  s.status = mode; s.areaId = c.areas[0].id;
  s.learnedSkills[skillId] = 1; s.rotation = [skillId];
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.sp = 100;
  beginBattle(s, c, 1002, 0, mode === 'challenge' ? 'mastering' : undefined);
  const enemy = s.battle!.enemies![0];
  Object.assign(enemy, { hp: 100000, maxHp: 100000, engaged: true, hostile: true,
    approachFrom: tile(1), position: tile(1), startedAt: 0, arrivedAt: 0,
    enemyNextAttackAt: Number.MAX_SAFE_INTEGER, statuses: {} });
  s.battle!.enemies = [enemy]; s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = 0; s.battle!.playerActionReadyAt = 0;
  if (s.fieldPopulation) s.fieldPopulation.enemies = mode === 'hunting' ? [enemy] : [];
  if (s.fieldPopulation && mode === 'hunting') {
    enemy.fieldSlot = 0;
    s.fieldPopulation.respawns = [1, 2, 3].map(slot => ({ slot, at: 1_000_000_000 }));
  }
  if (s.fieldHero) Object.assign(s.fieldHero, { from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: 0, arrivedAt: 0, phase: 'fighting', targetId: enemy.id });
  return { c, s, enemy };
}

afterEach(() => vi.restoreAllMocks());

describe('RG_CLOSECONFINE source combat flow', () => {
  it('confines the adjacent field target and caster for 10s without damage, while normal attacks continue', () => {
    const { c, s, enemy } = setup();
    const applied = advanceState(s, c, 250);
    const locked = applied.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    const skill = applied.events.find(event => event.kind === 'skill' && event.skillId === skillId);
    expect(skill).toBeDefined();
    expect(applied.sp).toBe(75);
    expect(locked.statuses?.SC_RG_CCONFINE_S).toMatchObject({ level: 1, startsAt: skill!.at,
      expiresAt: skill!.at! + 10000, skillId, sourceActorId: applied.id });
    expect(applied.events.some(event => event.kind === 'damage' && event.skillId === skillId)).toBe(false);

    applied.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
    applied.battle!.playerNextAttackAt = applied.lastSimulatedAt;
    applied.battle!.playerActionReadyAt = applied.lastSimulatedAt;
    const attacked = advanceState(applied, c, applied.lastSimulatedAt + 250);
    expect(attacked.battle!.enemies!.find(entry => entry.id === enemy.id)!.hp).toBeLessThan(100000);
  });

  it('does not spend SP or apply the lock before reaching source range', () => {
    const { c, s, enemy } = setup();
    enemy.approachFrom = enemy.position = tile(5);
    enemy.startedAt = enemy.arrivedAt = 0;
    const approaching = advanceState(s, c, 250);
    expect(approaching.sp).toBe(100);
    expect(approaching.events.some(event => event.kind === 'skill' && event.skillId === skillId)).toBe(false);
    expect(approaching.battle!.enemies!.find(entry => entry.id === enemy.id)!.statuses?.SC_RG_CCONFINE_S).toBeUndefined();
  });

  it('releases the caster lock when the confined target dies and the next target is farther away', () => {
    const { c, s, enemy } = setup();
    const applied = advanceState(s, c, 250);
    const locked = applied.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    locked.hp = 1;
    const next = { ...structuredClone(locked), id: 'next-live-target', fieldSlot: 1,
      hp: 100000, maxHp: 100000, engaged: false, hostile: false,
      approachFrom: tile(20), position: tile(20), startedAt: applied.lastSimulatedAt,
      arrivedAt: applied.lastSimulatedAt, enemyNextAttackAt: Number.MAX_SAFE_INTEGER, statuses: {} } satisfies BattleEnemy;
    applied.battle!.enemies!.push(next);
    applied.fieldPopulation!.enemies.push(next);
    applied.battle!.targetId = locked.id;
    applied.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
    applied.battle!.playerNextAttackAt = applied.lastSimulatedAt;
    applied.battle!.playerActionReadyAt = applied.lastSimulatedAt;

    const defeated = advanceState(applied, c, applied.lastSimulatedAt + 1000);
    expect(defeated.battle!.enemies!.some(entry => entry.id === locked.id)).toBe(false);
    expect(defeated.fieldHero!.phase).toBe('chasing');
    expect(defeated.fieldHero!.arrivedAt).toBeGreaterThan(defeated.lastSimulatedAt);
  });

  it('does not cast the field-only adaptation inside a challenge', () => {
    const { c, s, enemy } = setup('challenge');
    const next = advanceState(s, c, 250);
    expect(next.sp).toBe(100);
    expect(next.events.some(event => event.kind === 'skill' && event.skillId === skillId)).toBe(false);
    expect(next.battle!.enemies!.find(entry => entry.id === enemy.id)!.statuses?.SC_RG_CCONFINE_S).toBeUndefined();
  });

  it('ends the paired status on the source deadline and releases field movement', () => {
    const { c, s, enemy } = setup();
    const applied = advanceState(s, c, 250);
    const expiry = applied.battle!.enemies!.find(entry => entry.id === enemy.id)!.statuses!.SC_RG_CCONFINE_S!.expiresAt;
    applied.rotation = [];
    const ended = advanceState(applied, c, expiry);
    const target = ended.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    expect(target.statuses?.SC_RG_CCONFINE_S).toBeUndefined();
    expect(ended.events.filter(event => event.kind === 'status-end' && event.statusName === 'SC_RG_CCONFINE_S' &&
      event.enemyId === enemy.id)).toHaveLength(1);
  });

  it('preserves the confinement duration across an idle pause and reconnect', () => {
    const { c, s } = setup();
    const applied = advanceState(s, c, 250);
    const expiry = applied.battle!.enemies![0].statuses!.SC_RG_CCONFINE_S!.expiresAt;
    const paused = structuredClone(applied);
    paused.status = 'paused'; paused.pausedStatus = 'hunting'; paused.pausedAt = paused.lastSimulatedAt;
    const reconnectAt = paused.pausedAt + 5000;
    const resumed = applyCommand(paused, c, { type: 'setHuntFocus', areaId: paused.areaId!, focus: 'any' }, reconnectAt);
    expect(resumed.battle!.enemies![0].statuses!.SC_RG_CCONFINE_S!.expiresAt).toBe(expiry + 5000);
    expect(resumed.fieldPopulation!.enemies.find(entry => entry.id === resumed.battle!.enemies![0].id)!
      .statuses!.SC_RG_CCONFINE_S!.expiresAt).toBe(expiry + 5000);
  });

  it('clears source-bound confinement when the player stops the hunt', () => {
    const { c, s, enemy } = setup();
    const applied = advanceState(s, c, 250);
    const ended = applyCommand(applied, c, { type: 'stop' }, applied.lastSimulatedAt + 250);
    expect(ended.battle).toBeNull();
    expect(ended.battle?.enemies?.[0].statuses?.SC_RG_CCONFINE_S).toBeUndefined();
    expect(ended.fieldPopulation!.enemies.find(entry => entry.id === enemy.id)!.statuses?.SC_RG_CCONFINE_S).toBeUndefined();
    expect(ended.events.filter(event => event.kind === 'status-end' && event.statusName === 'SC_RG_CCONFINE_S' &&
      event.enemyId === enemy.id)).toHaveLength(1);
  });
});
