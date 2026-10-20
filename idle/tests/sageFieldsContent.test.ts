import { beforeDungeonExpansionCatalog, beforeDungeonExpansionManifest } from './dungeon-map-historical';
import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest } from './arrow-craft-historical';
import { beforeSoloAlchemySkills } from './solo-alchemy-historical';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import dungeonCurrentRaw from '../content/catalog.json';
import dungeonCurrentManifest from '../content/source-manifest.json';
import baseline from './fixtures/sageFields256Baseline.json';
import { beforeTeleportSkills } from './sage-fields-historical-fixture';
import type { Catalog } from '../shared/types';
import { beforeHistoricalClassCadence } from './class-cadence-historical';
const raw = beforeDungeonExpansionCatalog(beforeArrowCraftingCatalog(dungeonCurrentRaw));
const manifest = beforeDungeonExpansionManifest(beforeArrowCraftingManifest(dungeonCurrentManifest));

const c = raw as unknown as Catalog;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const added = ['SA_DELUGE', 'SA_VIOLENTGALE', 'SA_VOLCANO'];
describe('pinned Sage fields catalog release', () => {
  it.each([['sa_volcano', 285], ['sa_deluge', 286], ['sa_violentgale', 287]] as const)(
    'enables %s with source costs, durations, icon and manual cast', (id, herculesId) => {
      expect(c.skills[id]).toMatchObject({ herculesId, implementation: 'supported', manualUse: 'activate',
        maxLevel: 5, targetType: 'ground', interruptCast: true, spCost: [48, 46, 44, 42, 40],
        castTimeMs: [5000, 5000, 5000, 5000, 5000], groundDurationMs: [60000, 120000, 180000, 240000, 300000],
        iconResource: `data/texture/유저인터페이스/item/${id}.bmp` });
      expect(c.skills[id].itemCostByLevel).toEqual(Array.from({ length: 5 }, () => [{ itemId: 715, quantity: 1 }]));
      expect(c.skills[id].unsupportedReason).toBeUndefined();
    });
  it('adds exactly three solo skills without changing other skill mechanics or world balance', () => {
    const historicalSkills = beforeTeleportSkills(beforeSoloAlchemySkills(c.skills));
    const names = Object.values(historicalSkills).filter(s => s.implementation === 'supported').map(s => s.sourceName!);
    expect(names.filter(n => !baseline.supportedSourceNames.includes(n)).sort()).toEqual(expect.arrayContaining(added));
    expect(baseline.supportedSourceNames.filter(n => !names.includes(n))).toEqual([]);
    expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 298, unsupported: 50 });
    for (const [key, hash] of Object.entries(baseline.domains)) {
      const historical = key === 'classes' ? beforeHistoricalClassCadence(c.classes) : raw[key as keyof typeof raw];
      expect(digest(historical), key).toBe(hash);
    }
    expect({ ...Object.fromEntries(Object.entries(raw.source).filter(([key]) => key !== 'hash')),
      files: raw.source.files.filter(path => path !== 'npc/mapflag/noteleport.txt') }).toEqual(baseline.sourceMetadata);
    expect(digest(Object.fromEntries(Object.entries(historicalSkills).filter(([id]) =>
      !['sa_volcano', 'sa_deluge', 'sa_violentgale', 'pf_fogwall'].includes(id))))).toBe(baseline.otherSkills);
    const properties = new Set([2344, 2345, 2346, 2347, 2348, 2349, 2350, 2351, 4054, 4119]);
    expect(digest(Object.fromEntries(Object.entries(c.items).filter(([id]) => !properties.has(Number(id)))))).toBe(baseline.otherItems);
  });
  it('discloses fixed solo placement, NoSave and the remaining Fog blind adaptation', () => {
    for (const id of ['sa_volcano', 'sa_deluge', 'sa_violentgale'] as const) {
      expect(manifest.skillSources[id].adaptation).toContain('NoSave');
      expect(manifest.skillSources[id].sourceUnit).toMatchObject({ Layout: 3, Interval: -1 });
      expect((manifest.skillSources[id].sourceUnit as { Range?: number }).Range ?? 0).toBe(0);
    }
    expect(c.skills.pf_fogwall.description).toContain('fixo');
    expect(manifest.skillSources.pf_fogwall.adaptation).toContain('40');
    expect(manifest.skillSources.pf_fogwall.adaptation).toContain('blind');
  });
});
