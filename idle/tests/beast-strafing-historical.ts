import { createHash } from 'node:crypto';
import baseline from './fixtures/beastStrafingBaseline.json';
import { beforeTarotCardCatalog, beforeTarotCardManifest } from './tarot-card-historical.js';

const same = (value: unknown, hash: string) => value !== undefined
  && createHash('sha256').update(JSON.stringify(value)).digest('hex') === hash;

/** Reverse only the exact Beast Strafing content export delta. */
export function beforeBeastStrafingCatalog<T>(input: T): T {
  const result = beforeTarotCardCatalog(input) as Record<string, any>;
  for (const [id, change] of Object.entries(baseline.catalogSkills))
    if (same(result.skills?.[id], change.afterHash))
      result.skills[id] = structuredClone(change.before);
  for (const [id, change] of Object.entries(baseline.catalogItems))
    if (same(result.items?.[id], change.afterHash))
      result.items[id] = structuredClone(change.before);
  for (const [key, change] of Object.entries(baseline.catalogFields))
    if (same(result[key], change.afterHash))
      result[key] = structuredClone(change.before);
  return result as T;
}

/** Reverse only the exact Beast Strafing source-manifest delta. */
export function beforeBeastStrafingManifest<T>(input: T): T {
  const result = beforeTarotCardManifest(input) as Record<string, any>;
  for (const [id, change] of Object.entries(baseline.manifestSkills))
    if (same(result.skillSources?.[id], change.afterHash))
      result.skillSources[id] = structuredClone(change.before);
  for (const [key, change] of Object.entries(baseline.manifestFields))
    if (same(result[key], change.afterHash))
      result[key] = structuredClone(change.before);
  return result as T;
}
