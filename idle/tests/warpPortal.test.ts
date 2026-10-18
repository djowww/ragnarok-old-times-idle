import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import { executeCommand } from '../engine/commands';
import { createInitialState } from '../engine';
import { createFieldNavigationRuntime } from '../engine/fieldNavigation';
import { parseCommandRequest } from '../server/validation';
import { BATTLE_HERO } from '../shared/battleSpatial';
import type { Catalog, GameCommand, GameState } from '../shared/types';

const catalog = structuredClone(raw) as unknown as Catalog;
const specs = [
  { areaId: 'prontera_south', map: 'prt_fild08', origin: { x: 6, y: 6 }, homeOffsets: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }] },
  { areaId: 'sewers', map: 'prt_sewb1', origin: { x: 7, y: 7 }, homeOffsets: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }] },
] as const;
function world() {
  const width = 17, height = 17, walkable = new Uint8Array(Math.ceil(width * height / 8));
  for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) {
    const id = y * width + x; walkable[id >> 3] |= 1 << (id & 7);
  }
  const grid = (map: string) => ({ map, width, height, walkable, sourceSha256: 'a'.repeat(64) });
  return createFieldNavigationRuntime(specs, new Map(specs.map(spec => [spec.map, grid(spec.map)])));
}
const navigation = world();
const context = { navigation };
function player(level = 2): GameState {
  const s = createInitialState(catalog, 0);
  s.job = 'priest'; s.baseLevel = 50; s.status = 'hunting'; s.areaId = 'prontera_south';
  s.hp = 100; s.sp = 100;
  s.learnedSkills = { al_teleport: 2, al_ruwach: 1, al_warp: level };
  s.inventory = [{ uid: 'blue-gemstone', itemId: 717, quantity: 4, refine: 0, cards: [], favorite: false }];
  s.fieldHero = { areaId: 'prontera_south', from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'fighting', targetId: 'mob' };
  return s;
}
const memoCommand = { type: 'memoWarp' } as unknown as GameCommand;
const portal = (destination: 'memo1' | 'memo2' | 'memo3') =>
  ({ type: 'warpPortal', destination } as unknown as GameCommand);
function enableWarp() {
  Object.assign(catalog.skills.al_warp, { implementation: 'supported', manualUse: 'warpPortal', spCost: [35, 32, 29, 26], itemCostByLevel: [[{ itemId: 717, quantity: 1 }], [{ itemId: 717, quantity: 1 }], [{ itemId: 717, quantity: 1 }], [{ itemId: 717, quantity: 1 }]], castTimeMs: [1000, 1000, 1000, 1000] });
}

describe('solo Warp Portal', () => {
  it('accepts memo and portal commands with only source destinations', () => {
    expect(parseCommandRequest({ requestId: 'warp_001', command: { type: 'memoWarp' } }).command)
      .toEqual({ type: 'memoWarp' });
    expect(parseCommandRequest({ requestId: 'warp_002', command: { type: 'warpPortal', destination: 'memo1' } }).command)
      .toEqual({ type: 'warpPortal', destination: 'memo1' });
    expect(() => parseCommandRequest({ requestId: 'warp_003', command: { type: 'warpPortal', destination: 'memo4' } })).toThrow();
  });

  it('requires Teleport level 2 before using Warp Portal', () => {
    enableWarp();
    const s = player(2); delete s.learnedSkills.al_teleport;
    const before = structuredClone(s);
    expect(() => executeCommand(s, catalog, memoCommand, 100, context)).toThrow();
    expect(s).toEqual(before);
  });

  it('memorizes a walkable map position and keeps only the slots unlocked by skill level', () => {
    enableWarp();
    const s = player(2), point = navigation.toBattlePoint('prontera_south', { x: 8.5, y: 9.5 });
    s.fieldHero!.position = point;
    executeCommand(s, catalog, memoCommand, 100, context);
    expect((s as GameState & { warpMemos?: unknown[] }).warpMemos).toEqual([
      { areaId: 'prontera_south', map: 'prt_fild08', x: s.fieldHero!.position.x, y: s.fieldHero!.position.y },
    ]);
    const nextPoint = navigation.toBattlePoint('prontera_south', { x: 10.5, y: 11.5 });
    s.fieldHero!.position = nextPoint;
    executeCommand(s, catalog, memoCommand, 200, context);
    expect((s as GameState & { warpMemos?: unknown[] }).warpMemos).toEqual([
      { areaId: 'prontera_south', map: 'prt_fild08', x: s.fieldHero!.position.x, y: s.fieldHero!.position.y },
    ]);
  });

  it('uses a saved memo as an actual destination, pays the pinned SP and gemstone costs, and leaves the old encounter', () => {
    enableWarp();
    const s = player(2), point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    const target = { areaId: 'sewers', map: 'prt_sewb1', ...point };
    (s as GameState & { warpMemos?: typeof target[] }).warpMemos = [target];
    const expected = navigation.resolveActorPoint(target.areaId, { x: target.x, y: target.y }, false)!;
    s.battle = { enemies: [] } as unknown as GameState['battle'];
    const before = s.baseExp;
    executeCommand(s, catalog, portal('memo1'), 100, context);
    expect(s.areaId).toBe('sewers'); expect(s.fieldHero?.areaId).toBe('sewers');
    expect(s.fieldHero?.position).toEqual(expected); expect(s.fieldHero?.phase).toBe('seeking');
    expect(s.battle).toBeNull(); expect(s.sp).toBe(68);
    expect(s.inventory.find(entry => entry.itemId === 717)?.quantity).toBe(3);
    expect(s.baseExp).toBe(before);
    expect(s.events.at(-1)).toMatchObject({ kind: 'warp', skillId: 'al_warp', areaId: 'sewers' });
  });

  it('respects no memo and no warp-to restrictions before charging', () => {
    enableWarp();
    const s = player(2);
    Object.assign(catalog, { warpBlockedMaps: [], warpMemoBlockedMaps: ['prt_fild08'], warpDestinationBlockedMaps: ['prt_sewb1'] });
    const beforeMemo = structuredClone(s);
    expect(() => executeCommand(s, catalog, memoCommand, 100, context)).toThrow();
    expect(s).toEqual(beforeMemo);
    const point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    s.warpMemos = [{ areaId: 'sewers', map: 'prt_sewb1', ...point }];
    const beforePortal = structuredClone(s);
    expect(() => executeCommand(s, catalog, portal('memo1'), 100, context)).toThrow();
    expect(s).toEqual(beforePortal);
  });
  it('rejects blocked or unavailable destinations without paying or moving', () => {
    enableWarp();
    const s = player(2), point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    const target = { areaId: 'sewers', map: 'prt_sewb1', ...point };
    (s as GameState & { warpMemos?: typeof target[] }).warpMemos = [target];
    const before = structuredClone(s);
    Object.assign(catalog, { warpBlockedMaps: ['prt_fild08'], warpMemoBlockedMaps: [], warpDestinationBlockedMaps: [] });
    expect(() => executeCommand(s, catalog, portal('memo1'), 100, context)).toThrow();
    expect(s).toEqual(before);
  });
});
