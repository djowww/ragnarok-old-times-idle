import { createHash } from 'node:crypto';
import baseline from './fixtures/arrowCraftHistoricalBaseline.json';
import type { Catalog } from '../shared/types';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

type HistoricalCatalogShape = {
  skills?: Record<string, Catalog['skills'][string] | undefined>;
  items?: Record<string, unknown>;
  source?: unknown;
};

type HistoricalManifestShape = {
  sources?: unknown[];
  inertDropItems?: Array<{ itemId: number; [key: string]: unknown }>;
  skillSources?: Record<string, unknown>;
  skillCoverage?: unknown;
  catalogSha256?: string;
  rulesSha256?: string;
  arrowCraft?: unknown;
};

/** Remove only the pinned Arrow Crafting delta before older frozen projections.
 * Changed rows stay visible so historical hashes continue to catch unrelated drift. */
export function beforeArrowCraftingCatalog<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input) as T & HistoricalCatalogShape;
  const arrow = result.skills?.ac_makingarrow;
  if (result.skills && arrow && sha(arrow) === baseline.catalog.afterSkillSha256)
    result.skills.ac_makingarrow = structuredClone(baseline.catalog.beforeSkill) as Catalog['skills'][string];
  for (const [id, hash] of Object.entries(baseline.catalog.addedItemHashes)) {
    const item = result.items?.[id];
    if (result.items && item && sha(item) === hash) delete result.items[id];
  }
  if (result.source && sha(result.source) === baseline.catalog.afterSourceSha256)
    result.source = structuredClone(baseline.catalog.beforeSource);
  return result;
}

export function beforeArrowCraftingManifest<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input) as T & HistoricalManifestShape;
  if (Array.isArray(result.sources)) {
    result.sources = result.sources.filter((source: unknown) =>
      JSON.stringify(source) !== JSON.stringify(baseline.manifest.addedSource));
  }
  if (Array.isArray(result.inertDropItems)) {
    const addedHashes = baseline.manifest.addedInertDropHashes as Record<string, string>;
    const rows = result.inertDropItems.filter((entry: { itemId: number }) =>
      addedHashes[String(entry.itemId)] !== sha(entry));
    const expectedOrder = baseline.manifest.beforeInertDropItemOrder as number[];
    const canonicalRows = [...rows].sort((a: { itemId: number }, b: { itemId: number }) => a.itemId - b.itemId);
    const byId = new Map<number, (typeof rows)[number]>();
    let unique = true;
    for (const row of rows) {
      if (byId.has(row.itemId)) unique = false;
      byId.set(row.itemId, row);
    }
    const exactHistoricalSet = sha(canonicalRows) === baseline.manifest.afterArrowCanonicalInertDropSha256
      && Array.isArray(expectedOrder)
      && expectedOrder.length === rows.length
      && new Set(expectedOrder).size === expectedOrder.length
      && unique
      && expectedOrder.every((id) => byId.has(id));
    // Arrow Crafting changes exporter order. Restore the captured HEAD ordering only
    // when every remaining row still matches the exact reviewed historical set.
    result.inertDropItems = exactHistoricalSet
      ? expectedOrder.map((id) => byId.get(id)!)
      : rows;
  }
  const skillSource = result.skillSources?.ac_makingarrow;
  if (result.skillSources && skillSource && sha(skillSource) === baseline.manifest.afterSkillSourceSha256)
    result.skillSources.ac_makingarrow = structuredClone(baseline.manifest.beforeSkillSource);
  if (result.skillCoverage && sha(result.skillCoverage) === baseline.manifest.afterSkillCoverageSha256)
    result.skillCoverage = structuredClone(baseline.manifest.beforeSkillCoverage);
  if (result.catalogSha256 === baseline.manifest.afterCatalogSha256)
    result.catalogSha256 = baseline.manifest.beforeCatalogSha256;
  if (result.rulesSha256 === baseline.manifest.afterRulesSha256)
    result.rulesSha256 = baseline.manifest.beforeRulesSha256;
  if (JSON.stringify(result.arrowCraft) === JSON.stringify(baseline.manifest.arrowCraft))
    delete result.arrowCraft;
  return result;
}

export function beforeArrowCraftingRules<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input);
  if (result.sourceHashes?.[baseline.rules.sourcePath] === baseline.rules.sourceHash)
    delete result.sourceHashes[baseline.rules.sourcePath];
  return result;
}
/** Canonicalize only this unordered collection at historical hash boundaries. */
export function canonicalArrowHistoricalManifest<T extends Record<string, any>>(input: T): T {
  const result = structuredClone(input);
  if (Array.isArray(result.inertDropItems))
    result.inertDropItems.sort((a: { itemId: number }, b: { itemId: number }) => a.itemId - b.itemId);
  return result;
}

export function canonicalArrowHistoricalRows<T extends { itemId: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.itemId - b.itemId);
}
