import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import * as stateTools from '../engine/state.js';

const source = rawCatalog as unknown as Catalog;
const skillId = 'sa_dispell';

function tile(dx: number, dy = 0) {
  const x = Math.floor(BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT) + dx;
  const y = Math.floor(BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT) + dy;
  return { x: (x + .5) / BATTLE_CELLS_PER_UNIT, y: (y + .5) / BATTLE_CELLS_PER_UNIT };
}

function setup(options: { level?: number; statuses?: Record<string, { startsAt?: number; expiresAt: number; level: number }>; gemstone?: boolean; supportNeedsOffense?: boolean } = {}) {
  const c = structuredClone(source);
  const s = createInitialState(c, 0, 'dispell-flow');
  s.id = 'dispell-flow';
  s.job = 'professor';
  s.baseLevel = 50;
  s.jobLevel = 50;
  const level = options.level ?? 5;
  s.learnedSkills[skillId] = level;
  s.rotation = [skillId];
  s.status = 'hunting';
  s.areaId = c.areas[0].id;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.sp = 100;
  if (options.gemstone !== false) {
    s.inventory = [{
      uid: 'yellow-gemstone',
      itemId: 715,
      quantity: 1,
      refine: 0,
      cards: [],
      favorite: false,
      identified: true,
    }];
  }
  beginBattle(s, c, 1002, 0);
  if (options.supportNeedsOffense !== undefined)
    s.battle!.supportNeedsOffense = options.supportNeedsOffense;
  const enemy = s.battle!.enemies!.find(row => row.id === s.battle!.targetId)!;
  Object.assign(c.monsters[enemy.monsterId], {
    hp: 100000, attack: [1, 1], attackRange: 1, attackDelay: 100000,
    attackMotionMs: 500, baseExp: 0, jobExp: 0, boss: false, canMove: true,
    race: 'Plant', element: 'Water', mdef: 30,
    stats: { str: 1, agi: 1, vit: 10, int: 10, dex: 1, luk: 1 },
  });
  Object.assign(enemy, {
    hp: 100000, maxHp: 100000, sp: 100, engaged: true, hostile: true,
    approachFrom: tile(1), position: tile(1), startedAt: 0, arrivedAt: 0,
    enemyNextAttackAt: Number.MAX_SAFE_INTEGER, statuses: options.statuses ?? {},
  });
  s.battle!.enemies = [enemy];
  s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = 0;
  s.battle!.playerActionReadyAt = 0;
  if (s.fieldPopulation) {
    s.fieldPopulation.enemies = [enemy];
    s.fieldPopulation.respawns = [1, 2, 3].map(slot => ({ slot, at: 1_000_000_000 }));
  }
  if (s.fieldHero) Object.assign(s.fieldHero, {
    from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: 0, arrivedAt: 0, phase: 'fighting', targetId: enemy.id,
  });
  return { c, s, enemy };
}

function mockRandom(...rolls: number[]) {
  let index = 0;
  vi.spyOn(stateTools, 'random').mockImplementation(() => rolls[index++] ?? rolls.at(-1) ?? 0.1);
}

afterEach(() => vi.restoreAllMocks());

describe('SA_DISPELL pre-renewal AFK combat flow', () => {
  it('removes active effects while preserving statuses Hercules excludes on monsters', () => {
    const { c, s, enemy } = setup({
      statuses: {
        SC_ATKUP: { startsAt: 0, expiresAt: 60000, level: 1 },
        SC_STUN: { startsAt: 0, expiresAt: 60000, level: 1 },
        SC_ASSUMPTIO: { startsAt: 0, expiresAt: 60000, level: 1 },
        SC_TAROTCARD: { startsAt: 0, expiresAt: 60000, level: 1 },
      },
    });
    mockRandom(0.99);

    const next = advanceState(s, c, 3000);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(true);
    expect(next.sp).toBe(99);
    expect(next.inventory.some(entry => entry.itemId === 715)).toBe(false);
    expect(target.statuses?.SC_ATKUP).toBeUndefined();
    expect(target.statuses?.SC_STUN).toBeUndefined();
    expect(target.statuses?.SC_ASSUMPTIO).toBeDefined();
    expect(target.statuses?.SC_TAROTCARD).toBeDefined();
  });

  it('does not cast or spend resources when no dispellable monster buff is active', () => {
    const { c, s, enemy } = setup({
      statuses: {
        SC_ASSUMPTIO: { startsAt: 0, expiresAt: 60000, level: 1 },
        SC_TAROTCARD: { startsAt: 0, expiresAt: 60000, level: 1 },
      },
    });

    const next = advanceState(s, c, 3000);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(false);
    expect(next.sp).toBe(100);
    expect(next.inventory.some(entry => entry.itemId === 715)).toBe(true);
    expect(target.statuses?.SC_ASSUMPTIO).toBeDefined();
  });

  it('waits until a scheduled status is active before spending resources', () => {
    const { c, s, enemy } = setup({
      statuses: { SC_ATKUP: { startsAt: 5000, expiresAt: 60000, level: 1 } },
    });

    const next = advanceState(s, c, 3000);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(false);
    expect(next.sp).toBe(100);
    expect(next.inventory.some(entry => entry.itemId === 715)).toBe(true);
    expect(target.statuses?.SC_ATKUP).toBeDefined();
  });

  it('requires the Yellow Gemstone before starting an automatic cast', () => {
    const { c, s } = setup({
      gemstone: false,
      statuses: { SC_BLESSING: { startsAt: 0, expiresAt: 60000, level: 1 } },
    });

    const next = advanceState(s, c, 3000);

    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(false);
    expect(next.sp).toBe(100);
  });

  it('keeps Dispell available when battle priorities require offense', () => {
    const { c, s, enemy } = setup({
      supportNeedsOffense: true,
      statuses: { SC_ATKUP: { startsAt: 0, expiresAt: 60000, level: 1 } },
    });
    mockRandom(0.1);

    const next = advanceState(s, c, 3000);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(true);
    expect(target.statuses?.SC_ATKUP).toBeUndefined();
  });

  it('does not cast on a monster protected by status immunity', () => {
    const { c, s, enemy } = setup({
      statuses: {
        SC_ATKUP: { startsAt: 0, expiresAt: 60000, level: 1 },
        SC_HERMODE: { startsAt: 0, expiresAt: 60000, level: 1 },
      },
    });

    const next = advanceState(s, c, 3000);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(false);
    expect(next.sp).toBe(100);
    expect(next.inventory.some(entry => entry.itemId === 715)).toBe(true);
    expect(target.statuses?.SC_ATKUP).toBeDefined();
    expect(target.statuses?.SC_HERMODE).toBeDefined();
  });

  it('consumes resources when the cast completes but the source chance fails', () => {
    const { c, s, enemy } = setup({
      level: 1,
      statuses: { SC_ATKUP: { startsAt: 0, expiresAt: 60000, level: 1 } },
    });
    mockRandom(0.6); // Level 1 succeeds only below 60%.

    const next = advanceState(s, c, 3000);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(next.events.some(entry => entry.kind === 'cast-failed' && entry.skillId === skillId)).toBe(true);
    expect(next.sp).toBe(99);
    expect(next.inventory.some(entry => entry.itemId === 715)).toBe(false);
    expect(target.statuses?.SC_ATKUP).toBeDefined();
  });
});
