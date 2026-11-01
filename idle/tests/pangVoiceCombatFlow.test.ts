import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import * as stateTools from '../engine/state.js';

const source = rawCatalog as unknown as Catalog;
const skillId = 'ba_pangvoice';
function setup(boss = false, mode: 'challenge' | 'hunting' = 'hunting') {
  vi.spyOn(stateTools, 'random').mockReturnValue(.01);
  const c = structuredClone(source);
  Object.assign(c.skills[skillId], { implementation: 'supported', statusEffect: 'SC_CONFUSION',
    statusChance: [50], statusDurationMs: [17000] });
  delete c.skills[skillId].unsupportedReason;
  Object.assign(c.monsters[1002], { boss, level: 1, hp: 100000, attack: [1, 1], attackRange: 1,
    attackDelay: 1000, baseExp: 0, jobExp: 0, canMove: true,
    stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 } });
  const s = createInitialState(c, 0);
  s.job = 'bard'; s.baseLevel = 50; s.jobLevel = 50;
  s.status = mode; s.areaId = c.areas[0].id;
  s.rotation = [skillId]; s.learnedSkills[skillId] = 1;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  beginBattle(s, c, 1002, 0, mode === 'challenge' ? 'mastering' : undefined);
  const enemy = s.battle!.enemies![0];
  enemy.hp = enemy.maxHp = 100000;
  enemy.approachFrom = enemy.position = { x: BATTLE_HERO.x + .25, y: BATTLE_HERO.y };
  enemy.startedAt = enemy.arrivedAt = 0;
  enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 1000;
  s.battle!.playerActionReadyAt = 0;
  s.sp = 1000;
  return { c, s, enemy };
}
afterEach(() => vi.restoreAllMocks());

describe('BA_PANGVOICE solo combat flow', () => {
  it('casts without damage, applies source Confusion, and releases the monster until status expiry', () => {
    const { c, s, enemy } = setup();
    const next = advanceState(s, c, 4000);
    const confused = next.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    const cast = next.events.find(event => event.kind === 'skill' && event.skillId === skillId)!;
    expect(cast).toBeDefined();
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === skillId)).toBe(false);
    expect(confused.statuses?.SC_CONFUSION).toMatchObject({ level: 1, startsAt: cast.at,
      expiresAt: cast.at! + 17000, skillId, sourceActorId: s.id });
    expect(confused.npcCombat?.targetReleasedAt).toBe(cast.at);
    expect(confused.npcCombat?.nextTargetCheckAt).toBe(cast.at! + 17000);
  });

  it('does not confuse bosses even when the status chance roll succeeds', () => {
    const { c, s, enemy } = setup(true);
    const next = advanceState(s, c, 4000);
    expect(next.battle!.enemies!.find(entry => entry.id === enemy.id)!.statuses?.SC_CONFUSION).toBeUndefined();
  });

  it('keeps Pang Voice scoped to solo hunting instead of applying an incomplete status in challenges', () => {
    const { c, s, enemy } = setup(false, 'challenge');
    const next = advanceState(s, c, 4000);
    const challenged = next.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    expect(challenged.statuses?.SC_CONFUSION).toBeUndefined();
    expect(next.events.some(event => event.kind === 'skill' && event.skillId === skillId)).toBe(false);
  });

  it('keeps the hero in range of an eligible Pang Voice target instead of chasing a farther selected mob', () => {
    const { c, s, enemy } = setup(false, 'hunting');
    const farPoint = { x: BATTLE_HERO.x + 1.2, y: BATTLE_HERO.y };
    Object.assign(enemy, { approachFrom: farPoint, position: farPoint, startedAt: 0, arrivedAt: 0,
      enemyNextAttackAt: Number.MAX_SAFE_INTEGER });
    const nearby = { ...structuredClone(enemy), id: 'nearby-pang-target', fieldSlot: 1,
      approachFrom: { x: BATTLE_HERO.x + 0.6, y: BATTLE_HERO.y },
      position: { x: BATTLE_HERO.x + 0.6, y: BATTLE_HERO.y }, startedAt: 0, arrivedAt: 0 };
    s.battle!.enemies!.push(nearby);
    s.battle!.targetId = enemy.id;
    s.battle!.playerNextSkillAt = 0;
    s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
    s.battle!.playerActionReadyAt = Number.MAX_SAFE_INTEGER;

    const next = advanceState(s, c, 250);
    expect(next.fieldHero?.phase).toBe('fighting');
  });

  it('makes a confused field monster wander and prevents its attacks until the status expires', () => {
    const { c, s, enemy } = setup(false, 'hunting');
    const startingPoint = { ...enemy.position };
    const next = advanceState(s, c, 3000);
    const wandering = next.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    const confusion = wandering.statuses?.SC_CONFUSION!;
    expect(confusion).toBeDefined();
    expect(wandering.position).not.toEqual(startingPoint);
    expect(wandering.arrivedAt).toBeGreaterThan(confusion.startsAt!);
    expect(Math.abs(Math.floor(wandering.position.x * BATTLE_CELLS_PER_UNIT) -
      Math.floor(wandering.approachFrom!.x * BATTLE_CELLS_PER_UNIT))).toBeLessThanOrEqual(7);
    expect(Math.abs(Math.floor(wandering.position.y * BATTLE_CELLS_PER_UNIT) -
      Math.floor(wandering.approachFrom!.y * BATTLE_CELLS_PER_UNIT))).toBeLessThanOrEqual(7);
    expect(wandering.npcCombat?.nextTargetCheckAt).toBe(confusion.expiresAt);
    expect(next.events.some(event => event.kind === 'damage' && event.targetActorId === next.id &&
      event.at! >= confusion.startsAt!)).toBe(false);
  });

  it('ends Confusion on its source deadline and emits a single status-end event', () => {
    const { c, s, enemy } = setup(false, 'hunting');
    const active = advanceState(s, c, 3000);
    const confused = active.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    const deadline = confused.statuses!.SC_CONFUSION!.expiresAt;
    active.rotation = [];
    // The authoritative simulation advances in 250 ms ticks; include the first tick past expiry.
    const ended = advanceState(active, c, deadline + 250);
    const recovered = ended.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    expect(recovered.statuses?.SC_CONFUSION).toBeUndefined();
    expect(ended.events.filter(event => event.kind === 'status-end' && event.statusName === 'SC_CONFUSION' &&
      event.enemyId === enemy.id)).toHaveLength(1);
  });
});
