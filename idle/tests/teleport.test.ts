import { describe, expect, it, vi } from 'vitest';
import * as stateRuntime from '../engine/state';
import raw from '../content/catalog.json';
import { createInitialState, applyCommand } from '../engine';
import { executeCommand } from '../engine/commands';
import { applyTeleport, teleportAvailable } from '../engine/teleport';
import { createFieldNavigationRuntime } from '../engine/fieldNavigation';
import { parseCommandRequest } from '../server/validation';
import { BATTLE_HERO, battleHeroAt } from '../shared/battleSpatial';
import type { Catalog, GameState } from '../shared/types';

const c = raw as unknown as Catalog;
const spec = { areaId: 'prontera_south', map: 'prt_fild08', origin: { x: 6, y: 6 },
  homeOffsets: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }] };
function navigation() {
  const width = 13, height = 13, walkable = new Uint8Array(Math.ceil(width * height / 8));
  for (let y = 1; y < 12; y++) for (let x = 1; x < 12; x++) {
    if (x === 2) continue; // Wall separates a disconnected passable column at x1.
    const id = y * width + x; walkable[id >> 3] |= 1 << (id & 7);
  }
  return createFieldNavigationRuntime([spec], new Map([[spec.map, { map: spec.map, width, height, walkable,
    sourceSha256: 'a'.repeat(64) }]]));
}
function player(level = 2): GameState {
  const s = createInitialState(c, 0);
  s.job = 'acolyte'; s.baseLevel = 50; s.stats.int = 50; s.status = 'hunting'; s.areaId = spec.areaId;
  s.hp = 100; s.sp = 100; s.learnedSkills = { al_teleport: level, al_ruwach: 1 };
  s.fieldHero = { areaId: spec.areaId, from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'fighting', targetId: 'mob', moveBlockedUntil: 200 };
  return s;
}
const ctx = { navigation: navigation() };
describe('manual source Teleport', () => {
  it('accepts only explicit destination choices and no arbitrary coordinates', () => {
    expect(parseCommandRequest({ requestId: 'teleport_123', command: { type: 'teleport', destination: 'random' } }).command)
      .toEqual({ type: 'teleport', destination: 'random' });
    for (const command of [{ type: 'teleport' }, { type: 'teleport', destination: 'any' },
      { type: 'teleport', destination: 'save', x: 3 }])
      expect(() => parseCommandRequest({ requestId: 'teleport_123', command })).toThrow();
  });
  it.each([1, 2])('pays learned level %s cost for a random warp and preserves the same population', level => {
    const s = player(level), seed = s.rngState, inventory = structuredClone(s.inventory);
    const areaId = s.areaId;
    applyTeleport(s, c, 'random', 100, ctx);
    expect(s.sp).toBe(100 - [10, 9][level - 1]); expect(s.rngState).not.toBe(seed);
    expect(s.areaId).toBe(areaId); expect(s.status).toBe('hunting');
    expect(s.inventory).toEqual(inventory); expect(s.battle).toBeNull();
    const cell = ctx.navigation.toGridPoint(spec.areaId, battleHeroAt(s, 100));
    expect(cell.x).toBeGreaterThan(2); expect(cell.x).toBeLessThan(12);
    expect(cell.y).toBeGreaterThan(0); expect(cell.y).toBeLessThan(12);
    expect(ctx.navigation.isWalkableBattlePoint(spec.areaId, battleHeroAt(s, 100))).toBe(true);
    expect(s.fieldHero?.phase).toBe('seeking'); expect(s.fieldHero?.targetId).toBeUndefined();
    expect(s.fieldHero?.moveBlockedUntil).toBeUndefined();
    expect(s.events.at(-1)).toMatchObject({ kind: 'teleport', skillId: 'al_teleport', skillLevel: level });
  });
  it('replays persisted RNG deterministically with paired bounded draws', () => {
    const a = player(), b = JSON.parse(JSON.stringify(a));
    applyTeleport(a, c, 'random', 100, ctx); applyTeleport(b, c, 'random', 100, ctx);
    expect(a).toEqual(b);
  });
  it('uses existing SP reductions and keeps ordinary timed buffs through warp', () => {
    const s = player(); s.buffs.discount = { expiresAt: 1000, effects: { spCostReductionPct: 20 } };
    applyTeleport(s, c, 'random', 100, ctx);
    expect(s.sp).toBe(93); expect(s.buffs.discount).toEqual({ expiresAt: 1000, effects: { spCostReductionPct: 20 } });
  });
  it('bounds a valid failed destination search without inventing a landing or canceling the encounter', () => {
    const s = player(), start = structuredClone(s.fieldHero);
    const rng = vi.spyOn(stateRuntime, 'random').mockReturnValue(0); // Always disconnected x1/y1.
    try {
      applyTeleport(s, c, 'random', 100, ctx);
      expect(rng).toHaveBeenCalledTimes(2000); expect(s.sp).toBe(91);
      expect(s.fieldHero).toEqual(start); expect(s.status).toBe('hunting');
      expect(s.events.at(-1)?.kind).toBe('cast-failed');
    } finally { rng.mockRestore(); }
  });
  it('returns level2 directly to Prontera without healing/recovery or deleting progress', () => {
    const s = player(), before = structuredClone(s); s.autoResume = true; s.pendingAreaId = 'orcs';
    executeCommand(s, c, { type: 'teleport', destination: 'save' }, 100, ctx);
    expect(s.status).toBe('town'); expect(s.areaId).toBeNull(); expect(s.battle).toBeNull();
    expect(s.sp).toBe(91); expect(s.hp).toBe(before.hp); expect(s.restUntil).toBe(0);
    expect(s.autoResume).toBe(false); expect(s.pendingAreaId).toBeNull();
    for (const key of ['inventory', 'equipment', 'baseExp', 'jobExp', 'learnedSkills', 'zeny', 'totals'] as const)
      expect(s[key]).toEqual(before[key]);
  });
  it('rejects level1 save choice with no payment or RNG draw', () => {
    const s = player(1), before = structuredClone(s);
    expect(() => applyTeleport(s, c, 'save', 100, ctx)).toThrow(); expect(s).toEqual(before);
  });
  it('allows manual escape during basic attack motion and AFK decision polling', () => {
    const s = player(); s.battle = { playerActionReadyAt: 500, enemies: [] } as unknown as GameState['battle'];
    expect(teleportAvailable(s, c, 'random', 100)).toBe(true);
    applyTeleport(s, c, 'random', 100, ctx); expect(s.battle).toBeNull(); expect(s.sp).toBe(91);
  });
  it('blocks a genuine skill action deadline and permits teleport exactly when it expires', () => {
    const s = player(); Object.assign(s, { playerCanActAt: 500 });
    const before = structuredClone(s);
    expect(teleportAvailable(s, c, 'random', 100)).toBe(false);
    expect(() => applyTeleport(s, c, 'random', 100, ctx)).toThrow(); expect(s).toEqual(before);
    expect(teleportAvailable(s, c, 'random', 500)).toBe(true);
    applyTeleport(s, c, 'random', 500, ctx); expect(s.battle).toBeNull(); expect(s.sp).toBe(91);
  });
  it('retains its own source action lock through warp and rejects immediate repeated escapes', () => {
    const s = player(); applyTeleport(s, c, 'random', 100, ctx);
    expect(teleportAvailable(s, c, 'random', 101)).toBe(false);
    const before = structuredClone(s);
    expect(() => applyTeleport(s, c, 'random', 101, ctx)).toThrow(); expect(s).toEqual(before);
    expect(teleportAvailable(s, c, 'random', 2000)).toBe(true);
  });
  it.each(['job', 'unlearned', 'prerequisite', 'dead', 'town', 'challenge', 'sitting', 'silence', 'cast', 'hiding', 'stasis', 'kagehumi'])(
    'rejects %s eligibility without a side effect', condition => {
      const s = player();
      if (condition === 'job') s.job = 'mage';
      if (condition === 'unlearned') delete s.learnedSkills.al_teleport;
      if (condition === 'prerequisite') delete s.learnedSkills.al_ruwach;
      if (condition === 'dead') s.hp = 0;
      if (condition === 'town' || condition === 'challenge') s.status = condition;
      if (condition === 'sitting') { s.status = 'resting'; s.restMode = 'field'; }
      if (condition === 'silence' || condition === 'stasis' || condition === 'kagehumi')
        s.playerStatuses = { [condition === 'silence' ? 'SC_SILENCE' : condition === 'stasis' ? 'SC_STASIS' : 'SC_KG_KAGEHUMI']:
          { startsAt: 0, expiresAt: 1000, level: 1, sourceActorId: 'mob' } };
      if (condition === 'hiding') s.buffs.tf_hiding = { expiresAt: 1000, effects: {} };
      if (condition === 'cast') s.supportCast = { skillId: 'al_heal', level: 1, startedAt: 0, endsAt: 500, actionId: 'cast' };
      const before = structuredClone(s); expect(teleportAvailable(s, c, 'random', 100)).toBe(false);
      expect(() => applyTeleport(s, c, 'random', 100, ctx)).toThrow(); expect(s).toEqual(before);
    });
  it('fails closed without navigation, source map flags or a source-supported skill', () => {
    for (const mode of ['navigation', 'flags', 'support'] as const) {
      const s = player(), catalog = structuredClone(c);
      if (mode === 'flags') delete catalog.teleportBlockedMaps;
      if (mode === 'support') catalog.skills.al_teleport.implementation = 'unsupported';
      const before = structuredClone(s);
      expect(() => applyTeleport(s, catalog, 'random', 100, mode === 'navigation' ? undefined : ctx)).toThrow();
      expect(s).toEqual(before);
    }
  });
  it('blocks source noteleport on either destination and fails before charging', () => {
    const catalog = structuredClone(c); catalog.teleportBlockedMaps = [spec.map];
    for (const destination of ['random', 'save'] as const) {
      const s = player(), before = structuredClone(s);
      expect(() => applyTeleport(s, catalog, destination, 100, ctx)).toThrow(); expect(s).toEqual(before);
    }
  });
  it('clears casts/targeting and grounds once while preserving aliased monster HP/status and respawns', () => {
    const s = player();
    const enemy = { id: 'mob', monsterId: 1002, hp: 27, maxHp: 50, startedAt: 0, arrivedAt: 200,
      enemyNextAttackAt: 400, position: { x: .4, y: .5 }, approachFrom: { x: .3, y: .5 }, fieldSlot: 0,
      spawnDirection: 0, engaged: true, hostile: true, statuses: { SC_POISON: { expiresAt: 900, level: 1 } },
      npcCombat: { firstAttackDone: true, readyAt: { 19: 900 }, cast: { skillId: 19, level: 1, targetActorId: s.id,
        startedAt: 0, endsAt: 300, areaId: s.areaId, actionId: 'npc' } } };
    s.fieldPopulation = { areaId: spec.areaId, generation: 3, enemies: [enemy], respawns: [{ slot: 1, at: 500 }] };
    s.battle = { monsterId: 1002, hp: 27, maxHp: 50, startedAt: 0, playerNextAttackAt: 0, enemyNextAttackAt: 400,
      enemies: [enemy], targetId: enemy.id, playerActionReadyAt: 0 };
    s.buffs.al_pneuma = { expiresAt: 900, effects: {} };
    s.buffs.blessing = { expiresAt: 900, effects: { str: 10 } };
    s.groundPlacements = [{ id: 'ground', ownerActorId: s.id, skillId: 'al_pneuma', level: 1, map: spec.map,
      cellOffset: { x: 0, y: 0 }, range: 0, sourceName: 'AL_PNEUMA', sceneKey: spec.areaId,
      placedAt: 0, expiresAt: 900, cells: [{ x: 6, y: 6 }] }];
    const oldPopulation = s.fieldPopulation!, poison = structuredClone(enemy.statuses), respawns = structuredClone(oldPopulation.respawns);
    applyTeleport(s, c, 'random', 100, ctx);
    expect(s.fieldPopulation).toBe(oldPopulation); expect(enemy.hp).toBe(27); expect(enemy.statuses).toEqual(poison);
    expect(enemy.engaged).toBe(false); expect(enemy.hostile).toBe(false); expect(enemy.npcCombat.cast).toBeUndefined();
    expect(oldPopulation.respawns).toEqual(respawns); expect(s.buffs.blessing).toBeDefined();
    expect(s.buffs.al_pneuma).toBeUndefined(); expect(s.groundPlacements).toBeUndefined();
    expect(s.battle).toBeNull(); expect(s.events.some(e => ['kill', 'loot', 'damage'].includes(e.kind))).toBe(false);
  });
  it('is manual-only and rejects a saved rotation selection', () => {
    const s = player(); expect(() => applyCommand(s, c, { type: 'setRotation', skillIds: ['al_teleport'] }, 0)).toThrow();
  });
});
