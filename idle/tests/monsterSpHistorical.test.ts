import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import rawManifest from '../content/source-manifest.json';
import { beforeMonsterSpCatalog, beforeMonsterSpManifest, monsterSpHistoricalJsonHash } from './monster-sp-historical';

describe('audited monster SP and Shockwave catalog delta', () => {
  it('reconstructs the exact catalog bytes from before the SP and skill promotion', () => {
    expect(monsterSpHistoricalJsonHash(beforeMonsterSpCatalog(rawCatalog)))
      .toBe('f05e0a2f37dba20df233e6d43009713ccec505d1cec956c13105f3523dd7fff1');
    const prior = beforeMonsterSpManifest(rawManifest);
    expect(prior.catalogSha256).toBe('f05e0a2f37dba20df233e6d43009713ccec505d1cec956c13105f3523dd7fff1');
    expect(prior.skillCoverage).toMatchObject({ supported: 267, unsupported: 81 });
  });

  it('reconstructs the exact source manifest bytes before the SP and skill promotion', () => {
    expect(monsterSpHistoricalJsonHash(beforeMonsterSpManifest(rawManifest)))
      .toBe('bc12144829a7c64193ca60d61ae5b64da80c9e8b04d513843d4983f9c794613d');
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
    expect(beforeMonsterSpManifest(changedManifest).skillCoverage.supported).toBe(269);
  });
});
