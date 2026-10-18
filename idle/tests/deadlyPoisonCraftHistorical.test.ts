import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import { beforeDeadlyPoisonCraftCatalog, beforeDeadlyPoisonCraftManifest, deadlyPoisonCraftHistoricalBaseline } from './deadly-poison-craft-historical';

const hash = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value, null, 2) + '\n').digest('hex');

describe('strict ASC_CDP historical projection', () => {
  it('reconstructs the prior complete catalog from only the exact skill delta', () => {
    const baseline = deadlyPoisonCraftHistoricalBaseline();
    expect(hash(beforeDeadlyPoisonCraftCatalog(catalog))).toBe(baseline.beforeCatalogSha256);
  });

  it('preserves unrelated catalog and manifest mutations', () => {
    const changed = structuredClone(catalog);
    changed.items['1002'].sellPrice++;
    expect(beforeDeadlyPoisonCraftCatalog(changed).items['1002']).toEqual(changed.items['1002']);

    const changedManifest = structuredClone(manifest);
    changedManifest.skillCoverage.supported++;
    expect(beforeDeadlyPoisonCraftManifest(changedManifest).skillCoverage).toEqual(changedManifest.skillCoverage);

    const projected = beforeDeadlyPoisonCraftManifest(manifest);
    const baseline = deadlyPoisonCraftHistoricalBaseline();
    expect(projected.rulesSha256).toBe(baseline.manifestRulesSha256.before);
    expect(projected.adaptations[baseline.manifestAdaptation.index]).toBe(baseline.manifestAdaptation.before);

    const changedAdaptation = structuredClone(manifest);
    changedAdaptation.adaptations[baseline.manifestAdaptation.index] += ' extra';
    expect(beforeDeadlyPoisonCraftManifest(changedAdaptation).adaptations[baseline.manifestAdaptation.index])
      .toBe(changedAdaptation.adaptations[baseline.manifestAdaptation.index]);
  });
});
