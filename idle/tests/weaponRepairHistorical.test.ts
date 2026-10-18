import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import baseline from './fixtures/weaponRepairHistoricalBaseline.json';
import { beforeWeaponRepairCatalog, beforeWeaponRepairManifest } from './weaponRepairHistorical';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('strict inverse of the Weapon Repair export delta', () => {
  it('restores only the exact prior skill and coverage rows', () => {
    const oldCatalog = beforeWeaponRepairCatalog(catalog as Record<string, any>);
    const oldManifest = beforeWeaponRepairManifest(manifest as Record<string, any>);
    expect(oldCatalog.skills.bs_repairweapon).toEqual(baseline.beforeSkill);
    expect(oldCatalog.source.hash).toBe(baseline.beforeCatalogSourceHash);
    expect(oldManifest.skillSources.bs_repairweapon).toEqual(baseline.beforeSkillSource);
    expect(sha(oldManifest.skillCoverage)).toBe(baseline.beforeSkillCoverageSha256);
    expect(oldManifest.catalogSha256).toBe(baseline.beforeCatalogSha256);
    expect(oldCatalog.skills.bs_findingore).toEqual(catalog.skills.bs_findingore);
  });

  it('keeps a changed skill row visible instead of masking drift', () => {
    const changed = structuredClone(catalog) as Record<string, any>;
    changed.skills.bs_repairweapon.description += ' unrelated drift';
    expect(beforeWeaponRepairCatalog(changed).skills.bs_repairweapon)
      .toEqual(changed.skills.bs_repairweapon);
  });

  it('keeps changed manifest coverage visible instead of restoring a historical count', () => {
    const changed = structuredClone(manifest) as Record<string, any>;
    changed.skillCoverage.byClass.blacksmith.supported += 1;
    expect(beforeWeaponRepairManifest(changed).skillCoverage)
      .toEqual(changed.skillCoverage);
  });
});
