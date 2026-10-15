import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { BattleEnemy, Catalog, GameCommand, GameState } from '../shared/types.js';
import { BATTLE_HERO, battleHeroAt } from '../shared/battleSpatial.js';
import { advanceState, applyCommand, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { clearStaleSenseInspection, senseInspectionEnemy, senseManualSpCost, senseManualTarget, validSenseInspection } from '../engine/senseInspection.js';
import { parseCommandRequest } from '../server/validation.js';

const raw = rawCatalog as unknown as Catalog;
const skillId = 'sense';
const at = 1000;

function candidateCatalog(): Catalog {
  const catalog = structuredClone(raw);
  // Sense's catalog promotion is owned by the exporter task. This local unit fixture
  // supplies only the agreed gate fields until that independent task promotes the row.
  const skill = catalog.skills[skillId];
  if (skill.implementation !== 'supported') skill.implementation = 'supported';
  skill.manualUse = 'inspect';
  skill.kind = 'buff';
  skill.spCost = [10];
  skill.range = [9];
  skill.targetType = 'enemy';
  return catalog;
}

function setup() {
  const catalog = candidateCatalog();
  const state = createInitialState(catalog, at, 'sense-command-test');
  state.id = 'sense-command-test';
  state.job = 'wizard';
  state.jobLevel = 50;
  state.skillPoints = 1;
  Object.assign(state, applyCommand(state, catalog, { type: 'learnSkill', skillId }, at));
  state.status = 'hunting';
  state.areaId = 'prontera_south';
  beginBattle(state, catalog, 1002, at);
  const enemy = state.battle!.enemies!.find(row => row.id === state.battle!.targetId)!;
  const hero = { ...BATTLE_HERO };
  state.fieldHero = { areaId: state.areaId, from: hero, position: hero, startedAt: at, arrivedAt: at,
    routeIndex: 0, phase: 'fighting', targetId: enemy.id };
  for (const row of state.battle!.enemies!) {
    row.hostile = false;
    row.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  }
  enemy.position = { ...hero };
  enemy.approachFrom = { ...hero };
  enemy.startedAt = at;
  enemy.arrivedAt = at;
  state.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  state.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
  state.battle!.playerActionReadyAt = Number.MAX_SAFE_INTEGER;
  state.sp = 20;
  return { catalog, state, enemy };
}

const senseCommand = (enemyId?: string): GameCommand => ({ type: 'useSkill', skillId, expectedEnemyId: enemyId });
const useSense = (state: GameState, catalog: Catalog, enemyId?: string, time = at) =>
  applyCommand(state, catalog, senseCommand(enemyId), time);

function putAtDistance(state: GameState, enemy: BattleEnemy, distance: number, time = at) {
  const hero = battleHeroAt(state, time);
  enemy.position = { x: hero.x + distance / 12, y: hero.y };
  enemy.approachFrom = { ...enemy.position };
  enemy.startedAt = time;
  enemy.arrivedAt = time;
}

describe('manual WZ_ESTIMATION command', () => {
  it('inspects the exact selected live actor at range nine, pays once, and changes no combat outcomes', () => {
    const { catalog, state, enemy } = setup();
    putAtDistance(state, enemy, 9);
    const before = structuredClone(state);
    const result = useSense(state, catalog, enemy.id);

    expect(result.sp).toBe(before.sp - 10);
    expect(result.senseInspection).toMatchObject({
      sourceSkill: 'WZ_ESTIMATION', actorId: enemy.id, monsterId: enemy.monsterId,
      areaId: state.areaId, fieldGeneration: state.fieldPopulation?.generation,
      observedAt: at, currentHp: enemy.hp,
    });
    expect(result.rngState).toBe(before.rngState);
    expect(result.battle?.enemies?.map(row => row.hp)).toEqual(before.battle?.enemies?.map(row => row.hp));
    expect(result.battle?.enemies?.map(row => row.statuses)).toEqual(before.battle?.enemies?.map(row => row.statuses));
    expect(result.totals).toEqual(before.totals);
    expect(result.inventory).toEqual(before.inventory);
    expect(result.events.slice(before.events.length)).toHaveLength(1);
    expect(result.events.at(-1)).toMatchObject({ kind: 'skill', skillId, sourceActorId: result.id,
      targetActorId: enemy.id, actorAction: 'none' });
    expect(result.events.slice(before.events.length).some(event => event.kind === 'damage')).toBe(false);
    expect(() => applyCommand(result, catalog, { type: 'setRotation', skillIds: [skillId] }, at)).toThrow();
  });

  it('uses the source distance floor for range and accepts the exact selected ID only', () => {
    const { catalog, state, enemy } = setup();
    putAtDistance(state, enemy, 10);
    expect(useSense(state, catalog, enemy.id).senseInspection?.actorId).toBe(enemy.id);

    const belowSourceBoundary = setup();
    putAtDistance(belowSourceBoundary.state, belowSourceBoundary.enemy, 10.06);
    expect(useSense(belowSourceBoundary.state, belowSourceBoundary.catalog, belowSourceBoundary.enemy.id)
      .senseInspection?.actorId).toBe(belowSourceBoundary.enemy.id);

    const aboveSourceBoundary = setup();
    putAtDistance(aboveSourceBoundary.state, aboveSourceBoundary.enemy, 10.063);
    expect(() => useSense(aboveSourceBoundary.state, aboveSourceBoundary.catalog, aboveSourceBoundary.enemy.id)).toThrow();
    expect(aboveSourceBoundary.state.sp).toBe(20);


    const replacement = structuredClone(enemy);
    replacement.id = `${enemy.id}-replacement`;
    state.battle!.enemies = [enemy, replacement];
    state.fieldPopulation!.enemies = [enemy, replacement];
    state.battle!.targetId = replacement.id;
    putAtDistance(state, replacement, 1);
    expect(() => useSense(state, catalog, enemy.id)).toThrow();
    expect(state.sp).toBe(20);
    expect(state.senseInspection).toBeUndefined();
  });

  it('rejects absent, dead, wrong-area, Emperium, unsupported, unlearned, wrong-class, and invalid-level uses before SP', () => {
    const cases: Array<[string, (x: ReturnType<typeof setup>) => void, string?]> = [
      ['wrong actor token', () => {}, ''],
      ['dead actor', ({ enemy }) => { enemy.hp = 0; }],
      ['wrong area', ({ state }) => { state.areaId = 'payon_cave'; }],
      ['unsupported row', ({ catalog }) => { catalog.skills[skillId].implementation = 'unsupported'; }],
      ['unlearned', ({ state }) => { delete state.learnedSkills[skillId]; }],
      ['wrong class', ({ state }) => { state.job = 'novice'; }],
      ['invalid level', ({ state }) => { state.learnedSkills[skillId] = 2; }],
      ['silenced', ({ state }) => { state.playerStatuses = { SC_SILENCE: { startsAt: at, expiresAt: at + 1000, level: 1 } }; }],
      ['active cast', ({ state, enemy }) => {
        state.battle!.cast = { skillId: 'firebolt', level: 1, targetId: enemy.id, startedAt: at, endsAt: at + 1000 };
      }],
      ['Steel Body', ({ catalog, state }) => {
        const buff = Object.values(catalog.skills).find(row => row.sourceName === 'MO_STEELBODY')!;
        state.buffs[buff.id] = { expiresAt: at + 1000, effects: {} };
      }],
      ['overweight', ({ catalog, state }) => {
        catalog.items[501].weight = 5000;
        state.inventory = [{ uid: 'heavy', itemId: 501, quantity: 1, refine: 0, cards: [], favorite: false }];
      }],
    ];
    const emperiumId = 999999;
    cases.push(['Emperium', ({ catalog, enemy }) => {
      catalog.monsters[emperiumId] = { ...structuredClone(catalog.monsters[1002]), id: emperiumId, aegisName: 'Emperium' };
      enemy.monsterId = emperiumId;
    }]);

    for (const [label, mutate, targetId] of cases) {
      const fixture = setup();
      mutate(fixture);
      expect(() => useSense(fixture.state, fixture.catalog, targetId ?? fixture.enemy.id), label).toThrow();
      expect(fixture.state.sp, label).toBe(20);
      expect(fixture.state.senseInspection, label).toBeUndefined();
    }
    const missing = setup();
    expect(() => useSense(missing.state, missing.catalog), 'expectedEnemyId is mandatory').toThrow();
    expect(missing.state.sp).toBe(20);
  });

  it('rejects nine SP without charging, RNG, or changing the inspection snapshot', () => {
    const { catalog, state, enemy } = setup();
    state.sp = 9;
    const before = structuredClone(state);
    expect(() => useSense(state, catalog, enemy.id)).toThrow();
    expect(state.sp).toBe(before.sp);
    expect(state.rngState).toBe(before.rngState);
    expect(state.senseInspection).toBeUndefined();
  });

  it('uses the read-only modified SP cost and charges the same amount once', () => {
    const { catalog, state, enemy } = setup();
    state.buffs.testSpDiscount = { expiresAt: at + 5000, effects: { spCostReductionPct: 50 } };
    state.sp = 5;
    expect(senseManualSpCost(state, catalog, at)).toBe(5);
    expect(useSense(state, catalog, enemy.id).sp).toBe(0);
  });

  it('keeps a one-time snapshot while live values change and clears it when the actor or population changes', () => {
    const { catalog, state, enemy } = setup();
    const first = useSense(state, catalog, enemy.id);
    const captured = structuredClone(first.senseInspection);
    first.battle!.enemies!.find(row => row.id === enemy.id)!.hp -= 7;
    Object.assign(first, advanceState(first, catalog, at + 1));
    expect(validSenseInspection(first)).toEqual(captured);
    expect(senseInspectionEnemy(first)?.id).toBe(enemy.id);

    const replacedPopulation = structuredClone(first);
    replacedPopulation.fieldPopulation!.generation++;
    expect(validSenseInspection(replacedPopulation)).toBeUndefined();
    clearStaleSenseInspection(replacedPopulation);
    expect(replacedPopulation.senseInspection).toBeUndefined();

    const paused = structuredClone(first);
    paused.status = 'paused';
    paused.pausedStatus = 'hunting';
    expect(validSenseInspection(paused)).toEqual(captured);

    const warped = structuredClone(first);
    warped.areaId = 'payon_cave';
    expect(validSenseInspection(warped)).toBeUndefined();

    const endedChallenge = structuredClone(first);
    endedChallenge.battle!.challengeId = 'different-challenge';
    expect(validSenseInspection(endedChallenge)).toBeUndefined();

    first.fieldPopulation!.generation++;
    clearStaleSenseInspection(first);
    expect(first.senseInspection).toBeUndefined();

    const second = useSense(first, catalog, enemy.id, at + 3);
    expect(second.senseInspection).toBeDefined();
    second.fieldPopulation!.enemies = second.fieldPopulation!.enemies.map(row =>
      row.id === enemy.id ? { ...row, hp: row.hp } : row);
    second.battle!.enemies!.find(row => row.id === enemy.id)!.hp = 0;
    expect(validSenseInspection(second)).toBeUndefined();
    const afterDeath = advanceState(second, catalog, at + 4);
    expect(afterDeath.senseInspection).toBeUndefined();
  });
});

describe('Sense command request validation', () => {
  it('accepts a token-shaped expected actor ID and rejects malformed IDs', () => {
    expect(parseCommandRequest({ requestId: 'sense-use-0001', command: {
      type: 'useSkill', skillId, expectedEnemyId: 'field-prontera_south-1-0',
    } }).command).toMatchObject({ type: 'useSkill', skillId, expectedEnemyId: 'field-prontera_south-1-0' });
    expect(() => parseCommandRequest({ requestId: 'sense-use-0002', command: {
      type: 'useSkill', skillId, expectedEnemyId: 'same species / wrong actor',
    } })).toThrow();
  });
});
