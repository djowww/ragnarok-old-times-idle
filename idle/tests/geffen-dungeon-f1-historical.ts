import { createHash } from 'node:crypto';
import baseline from './fixtures/geffenDungeonF1Baseline.json';

const same = (value: unknown, hash: string) => value !== undefined
  && createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;

/** Reverse only exact Geffen F1 rows so older catalog snapshots remain strict. */
export function beforeGeffenDungeonFloorCatalog<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  for (const [id, row] of Object.entries(baseline.catalog.areas)) {
    const index = result.areas.findIndex((area: { id: string }) => area.id === id);
    if (index < 0 || !same(result.areas[index], row.afterSha256)) continue;
    if ('before' in row) result.areas[index] = structuredClone(row.before);
    else result.areas.splice(index, 1);
  }
  if (result.source?.hash === baseline.catalog.sourceHash.after)
    result.source.hash = baseline.catalog.sourceHash.before;
  return result as T;
}

/** Reverse the exact catalog checksum update from the new floor. */
export function beforeGeffenDungeonFloorManifest<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  if (result.catalogSha256 === baseline.manifest.catalogSha256.after)
    result.catalogSha256 = baseline.manifest.catalogSha256.before;
  return result as T;
}
