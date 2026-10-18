import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import { advanceState, applyCommand, createInitialState } from '../engine/index.js';
import { awardKill, beginBattle } from '../engine/encounters.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import type { Catalog, GameState } from '../shared/types.js';
import { fixture } from './engine-fixture.js';

const source = raw as unknown as Catalog;
const SKILL = 'am_cannibalize';
const SPECIES = [1589, 1579, 1575, 1555, 1590];
const DURATION = [300000, 240000, 180000, 120000, 60000];
const FAR = 9_999_999_999;

function setup(level = 1) {
  const c = fixture();
  c.classes.alchemist = structuredClone(source.classes.alchemist);
  c.skills[SKILL] = structuredClone(source.skills[SKILL]);
  c.classes.alchemist.skills.push(SKILL);
  c.items[7137] = structuredClone(source.items[7137]);
  const s = createInitialState(c, 0);
  s.job = 'alchemist';
  s.jobLevel = 50;
  s.status = 'challenge';
  s.areaId = 'prontera';
  s.sp = 28;
  s.rotation = [SKILL];
  s.learnedSkills = { [SKILL]: level, am_pharmacy: 6 };
  s.stats.int = 99;
  s.inventory = [{ uid: 'plant-bottles', itemId: 7137, quantity: 10, refine: 0, cards: [], favorite: false }];
  beginBattle(s, c, 1002, 0, 'mastering');
  const b = s.battle!;
  const enemy = b.enemies![0];
  enemy.hp = enemy.maxHp = 50_000;
  enemy.position = { x: BATTLE_HERO.x + 0.25, y: BATTLE_HERO.y };
  enemy.approachFrom = { ...enemy.position };
  enemy.arrivedAt = 0;
  enemy.hostile = false;
  enemy.enemyNextAttackAt = FAR;
  b.targetId = enemy.id;
  b.playerNextAttackAt = FAR;
  b.playerNextSkillAt = 0;
  b.playerActionReadyAt = 0;
  b.enemyNextAttackAt = FAR;
  return { s, c, enemy };
}

function advance(s: GameState, c: Catalog, at: number) {
  for (let i = 0; i < 100 && (s.lastSimulatedAt ?? 0) < at; i++)
    Object.assign(s, advanceState(s, c, at));
  if ((s.lastSimulatedAt ?? 0) < Math.floor(at / 250) * 250)
    throw new Error(`Combat timeline stopped before ${at}ms`);
}

function summons(s: GameState): any[] {
  return ((s.battle as any)?.cannibalizeSummons ?? []) as any[];
}

describe('AM_CANNIBALIZE encounter-bound AI_FLORA', () => {
  it('exports the skill as supported after its encounter implementation', () => {
    expect(source.skills[SKILL].implementation).toBe('supported');
    expect(source.skills[SKILL].unsupportedReason).toBeUndefined();
  });

  it.each(SPECIES.map((monsterId, index) => [index + 1, monsterId, DURATION[index]] as const))(
    'uses Hercules level %i species, duration, and costs', (level, monsterId, durationMs) => {
      const { s, c } = setup(level);
      advance(s, c, 2000);
      expect(summons(s)).toHaveLength(1);
      expect(summons(s)[0]).toMatchObject({ monsterId, expiresAt: summons(s)[0].spawnedAt + durationMs });
      expect(s.sp).toBe(8);
      expect(s.inventory.find(entry => entry.itemId === 7137)?.quantity).toBe(9);
    },
  );

  it('attacks the battle target on the source attack clock without joining rewards', () => {
    const { s, c, enemy } = setup(1);
    const enemyId = enemy.id;
    advance(s, c, 2000);
    s.rotation = [];
    const summon = summons(s)[0];
    const before = s.battle!.enemies!.find(entry => entry.id === enemyId)!.hp;
    advance(s, c, Math.ceil(summon.nextAttackAt / 250) * 250);
    const after = s.battle!.enemies!.find(entry => entry.id === enemyId)!.hp;
    expect(after).toBeLessThan(before);
    expect(s.events.some(event => event.kind === 'damage' && event.sourceActorId === summon.id)).toBe(true);
    expect(s.battle!.enemies).toHaveLength(1);
  });

  it('lets Geographer heal the owner below the Hercules 90 percent threshold', () => {
    const { s, c } = setup(5);
    s.hp = 10;
    advance(s, c, 8_000);
    expect(s.hp).toBeGreaterThan(10);
    expect(s.hp).toBeLessThanOrEqual(100);
  });

  it('expires the helper with its source duration', () => {
    const { s, c } = setup(5);
    advance(s, c, 2000);
    s.rotation = [];
    const expiresAt = summons(s)[0].expiresAt;
    advance(s, c, Math.ceil(expiresAt / 250) * 250);
    expect(summons(s)).toHaveLength(0);
  });

  it('shifts summon clocks across offline pause and discards them with the killed encounter', () => {
    const { s, c, enemy } = setup(1);
    advance(s, c, 2000);
    const priorExpiry = summons(s)[0].expiresAt;
    s.status = 'paused';
    s.pausedAt = 2000;
    s.lastSimulatedAt = 2000;
    s.job = 'novice';
    Object.assign(s, applyCommand(s, c, { type: 'setGender', gender: 'female' }, 12_000));
    s.job = 'alchemist';
    expect(summons(s)[0].expiresAt).toBe(priorExpiry + 10_000);
    awardKill(s, c, enemy, 12_001);
    expect(s.battle).toBeNull();
    expect((s as any).cannibalizeSummons).toBeUndefined();
    expect(s.inventory.filter(entry => entry.itemId === 909).reduce((sum, entry) => sum + entry.quantity, 0)).toBe(1);
  });
});
