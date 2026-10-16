import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import baseline from './fixtures/suffragiumBaseline.json';
import { beforeSuffragiumCatalog, beforeSuffragiumManifest } from './suffragium-historical';

const catalog = beforeFourMapExpansionCatalog(currentCatalog);
const manifest = beforeFourMapExpansionManifest(currentManifest);

const prettySha = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value, null, 2) + '\n').digest('hex');

describe('Suffragium historical projection', () => {
  it('reconstructs the exact pinned catalog and manifest that preceded the promotion', () => {
    expect(prettySha(beforeSuffragiumCatalog(catalog))).toBe(baseline.catalog.beforeFileSha256);
    expect(prettySha(beforeSuffragiumManifest(manifest))).toBe(baseline.manifest.beforeFileSha256);
  });

  it('preserves an unrelated catalog edit while reversing only exact Suffragium fields', () => {
    const changed = structuredClone(catalog);
    (changed as Record<string, unknown>).unrelatedFixtureMutation = 'preserved';
    const restored = beforeSuffragiumCatalog(changed);
    expect((restored as Record<string, unknown>).unrelatedFixtureMutation).toBe('preserved');
    expect(restored.skills.pr_suffragium).toEqual(baseline.catalog.beforeSkill);
  });
});
