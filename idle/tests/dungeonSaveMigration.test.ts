import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { advanceState, createInitialState, getSnapshot } from '../engine/index';
import { beginBattle, tick } from '../engine/encounters';
import { encounterDelay, focusForArea } from '../shared/hunt';

const catalog = raw as unknown as Catalog;
const at = 1000;
function saved() {
  const state = createInitialState(catalog, at, 'migration-test');
  state.baseLevel = 70; state.baseExp = 1234; state.zeny = 5432;
  state.bestiary[1002] = 77; state.status = 'hunting'; state.areaId = 'orc_dungeon';
  state.rotation = []; state.nextEncounterAt = at + 10000;
  return state;
}
function progress(state: GameState) {
  const { baseLevel, baseExp, jobLevel, jobExp, zeny, inventory, bestiary, learnedSkills } = state;
  return { baseLevel, baseExp, jobLevel, jobExp, zeny, inventory, bestiary, learnedSkills };
}
function oldEncounter() {
  const old = structuredClone(catalog); old.areas.find(row => row.id === 'orc_dungeon')!.monsters = [1023];
  const state = saved(); beginBattle(state, old, 1023, at);
  state.battle!.playerNextAttackAt = state.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
  state.battle!.playerActionReadyAt = Number.MAX_SAFE_INTEGER;
  for (const enemy of state.battle!.enemies!) enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  return state;
}
describe('existing saves after native dungeon pool corrections', () => {
  it('normalizes removed monster and element preferences without touching progress', () => {
    const state = saved(); state.huntFocus = { orc_dungeon: 'monster:1023', byalan_depths: 'element:holy', prontera_south: 'monster:1002' };
    const before = progress(state), result = advanceState(state, catalog, at);
    expect(focusForArea(result, 'orc_dungeon')).toBe('any');
    expect(focusForArea(result, 'byalan_depths')).toBe('any');
    expect(focusForArea(result, 'prontera_south')).toBe('monster:1002');
    expect(encounterDelay(result, 'orc_dungeon', 6000)).toBe(6000);
    expect(progress(result)).toEqual(before);
    expect(state.huntFocus.orc_dungeon).toBe('monster:1023');
  });
  it('also gives the UI a valid preference before the next simulation tick', () => {
    const state = saved(); state.huntFocus = { orc_dungeon: 'monster:1023' };
    expect(getSnapshot(state, catalog, at).state.huntFocus!.orc_dungeon).toBe('any');
    expect(state.huntFocus.orc_dungeon).toBe('monster:1023');
  });
  it('replaces only obsolete ambient actors while retaining respawn deadlines and progress', () => {
    const state = oldEncounter(); state.battle = null;
    const population = state.fieldPopulation!, previousGeneration = population.generation, count = population.enemies.length;
    population.enemies = population.enemies.filter(enemy => enemy.fieldSlot !== 1);
    population.respawns = [{ slot: 1, at: at + 5000 }];
    const before = progress(state);
    tick(state, catalog, at, 0);
    const allowed = catalog.areas.find(row => row.id === state.areaId)!.monsters;
    expect(state.fieldPopulation!.enemies.every(enemy => allowed.includes(enemy.monsterId))).toBe(true);
    expect(state.fieldPopulation!.enemies).toHaveLength(count - 1);
    expect(state.fieldPopulation!.respawns).toEqual([{ slot: 1, at: at + 5000 }]);
    expect(state.fieldPopulation!.generation).toBe(previousGeneration + count - 1);
    expect(progress(state)).toEqual(before);
    tick(state, catalog, at + 5000, 0);
    expect(state.fieldPopulation!.enemies).toHaveLength(count);
    expect(state.fieldPopulation!.enemies.every(enemy => allowed.includes(enemy.monsterId))).toBe(true);
    expect(state.fieldPopulation!.respawns).toEqual([]);
  });
  it('refreshes obsolete actors before a new encounter adopts the map population', () => {
    const state = oldEncounter(); state.battle = null;
    beginBattle(state, catalog, 1042, at);
    const allowed = catalog.areas.find(row => row.id === state.areaId)!.monsters;
    expect(state.battle!.enemies!.every(enemy => allowed.includes(enemy.monsterId))).toBe(true);
  });
  it('keeps active actor identity, HP and copied combat state until the encounter finishes', () => {
    const state = JSON.parse(JSON.stringify(oldEncounter())) as GameState;
    const before = state.battle!.enemies!.map(enemy => ({ id: enemy.id, monsterId: enemy.monsterId, hp: enemy.hp }));
    tick(state, catalog, at, 0);
    expect(state.battle!.enemies!.map(enemy => ({ id: enemy.id, monsterId: enemy.monsterId, hp: enemy.hp }))).toEqual(before);
    expect(state.fieldPopulation!.enemies.map(enemy => enemy.id)).toEqual(before.map(enemy => enemy.id));
  });
  it('normalizes and adopts a legacy encounter before deciding whether the field is empty', () => {
    const state = oldEncounter(); delete state.battle!.enemies; delete state.battle!.targetId;
    state.fieldPopulation!.enemies = []; state.status = 'resting'; state.autoResume = false;
    const hp = state.battle!.hp;
    tick(state, catalog, at, 0);
    expect(state.battle!.enemies![0]).toMatchObject({ id: `legacy-${at}-1023`, monsterId: 1023, hp });
    expect(state.fieldPopulation!.enemies.some(enemy => enemy.id === `legacy-${at}-1023`)).toBe(true);
  });
});
