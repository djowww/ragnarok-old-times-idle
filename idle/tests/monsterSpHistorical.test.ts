import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest, canonicalArrowHistoricalManifest } from './arrow-craft-historical';
import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import { describe, expect, it } from 'vitest';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import { beforeMonsterSpCatalog, beforeMonsterSpManifest, monsterSpHistoricalJsonHash } from './monster-sp-historical';

const rawCatalog = beforeFourMapExpansionCatalog(beforeArrowCraftingCatalog(currentCatalog));
const rawManifest = beforeFourMapExpansionManifest(beforeArrowCraftingManifest(currentManifest));

describe('audited monster SP and Shockwave catalog delta', () => {
  it('reconstructs the exact catalog bytes from before the SP and skill promotion', () => {
    expect(monsterSpHistoricalJsonHash(beforeMonsterSpCatalog(rawCatalog)))
      .toBe('ab482eed19c5a38e66ded5ca828460408206aac5ee4212ff4ed97129479818d3');
    const prior = beforeMonsterSpManifest(rawManifest);
    expect(prior.catalogSha256).toBe('97d6e6ac1aee65d6ab0dd54490a3850d8ad8f8297e9d74b542e4e788294ed648');
    expect(prior.skillCoverage).toMatchObject({ supported: 298, unsupported: 50 });
  });

  it('reconstructs the exact source manifest bytes before the SP and skill promotion', () => {
    expect(monsterSpHistoricalJsonHash(canonicalArrowHistoricalManifest(beforeMonsterSpManifest(rawManifest))))
      .toBe('13368e7a09d8068331d5ad88c4835e2be42d6ccaf64b5a4a262e8f17cbe53706');
  });

  it('keeps mutations to monster SP, Shockwave inputs, and coverage visible', () => {
    const changed = structuredClone(rawCatalog);
    changed.monsters['1191'].maxSp = 183;
    changed.skills.ht_shockwave.spCost[0]++;
    const prior = beforeMonsterSpCatalog(changed);
    expect(prior.monsters['1191'].maxSp).toBe(183);
    expect(prior.skills.ht_shockwave.spCost[0]).toBe(changed.skills.ht_shockwave.spCost[0]);

    const changedManifest = structuredClone(rawManifest);
    changedManifest.skillCoverage.supported++;
    expect(beforeMonsterSpManifest(changedManifest).skillCoverage.supported).toBe(changedManifest.skillCoverage.supported);
  });
});
