import { createHash } from 'node:crypto';
import baseline from './fixtures/weaponRepairHistoricalBaseline.json';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type CatalogShape = { skills?: Record<string, unknown>; source?: { hash?: string } };
type ManifestShape = {
  skillSources?: Record<string, unknown>;
  skillCoverage?: { supported: number; unsupported: number; byClass: Record<string, { supported: number; unsupported: number }>; supportedSourceNames: string[]; unavailable: Array<{ skillId: string; sourceName: string; reason: string }> };
  catalogSha256?: string;
};

/** Reverse only the exact Weapon Repair export delta for older frozen projections. */
export function beforeWeaponRepairCatalog<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input) as T & CatalogShape;
  const skill = result.skills?.bs_repairweapon;
  if (skill && sha(skill) === baseline.afterSkillSha256)
    result.skills!.bs_repairweapon = structuredClone(baseline.beforeSkill);
  if (result.source?.hash === baseline.afterCatalogSourceHash)
    result.source!.hash = baseline.beforeCatalogSourceHash;
  return result;
}

export function beforeWeaponRepairManifest<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input) as T & ManifestShape;
  const skillSource = result.skillSources?.bs_repairweapon;
  if (skillSource && sha(skillSource) === baseline.afterSkillSourceSha256)
    result.skillSources!.bs_repairweapon = structuredClone(baseline.beforeSkillSource);
  const coverage = result.skillCoverage;
  if (coverage && sha(coverage) === baseline.afterSkillCoverageSha256) {
    coverage.supported--;
    coverage.unsupported++;
    for (const id of ['blacksmith', 'whitesmith']) {
      coverage.byClass[id].supported--;
      coverage.byClass[id].unsupported++;
    }
    coverage.supportedSourceNames = coverage.supportedSourceNames.filter(name => name !== 'BS_REPAIRWEAPON');
    coverage.unavailable.splice(baseline.beforeUnavailableIndex, 0, structuredClone(baseline.beforeUnavailableEntry));
  }
  if (result.catalogSha256 === baseline.afterCatalogSha256)
    result.catalogSha256 = baseline.beforeCatalogSha256;
  return result;
}
