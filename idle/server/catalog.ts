import { readFile } from 'node:fs/promises';
import type { Catalog } from '../shared/types.js';
export async function loadCatalog(path = 'content/catalog.json'): Promise<Catalog> {
  const catalog = JSON.parse(await readFile(path, 'utf8')) as Catalog;
  if (!catalog.version || !catalog.classes?.novice || catalog.areas?.length !== 10 || !catalog.items?.[1201] || !catalog.items?.[501]) throw new Error('Invalid idle catalog');
  return catalog;
}
