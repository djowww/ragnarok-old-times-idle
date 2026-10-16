import { describe, expect, it } from "vitest";
import { createHash } from 'node:crypto';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import { beforeTarotCardCatalog, beforeTarotCardManifest } from './tarot-card-historical';

const hash = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value, null, 2) + '\n')
  .digest('hex');

describe('Tarot Card historical projection', () => {
  it('reconstructs the exact catalog and manifest that preceded Tarot support', () => {
    expect(hash(beforeTarotCardCatalog(catalog))).toBe('c7fa90403e7997b651e77e10324a125ef49784bc4f2457a2e8a3a585d6df9c53');
    expect(hash(beforeTarotCardManifest(manifest))).toBe('30347bfacc2bc7c1b7e4d3520f0bfd49c4fbbea87e8aab128b01d024641d7b75');
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
