import { readFile } from 'node:fs/promises';
import type { Catalog } from '../shared/types.js';
export async function loadCatalog(path = 'content/catalog.json'): Promise<Catalog> {
  const catalog = JSON.parse(await readFile(path, 'utf8')) as Catalog;
  const areaIds = new Set(catalog.areas?.map(area => area.id));
  if (!catalog.version || !catalog.classes?.novice || !catalog.areas?.length || areaIds.size !== catalog.areas.length ||
      catalog.areas.some(area => !area.map || area.monsters.some(id => !catalog.monsters[id])) ||
      !catalog.items?.[1201] || !catalog.items?.[501]) throw new Error('Invalid idle catalog');
  return catalog;
}
