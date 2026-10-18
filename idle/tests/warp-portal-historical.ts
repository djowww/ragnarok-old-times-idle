import { createHash } from 'node:crypto';
import baseline from './fixtures/warpPortalBaseline.json';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

type CatalogProjection = {
  skills?: Record<string, unknown>;
  source?: { files?: string[]; hash?: string; [key: string]: unknown };
  [key: string]: unknown;
};
type ManifestProjection = {
  sources?: Array<Record<string, unknown>>;
  skillSources?: Record<string, unknown>;
  skillCoverage?: { supported?: number; unsupported?: number; byClass?: Record<string, unknown>; [key: string]: unknown };
  catalogSha256?: string;
  rulesSha256?: string;
  warpPortal?: unknown;
  [key: string]: unknown;
};

/** Reverses only the reviewed Warp Portal export delta before older frozen snapshots. */
export function beforeWarpPortalCatalog<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input) as T & CatalogProjection;
  const warp = result.skills?.al_warp;
  if (result.skills && warp && sha(warp) === baseline.catalog.afterSkillSha256)
    result.skills.al_warp = structuredClone(baseline.catalog.beforeSkill);
  for (const [field, hash] of Object.entries(baseline.catalog.mapFlags)) {
    const maps = result[field];
    if (maps !== undefined && sha(maps) === hash) delete result[field];
  }
  const source = result.source;
  if (source && sha(source) === baseline.catalog.afterSourceSha256) {
    const added = new Set(baseline.catalog.addedSourcePaths);
    if (!Array.isArray(source.files) || !baseline.catalog.addedSourcePaths.every(path => source.files!.includes(path)))
      throw new Error('Warp Portal source projection fingerprint matched without all pinned source paths');
    source.files = source.files.filter(path => !added.has(path));
    source.hash = baseline.catalog.beforeSourceHash;
  }
  return result;
}

/** Removes Warp-only source, coverage and metadata after exact post-export fingerprints match. */
export function beforeWarpPortalManifest<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input) as T & ManifestProjection;
  if (Array.isArray(result.sources)) {
    const hashes = baseline.manifest.addedSourceHashes as Record<string, string>;
    result.sources = result.sources.filter(source => hashes[source.path as string] !== sha(source));
  }
  const warpSource = result.skillSources?.al_warp;
  if (result.skillSources && warpSource && sha(warpSource) === baseline.manifest.afterSkillSourceSha256)
    result.skillSources.al_warp = structuredClone(baseline.manifest.beforeSkillSource);
  const coverage = result.skillCoverage;
  if (coverage && sha(coverage) === baseline.manifest.afterSkillCoverageSha256) {
    coverage.supported = baseline.manifest.beforeSkillCoverage.supported;
    coverage.unsupported = baseline.manifest.beforeSkillCoverage.unsupported;
    if (coverage.byClass) {
      for (const [classId, oldCoverage] of Object.entries(baseline.manifest.beforeSkillCoverage.byClass))
        coverage.byClass[classId] = structuredClone(oldCoverage);
    }
  }
  if (result.catalogSha256 === baseline.manifest.afterCatalogSha256)
    result.catalogSha256 = baseline.manifest.beforeCatalogSha256;
  if (result.rulesSha256 === baseline.manifest.afterRulesSha256)
    result.rulesSha256 = baseline.manifest.beforeRulesSha256;
  if (JSON.stringify(result.warpPortal) === JSON.stringify(baseline.manifest.warpPortal))
    delete result.warpPortal;
  return result;
}

export function beforeWarpPortalRules<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input);
  const hashes = baseline.rules.addedSourceHashes as Record<string, string>;
  if (result.sourceHashes) {
    for (const [path, hash] of Object.entries(hashes))
      if (result.sourceHashes[path] === hash) delete result.sourceHashes[path];
  }
  return result;
}
