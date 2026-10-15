import baseline from './fixtures/soloAlchemy260Baseline.json';
import type { Catalog } from '../shared/types';

/** Restore only this packet's fields before frozen skill hashes/names.
 * The live soloAlchemy content tests guard the actual promotions separately.
 * Unrelated current values, additions and removals remain visible to the hashes.
 */
export function beforeSoloAlchemySkills(skills: Catalog['skills']): Catalog['skills'] {
  const restored = structuredClone(skills);
  const rows = restored as unknown as Record<string, Record<string, unknown>>;
  for (const [id, saved] of Object.entries(baseline.changedSkills)) {
    const current = rows[id];
    if (!current) throw new Error(`Solo alchemy historical skill missing: ${id}`);
    const prior = saved as unknown as Record<string, unknown>;
    const fields = new Set(['description', 'manualUse', 'implementation', 'unsupportedReason',
      ...(id === 'ws_meltdown' ? ['statusDurationMs'] : [])]);
    const row: Record<string, unknown> = {};
    // Place restored fields in the original catalog order for JSON-based goldens.
    for (const key of Object.keys(prior)) {
      if (fields.has(key)) row[key] = structuredClone(prior[key]);
      else if (Object.hasOwn(current, key)) row[key] = current[key];
    }
    for (const key of Object.keys(current))
      if (!Object.hasOwn(prior, key) && !fields.has(key)) row[key] = current[key];
    rows[id] = row;
  }
  return restored;
}
