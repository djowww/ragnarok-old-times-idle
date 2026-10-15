import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { effectiveMonsterStatus } from '../engine/classicStatuses.js';
import { classicSoftMdef } from '../engine/classic.js';
import * as stateTools from '../engine/state.js';

const source = rawCatalog as unknown as Catalog;
const skillId = 'pf_mindbreaker';

function tile(dx: number, dy = 0) {
  const x = Math.floor(BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT) + dx;
  const y = Math.floor(BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT) + dy;
  return { x: (x + .5) / BATTLE_CELLS_PER_UNIT, y: (y + .5) / BATTLE_CELLS_PER_UNIT };
}

function setup(rng = .79, overrides: { boss?: boolean; race?: string; element?: string } = {}) {
  vi.spyOn(stateTools, 'random').mockReturnValue(rng);
  const c = structuredClone(source);
  const s = createInitialState(c, 0, 'mindbreaker-flow');
  s.id = 'mindbreaker-flow';
  s.job = 'professor'; s.baseLevel = 50; s.jobLevel = 50;
  s.learnedSkills[skillId] = 5;
  s.learnedSkills.pf_soulburn = 1; s.learnedSkills.sp_recovery = 3;
  s.rotation = [skillId];
  s.status = 'hunting'; s.areaId = c.areas[0].id;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.sp = 100;
  beginBattle(s, c, 1002, 0);
  const enemy = s.battle!.enemies!.find(row => row.id === s.battle!.targetId)!;
  Object.assign(c.monsters[enemy.monsterId], { hp: 100000, attack: [1, 1], attackRange: 1,
    attackDelay: 100000, attackMotionMs: 500, baseExp: 0, jobExp: 0, boss: overrides.boss ?? false,
    canMove: true, race: overrides.race ?? 'Plant', element: overrides.element ?? 'Water', mdef: 30,
    stats: { str: 1, agi: 1, vit: 10, int: 10, dex: 1, luk: 1 } });
  Object.assign(enemy, { hp: 100000, maxHp: 100000, engaged: true, hostile: true,
    approachFrom: tile(1), position: tile(1), startedAt: 0, arrivedAt: 0,
    enemyNextAttackAt: Number.MAX_SAFE_INTEGER, statuses: {} });
  s.battle!.enemies = [enemy]; s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = 0; s.battle!.playerActionReadyAt = 0;
  if (s.fieldPopulation) s.fieldPopulation.enemies = [enemy];
  if (s.fieldPopulation) s.fieldPopulation.respawns = [1, 2, 3].map(slot => ({ slot, at: 1_000_000_000 }));
  if (s.fieldHero) Object.assign(s.fieldHero, { from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: 0, arrivedAt: 0, phase: 'fighting', targetId: enemy.id });
  return { c, s, enemy };
}

afterEach(() => vi.restoreAllMocks());

describe('PF_MINDBREAKER source combat flow', () => {
  it('applies the level-five 30-second debuff at 80% without dealing damage', () => {
    const { c, s, enemy } = setup(.79);
    const next = advanceState(s, c, 250);
    const cast = next.events.find(entry => entry.kind === 'skill' && entry.skillId === skillId);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(cast).toBeDefined();
    expect(next.sp).toBe(76);
    expect(target.statuses?.SC_MINDBREAKER).toMatchObject({
      level: 5, startsAt: cast!.at, expiresAt: cast!.at! + 30_000,
      magicAttackPct: 100, mdefPercent: 40,
    });
    expect(next.events.some(entry => entry.kind === 'damage' && entry.skillId === skillId)).toBe(false);
    const adjusted = effectiveMonsterStatus(c.monsters[enemy.monsterId], target.statuses, cast!.at!).monster;
    expect(adjusted.mdefPercent).toBe(40);
    expect(classicSoftMdef(adjusted)).toBe(6);
    expect(classicSoftMdef({ ...adjusted, mdefPercent: undefined,
      stats: { ...adjusted.stats, int: 0, vit: 0 } })).toBe(1);
  });

  it('uses the source chance boundary and does not retry an active status', () => {
    const failed = setup(.8);
    const miss = advanceState(failed.s, failed.c, 250);
    expect(miss.sp).toBe(76);
    expect(miss.battle!.enemies![0].statuses?.SC_MINDBREAKER).toBeUndefined();

    const active = setup(.1);
    active.enemy.statuses = { SC_MINDBREAKER: { startsAt: 0, expiresAt: 20_000, level: 5,
      magicAttackPct: 100, mdefPercent: 40 } };
    const before = structuredClone(active.s);
    const skipped = advanceState(active.s, active.c, 250);
    expect(skipped.sp).toBe(before.sp);
    expect(skipped.battle!.enemies![0].statuses?.SC_MINDBREAKER?.expiresAt).toBe(20_000);
    expect(skipped.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(false);
  });

  it('rejects bosses and undead targets before spending SP', () => {
    const cases = [setup(.1, { boss: true }), setup(.1, { race: 'Undead' }), setup(.1, { element: 'Undead' })];
    for (const { c, s, enemy } of cases) {
      const before = s.sp;
      const next = advanceState(s, c, 250);
      expect(next.sp).toBe(before);
      expect(next.battle!.enemies!.find(row => row.id === enemy.id)!.statuses?.SC_MINDBREAKER).toBeUndefined();
      expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(false);
    }
  });

  it('ends sleep, freeze, and stone when the debuff lands', () => {
    const { c, s, enemy } = setup(.79);
    enemy.statuses = {
      SC_SLEEP: { startsAt: 0, expiresAt: 5000, level: 1 },
      SC_FREEZE: { startsAt: 0, expiresAt: 5000, level: 1 },
      SC_STONE: { startsAt: 0, expiresAt: 5000, petrifiesAt: 3000, level: 1 },
    };
    const next = advanceState(s, c, 250);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(target.statuses?.SC_MINDBREAKER).toBeDefined();
    expect(target.statuses?.SC_SLEEP).toBeUndefined();
    expect(target.statuses?.SC_FREEZE).toBeUndefined();
    expect(target.statuses?.SC_STONE).toBeUndefined();
  });
});
