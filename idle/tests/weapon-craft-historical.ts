import { createHash } from 'node:crypto';
import baseline from './fixtures/weaponCraftHistoricalBaseline.json';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (value: unknown, hash: string) => value !== undefined && sha(value) === hash;

/** Reverse only exact Weapon Crafting export rows; any altered feature record stays visible. */
export function beforeWeaponCraftingCatalog<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  for (const [id, hash] of Object.entries(baseline.catalog.addedItems))
    if (same(result.items?.[id], hash)) delete result.items[id];
  for (const [id, row] of Object.entries(baseline.catalog.changedItems))
    if (same(result.items?.[id], row.afterHash)) result.items[id] = structuredClone(row.before);
  for (const [id, row] of Object.entries(baseline.catalog.changedSkills))
    if (same(result.skills?.[id], row.afterHash)) result.skills[id] = structuredClone(row.before);
  if (same(result.source, baseline.catalog.source.afterHash)) result.source = structuredClone(baseline.catalog.source.before);
  return result as T;
}

/** Reverse only exact Weapon Crafting manifest deltas; mutated coverage and rows remain observable. */
export function beforeWeaponCraftingManifest<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  for (const [id, hash] of Object.entries(baseline.manifest.addedInertItems)) {
    const index = result.inertDropItems?.findIndex((row: { itemId: number }) =>
      row.itemId === Number(id) && same(row, hash));
    if (index !== undefined && index >= 0) result.inertDropItems.splice(index, 1);
  }
  for (const [id, row] of Object.entries(baseline.manifest.changedSkills))
    if (same(result.skillSources?.[id], row.afterHash)) result.skillSources[id] = structuredClone(row.before);
  if (same(result.skillCoverage, baseline.manifest.skillCoverage.afterHash))
    result.skillCoverage = structuredClone(baseline.manifest.skillCoverage.before);
  if (same(result.catalogSha256, baseline.manifest.catalogSha256.afterHash))
    result.catalogSha256 = baseline.manifest.catalogSha256.before;
  if (same(result.weaponCraft, baseline.manifest.addedFields.weaponCraft)) delete result.weaponCraft;
  return result as T;
}
