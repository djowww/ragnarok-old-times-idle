import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import { createFieldNavigationRuntime, type FieldNavigationAreaSpec } from '../engine/fieldNavigation.js';
import { executeCommand } from '../engine/commands.js';
import { GameError } from '../engine/state.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { fixture } from './engine-fixture.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO, battleHeroAt } from '../shared/battleSpatial.js';
import type { Catalog, GameState } from '../shared/types.js';
import type { FieldNavigationGrid } from '../shared/fieldNavigation.js';

const catalog = catalogJson as unknown as Catalog;
const area: FieldNavigationAreaSpec = { areaId: 'test_area', map: 'test_field', origin: { x: 6, y: 6 },
  homeOffsets: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }] };
const directions = [
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
];

function grid(blocked: readonly (readonly [number, number])[] = []): FieldNavigationGrid {
  const width = 13, height = 13, walkable = new Uint8Array(Math.ceil(width * height / 8));
  for (let id = 0; id < width * height; id++) walkable[id >> 3] |= 1 << (id & 7);
  for (const [x, y] of blocked) walkable[(y * width + x) >> 3] &= ~(1 << ((y * width + x) & 7));
  return { map: 'test_field', width, height, walkable, sourceSha256: 'a'.repeat(64) };
}
function runtime(blocked: readonly (readonly [number, number])[] = []) {
  return createFieldNavigationRuntime([area], new Map([['test_field', grid(blocked)]]));
}
function battleAtCell(x: number, y: number) {
  return { x: BATTLE_HERO.x + (x + 0.5 - (area.origin.x + 0.5)) / BATTLE_CELLS_PER_UNIT,
    y: BATTLE_HERO.y + (y + 0.5 - (area.origin.y + 0.5)) / BATTLE_CELLS_PER_UNIT };
}
function stateWithBacksliding(): GameState {
  const state = createInitialState(catalog, 0);
  state.job = 'thief'; state.status = 'hunting'; state.areaId = area.areaId;
  state.hp = 100; state.sp = 19; state.learnedSkills = { tf_backsliding: 1 };
  const point = battleAtCell(6, 6);
  state.fieldHero = { areaId: area.areaId, from: point, position: point, startedAt: 0, arrivedAt: 0,
    routeIndex: 0, phase: 'seeking', targetId: 'mob-1' };
  state.battle = { targetId: 'mob-1', cast: undefined } as GameState['battle'];
  state.playerFacing = { x: 0, y: -1 };
  return state;
}
const backSlide = { type: 'useSkill', skillId: 'tf_backsliding' } as const;
const expectedPoint = (x: number, y: number) => battleAtCell(x, y);

