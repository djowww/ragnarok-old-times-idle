import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest, canonicalArrowHistoricalManifest } from './arrow-craft-historical';
import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import baseline from './fixtures/antHellBaseline.json';
import { beforeAntHellCatalog, beforeAntHellManifest } from './ant-hell-historical';

const catalog = beforeFourMapExpansionCatalog(beforeArrowCraftingCatalog(currentCatalog));
const manifest = beforeFourMapExpansionManifest(beforeArrowCraftingManifest(currentManifest));

const fileSha = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value, null, 2) + '\n').digest('hex');

describe('Ant Hell historical projection', () => {
  it('reconstructs the exact prior catalog and source manifest', () => {
    expect(fileSha(beforeAntHellCatalog(catalog))).toBe(baseline.catalog.beforeFileSha256);
    expect(fileSha(canonicalArrowHistoricalManifest(beforeAntHellManifest(manifest)))).toBe(baseline.manifest.beforeFileSha256);
  });

  it('reverses only exact new content and preserves edits to added records', () => {
    const changed = structuredClone(catalog);
    const monsterId = Object.keys(baseline.catalog.newMonsters)[0] as keyof typeof changed.monsters;
    changed.monsters[monsterId].hp += 1;
    expect(beforeAntHellCatalog(changed).monsters[monsterId]).toEqual(changed.monsters[monsterId]);

    const changedManifest = structuredClone(manifest);
    changedManifest.sources.push({ path: 'unreviewed', url: 'https://example.test', sha256: 'invalid' });
    expect(beforeAntHellManifest(changedManifest).sources.some(source => source.path === 'unreviewed')).toBe(true);
  });
});
