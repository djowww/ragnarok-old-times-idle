import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { automaticSkillRotation, skillRotationForArea } from '../shared/skillRotation';
import { advanceState, applyCommand, createInitialState } from '../engine';
import { beginBattle } from '../engine/encounters';
import { derivedStats } from '../engine/stats';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { fixture } from './engine-fixture';

const source = rawCatalog as unknown as Catalog;

function combatSetup() {
  const catalog = fixture();
  catalog.source = structuredClone(source.source);
  for (const id of ['fire_bolt', 'cold_bolt']) catalog.skills[id] = structuredClone(source.skills[id]);
  catalog.classes.mage = {
    ...structuredClone(source.classes.mage), hp: Array(99).fill(1000), sp: Array(99).fill(100), jobBonuses: {},
  };
  Object.assign(catalog.monsters[1002], {
    hp: 2000, attack: [0, 0], baseExp: 0, jobExp: 0,
    stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 }, def: 0, mdef: 0, canMove: false, drops: [],
  });
  const state = createInitialState(catalog, 0);
  state.job = 'mage'; state.jobLevel = 10; state.skillPoints = 0;
  state.learnedSkills = { fire_bolt: 1, cold_bolt: 1 };
  state.rotation = ['fire_bolt'];
  const areaId = catalog.areas[0].id;
  state.status = 'hunting'; state.areaId = areaId;
  state.rotationByArea = { [areaId]: ['cold_bolt'] };
  state.hp = derivedStats(state, catalog).maxHp; state.sp = 1000;
  state.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  beginBattle(state, catalog, 1002, 0, 'mastering');
  const enemy = state.battle!.enemies![0];
  const position = { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y };
  Object.assign(enemy, { hp: 2000, maxHp: 2000, position, approachFrom: { ...position }, homePosition: { ...position },
    startedAt: 0, arrivedAt: 0, enemyNextAttackAt: 999999, hostile: false });
  state.battle!.targetId = enemy.id;
  state.battle!.playerNextAttackAt = 999999;
  state.battle!.playerNextSkillAt = state.battle!.playerActionReadyAt = 1000;
  return { catalog, state, areaId };
}

describe('automatic skill rotation by area', () => {
  it('uses an area profile and otherwise falls back to the global rotation', () => {
    const state = createInitialState(fixture(), 0) as GameState;
    state.rotation = ['firstaid'];
    state.rotationByArea = { pay_fild01: ['fire_bolt'], pay_fild02: [] };

    expect(skillRotationForArea(state, 'pay_fild01')).toEqual(['fire_bolt']);
    expect(skillRotationForArea(state, 'pay_fild02')).toEqual([]);
    expect(skillRotationForArea(state, 'prt_fild08')).toEqual(['firstaid']);
    expect(automaticSkillRotation({ ...state, status: 'hunting', areaId: 'pay_fild01' })).toEqual(['fire_bolt']);
    expect(automaticSkillRotation({ ...state, status: 'challenge', areaId: 'pay_fild01' })).toEqual(['firstaid']);
  });

  it('saves an area rotation without changing the global profile and rejects unknown maps', () => {
    const catalog = fixture();
    catalog.source = structuredClone(source.source);
    for (const id of ['fire_bolt', 'cold_bolt']) catalog.skills[id] = structuredClone(source.skills[id]);
    catalog.classes.mage = { ...structuredClone(source.classes.mage), hp: Array(99).fill(1000), sp: Array(99).fill(100), jobBonuses: {} };
    const state = createInitialState(catalog, 0);
    state.job = 'mage'; state.learnedSkills = { fire_bolt: 1, cold_bolt: 1 };
    state.rotation = ['fire_bolt'];
    const areaId = catalog.areas[0].id;
    const next = applyCommand(state, catalog, { type: 'setRotation', areaId, skillIds: ['cold_bolt'] }, 0);

    expect(next.rotation).toEqual(['fire_bolt']);
    expect(next.rotationByArea?.[areaId]).toEqual(['cold_bolt']);
    expect(JSON.parse(JSON.stringify(next)).rotationByArea[areaId]).toEqual(['cold_bolt']);
    expect(() => applyCommand(state, catalog, { type: 'setRotation', areaId: 'unknown_map', skillIds: [] }, 0)).toThrow();
  });

  it('updates the global rotation without rewriting existing map profiles', () => {
    const { catalog, state, areaId } = combatSetup();
    const next = applyCommand(state, catalog, {
      type: 'setRotation', skillIds: ['fire_bolt', 'cold_bolt'],
    }, 1);

    expect(next.rotation).toEqual(['fire_bolt', 'cold_bolt']);
    expect(next.rotationByArea?.[areaId]).toEqual(['cold_bolt']);
    expect(skillRotationForArea(next, catalog.areas[1].id)).toEqual(['fire_bolt', 'cold_bolt']);
  });

  it('uses the global rotation for challenge battles', () => {
    const { catalog, state } = combatSetup();
    state.status = 'challenge';
    const cast = advanceState(state, catalog, 1000);
    expect(cast.events.find(event => event.kind === 'cast')?.skillId).toBe('fire_bolt');
  });

  it('respects an explicitly empty map profile instead of falling back to global', () => {
    const { catalog, state, areaId } = combatSetup();
    state.rotationByArea![areaId] = [];
    const result = advanceState(state, catalog, 1000);
    expect(result.events.some(event => event.kind === 'cast')).toBe(false);
  });

  it('casts from the current map profile while keeping the global rotation intact', () => {
    const { catalog, state, areaId } = combatSetup();
    expect(state.rotation).toEqual(['fire_bolt']);
    expect(state.rotationByArea?.[areaId]).toEqual(['cold_bolt']);

    const cast = advanceState(state, catalog, 1000);
    expect(cast.events.find(event => event.kind === 'cast')?.skillId).toBe('cold_bolt');
    expect(cast.rotation).toEqual(['fire_bolt']);
  });

  it('removes profiles for areas absent from the current catalog', () => {
    const catalog = fixture();
    const state = createInitialState(catalog, 0);
    const activeAreaId = catalog.areas[0].id;
    state.rotationByArea = { [activeAreaId]: [], retired_map: ['firstaid'] };

    const next = advanceState(state, catalog, 0);

    expect(next.rotationByArea).toEqual({ [activeAreaId]: [] });
  });
});
