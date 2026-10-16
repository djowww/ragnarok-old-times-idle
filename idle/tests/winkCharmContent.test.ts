import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import rawManifest from '../content/source-manifest.json';
import rawRules from '../content/rules.json';
import type { Catalog } from '../shared/types.js';

const catalog = rawCatalog as unknown as Catalog;
const skill = Object.values(catalog.skills).find(entry => entry.sourceName === 'DC_WINKCHARM')!;

describe('DC_WINKCHARM source content', () => {
  it('exports the supported monster-only effect with Hercules timings and chance', () => {
    expect(skill).toMatchObject({
      implementation: 'supported',
      maxLevel: 1,
      statusEffect: 'SC_DC_WINKCHARM',
      statusChance: [70],
      statusDurationMs: [10000],
      durationMs: 10000,
      castTimeMs: [1000],
      afterCastDelayMs: [2000],
      spCost: [40],
      range: [9],
      kind: 'buff',
      targetType: 'enemy',
    });
    expect(skill.unsupportedReason).toBeUndefined();
    expect(rawManifest.skillSources.dc_winkcharm).toMatchObject({
      id: 1011,
      name: 'DC_WINKCHARM',
      implementation: 'supported',
      adaptation: expect.stringContaining('NPC special skill is modeled'),
    });
    expect(rawManifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 268, unsupported: 80 });
    expect(rawManifest.skillCoverage.supportedSourceNames).toContain('DC_WINKCHARM');
    expect(rawManifest.skillCoverage.supportedSourceNames).toEqual(
      Object.values(catalog.skills).filter(entry => entry.implementation === 'supported').map(entry => entry.sourceName),
    );
    const classCoverage = rawManifest.skillCoverage.byClass as Record<string, {
      sourceTree: number; supported: number; unsupported: number;
    }>;
    for (const job of Object.values(catalog.classes)) {
      const supported = job.skills.filter(id => catalog.skills[id].implementation === 'supported').length;
      expect(classCoverage[job.id]).toEqual({
        sourceTree: job.skills.length,
        supported,
        unsupported: job.skills.length - supported,
      });
    }
    expect(rawManifest.skillCoverage.combatExpansion).toContain('DC_WINKCHARM');
    expect(rawManifest.skillCoverage.unavailable.some(entry => entry.sourceName === 'DC_WINKCHARM')).toBe(false);
    expect((rawRules.skillDescriptions as Record<string, string>).DC_WINKCHARM).toMatch(/70%/);
  });
});
