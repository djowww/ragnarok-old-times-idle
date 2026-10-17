import { createHash } from 'node:crypto';
import baseline from './fixtures/fourMapExpansionBaseline.json';
import { beforeGeffenDungeonFloorCatalog, beforeGeffenDungeonFloorManifest } from './geffen-dungeon-f1-historical';

const same = (value: unknown, hash: string) => value !== undefined
  && createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;

/** Undo only exact additions from the four-map release. Unknown edits stay visible to older snapshots. */
export function beforeFourMapExpansionCatalog<T>(input: T): T {
  const result = beforeGeffenDungeonFloorCatalog(input) as Record<string, any>;
  for (const [id, hash] of Object.entries(baseline.catalog.addedItems))
    if (same(result.items?.[id], hash)) delete result.items[id];
  for (const [id, hash] of Object.entries(baseline.catalog.addedMonsters))
    if (same(result.monsters?.[id], hash)) delete result.monsters[id];
  result.areas = result.areas.filter((area: { id: string }) => {
    const hash = (baseline.catalog.addedAreas as Record<string, string>)[area.id];
    return !hash || !same(area, hash);
  });
  if (result.source?.hash === baseline.catalog.sourceHash.after)
    result.source.hash = baseline.catalog.sourceHash.before;
  return result as T;
}

export function beforeFourMapExpansionRules<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  result.areas = result.areas.filter((area: { id: string }) => {
    const hash = (baseline.rules.addedAreas as Record<string, string>)[area.id];
    return !hash || !same(area, hash);
  });
  return result as T;
}

export function beforeFourMapExpansionManifest<T>(input: T): T {
  const result = beforeGeffenDungeonFloorManifest(input) as Record<string, any>;
  if (same(result.inertDropItems, baseline.manifest.inertDropsAfterHash)) {
    const additions = baseline.manifest.addedInertDrops as Record<string, string>;
    const moved = baseline.manifest.relocatedInertDrop;
    const relocated = result.inertDropItems[moved.afterIndex];
    if (relocated?.itemId === moved.itemId && same(relocated, moved.entryHash)) {
      result.inertDropItems.splice(moved.afterIndex, 1);
      result.inertDropItems = result.inertDropItems.filter((entry: { itemId: number }) =>
        !additions[entry.itemId] || !same(entry, additions[entry.itemId]));
      result.inertDropItems.splice(moved.beforeIndex, 0, relocated);
    }
  }
  for (const [key, additions] of Object.entries(baseline.manifest.addedBehaviorIds)) {
    const values = result.monsterBehavior?.[key];
    if (same(values, baseline.manifest.behaviorAfterHashes[key as keyof typeof baseline.manifest.behaviorAfterHashes]))
      result.monsterBehavior[key] = values.filter((id: number) => !additions.includes(id));
  }
  if (same(result.mapSpawnValidation?.maps, baseline.manifest.mapsAfterHash))
    result.mapSpawnValidation.maps = result.mapSpawnValidation.maps.filter(
      (map: string) => !baseline.manifest.addedMaps.includes(map));
  if (result.catalogSha256 === baseline.manifest.catalogSha256.after)
    result.catalogSha256 = baseline.manifest.catalogSha256.before;
  if (result.rulesSha256 === baseline.manifest.rulesSha256.after)
    result.rulesSha256 = baseline.manifest.rulesSha256.before;
  return result as T;
}
