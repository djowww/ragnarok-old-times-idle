import baseline from './fixtures/sageFields256Baseline.json';
import type { Catalog } from '../shared/types';
/** Restore only this packet's checked changes before older domain hashes.
 * sageFieldsContent and itemDefenseElementContent verify the live changes. */
export function beforeSageFieldSkills(skills: Catalog['skills']): Catalog['skills'] {
  const restored = structuredClone(skills);
  for (const [id, row] of Object.entries(baseline.changedSkills)) restored[id] = structuredClone(row) as Catalog['skills'][string];
  return restored;
}
export function beforeSagePropertyItems(items: Catalog['items']): Catalog['items'] {
  const restored = structuredClone(items);
  for (const [id, row] of Object.entries(baseline.changedItems)) {
    if (row) restored[Number(id)] = structuredClone(row) as Catalog['items'][number];
    else delete restored[Number(id)];
  }
  return restored;
}
