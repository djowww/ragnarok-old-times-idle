import { createHash } from 'node:crypto';
import baseline from './fixtures/battleChantBaseline.json';

const same = (value: unknown, hash: string) => value !== undefined
  && createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;

/** Reverse only the exact Battle Chant records so older catalog snapshots remain stable. */
export function beforeBattleChantCatalog<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  if (same(result.skills?.pa_gospel, baseline.catalogSkill.afterHash)) {
    result.skills.pa_gospel = structuredClone(baseline.catalogSkill.before);
  }
  if (same(result.source, baseline.catalogSource.afterHash)) {
    result.source = structuredClone(baseline.catalogSource.before);
  }
  return result as T;
}

export function beforeBattleChantManifest<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  if (same(result.skillCoverage, baseline.manifestCoverage.afterHash)) {
    const coverage = result.skillCoverage;
    coverage.supported = baseline.manifestCoverage.supported;
    coverage.unsupported = baseline.manifestCoverage.unsupported;
    coverage.byClass.paladin = structuredClone(baseline.manifestCoverage.paladin);
    coverage.supportedSourceNames = coverage.supportedSourceNames.filter((name: string) => name !== 'PA_GOSPEL');
    coverage.combatExpansion = coverage.combatExpansion.filter((name: string) => name !== 'PA_GOSPEL');
    coverage.unavailable.splice(
      baseline.manifestCoverage.unavailableIndex,
      0,
      structuredClone(baseline.manifestCoverage.unavailableEntry),
    );
  }
  if (same(result.skillSources?.pa_gospel, baseline.manifestSkill.afterHash)) {
    result.skillSources.pa_gospel = structuredClone(baseline.manifestSkill.before);
  }
  if (result.catalogSha256 === baseline.manifestCatalogSha256.after) {
    result.catalogSha256 = baseline.manifestCatalogSha256.before;
  }
  return result as T;
}
