import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../shared/types.js';
import rawCatalog from '../content/catalog.json';
import { advanceState } from '../engine/index.js';
import { activeFreeCastLevel, derivedStats, learnedFreeCastLevel } from '../engine/stats.js';
import { beginBattle, playerWalkSpeed } from '../engine/encounters.js';
import { cancelActorCast } from '../engine/castControl.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import { castSetup } from './cast-control-fixture.js';

const sourceCatalog = rawCatalog as unknown as Catalog;

function setupFreeCast(level = 1) {
  const { s, c, e } = castSetup();
  const freeCast = Object.values(sourceCatalog.skills).find(skill => skill.sourceName === 'SA_FREECAST')!;
  c.skills[freeCast.id] = structuredClone(freeCast);
  c.skills[freeCast.id].implementation = 'supported';
  if (!c.classes.sage.skills.includes(freeCast.id)) c.classes.sage.skills.push(freeCast.id);
  s.learnedSkills[freeCast.id] = level;
  return { s, c, e, freeCast };
}

function setPlayerCast(s: ReturnType<typeof setupFreeCast>['s'], targetId: string, endsAt = 1000) {
  s.battle!.cast = {
    skillId: 'fire_bolt', level: 1, targetId, startedAt: 0, endsAt,
    actionId: 'freecast-anchor', position: { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y },
    afterCastDelayMs: 0,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('SA_FREECAST persisted combat integration', () => {
  it.each([[1, 217], [10, 150]])('composes level %i walk rate with Increase Agility before integer division', (level, expected) => {
    const { s, c, e } = setupFreeCast(level);
    const agility = Object.values(sourceCatalog.skills).find(skill => skill.sourceName === 'AL_INCAGI')!;
    c.skills[agility.id] = structuredClone(agility);
    s.buffs[agility.id] = { startsAt: 0, expiresAt: 10000, effects: {} };
    setPlayerCast(s, e.id);
    expect(playerWalkSpeed(s, c, 100)).toBe(expected);
    expect(playerWalkSpeed(s, c, 5000)).toBe(112);
  });
  it('does not apply unsupported learned Free Cast to attack timing or movement', () => {
    const { s, c, e, freeCast } = setupFreeCast(1);
    c.classes.sage.weaponAspd!.unarmed = 101;
    c.skills[freeCast.id].implementation = 'unsupported';
    s.equipment = {};
    s.stats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
    s.lastSimulatedAt = 100;
    setPlayerCast(s, e.id);

    expect(learnedFreeCastLevel(s, c)).toBe(0);
    expect(activeFreeCastLevel(s, c, 100)).toBe(0);
    expect(derivedStats(s, c)).toMatchObject({ attackMotionMs: 101, attackIntervalMs: 202 });
    expect(playerWalkSpeed(s, c, 100)).toBe(150);
  });

  it('ignores persisted Free Cast when the current class skill tree does not contain it', () => {
    const { s, c, e, freeCast } = setupFreeCast(1);
    c.classes.sage.skills = c.classes.sage.skills.filter(id => id !== freeCast.id);
    setPlayerCast(s, e.id);

    expect(learnedFreeCastLevel(s, c)).toBe(0);
    expect(activeFreeCastLevel(s, c, 100)).toBe(0);
    expect(playerWalkSpeed(s, c, 100)).toBe(150);
  });

  it.each([0, -1, 1.5, 11])('ignores invalid persisted Free Cast level %s', level => {
    const { s, c, e, freeCast } = setupFreeCast(level);
    setPlayerCast(s, e.id);

    expect(learnedFreeCastLevel(s, c)).toBe(0);
    expect(activeFreeCastLevel(s, c, 100)).toBe(0);
  });

  it.each([[1, 146, 292], [10, 101, 202]])(
    'uses source amotion then doubled adelay for level %i and odd base motion',
    (level, expectedMotion, expectedDelay) => {
      const { s, c, freeCast } = setupFreeCast(level);
      c.classes.sage.weaponAspd!.unarmed = 101;
      s.equipment = {};
      s.stats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
      s.lastSimulatedAt = 100;
      setPlayerCast(s, s.battle!.enemies![0].id);

      expect(derivedStats(s, c).attackMotionMs).toBe(expectedMotion);
      expect(derivedStats(s, c).attackIntervalMs).toBe(expectedDelay);

      s.lastSimulatedAt = 1000;
      expect(derivedStats(s, c).attackMotionMs).toBe(101);
      expect(derivedStats(s, c).attackIntervalMs).toBe(202);
      expect(c.skills[freeCast.id].sourceName).toBe('SA_FREECAST');
    },
  );

  it('applies the source per-class minimum amotion after odd ASPD and Free Cast stages', () => {
    const { s, c, e } = setupFreeCast(1);
    c.classes.sage.weaponAspd!.unarmed = 101;
    c.classes.sage.minimumAttackMotionMs = 135;
    s.equipment = {};
    s.stats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
    s.buffs['odd-aspd-stage'] = { expiresAt: 500, effects: { aspd: 10 } };
    s.lastSimulatedAt = 100;
    setPlayerCast(s, e.id);

    expect(derivedStats(s, c)).toMatchObject({ attackMotionMs: 135, attackIntervalMs: 270 });
  });

  it('uses ordinary attack timing outside a cast and throughout inactive cast boundaries', () => {
    const { s, c, e } = setupFreeCast(1);
    c.classes.sage.weaponAspd!.unarmed = 101;
    s.equipment = {};
    s.stats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
    s.lastSimulatedAt = 0;

    expect(derivedStats(s, c)).toMatchObject({ attackMotionMs: 101, attackIntervalMs: 202 });
    setPlayerCast(s, e.id, 1000);
    s.lastSimulatedAt = 1000;
    expect(derivedStats(s, c)).toMatchObject({ attackMotionMs: 101, attackIntervalMs: 202 });
  });

  it.each([[1, 255], [10, 187]])('composes Free Cast level %i into cell time as speed_rate %i', (level, cellTime) => {
    const { s, c, e } = setupFreeCast(level);
    s.equipment = {};
    s.lastSimulatedAt = 0;
    expect(playerWalkSpeed(s, c, 0)).toBe(150);
    setPlayerCast(s, e.id);
    expect(playerWalkSpeed(s, c, 0)).toBe(cellTime);
  });

  it('continues field movement toward the cast target while keeping the cast anchor unchanged', () => {
    const { s, c, e } = setupFreeCast(1);
    s.equipment = {};
    s.status = 'hunting';
    s.areaId = 'prontera';
    beginBattle(s, c, 1175, 0);
    const fieldTarget = s.battle!.enemies!.find(enemy => enemy.id === s.battle!.targetId)!;
    fieldTarget.position = { x: BATTLE_HERO.x + 6 / 12, y: BATTLE_HERO.y };
    fieldTarget.approachFrom = { ...fieldTarget.position };
    fieldTarget.arrivedAt = 0;
    fieldTarget.engaged = false;
    fieldTarget.hostile = false;
    s.battle!.playerNextAttackAt = 999999;
    s.battle!.playerNextSkillAt = 999999;
    s.battle!.playerActionReadyAt = 999999;
    setPlayerCast(s, fieldTarget.id, 5000);
    const originalCast = structuredClone(s.battle!.cast);

    const moved = advanceState(s, c, 1);

    expect(moved.fieldHero?.phase).toBe('chasing');
    expect(moved.fieldHero?.arrivedAt).toBeGreaterThan(1);
    expect(moved.battle?.cast).toEqual(originalCast);
    expect(moved.battle?.targetId).toBe(fieldTarget.id);
  });

  it('allows basic attacks during the original cast without starting or charging another cast', () => {
    const { s, c, e } = setupFreeCast(1);
    s.equipment = {};
    c.skills.fire_bolt.castTimeMs = [1000];
    c.skills.fire_bolt.spCost = [25];
    c.skills.fire_bolt.afterCastDelayMs = [0];
    c.skills.fire_bolt.implementation = 'supported';
    delete e.npcCombat;
    s.rotation = ['fire_bolt'];
    s.battle!.playerNextAttackAt = 100;
    s.battle!.playerNextSkillAt = 0;
    s.battle!.playerActionReadyAt = 0;
    const started = advanceState(s, c, 500);
    const castAtHalf = started.battle!.cast;

    expect(castAtHalf).toMatchObject({ skillId: 'fire_bolt', targetId: e.id, startedAt: 0, endsAt: 1000 });
    expect(started.sp).toBe(100);
    expect(started.events.filter(event => event.kind === 'cast' && event.skillId === 'fire_bolt')).toHaveLength(1);
    expect(started.events.filter(event => event.kind === 'damage' && event.actorAction === 'attack')).toHaveLength(1);
    expect(castAtHalf).toMatchObject({
      targetId: e.id, startedAt: 0, endsAt: 1000,
      position: { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y },
    });
    const castActionId = castAtHalf!.actionId;
    expect(castActionId).toBeTruthy();

    const beforeEnd = advanceState(JSON.parse(JSON.stringify(started)), c, 999);
    expect(beforeEnd.battle!.cast?.actionId).toBe(castActionId); expect(beforeEnd.sp).toBe(100);
    expect(beforeEnd.events.filter(event => event.kind === 'cast' && event.skillId === 'fire_bolt')).toHaveLength(1);
    const completed = advanceState(beforeEnd, c, 1000);
    // Native zero postdelay permits the next cast exactly at completion. FreeCast
    // never started a second cast while the original was still active.
    expect(completed.battle!.cast).toMatchObject({ skillId: 'fire_bolt', startedAt: 1000, endsAt: 2000 });
    expect(completed.battle!.cast!.actionId).not.toBe(castActionId);
    expect(completed.sp).toBe(75);
    expect(completed.events.filter(event => event.kind === 'cast' && event.skillId === 'fire_bolt'))
      .toMatchObject([{ actionId: castActionId }, { at: 1000 }]);
    expect(completed.events.filter(event => event.kind === 'skill' && event.skillId === 'fire_bolt'))
      .toMatchObject([{ actionId: castActionId }]);
  });

  it('does not retarget basic attacks when the original cast target dies before expiry', () => {
    const { s, c, e } = setupFreeCast(1);
    const nextTarget = { ...structuredClone(e), id: 'other-live-target', hp: 1234 };
    s.battle!.enemies!.push(nextTarget);
    s.battle!.targetId = nextTarget.id;
    e.hp = 0;
    s.battle!.playerNextAttackAt = 100;
    s.battle!.playerNextSkillAt = 0;
    setPlayerCast(s, e.id, 500);

    const ended = advanceState(s, c, 500);

    expect(ended.battle!.cast).toBeUndefined();
    expect(ended.events.filter(event => event.kind === 'cast-failed' && event.skillId === 'fire_bolt')).toHaveLength(1);
    expect(ended.sp).toBe(100);
    expect(ended.events.filter(event => event.kind === 'damage' && event.actorAction === 'attack' &&
      event.sourceActorId === s.id)).toHaveLength(0);
    expect(ended.events.filter(event => event.kind === 'cast' && event.enemyId === nextTarget.id)).toHaveLength(0);
  }, 1000);

  it('restores ordinary motion and walk rate immediately when the cast is canceled', () => {
    const { s, c, e } = setupFreeCast(1);
    s.equipment = {};
    setPlayerCast(s, e.id);
    s.lastSimulatedAt = 250;
    expect(playerWalkSpeed(s, c, 250)).toBe(255);
    const ordinary = derivedStats({ ...s, battle: { ...s.battle!, cast: undefined } }, c);

    cancelActorCast(s, c, { kind: 'player', actorId: s.id }, 250, 'manual');

    expect(s.battle!.cast).toBeUndefined();
    expect(playerWalkSpeed(s, c, 250)).toBe(150);
    expect(derivedStats(s, c)).toMatchObject({ attackMotionMs: ordinary.attackMotionMs,
      attackIntervalMs: ordinary.attackIntervalMs });
  });
});
