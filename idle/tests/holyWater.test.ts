import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import type { FieldNavigationGrid } from '../shared/fieldNavigation.js';
import { createFieldNavigationRuntime, type FieldNavigationAreaSpec } from '../engine/fieldNavigation.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { executeCommand } from '../engine/commands.js';
import { addItem } from '../engine/state.js';
import { derivedStats } from '../engine/stats.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import { resolveHolyWaterCast } from '../engine/holyWater.js';

const area: FieldNavigationAreaSpec = { areaId: (catalogJson as any).areas[0].id, map: (catalogJson as any).areas[0].map, origin: { x: 6, y: 6 },
  homeOffsets: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }] };
function runtime(water = true) {
  const width = 13, height = 13, walkable = new Uint8Array(Math.ceil(width * height / 8));
  const mask = new Uint8Array(walkable.length);
  for (let id = 0; id < width * height; id++) walkable[id >> 3] |= 1 << (id & 7);
  if (water) mask[(6 * width + 6) >> 3] |= 1 << ((6 * width + 6) & 7);
  const grid: FieldNavigationGrid = { map: area.map, width, height, walkable, water: mask, sourceSha256: 'a'.repeat(64) };
  return createFieldNavigationRuntime([area], new Map([[area.map, grid]]));
}
function setup(water = true, bottle = true) {
  const c = structuredClone(catalogJson) as unknown as Catalog;
  const skill = c.skills.al_holywater;
  Object.assign(skill, { implementation: 'supported', manualUse: 'holyWaterCraft' });
  const s = createInitialState(c, 0);
  s.job = 'acolyte'; s.status = 'hunting'; s.areaId = area.areaId; s.rotation = [];
  s.learnedSkills = { al_holywater: 1 }; s.stats.dex = 1;
  s.fieldHero = { areaId: area.areaId, from: BATTLE_HERO, position: BATTLE_HERO, startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'seeking' };
  s.sp = derivedStats(s, c).maxSp;
  if (bottle) addItem(s, c, 713, 1);
  return { s, c, context: { navigation: runtime(water) } };
}

describe('Aqua Benedicta', () => {
  it('casts on water, spends 10 SP at cast end and converts one Empty Bottle without a failure roll', () => {
    const { s, c, context } = setup();
    const spBefore = s.sp;
    executeCommand(s, c, { type: 'useSkill', skillId: 'al_holywater' }, 0, context);
    expect(s.supportCast?.endsAt).toBeGreaterThan(0);
    expect(s.inventory.find(e => e.itemId === 713)?.quantity).toBe(1);
    const result = advanceState(s, c, Math.ceil(s.supportCast!.endsAt / 250) * 250, context);
    expect(result.supportCast).toBeUndefined(); expect(result.events.filter(e => e.kind === 'cast-failed')).toEqual([]);
    expect(result.inventory.find(e => e.itemId === 713)).toBeUndefined();
    expect(result.inventory.find(e => e.itemId === 523)?.quantity).toBe(1);
    expect(result.sp).toBe(spBefore - 10);
  });

  it('resolves the guaranteed recipe without consuming an RNG roll', () => {
    const { s, c, context } = setup();
    executeCommand(s, c, { type: 'useSkill', skillId: 'al_holywater' }, 0, context);
    const rng = s.rngState, end = s.supportCast!.endsAt;
    expect(resolveHolyWaterCast(s, c, end, context)).toBe(true);
    expect(s.rngState).toBe(rng);
    expect(s.inventory.find(e => e.itemId === 523)?.quantity).toBe(1);
  });

  it('requires the caster to be on a water GAT cell', () => {
    const { s, c, context } = setup(false);
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'al_holywater' }, 0, context)).toThrow();
    expect(s.supportCast).toBeUndefined(); expect(s.sp).toBe(derivedStats(s, c).maxSp);
  });


  it('does not spend SP or consume the bottle if the caster leaves the water cell before cast end', () => {
    const { s, c, context } = setup(); const spBefore = s.sp;
    executeCommand(s, c, { type: 'useSkill', skillId: 'al_holywater' }, 0, context);
    const end = Math.ceil(s.supportCast!.endsAt / 250) * 250;
    const result = advanceState(s, c, end, { navigation: runtime(false) });
    expect(result.supportCast).toBeUndefined();
    expect(result.inventory.find(e => e.itemId === 713)?.quantity).toBe(1);
    expect(result.inventory.find(e => e.itemId === 523)).toBeUndefined();
    expect(result.sp).toBe(spBefore);
    expect(result.events.some(e => e.kind === 'cast-failed')).toBe(true);
  });

  it('requires an Empty Bottle before beginning the cast', () => {
    const { s, c, context } = setup(true, false);
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'al_holywater' }, 0, context)).toThrow();
    expect(s.supportCast).toBeUndefined(); expect(s.sp).toBe(derivedStats(s, c).maxSp);
  });
});
