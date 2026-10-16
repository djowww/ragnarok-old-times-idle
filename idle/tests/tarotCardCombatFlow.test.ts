import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { effectiveMonsterStatus } from '../engine/classicStatuses.js';
import * as stateTools from '../engine/state.js';

const source = rawCatalog as unknown as Catalog;
const skillId = 'cg_tarotcard';

function tile(dx: number, dy = 0) {
  const x = Math.floor(BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT) + dx;
  const y = Math.floor(BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT) + dy;
  return { x: (x + .5) / BATTLE_CELLS_PER_UNIT, y: (y + .5) / BATTLE_CELLS_PER_UNIT };
}

function setup() {
  const c = structuredClone(source);
  const s = createInitialState(c, 0, 'tarot-card-flow');
  s.id = 'tarot-card-flow';
  s.job = 'clown'; s.baseLevel = 50; s.jobLevel = 50;
  s.learnedSkills[skillId] = 5;
  s.rotation = [skillId];
  s.status = 'hunting'; s.areaId = c.areas[0].id;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.sp = 100;
  beginBattle(s, c, 1002, 0);
  const enemy = s.battle!.enemies!.find(row => row.id === s.battle!.targetId)!;
  Object.assign(c.monsters[enemy.monsterId], { hp: 100000, attack: [1, 1], attackRange: 1,
    attackDelay: 100000, attackMotionMs: 500, baseExp: 0, jobExp: 0, boss: false,
    canMove: true, race: 'Plant', element: 'Water', mdef: 30,
    stats: { str: 1, agi: 1, vit: 10, int: 10, dex: 1, luk: 1 } });
  Object.assign(enemy, { hp: 100000, maxHp: 100000, sp: 100, engaged: true, hostile: true,
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

function mockRandom(...rolls: number[]) {
  let index = 0;
  vi.spyOn(stateTools, 'random').mockImplementation(() => rolls[index++] ?? rolls.at(-1) ?? 0.1);
}

afterEach(() => vi.restoreAllMocks());

describe('CG_TAROTCARD pre-renewal PvE combat flow', () => {
  it('pays SP only on a successful draw and applies the card effect', () => {
    const { c, s, enemy } = setup();
    mockRandom(0.01, 0.01, 0.1); // Cast roll, 1% success, card 1: halve MATK.
    const next = advanceState(s, c, 1250);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;
    const cast = next.events.find(entry => entry.kind === 'skill' && entry.skillId === skillId);

    expect(cast).toBeDefined();
    expect(next.sp).toBe(60);
    expect(target.statuses?.SC_TAROTCARD_MATK_PERC).toMatchObject({
      startsAt: cast!.at, expiresAt: cast!.at! + 30000, magicAttackPct: -50,
    });
  });

  it('applies source-permitted Tarot debuffs to MVP monsters', () => {
    const { c, s, enemy } = setup();
    c.monsters[enemy.monsterId].boss = true;
    mockRandom(0.01, 0.01, 0.3, 0.1); // Cast, success, card 4, guaranteed status.
    const next = advanceState(s, c, 1250);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(target.statuses?.SC_TAROTCARD_ATK_PERC).toMatchObject({ attackPercent: -50 });
  });

  it('does not roll a status chance after Hercules boss immunity rejects it', () => {
    const { c, s, enemy } = setup();
    c.monsters[enemy.monsterId].boss = true;
    const rolls = [0.01, 0.01, 0.5, 0.4]; // Cast, success, control card, Freeze.
    let draws = 0;
    vi.spyOn(stateTools, 'random').mockImplementation(() => rolls[draws++] ?? 0.5);
    const next = advanceState(s, c, 1250);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(target.statuses?.SC_FREEZE).toBeUndefined();
    expect(draws).toBe(4);
  });

  it('does not pay SP or affect the target when the source success roll fails', () => {
    const { c, s, enemy } = setup();
    mockRandom(0.1, 0.41); // Cast roll, then 41% Tarot failure roll.
    const next = advanceState(s, c, 1250);

    expect(next.sp).toBe(100);
    expect(next.battle!.enemies!.find(row => row.id === enemy.id)!.statuses?.SC_TAROTCARD).toBeUndefined();
    expect(next.events.some(entry => entry.kind === 'cast-failed' && entry.skillId === skillId)).toBe(true);
  });

  it('uses the fixed damage card through normal kill and reward handling', () => {
    const { c, s, enemy } = setup();
    enemy.hp = 4000; enemy.maxHp = 4000;
    mockRandom(0.01, 0.01, 0.79); // Cast roll, success, card 11: 4444 fixed damage.
    const before = s.totals.kills;
    const next = advanceState(s, c, 1250);

    expect(next.totals.kills).toBe(before + 1);
    expect(next.events.some(entry => entry.kind === 'damage' && entry.skillId === skillId && entry.amount === 4000)).toBe(true);
    expect(next.events.some(entry => entry.kind === 'kill' && entry.monsterId === enemy.monsterId)).toBe(true);
  });

  it('records Tarot Coma damage as the player attacking the monster', () => {
    const { c, s, enemy } = setup();
    mockRandom(0.01, 0.01, 0.6); // Cast roll, success, card 9: Coma, Curse, Poison.
    const next = advanceState(s, c, 1250);
    const target = next.battle!.enemies!.find(row => row.id === enemy.id)!;

    expect(target.hp).toBe(1);
    expect(target.npcCombat?.pendingAttackerActorId).toBe(s.id);
  });

  it('applies card 13 stat reductions and prevents another Tarot while active', () => {
    const { c, s, enemy } = setup();
    mockRandom(0.01, 0.01, 0.93); // Cast roll, success, card 13: all listed combat stats -20%.
    const first = advanceState(s, c, 1250);
    const target = first.battle!.enemies!.find(row => row.id === enemy.id)!;
    const cast = first.events.find(entry => entry.kind === 'skill' && entry.skillId === skillId)!;

    expect(target.statuses?.SC_TAROTCARD).toMatchObject({ startsAt: cast.at, expiresAt: cast.at! + 30000 });
    expect(effectiveMonsterStatus(c.monsters[enemy.monsterId], target.statuses, cast.at!).atkPercent).toBe(80);
    const second = advanceState(first, c, 5000);
    expect(second.events.filter(entry => entry.kind === 'skill' && entry.skillId === skillId)).toHaveLength(1);
    expect(second.sp).toBe(60);
  });
});
