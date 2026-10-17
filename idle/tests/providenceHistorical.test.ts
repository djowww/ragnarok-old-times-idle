import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import rules from '../content/rules.json';
import manifest from '../content/source-manifest.json';
import baseline from './fixtures/providenceBaseline.json';
import { beforeProvidenceCatalog, beforeProvidenceRules, beforeProvidenceManifest } from './providence-historical';

const fileSha = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value, null, 2) + '\n').digest('hex');

describe('Providence and Geffen source synchronization historical projection', () => {
  it('reconstructs all three preceding files exactly', () => {
    expect(fileSha(beforeProvidenceCatalog(catalog))).toBe(baseline.catalog.beforeFileSha256);
    expect(fileSha(beforeProvidenceRules(rules))).toBe(baseline.rules.beforeFileSha256);
    expect(fileSha(beforeProvidenceManifest(manifest))).toBe(baseline.manifest.beforeFileSha256);
  });

  it('keeps unreviewed skill, area and coverage mutations visible', () => {
    const c = structuredClone(catalog);
    c.skills.cr_providence.spCost[0]++;
    expect(beforeProvidenceCatalog(c).skills.cr_providence).toEqual(c.skills.cr_providence);
    const r = structuredClone(rules);
    r.areas.find(area => area.id === 'geffen_dungeon_f1')!.minLevel++;
    expect(beforeProvidenceRules(r).areas.find(area => area.id === 'geffen_dungeon_f1'))
      .toEqual(r.areas.find(area => area.id === 'geffen_dungeon_f1'));
    const m = structuredClone(manifest);
    m.skillCoverage.byClass.novice.supported++;
    expect(beforeProvidenceManifest(m).skillCoverage).toEqual(m.skillCoverage);
    m.skillSources.cr_providence.adaptation += ' unreviewed';
    expect(beforeProvidenceManifest(m).skillSources.cr_providence).toEqual(m.skillSources.cr_providence);
  });
});
