import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { effectiveMonsterStatus } from '../engine/classicStatuses.js';
import { derivedStats } from '../engine/stats.js';
import { slowGraceValues } from '../engine/slowGraceRules.js';
import * as stateTools from '../engine/state.js';

const source = raw as unknown as Catalog;
const skillId = 'dc_dontforgetme';
function tile(dx: number, dy = 0) {
  const x = Math.floor(BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT) + dx;
  const y = Math.floor(BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT) + dy;
  return { x: (x + .5) / BATTLE_CELLS_PER_UNIT, y: (y + .5) / BATTLE_CELLS_PER_UNIT };
}
function setup(weaponId = 1950) {
  vi.spyOn(stateTools, 'random').mockReturnValue(.5);
  const c = structuredClone(source);
  c.skills[skillId].implementation = 'supported';
  delete c.skills[skillId].unsupportedReason;
  Object.assign(c.monsters[1002], { hp: 100000, attack: [10, 10], attackRange: 1, baseExp: 0, jobExp: 0, boss: false,
    canMove: false, stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 } });
  const s = createInitialState(c, 0);
  s.job = 'dancer'; s.jobLevel = 50; s.baseLevel = 50;
  s.status = 'challenge'; s.learnedSkills[skillId] = 5; s.learnedSkills.dc_uglydance = 3; s.learnedSkills.dc_dancinglesson = 2;
  s.stats.dex = 75; s.stats.agi = 66; s.sp = 300; s.rotation = [skillId]; s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  stateTools.addItem(s, c, weaponId, 1, false);
  s.equipment.weapon = s.inventory.find(item => item.itemId === weaponId)!.uid;
  beginBattle(s, c, 1002, 0, 'mastering');
  const first = s.battle!.enemies![0];
  first.hp = first.maxHp = 100000; first.position = first.approachFrom = tile(0); first.arrivedAt = first.startedAt = 0;
  first.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.enemies!.push({ ...structuredClone(first), id: 'inside-neighbor', position: tile(3, -3), approachFrom: tile(3, -3), statuses: {} });
  s.battle!.enemies!.push({ ...structuredClone(first), id: 'outside-neighbor', position: tile(4), approachFrom: tile(4), statuses: {} });
  s.battle!.targetId = first.id;
  s.battle!.playerNextSkillAt = s.battle!.playerActionReadyAt = 1000;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  return { c, s, first };
}
afterEach(() => vi.restoreAllMocks());

