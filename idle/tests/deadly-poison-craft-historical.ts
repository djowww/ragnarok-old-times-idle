import { createHash } from 'node:crypto';
import baseline from './fixtures/deadlyPoisonCraftBaseline.json';

const same = (value: unknown, hash: string) => value !== undefined &&
  createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;

/** Reverse only the exact ASC_CDP delta over the prior catalog. */
export function beforeDeadlyPoisonCraftCatalog<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  if (same(result.skills.asc_cdp, baseline.catalogSkill.afterHash))
    result.skills.asc_cdp = structuredClone(baseline.catalogSkill.before);
  if (same(result.source, baseline.catalogSource.afterHash))
    result.source = structuredClone(baseline.catalogSource.before);
  return result as T;
}

export function beforeDeadlyPoisonCraftManifest<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  if (same(result.deadlyPoisonCraft, baseline.manifestDeadlyPoisonCraftAfterHash))
    delete result.deadlyPoisonCraft;
  if (same(result.skillCoverage, baseline.manifestSkillCoverage.afterHash))
    result.skillCoverage = structuredClone(baseline.manifestSkillCoverage.before);
  if (same(result.skillSources.asc_cdp, baseline.manifestSkillSource.afterHash))
    result.skillSources.asc_cdp = structuredClone(baseline.manifestSkillSource.before);
  if (same(result.catalogSha256, baseline.manifestCatalogSha256.afterHash))
    result.catalogSha256 = baseline.manifestCatalogSha256.before;
  if (same(result.rulesSha256, baseline.manifestRulesSha256.afterHash))
    result.rulesSha256 = baseline.manifestRulesSha256.before;
  const adaptationIndex = baseline.manifestAdaptation.index;
  if (same(result.adaptations[adaptationIndex], baseline.manifestAdaptation.afterHash))
    result.adaptations[adaptationIndex] = baseline.manifestAdaptation.before;
  return result as T;
}

export function deadlyPoisonCraftHistoricalBaseline() {
  return baseline;
}
