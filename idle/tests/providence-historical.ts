import { createHash } from 'node:crypto';
import baseline from './fixtures/providenceBaseline.json';

const same = (value: unknown, hash: string) => value !== undefined
  && createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;

/** Reverse only reviewed Providence and Geffen source-sync deltas. */
export function beforeProvidenceCatalog<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  if (same(result.skills?.cr_providence, baseline.catalog.afterSkillSha256))
    result.skills.cr_providence = structuredClone(baseline.catalog.beforeSkill);
  if (result.source?.hash === baseline.catalog.sourceHash.after)
    result.source.hash = baseline.catalog.sourceHash.before;
  return result as T;
}

export function beforeProvidenceRules<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  for (const [id, row] of Object.entries(baseline.rules.areas)) {
    const index = result.areas.findIndex((area: { id: string }) => area.id === id);
    if (index < 0 || !same(result.areas[index], row.afterSha256)) continue;
    if ('before' in row) result.areas[index] = structuredClone(row.before);
    else result.areas.splice(index, 1);
  }
  return result as T;
}

export function beforeProvidenceManifest<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  if (same(result.skillSources?.cr_providence, baseline.manifest.afterSkillSourceSha256))
    result.skillSources.cr_providence = structuredClone(baseline.manifest.beforeSkillSource);
  const coverage = result.skillCoverage;
  if (same(coverage, baseline.manifest.afterCoverageSha256)) {
    const before = baseline.manifest.beforeCoverage;
    coverage.supported = before.supported;
    coverage.unsupported = before.unsupported;
    coverage.byClass.crusader = structuredClone(before.crusader);
    coverage.byClass.paladin = structuredClone(before.paladin);
    coverage.supportedSourceNames = coverage.supportedSourceNames.filter((name: string) => name !== 'CR_PROVIDENCE');
    coverage.unavailable.splice(before.unavailableIndex, 0, structuredClone(before.unavailableEntry));
  }
  if (same(result.mapSpawnValidation?.maps, baseline.manifest.afterMapsSha256))
    result.mapSpawnValidation.maps = structuredClone(baseline.manifest.beforeMaps);
  if (result.catalogSha256 === baseline.manifest.catalogSha256.after)
    result.catalogSha256 = baseline.manifest.catalogSha256.before;
  if (result.rulesSha256 === baseline.manifest.rulesSha256.after)
    result.rulesSha256 = baseline.manifest.rulesSha256.before;
  return result as T;
}
