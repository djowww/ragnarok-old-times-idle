import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import { loadCatalog } from '../server/catalog';

async function loadWithSpawnWeights(spawnWeights: Record<number, number>) {
  const dir = await mkdtemp(join(tmpdir(), 'ragidle-spawn-weights-'));
  try {
    const candidate = structuredClone(catalog) as unknown as {
      areas: Array<{ id: string; spawnWeights?: Record<number, number> }>;
    };
    candidate.areas.find(area => area.id === 'geffen_dungeon_f1')!.spawnWeights = spawnWeights;
    const path = join(dir, 'catalog.json');
    await writeFile(path, JSON.stringify(candidate));
    return await loadCatalog(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('catalog map spawn weights', () => {
  it('accepts a complete set of positive integer weights', async () => {
    await expect(loadWithSpawnWeights({ 1035: 30, 1031: 15, 1077: 25 }))
      .resolves.toHaveProperty('areas');
  });

  it.each([
    ['zero', { 1035: 0, 1031: 15, 1077: 25 }],
    ['negative', { 1035: -1, 1031: 15, 1077: 25 }],
    ['fractional', { 1035: 30.5, 1031: 15, 1077: 25 }],
    ['missing monster', { 1035: 30, 1031: 15 }],
    ['unknown monster', { 1035: 30, 1031: 15, 1077: 25, 999999: 1 }],
  ])('rejects %s weights', async (_label, weights) => {
    await expect(loadWithSpawnWeights(weights)).rejects.toThrow('Invalid idle catalog');
  });
});
