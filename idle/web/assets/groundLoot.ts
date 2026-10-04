/** Original client ground items. The BMP inventory icon is a fallback only. */
import type { Item } from '../../shared/types';
import { getItemIcon } from './items';
import { loadActor, type DecodedActor } from './renderer';

export interface GroundLootVisual {
  actor: DecodedActor | null;
  icon: HTMLImageElement | null;
}

const cache = new Map<number, Promise<GroundLootVisual>>();

function resourceName(item: Item): string {
  const file = item.resource.replace(/\\/g, '/').split('/').at(-1) ?? '';
  return file.replace(/\.bmp$/i, '');
}

async function fallbackIcon(item: Item): Promise<HTMLImageElement | null> {
  try {
    const image = new Image();
    image.src = await getItemIcon(item);
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

export function loadGroundLoot(item: Item): Promise<GroundLootVisual> {
  const existing = cache.get(item.id);
  if (existing) return existing;
  const promise = (async () => {
    const name = resourceName(item);
    if (name) {
      const base = `data/sprite/아이템/${name}`;
      const actor = await loadActor({ spr: `${base}.spr`, act: `${base}.act` });
      if (!actor.fallback && actor.body) return { actor, icon: null };
    }
    return { actor: null, icon: await fallbackIcon(item) };
  })();
  cache.set(item.id, promise);
  return promise;
}
