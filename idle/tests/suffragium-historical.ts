import { createHash } from 'node:crypto';
import baseline from './fixtures/suffragiumBaseline.json';
import { beforeAntHellCatalog, beforeAntHellManifest } from './ant-hell-historical.js';

const same = (value: unknown, hash: string) => value !== undefined
  && createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;

/** Reverse only the exact Suffragium promotion so older snapshots stay stable. */
export function beforeSuffragiumCatalog<T>(input: T): T {
  const result = structuredClone(beforeAntHellCatalog(input)) as Record<string, any>;
  if (same(result.skills?.pr_suffragium, baseline.catalog.afterSkillSha256))
    result.skills.pr_suffragium = structuredClone(baseline.catalog.beforeSkill);
  if (result.source?.hash === baseline.catalog.afterSourceHash)
    result.source.hash = baseline.catalog.beforeSourceHash;
  return result as T;
}

/** Reverse only Suffragium's source-manifest and coverage delta. */
export function beforeSuffragiumManifest<T>(input: T): T {
  const result = structuredClone(beforeAntHellManifest(input)) as Record<string, any>;
  const source = result.skillSources?.pr_suffragium;
  if (same(source, baseline.manifest.afterSkillSourceSha256))
    result.skillSources.pr_suffragium = structuredClone(baseline.manifest.beforeSkillSource);

  const coverage = result.skillCoverage;
  if (same(coverage, baseline.manifest.afterCoverageSha256)) {
    const before = baseline.manifest.beforeCoverage;
    coverage.supported = before.supported;
    coverage.unsupported = before.unsupported;
    coverage.byClass.priest = structuredClone(before.priest);
    coverage.byClass.high_priest = structuredClone(before.high_priest);
    coverage.supportedSourceNames = coverage.supportedSourceNames.filter((name: string) => name !== 'PR_SUFFRAGIUM');
    coverage.unavailable.splice(before.unavailableIndex, 0, structuredClone(before.unavailableEntry));
    coverage.combatExpansion = coverage.combatExpansion.filter((name: string) => name !== 'PR_SUFFRAGIUM');
  }
  if (result.rulesSha256 === baseline.manifest.afterRulesSha256)
    result.rulesSha256 = baseline.manifest.beforeRulesSha256;
  if (result.catalogSha256 === baseline.manifest.afterCatalogSha256)
    result.catalogSha256 = baseline.manifest.beforeCatalogSha256;
  const adaptations = result.adaptations as string[] | undefined;
  if (adaptations?.[baseline.manifest.afterAdaptationIndex] === baseline.manifest.afterAdaptationEntry)
    adaptations.splice(baseline.manifest.afterAdaptationIndex, 1);
  return result as T;
}
