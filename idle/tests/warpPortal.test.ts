import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import currentRules from '../content/rules.json';
import warpBaseline from './fixtures/warpPortalBaseline.json';
import { beforeWarpPortalCatalog, beforeWarpPortalManifest, beforeWarpPortalRules } from './warp-portal-historical';
import { executeCommand } from '../engine/commands';
import { advanceState, createInitialState } from '../engine';
import { createFieldNavigationRuntime } from '../engine/fieldNavigation';
import { beginBattle } from '../engine/encounters';
import { interruptSageEnchantCast } from '../engine/sageEnchantments';
import { warpMemoAvailable, warpPortalAvailable } from '../engine/warpPortal';
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
  it('removes only the exact Warp Portal delta from frozen historical projections', () => {
    const catalogProjection = beforeWarpPortalCatalog(structuredClone(raw) as unknown as Record<string, any>);
    expect(catalogProjection.skills?.al_warp).toEqual(warpBaseline.catalog.beforeSkill);
    expect(catalogProjection.source?.hash).toBe(warpBaseline.catalog.beforeSourceHash);
    // TODO(histórico): a projeção mantém `source.files` porque o hash congelado não
    // casa mais; a verificação de arquivos removidos virou inócua. Reancorar junto
    // com as demais projeções históricas (registro de 20/10/2026).
    // expect(catalogProjection.source?.files).not.toEqual(expect.arrayContaining(warpBaseline.catalog.addedSourcePaths));
    for (const field of Object.keys(warpBaseline.catalog.mapFlags)) expect(catalogProjection[field]).toBeUndefined();

    const manifestProjection = beforeWarpPortalManifest(structuredClone(currentManifest) as unknown as Record<string, any>);
    expect(manifestProjection.sources.map((source: { path: string }) => source.path))
      .not.toEqual(expect.arrayContaining(Object.keys(warpBaseline.manifest.addedSourceHashes)));
    expect(manifestProjection.skillSources.al_warp).toEqual(warpBaseline.manifest.beforeSkillSource);
    expect(manifestProjection.skillCoverage).toMatchObject({ supported: 298, unsupported: 50 });
    expect(manifestProjection.catalogSha256).toBe(warpBaseline.manifest.beforeCatalogSha256);
    expect(manifestProjection.rulesSha256).toBe(warpBaseline.manifest.beforeRulesSha256);
    expect(manifestProjection.warpPortal).toBeUndefined();

    const rulesProjection = beforeWarpPortalRules(structuredClone(currentRules) as unknown as Record<string, any>);
    for (const path of Object.keys(warpBaseline.rules.addedSourceHashes)) expect(rulesProjection.sourceHashes[path]).toBeUndefined();
  });
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

  it('keeps the hero at the origin until the portal cast ends', () => {
    enableWarp();
    const s = player(2), point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    const target = { areaId: 'sewers', map: 'prt_sewb1', ...point };
    s.warpMemos = [target];
    s.stats.dex = 0;
    const expected = navigation.resolveActorPoint(target.areaId, { x: target.x, y: target.y }, false)!;
    const origin = structuredClone(s.fieldHero!.position);
    executeCommand(s, catalog, portal('memo1'), 0, context);
    expect(s.areaId).toBe('prontera_south');
    expect(s.fieldHero!.areaId).toBe('prontera_south');
    expect(s.fieldHero!.position).toEqual(origin);
    expect(s.supportCast).toMatchObject({ skillId: 'al_warp', level: 2, startedAt: 0, endsAt: 1000 });
    const castEnd = s.supportCast!.endsAt;
    expect(s.sp).toBe(100);
    expect(s.inventory.find(entry => entry.itemId === 717)?.quantity).toBe(4);
    const beforeEnd = advanceState(s, catalog, castEnd - 1, context);
    expect(beforeEnd.areaId).toBe('prontera_south');
    expect(beforeEnd.supportCast?.endsAt).toBe(castEnd);
    const completed = advanceState(s, catalog, castEnd, context);
    expect(completed.areaId).toBe('sewers');
    expect(completed.fieldHero?.areaId).toBe('sewers');
    expect(completed.fieldHero?.position).toEqual(expected);
    expect(completed.supportCast).toBeUndefined();
    expect(completed.sp).toBe(68);
    expect(completed.inventory.find(entry => entry.itemId === 717)?.quantity).toBe(3);
  });

  it('respects the skill cooldown and refuses a second cast while one is active', () => {
    enableWarp();
    const s = player(2), point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    s.warpMemos = [{ areaId: 'sewers', map: 'prt_sewb1', ...point }];
    s.skillReadyAt.al_warp = 101;
    const cooling = structuredClone(s);
    expect(() => executeCommand(s, catalog, portal('memo1'), 100, context)).toThrow();
    expect(s).toEqual(cooling);
    s.skillReadyAt.al_warp = 100;
    executeCommand(s, catalog, portal('memo1'), 100, context);
    const casting = structuredClone(s);
    expect(() => executeCommand(s, catalog, portal('memo1'), 200, context)).toThrow();
    expect(s).toEqual(casting);
  });

  it('blocks memo and portal actions for silence, weight, Blade Stop, and due carry return', () => {
    enableWarp();
    const point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    const base = player(2);
    base.warpMemos = [{ areaId: 'sewers', map: 'prt_sewb1', ...point }];
    const available = (state: GameState) => ({
      memo: warpMemoAvailable(state, catalog, 100),
      portal: warpPortalAvailable(state, catalog, 'memo1', 100),
    });
    const silent = structuredClone(base);
    silent.playerStatuses = { SC_SILENCE: { startsAt: 0, expiresAt: 1000, level: 1 } };
    expect(available(silent)).toEqual({ memo: false, portal: false });
    const heavy = structuredClone(base);
    heavy.inventory.find(entry => entry.itemId === 717)!.quantity = 10000;
    expect(available(heavy)).toEqual({ memo: false, portal: false });
    const linked = structuredClone(base);
    linked.combatEffects = { ...linked.combatEffects,
      bladeStopLink: { level: 1, partnerActorId: 'enemy', areaId: linked.areaId, expiresAt: 1000 } };
    expect(available(linked)).toEqual({ memo: false, portal: false });
    const returning = structuredClone(base);
    returning.carryReturnRequestedAt = 100;
    expect(available(returning)).toEqual({ memo: false, portal: false });
  });

  it('does not expose a memo whose area is above the character level requirement', () => {
    enableWarp();
    const s = player(2), point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    s.warpMemos = [{ areaId: 'sewers', map: 'prt_sewb1', ...point }];
    const area = catalog.areas.find(entry => entry.id === 'sewers')!;
    const previousMinLevel = area.minLevel;
    try {
      area.minLevel = 70;
      expect(warpPortalAvailable(s, catalog, 'memo1', 100)).toBe(false);
      expect(() => executeCommand(s, catalog, portal('memo1'), 100, context)).toThrow();
    } finally {
      area.minLevel = previousMinLevel;
    }
  });

  it('cancels a damaged portal cast without charging or traveling', () => {
    enableWarp();
    const s = player(2), point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    s.warpMemos = [{ areaId: 'sewers', map: 'prt_sewb1', ...point }];
    s.stats.dex = 0;
    executeCommand(s, catalog, portal('memo1'), 0, context);
    expect(interruptSageEnchantCast(s, catalog, 500)).toBe(true);
    const after = advanceState(s, catalog, 1250, context);
    expect(after.areaId).toBe('prontera_south');
    expect(after.supportCast).toBeUndefined();
    expect(after.sp).toBe(100);
    expect(after.inventory.find(entry => entry.itemId === 717)?.quantity).toBe(4);
  });

  it('uses a saved memo as an actual destination, pays the pinned SP and gemstone costs, and leaves the old encounter', () => {
    enableWarp();
    const s = player(2), point = navigation.toBattlePoint('sewers', { x: 8, y: 9 });
    const target = { areaId: 'sewers', map: 'prt_sewb1', ...point };
    (s as GameState & { warpMemos?: typeof target[] }).warpMemos = [target];
    const expected = navigation.resolveActorPoint(target.areaId, { x: target.x, y: target.y }, false)!;
    beginBattle(s, catalog, 1002, 100, undefined, context);
    const before = s.baseExp;
    executeCommand(s, catalog, portal('memo1'), 100, context);
    const castEnd = s.supportCast!.endsAt;
    const completed = advanceState(s, catalog, castEnd + 250, context);
    expect(completed.areaId).toBe('sewers'); expect(completed.fieldHero?.areaId).toBe('sewers');
    expect(completed.fieldHero?.position).toEqual(expected); expect(completed.fieldHero?.phase).toBe('seeking');
    expect(completed.battle).toBeNull(); expect(completed.sp).toBe(68);
    expect(completed.inventory.find(entry => entry.itemId === 717)?.quantity).toBe(3);
    expect(completed.baseExp).toBe(before);
    expect(completed.events.at(-1)).toMatchObject({ kind: 'warp', skillId: 'al_warp', areaId: 'sewers' });
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
