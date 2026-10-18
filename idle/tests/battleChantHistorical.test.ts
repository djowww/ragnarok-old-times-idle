import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest, canonicalArrowHistoricalManifest } from './arrow-craft-historical';
import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import baseline from './fixtures/battleChantBaseline.json';
import { beforeBattleChantCatalog, beforeBattleChantManifest } from './battle-chant-historical.js';

const catalog = beforeFourMapExpansionCatalog(beforeArrowCraftingCatalog(currentCatalog));
const manifest = beforeFourMapExpansionManifest(beforeArrowCraftingManifest(currentManifest));

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value, null, 2) + '\n').digest('hex');

describe('strict Battle Chant historical delta', () => {
  it('reconstructs the exact pinned package from before Battle Chant', () => {
    expect(hash(beforeBattleChantCatalog(catalog))).toBe(baseline.beforeCatalogSha256);
    expect(hash(canonicalArrowHistoricalManifest(beforeBattleChantManifest(manifest)))).toBe(baseline.beforeManifestSha256);
  });

  it('does not conceal changed Battle Chant catalog or coverage records', () => {
    const changedCatalog = structuredClone(catalog);
    changedCatalog.skills.pa_gospel.description += ' changed';
    expect(beforeBattleChantCatalog(changedCatalog).skills.pa_gospel).toEqual(changedCatalog.skills.pa_gospel);

    const changedManifest = structuredClone(manifest);
    changedManifest.skillCoverage.supported++;
    expect(beforeBattleChantManifest(changedManifest).skillCoverage.supported).toBe(changedManifest.skillCoverage.supported);
  });
});