describe('DC_DONTFORGETME source combat flow', () => {
  it('places one weapon-gated 7x7 song, debuffs every covered enemy and deals no damage', () => {
    const { c, s, first } = setup();
    const next = advanceState(s, c, 1000);
    const unit = next.battle!.skillUnits?.[0];
    expect(unit).toMatchObject({ skillId, placedAt: 1000, nextTickAt: 4000, expiresAt: 181000,
      nextSpDrainAt: 11000, cells: expect.arrayContaining([tile(-3, -3), tile(3, 3)]) });
    expect(unit!.cells).toHaveLength(49);
    expect(next.sp).toBe(260);
    const attributes = derivedStats(s, c).attributes!;
    const expectedSlow = slowGraceValues(5, attributes.dex, attributes.agi, s.learnedSkills.dc_dancinglesson);
    for (const id of [first.id, 'inside-neighbor']) {
      const enemy = next.battle!.enemies!.find(entry => entry.id === id)!;
      expect(enemy.statuses?.SC_DONTFORGETME).toMatchObject({ startsAt: 1000, expiresAt: 21000,
        level: 5, groundId: unit!.id, skillId, sourceActorId: next.id, ...expectedSlow });
      expect(effectiveMonsterStatus(c.monsters[enemy.monsterId], enemy.statuses, 1000))
        .toMatchObject(expectedSlow);
    }
    expect(next.battle!.enemies!.find(entry => entry.id === 'outside-neighbor')!.statuses?.SC_DONTFORGETME).toBeUndefined();
    expect(next.events.some(event => event.kind === 'skill' && event.skillId === skillId && event.targetActorId === next.id)).toBe(true);
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === skillId)).toBe(false);
    expect(next.battle!.skillUnits).toHaveLength(1);
  });

  it('refreshes the 20-second status on field pulses and preserves the out-of-field grace', () => {
    const { c, s, first } = setup();
    const placed = advanceState(s, c, 1000);
    const tick = advanceState(placed, c, 4000);
    expect(tick.battle!.enemies![0].statuses?.SC_DONTFORGETME?.expiresAt).toBe(24000);
    const left = tick.battle!.enemies![0]; left.position = left.approachFrom = tile(4); left.startedAt = left.arrivedAt = 4000;
    const afterExit = advanceState(tick, c, 7000);
    expect(afterExit.battle!.enemies!.find(enemy => enemy.id === first.id)!.statuses?.SC_DONTFORGETME?.expiresAt)
      .toBe(27000);
  });

  it('stops the 180-second field and lets the last source status expire on its own 20-second timer', () => {
    const { c, s } = setup();
    const placed = advanceState(s, c, 1000);
    placed.rotation = [];
    const fieldEnded = advanceState(placed, c, 181000);
    expect(fieldEnded.battle!.skillUnits).toHaveLength(0);
    expect(fieldEnded.battle!.enemies![0].statuses?.SC_DONTFORGETME?.expiresAt).toBe(198000);
    const statusEnded = advanceState(fieldEnded, c, 198000);
    const enemy = statusEnded.battle!.enemies![0];
    const status = enemy.statuses?.SC_DONTFORGETME;
    expect(status).toBeDefined(); // Expired status records are lazily retained by the engine.
    expect(effectiveMonsterStatus(c.monsters[enemy.monsterId], enemy.statuses, 197999)).toMatchObject({
      attackDelayPct: status!.attackDelayPct,
      moveSlowPct: status!.moveSlowPct,
    });
    expect(effectiveMonsterStatus(c.monsters[enemy.monsterId], enemy.statuses, 198000)).toMatchObject({
      attackDelayPct: 0,
      moveSlowPct: 0,
    });
  });

  it('slows a roaming monster movement segment while the Hercules status is active', () => {
    const { c, s } = setup();
    const placed = advanceState(s, c, 1000);
    c.monsters[1002].canMove = true;
    const wanderingState = (debuffed: boolean) => {
      const field = structuredClone(placed);
      field.status = 'hunting'; field.areaId = c.areas[0].id;
      field.battle!.challengeId = undefined; field.battle!.skillUnits = [];
      const enemy = field.battle!.enemies![0];
      enemy.engaged = false; enemy.hostile = false; enemy.fieldSlot = 0;
      enemy.position = enemy.approachFrom = tile(0); enemy.startedAt = enemy.arrivedAt = 0;
      if (!debuffed) delete enemy.statuses?.SC_DONTFORGETME;
      field.fieldPopulation = { areaId: field.areaId!, generation: 1, enemies: [enemy], respawns: [] };
      return field;
    };
    const slowed = advanceState(wanderingState(true), c, 3000).fieldPopulation!.enemies[0];
    const normal = advanceState(wanderingState(false), c, 3000).fieldPopulation!.enemies[0];
    expect(slowed.arrivedAt - slowed.startedAt).toBeGreaterThan(normal.arrivedAt - normal.startedAt);
  });

  it('delays the next monster attack using the active Hercules ASPD penalty', () => {
    const { c, s } = setup();
    const placed = advanceState(s, c, 1000);
    const attackState = (debuffed: boolean) => {
      const state = structuredClone(placed);
      const enemy = state.battle!.enemies![0];
      if (!debuffed) {
        delete enemy.statuses?.SC_DONTFORGETME;
        state.battle!.skillUnits = [];
      }
      enemy.enemyNextAttackAt = 5000;
      state.battle!.enemyNextAttackAt = 5000;
      return state;
    };
    const slowed = advanceState(attackState(true), c, 5000).battle!.enemies![0];
    const normal = advanceState(attackState(false), c, 5000).battle!.enemies![0];
    expect(slowed.enemyNextAttackAt).toBeGreaterThan(normal.enemyNextAttackAt);
  });

  it('charges the periodic SP drain and ends cleanly when a later charge fails', () => {
    const { c, s } = setup();
    const placed = advanceState(s, c, 1000);
    const baseline = structuredClone(placed);
    baseline.battle!.skillUnits = [];
    baseline.rotation = [];
    for (const enemy of baseline.battle!.enemies!) delete enemy.statuses?.SC_DONTFORGETME;
    const withoutSong = advanceState(baseline, c, 11000);
    const drained = advanceState(placed, c, 11000);
    expect(drained.sp).toBe(withoutSong.sp - 1);
    expect(drained.battle!.skillUnits![0].nextSpDrainAt).toBe(21000);
    const exhausted = structuredClone(drained);
    exhausted.sp = 0;
    exhausted.battle!.skillUnits![0].nextSpDrainAt = 12000;
    const ended = advanceState(exhausted, c, 12000);
    expect(ended.battle!.skillUnits).toHaveLength(0);
    expect(ended.battle!.enemies![0].statuses?.SC_DONTFORGETME?.expiresAt).toBeGreaterThan(12000);
  });

  it('does not cast or spend SP with a weapon outside the source instrument/whip requirement', () => {
    const { c, s } = setup(1201);
    const before = s.sp;
    const next = advanceState(s, c, 1000);
    expect(next.battle!.skillUnits).toBeUndefined();
    expect(next.sp).toBe(before);
    expect(next.events.some(event => event.skillId === skillId)).toBe(false);
  });
});
