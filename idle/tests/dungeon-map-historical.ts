import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import { beforePharmacyCatalog, beforePharmacyManifest } from './pharmacy-historical.js';
import { createHash } from 'node:crypto';
import baseline from './fixtures/dungeonMapExpansionBaseline.json';

/** Reverse only this audited world delta so older package snapshots stay strict. */
export function beforeDungeonExpansionCatalog<T>(input: T): T {
  const result = beforePharmacyCatalog(beforeFourMapExpansionCatalog(input)) as Record<string, any>;
  const same = (value: unknown, hash: string) => value !== undefined &&
    createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;
  for (const [id, hash] of Object.entries(baseline.newEntryHashes.items))
    if (same(result.items[id], hash)) delete result.items[id];
  for (const [id, hash] of Object.entries(baseline.newEntryHashes.monsters))
    if (same(result.monsters[id], hash)) delete result.monsters[id];
  for (const [id, change] of Object.entries(baseline.itemTypes))
    if (result.items[id]?.type === change.after) result.items[id].type = change.before;
  result.areas = result.areas.filter((area: { id: string }) => {
    const hash = (baseline.newEntryHashes.areas as Record<string, string>)[area.id];
    return !hash || !same(area, hash);
  });
  for (const [id, change] of Object.entries(baseline.areaPools)) {
    const area = result.areas.find((candidate: { id: string }) => candidate.id === id);
    if (area && JSON.stringify(area.monsters) === JSON.stringify(change.after)) area.monsters = [...change.before];
  }
  if (JSON.stringify(result.source) === JSON.stringify(baseline.afterSource)) result.source = structuredClone(baseline.beforeSource);
  return result as T;
}
export function beforeDungeonExpansionManifest<T>(input: T): T {
  const result = beforePharmacyManifest(beforeFourMapExpansionManifest(input)) as Record<string, any>;
  result.sources = result.sources.filter((source: unknown) =>
    !baseline.addedSources.some(added => JSON.stringify(source) === JSON.stringify(added)));
  return result as T;
}
