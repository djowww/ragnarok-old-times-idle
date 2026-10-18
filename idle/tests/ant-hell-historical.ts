import { beforeWeaponCraftingCatalog, beforeWeaponCraftingManifest } from './weapon-craft-historical.js';
import { createHash } from 'node:crypto';
import baseline from './fixtures/antHellBaseline.json';

const same = (value: unknown, hash: string) => value !== undefined
  && createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;

/** Reverse only exact Ant Hell export records for older content snapshots. */
export function beforeAntHellCatalog<T>(input: T): T {
  const result = structuredClone(beforeWeaponCraftingCatalog(input)) as Record<string, any>;
  for (const [id, hash] of Object.entries(baseline.catalog.newItems))
    if (same(result.items?.[id], hash)) delete result.items[id];
  for (const [id, hash] of Object.entries(baseline.catalog.newMonsters))
    if (same(result.monsters?.[id], hash)) delete result.monsters[id];
  result.areas = result.areas.filter((area: { id: string }) => {
    const hash = (baseline.catalog.newAreas as Record<string, string>)[area.id];
    return !hash || !same(area, hash);
  });
  if (same(result.source, baseline.catalog.afterSourceHash))
    result.source = structuredClone(baseline.catalog.beforeSource);
  return result as T;
}

/** Reverse exact source-manifest metadata changes while keeping unrelated edits. */
export function beforeAntHellManifest<T>(input: T): T {
  const result = structuredClone(beforeWeaponCraftingManifest(input)) as Record<string, any>;
  result.sources = result.sources.filter((source: unknown) =>
    !baseline.manifest.addedSources.some(added => JSON.stringify(source) === JSON.stringify(added)));
  for (const [key, change] of Object.entries(baseline.manifest.changedFields)) {
    if (same(result[key], change.afterHash)) result[key] = structuredClone(change.before);
  }
  return result as T;
}
