import { readFileSync } from 'node:fs';

export const historicalCadenceFixture = JSON.parse(readFileSync(
  new URL('./fixtures/classCadenceHistorical.json', import.meta.url), 'utf8',
)) as { sourceCommit: string; sourceBlobSha: string; classes: Record<string, CadenceRow> };

type CadenceRow = { attackMotion?: unknown; weaponAspd?: unknown };
const priorClasses = historicalCadenceFixture.classes;

/** Restore only the two cadence fields present in the frozen historical catalog. */
export function beforeHistoricalClassCadence<T extends Record<string, CadenceRow>>(classes: T): T {
  const restored = structuredClone(classes);
  const rows = restored as Record<string, CadenceRow>;
  for (const [id, prior] of Object.entries(priorClasses)) {
    const row = rows[id];
    if (!row) throw new Error(`Historical cadence fixture class missing: ${id}`);
    for (const field of ['attackMotion', 'weaponAspd'] as const) {
      if (Object.hasOwn(prior, field)) row[field] = structuredClone(prior[field]);
      else delete row[field];
    }
  }
  return restored;
}
