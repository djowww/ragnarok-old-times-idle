import baseline from './fixtures/sageFields256Baseline.json';
import teleportBaseline from './fixtures/teleport259Baseline.json';
import type { Catalog } from '../shared/types';
/** Restore only this packet's checked changes before older domain hashes.
 * sageFieldsContent and itemDefenseElementContent verify the live changes. */
export function beforeSageFieldSkills(skills: Catalog['skills']): Catalog['skills'] {
  const restored = beforeTeleportSkills(skills);
  for (const [id, row] of Object.entries(baseline.changedSkills)) restored[id] = structuredClone(row) as Catalog['skills'][string];
  return restored;
}
/** Exact prior row; teleportContent independently guards the one live promotion. */
export function beforeTeleportSkills(skills: Catalog['skills']): Catalog['skills'] {
  return { ...structuredClone(skills), al_teleport: structuredClone(teleportBaseline.teleport) as Catalog['skills'][string] };
}
export function beforeSagePropertyItems(items: Catalog['items']): Catalog['items'] {
  const restored = structuredClone(items);
  for (const [id, row] of Object.entries(baseline.changedItems)) {
    if (row) restored[Number(id)] = structuredClone(row) as Catalog['items'][number];
    else delete restored[Number(id)];
  }
  return restored;
}
