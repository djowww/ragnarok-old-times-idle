import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest, canonicalArrowHistoricalManifest } from './arrow-craft-historical';
import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import { describe, expect, it } from "vitest";
import { createHash } from 'node:crypto';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import { beforeTarotCardCatalog, beforeTarotCardManifest } from './tarot-card-historical';

const catalog = beforeFourMapExpansionCatalog(beforeArrowCraftingCatalog(currentCatalog));
const manifest = beforeFourMapExpansionManifest(beforeArrowCraftingManifest(currentManifest));

const hash = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value, null, 2) + '\n')
  .digest('hex');

describe('Tarot Card historical projection', () => {
  it('reconstructs the exact catalog and manifest that preceded Tarot support', () => {
    expect(hash(beforeTarotCardCatalog(catalog))).toBe('c7fa90403e7997b651e77e10324a125ef49784bc4f2457a2e8a3a585d6df9c53');
    expect(hash(canonicalArrowHistoricalManifest(beforeTarotCardManifest(manifest)))).toBe('0d172f02f5d38da8a4d3fa5eb115443bfbc277a653a413652b0e60c33b06e5bb');
  });

  it('preserves unrelated catalog and manifest edits', () => {
    const changedCatalog = structuredClone(catalog) as typeof catalog;
    (changedCatalog.monsters['1002'] as { hp: number }).hp++;
    expect(beforeTarotCardCatalog(changedCatalog).monsters['1002'].hp).toBe(changedCatalog.monsters['1002'].hp);

    const changedManifest = structuredClone(manifest) as typeof manifest;
    changedManifest.skillCoverage.supported++;
    expect(beforeTarotCardManifest(changedManifest).skillCoverage.supported).toBe(changedManifest.skillCoverage.supported);
  });
});
