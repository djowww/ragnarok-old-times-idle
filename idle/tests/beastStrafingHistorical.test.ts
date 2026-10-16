import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import { beforeBeastStrafingCatalog, beforeBeastStrafingManifest } from './beast-strafing-historical.js';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import baseline from './fixtures/beastStrafingBaseline.json';
import { describe, expect, it } from 'vitest';

const catalog = beforeFourMapExpansionCatalog(currentCatalog);
const manifest = beforeFourMapExpansionManifest(currentManifest);

describe('Beast Strafing historical projection', () => {
  it('restores the exact prior catalog and manifest records', () => {
    const oldCatalog = beforeBeastStrafingCatalog(catalog);
    const oldManifest = beforeBeastStrafingManifest(manifest);
    expect(oldCatalog.skills.ht_power).toEqual(baseline.catalogSkills.ht_power.before);
    expect(oldCatalog.skills.double_strafe).toEqual(baseline.catalogSkills.double_strafe.before);
    expect(oldCatalog.items['1750']).toEqual(baseline.catalogItems['1750'].before);
    expect(oldCatalog.source).toEqual(baseline.catalogFields.source.before);
    expect(oldManifest.skillSources.ht_power).toEqual(baseline.manifestSkills.ht_power.before);
    expect(oldManifest.skillSources.double_strafe).toEqual(baseline.manifestSkills.double_strafe.before);
    for (const [key, change] of Object.entries(baseline.manifestFields))
      expect(oldManifest[key as keyof typeof oldManifest]).toEqual(change.before);
  });

  it('keeps mutations to promoted records visible to historical guards', () => {
    const changedCatalog = structuredClone(catalog);
    changedCatalog.skills.ht_power.description += ' unexpected edit';
    const projectedCatalog = beforeBeastStrafingCatalog(changedCatalog);
    expect(projectedCatalog.skills.ht_power).toEqual(changedCatalog.skills.ht_power);

    const changedManifest = structuredClone(manifest);
    changedManifest.skillSources.ht_power.adaptation += ' unexpected edit';
    const projectedManifest = beforeBeastStrafingManifest(changedManifest);
    expect(projectedManifest.skillSources.ht_power).toEqual(changedManifest.skillSources.ht_power);
  });
});
