import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import * as stateTools from '../engine/state.js';
import { fogWallDamage, fogWallHitChance } from '../engine/fogWall.js';

const source = rawCatalog as unknown as Catalog;

function tile(dx: number, dy = 0) {
  const x = Math.floor(BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT) + dx;
  const y = Math.floor(BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT) + dy;
  return { x: (x + .5) / BATTLE_CELLS_PER_UNIT, y: (y + .5) / BATTLE_CELLS_PER_UNIT };
}

function setup(attackRange: number, useFogWall = true, challenge = false) {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = structuredClone(source);
  const s = createInitialState(c, 0, 'fog-wall-flow');
  s.id = 'fog-wall-flow'; s.job = 'professor'; s.baseLevel = 50; s.jobLevel = 50;
  s.learnedSkills.pf_fogwall = 1; s.learnedSkills.sa_deluge = 2; s.learnedSkills.sa_violentgale = 2;
  s.rotation = useFogWall ? ['pf_fogwall'] : []; s.status = challenge ? 'challenge' : 'hunting'; s.areaId = c.areas[0].id;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.sp = 80;
  beginBattle(s, c, 1002, 0, challenge ? 'mastering' : undefined);
  const enemy = s.battle!.enemies!.find(row => row.id === s.battle!.targetId)!;
  Object.assign(c.monsters[enemy.monsterId], { hp: 100000, attack: [40, 40], attackRange, npcStatusSkills: [],
    attackDelay: 100000, attackMotionMs: 500, baseExp: 0, jobExp: 0, boss: false,
    canMove: true, race: 'Plant', element: 'Water', mdef: 5,
    stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 30, luk: 1 } });
  Object.assign(enemy, { hp: 100000, maxHp: 100000, engaged: true, hostile: true, fieldSlot: challenge ? 0 : 2,
    approachFrom: tile(challenge ? 1 : 8), position: tile(challenge ? 1 : 8), startedAt: 0, arrivedAt: 0,
    enemyNextAttackAt: Number.MAX_SAFE_INTEGER, statuses: {} });
  s.battle!.enemies = [enemy]; s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = 0; s.battle!.playerActionReadyAt = 0;
  if (s.fieldPopulation && !challenge) s.fieldPopulation.enemies = [enemy];
  if (s.fieldPopulation && !challenge) s.fieldPopulation.respawns = [1, 2, 3].map(slot => ({ slot, at: 1_000_000_000 }));
  if (s.fieldHero && !challenge) Object.assign(s.fieldHero, { from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: 0, arrivedAt: 0, phase: 'fighting', targetId: enemy.id });
  if (challenge) s.fieldHero = undefined;
  return { c, s };
}

afterEach(() => vi.restoreAllMocks());

describe('PF_FOGWALL solo combat adaptation', () => {
  it('uses Hercules ranged hit and damage reductions', () => {
    expect(fogWallHitChance(80, true, true, false)).toBe(.3);
    expect(fogWallHitChance(30, true, true, false)).toBe(.05);
    expect(fogWallHitChance(80, true, false, false)).toBe(.8);
    expect(fogWallHitChance(80, true, true, true)).toBe(.8);
    expect(fogWallDamage(40, true, true, false)).toBe(10);
    expect(fogWallDamage(40, true, false, true)).toBe(30);
    expect(fogWallDamage(40, false, true, false)).toBe(40);
  });

  it('places the defensive field on the player against a ranged hunter target', () => {
    const { c, s } = setup(8);
    const next = advanceState(s, c, 250);
    expect(next.sp).toBe(55);
    expect(next.buffs.pf_fogwall?.expiresAt).toBe(20_000);
    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === 'pf_fogwall' &&
      entry.target === 'player')).toBe(true);
    expect(next.battle?.skillUnits?.some(unit => unit.skillId === 'pf_fogwall') ?? false).toBe(false);
  });

  it('does not spend SP when the current target only uses melee attacks', () => {
    const { c, s } = setup(1);
    const next = advanceState(s, c, 250);
    expect(next.sp).toBe(s.sp);
    expect(next.buffs.pf_fogwall).toBeUndefined();
    expect(next.events.some(entry => entry.skillId === 'pf_fogwall')).toBe(false);
  });

  it('quarters damage from a normal ranged attack after the field is active', () => {
    const guarded = setup(8, false, true);
    vi.spyOn(stateTools, 'random').mockReturnValue(.02);
    guarded.s.hp = 1000;
    guarded.s.rotation = [];
    guarded.s.buffs.pf_fogwall = { expiresAt: 20_000, effects: {} };
    guarded.s.combatEffects = { buffLevels: { pf_fogwall: 1 } };
    Object.assign(guarded.s.battle!.enemies![0], { position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, enemyNextAttackAt: 1500 });
    const protectedState = advanceState(guarded.s, guarded.c, 2000);
    const reduced = protectedState.events.find(entry => entry.kind === 'damage' && entry.target === 'player')?.amount;

    const exposed = setup(8, false, true);
    vi.spyOn(stateTools, 'random').mockReturnValue(.02);
    exposed.s.hp = 1000;
    exposed.s.rotation = [];
    Object.assign(exposed.s.battle!.enemies![0], { position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, enemyNextAttackAt: 1500 });
    const exposedState = advanceState(exposed.s, exposed.c, 2000);
    const full = exposedState.events.find(entry => entry.kind === 'damage' && entry.target === 'player')?.amount;

    expect(full).toBeGreaterThan(0);
    expect(reduced).toBe(Math.floor(full! / 4));
  });
});
