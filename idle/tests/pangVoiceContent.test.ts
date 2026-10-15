import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import rawManifest from '../content/source-manifest.json';
import type { Catalog } from '../shared/types.js';

const catalog = rawCatalog as unknown as Catalog;
const skill = Object.values(catalog.skills).find(entry => entry.sourceName === 'BA_PANGVOICE')!;

describe('BA_PANGVOICE source content', () => {
  it('exports the solo hunt effect and source timings as supported', () => {
    expect(skill.implementation).toBe('supported');
    expect(skill.statusEffect).toBe('SC_CONFUSION');
    expect(skill.statusChance).toEqual([50]);
    expect(skill.statusDurationMs).toEqual([17000]);
    expect(skill.castTimeMs).toEqual([1000]);
    expect(skill.afterCastDelayMs).toEqual([2000]);
    expect(skill.spCost).toEqual([20]);
    expect(skill.range).toEqual([9]);
    expect(skill.kind).toBe('buff');
    expect(skill.targetType).toBe('enemy');
    expect(rawManifest.skillCoverage.supportedSourceNames).toContain('BA_PANGVOICE');
    expect(rawManifest.skillCoverage.combatExpansion).toContain('BA_PANGVOICE');
    expect(rawManifest.skillSources.ba_pangvoice.adaptation).toContain('releases the monster attack target');
  });
});
