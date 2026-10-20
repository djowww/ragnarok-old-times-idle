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
    expect(hash(beforeTarotCardCatalog(catalog))).toBe('075b1c2e0b68a519339632ba7ba1ab6538a3d44ec0a0a2c6b4f738b5163a6173');
    expect(hash(canonicalArrowHistoricalManifest(beforeTarotCardManifest(manifest)))).toBe('71c38cab11e505a57872d030e18baf745211a8237fc61868241cc146ee265757');
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
