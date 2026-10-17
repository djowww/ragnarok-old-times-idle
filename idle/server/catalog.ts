import { readFile } from 'node:fs/promises';
import type { Catalog } from '../shared/types.js';

function hasValidSpawnWeights(area: Catalog['areas'][number]): boolean {
  const weights = area.spawnWeights as unknown;
  if (weights === undefined) return true;
  if (typeof weights !== 'object' || weights === null || Array.isArray(weights)) return false;
  const entries = Object.entries(weights);
  return entries.length === area.monsters.length
    && area.monsters.every(id => Object.prototype.hasOwnProperty.call(weights, id)
      && Number.isSafeInteger((weights as Record<number, unknown>)[id])
      && ((weights as Record<number, number>)[id] > 0))
    && entries.every(([id, weight]) => String(Number(id)) === id
      && area.monsters.includes(Number(id))
      && Number.isSafeInteger(weight)
      && Number(weight) > 0);
}
export async function loadCatalog(path = 'content/catalog.json'): Promise<Catalog> {
  const catalog = JSON.parse(await readFile(path, 'utf8')) as Catalog;
  const areaIds = new Set(catalog.areas?.map(area => area.id));
  if (!catalog.version || !catalog.classes?.novice || !catalog.areas?.length || areaIds.size !== catalog.areas.length ||
      catalog.areas.some(area => !area.map || area.monsters.some(id => !catalog.monsters[id])
        || !hasValidSpawnWeights(area)) ||
      !catalog.items?.[1201] || !catalog.items?.[501]) throw new Error('Invalid idle catalog');
  return catalog;
}