describe('manual Back Slide', () => {
  it('pushes five GAT cells opposite each of the eight facings and preserves facing', () => {
    for (const facing of directions) {
      const state = stateWithBacksliding(); state.playerFacing = { ...facing };
      const beforeFacing = { ...state.playerFacing };
      executeCommand(state, catalog, backSlide, 100, { navigation: runtime() });
      const dx = -facing.x * 5, dy = -facing.y * 5;
      expect(battleHeroAt(state, 100)).toEqual(expectedPoint(6 + dx, 6 + dy));
      expect(state.playerFacing).toEqual(beforeFacing);
      expect(state.sp).toBe(19 - 7);
    }
  });

  it('uses Hercules north as the missing-facing fallback', () => {
    const state = stateWithBacksliding(); delete state.playerFacing;
    executeCommand(state, catalog, backSlide, 100, { navigation: runtime() });
    expect(battleHeroAt(state, 100)).toEqual(expectedPoint(6, 1));
  });

  it('clips at blocked destinations without diagonal corner checks or detours', () => {
    const diagonal = stateWithBacksliding(); diagonal.playerFacing = { x: -1, y: -1 };
    executeCommand(diagonal, catalog, backSlide, 100, { navigation: runtime([[7, 6]]) });
    expect(battleHeroAt(diagonal, 100)).toEqual(expectedPoint(11, 11));

    const wall = stateWithBacksliding(); wall.playerFacing = { x: 1, y: 0 };
    executeCommand(wall, catalog, backSlide, 100, { navigation: runtime([[3, 6]]) });
    expect(battleHeroAt(wall, 100)).toEqual(expectedPoint(4, 6));
  });

  it('blocks Hercules final map row and column and refuses a blocked starting cell', () => {
    const edge = stateWithBacksliding(); edge.fieldHero!.from = edge.fieldHero!.position = battleAtCell(6, 10);
    executeCommand(edge, catalog, backSlide, 100, { navigation: runtime() });
    expect(battleHeroAt(edge, 100)).toEqual(expectedPoint(6, 11));
    const edgeColumn = stateWithBacksliding(); edgeColumn.fieldHero!.from = edgeColumn.fieldHero!.position = battleAtCell(10, 6);
    edgeColumn.playerFacing = { x: -1, y: 0 };
    executeCommand(edgeColumn, catalog, backSlide, 100, { navigation: runtime() });
    expect(battleHeroAt(edgeColumn, 100)).toEqual(expectedPoint(11, 6));

    const blockedStart = stateWithBacksliding(); blockedStart.fieldHero!.from = blockedStart.fieldHero!.position = battleAtCell(5, 6);
    const before = structuredClone(blockedStart);
    expect(() => executeCommand(blockedStart, catalog, backSlide, 100, { navigation: runtime([[5, 6]]) }))
      .toThrow(expect.objectContaining({ code: 'NAVIGATION_UNAVAILABLE' } satisfies Partial<GameError>));
    expect(blockedStart).toEqual(before);
  });

  it('charges a valid blocked cast, but rejects invalid prerequisites before cost or movement', () => {
    const blocked = stateWithBacksliding(); blocked.playerFacing = { x: 1, y: 0 };
    executeCommand(blocked, catalog, backSlide, 100, { navigation: runtime([[5, 6]]) });
    expect(blocked.sp).toBe(19 - 7);
    expect(battleHeroAt(blocked, 100)).toEqual(expectedPoint(6, 6));

    const invalid = stateWithBacksliding(); invalid.sp = 6;
    const before = structuredClone(invalid);
    expect(() => executeCommand(invalid, catalog, backSlide, 100, { navigation: runtime() }))
      .toThrow(expect.objectContaining({ code: 'SP_REQUIRED' } satisfies Partial<GameError>));
    expect(invalid).toEqual(before);

    const overweight = stateWithBacksliding();
    overweight.inventory = [{ uid: 'load', itemId: 909, quantity: 10000, refine: 0, cards: [], favorite: false }];
    const heavyBefore = structuredClone(overweight);
    expect(() => executeCommand(overweight, catalog, backSlide, 100, { navigation: runtime() }))
      .toThrow(expect.objectContaining({ code: 'SKILL_WEIGHT_BLOCKED' } satisfies Partial<GameError>));
    expect(overweight).toEqual(heavyBefore);
  });

  it('freezes a moving hero at the interpolated point and preserves the encounter and population', () => {
    const state = stateWithBacksliding();
    const start = battleAtCell(3, 3), end = battleAtCell(5, 3);
    state.fieldHero = { ...state.fieldHero!, from: start, position: end, startedAt: 0, arrivedAt: 1000,
      movementRoute: [start, end], movementTargetKey: 'target-key', phase: 'chasing', targetId: 'mob-1' };
    state.battle = { targetId: 'mob-1', enemies: [{ id: 'mob-1', hp: 50 }], cast: undefined } as any;
    state.fieldPopulation = { areaId: area.areaId, generation: 3, enemies: [{ id: 'mob-1', hp: 50 }], respawns: [{ slot: 2, at: 5000 }] } as any;
    const battleBefore = structuredClone(state.battle), populationBefore = structuredClone(state.fieldPopulation);
    const interpolated = battleHeroAt(state, 500);
    executeCommand(state, catalog, backSlide, 500, { navigation: runtime() });
    const final = expectedPoint(4, 8);
    expect(state.fieldHero).toMatchObject({ from: final, position: final, startedAt: 500, arrivedAt: 500 });
    expect(state.fieldHero?.movementRoute).toBeUndefined();
    expect(state.fieldHero?.movementTargetKey).toBeUndefined();
    expect(state.battle).toEqual(battleBefore);
    expect(state.fieldPopulation).toEqual(populationBefore);
    state.playerFacing = { x: 1, y: 0 }; // Later pursuit may turn; this action's facing stays captured.
    expect(state.events.at(-1)).toMatchObject({ kind: 'skill', skillId: 'tf_backsliding', skillLevel: 1,
      target: 'player', actionSourcePosition: interpolated, movementDestination: final });
    expect(state.events.at(-1)?.actionFacing).toEqual({ x: 0, y: -1 });
  });

  it('rejects Back Slide through the real rotation command and never chooses a corrupted manual rotation', () => {
    const selected = stateWithBacksliding();
    expect(() => executeCommand(selected, catalog, { type: 'setRotation', skillIds: ['tf_backsliding'] }, 100))
      .toThrow(expect.objectContaining({ code: 'INVALID_ROTATION' } satisfies Partial<GameError>));

    const c = fixture();
    const sourceSkill = structuredClone(catalog.skills.tf_backsliding);
    c.skills[sourceSkill.id] = sourceSkill;
    c.classes.novice.skills.push(sourceSkill.id);
    c.classes.novice.hp.fill(10000); c.classes.novice.sp.fill(1000);
    const s = createInitialState(c, 0); s.status = 'challenge'; s.learnedSkills[sourceSkill.id] = 1;
    s.rotation = [sourceSkill.id]; s.sp = 1000;
    beginBattle(s, c, 1002, 0, 'mastering');
    s.battle!.playerNextAttackAt = 999999; s.battle!.playerNextSkillAt = 0;
    const next = advanceState(s, c, 250);
    expect(next.sp).toBe(s.sp);
    expect(next.events.some(event => event.kind === 'skill' && event.skillId === sourceSkill.id)).toBe(false);
  });

  it('refuses unsupported, unlearned, dead, out-of-context, mismatched, and actively casting uses without mutation', () => {
    const mutate = [
      (s: GameState) => { s.job = 'swordsman'; },
      (s: GameState) => { s.learnedSkills = {}; },
      (s: GameState) => { s.hp = 0; },
      (s: GameState) => { s.status = 'resting'; },
      (s: GameState) => { s.fieldHero = undefined; },
      (s: GameState) => { s.fieldHero!.areaId = 'other_area'; },
      (s: GameState) => { s.battle!.cast = { actionId: 'active' } as any; },
      (s: GameState) => { s.playerStatuses = { SC_SILENCE: { level: 1, startsAt: 0, expiresAt: 1000 } }; },
      ...['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'ST_CHASEWALK'].map(source => (s: GameState) => {
        const blocked = Object.values(catalog.skills).find(skill => skill.sourceName === source)!;
        s.buffs[blocked.id] = { expiresAt: 1000, effects: {} };
      }),
      (s: GameState) => { s.buffs.sc_invisibility = { expiresAt: 1000, effects: {} }; },
    ];
    for (const invalidate of mutate) {
      const state = stateWithBacksliding(); invalidate(state);
      const before = structuredClone(state);
      expect(() => executeCommand(state, catalog, backSlide, 100, { navigation: runtime() })).toThrow(GameError);
      expect(state).toEqual(before);
    }
    const missingRuntime = stateWithBacksliding();
    const before = structuredClone(missingRuntime);
    expect(() => executeCommand(missingRuntime, catalog, backSlide, 100)).toThrow(GameError);
    expect(missingRuntime).toEqual(before);
  });

  it('ends Cloaking on a valid Back Slide under the pinned default source setting', () => {
    const state = stateWithBacksliding();
    const cloaking = Object.values(catalog.skills).find(skill => skill.sourceName === 'AS_CLOAKING')!;
    state.buffs[cloaking.id] = { expiresAt: 1000, effects: {} };
    executeCommand(state, catalog, backSlide, 100, { navigation: runtime() });
    expect(state.buffs[cloaking.id]).toBeUndefined();
    expect(state.sp).toBe(12);
  });

  it('ends Cloaking after valid zero or partial displacement but preserves it on rejected uses', () => {
    const cloaking = Object.values(catalog.skills).find(skill => skill.sourceName === 'AS_CLOAKING')!;
    for (const [blockedCell, finalCell] of [[[5, 6], [6, 6]], [[4, 6], [5, 6]]] as const) {
      const state = stateWithBacksliding(); state.playerFacing = { x: 1, y: 0 };
      state.buffs[cloaking.id] = { expiresAt: 1000, effects: {} };
      executeCommand(state, catalog, backSlide, 100, { navigation: runtime([blockedCell]) });
      expect(battleHeroAt(state, 100)).toEqual(expectedPoint(finalCell[0], finalCell[1]));
      expect(state.buffs[cloaking.id]).toBeUndefined();
      expect(state.sp).toBe(12);
    }

    for (const reject of [
      (state: GameState) => { state.sp = 6; },
      (state: GameState) => { state.playerStatuses = { SC_SILENCE: { level: 1, startsAt: 0, expiresAt: 1000 } }; },
    ]) {
      const state = stateWithBacksliding(); reject(state);
      state.buffs[cloaking.id] = { expiresAt: 1000, effects: {} };
      const before = structuredClone(state);
      expect(() => executeCommand(state, catalog, backSlide, 100, { navigation: runtime() })).toThrow();
      expect(state).toEqual(before);
    }
  });

  it('explains status blockers without implying that only an active cast is blocking', () => {
    const state = stateWithBacksliding();
    state.playerStatuses = { SC_SILENCE: { level: 1, startsAt: 0, expiresAt: 1000 } };
    expect(() => executeCommand(state, catalog, backSlide, 100, { navigation: runtime() }))
      .toThrow('Seu estado atual impede usar Back Slide.');
  });
});
