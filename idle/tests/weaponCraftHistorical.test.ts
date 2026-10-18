import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import { beforeWeaponCraftingCatalog, beforeWeaponCraftingManifest } from './weapon-craft-historical.js';
import baseline from './fixtures/weaponCraftHistoricalBaseline.json';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('strict inverse for the pinned Weapon Crafting export', () => {
  it('reconstructs the exact prior catalog and manifest', () => {
    expect(sha(beforeWeaponCraftingCatalog(catalog))).toBe(baseline.catalog.beforeJsonSha256);
    expect(sha(beforeWeaponCraftingManifest(manifest))).toBe(baseline.manifest.beforeJsonSha256);
  });

  it('keeps changed feature rows visible to downstream historical guards', () => {
    const changedCatalog = structuredClone(catalog);
    changedCatalog.items[1107].attack += 1;
    expect(beforeWeaponCraftingCatalog(changedCatalog).items[1107].attack).toBe(changedCatalog.items[1107].attack);

    const changedManifest = structuredClone(manifest);
    changedManifest.weaponCraft.recipes += 1;
    expect(beforeWeaponCraftingManifest(changedManifest).weaponCraft.recipes).toBe(53);
  });
});
