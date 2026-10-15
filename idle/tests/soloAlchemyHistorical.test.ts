import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import baseline from './fixtures/soloAlchemy260Baseline.json';
import { beforeSoloAlchemySkills } from './solo-alchemy-historical';
import type { Catalog } from '../shared/types';

const skills = (catalog as unknown as Catalog).skills;
const rowIds = ['ws_meltdown', 'potion_pitcher'] as const;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
describe('scoped pre-solo-alchemy historical projection', () => {
  it('pins the exact two prior rows to their Git catalog source and Hercules source', () => {
    expect(baseline.sourceCommit).toBe('e5625bc513591c416054d9d80a41c793d16a9d59');
    expect(baseline.sourcePath).toBe('idle/content/catalog.json');
    expect(baseline.sourceBlobSha).toBe('e2f5c3ca3555d887fe420aedbc308d348dc036f1');
    expect(baseline.sourceSha256).toBe('3ad1adf3606cf6c36e2fd7e76befea45984917b7f74e151c2b53a858474910a9');
    expect(baseline.herculesCommit).toBe('410b9738c049ab1825d67b36b072d837c1d0b33a');
    expect(Object.keys(baseline.changedSkills)).toEqual([...rowIds]);
    expect(hash(baseline.changedSkills)).toBe('9495612fd17ba9ef21fd0f8e8a38e33e660da56b3499e45c6d1ec0e29334f249');
  });
  it('restores only packet fields in the original row order, retaining every other live row', () => {
    const original = structuredClone(skills), restored = beforeSoloAlchemySkills(skills);
    for (const id of rowIds) {
      expect(restored[id]).toEqual(baseline.changedSkills[id]);
      expect(Object.keys(restored[id])).toEqual(Object.keys(baseline.changedSkills[id]));
    }
    expect(Object.keys(restored)).toEqual(Object.keys(skills));
    for (const [id, row] of Object.entries(skills))
      if (!(rowIds as readonly string[]).includes(id)) expect(restored[id], id).toEqual(row);
    expect(skills).toEqual(original);
  });
  it.each(rowIds)('does not neutralize unrelated SP, icon, prerequisite or added-field mutations in %s', id => {
    const mutated = structuredClone(skills), row = mutated[id];
    row.spCost[0] += 17;
    row.iconResource = 'data/texture/changed-skill-icon.bmp';
    row.prerequisites![0].level += 1;
    Object.values(row.prerequisitesByClass!)[0][0].level += 1;
    (row as unknown as Record<string, unknown>).unrelatedNewField = { sentinel: true };
    if (id === 'potion_pitcher') row.statusDurationMs = [123456];
    const restored = beforeSoloAlchemySkills(mutated)[id];
    expect(restored.spCost).toEqual(row.spCost);
    expect(restored.iconResource).toBe(row.iconResource);
    expect(restored.prerequisites).toEqual(row.prerequisites);
    expect(restored.prerequisitesByClass).toEqual(row.prerequisitesByClass);
    expect((restored as unknown as Record<string, unknown>).unrelatedNewField).toEqual({ sentinel: true });
    if (id === 'potion_pitcher') expect(restored.statusDurationMs).toEqual([123456]);
    expect(hash(restored)).not.toBe(hash(baseline.changedSkills[id]));
  });
  it('does not restore an unrelated field removed from the live row', () => {
    const mutated = structuredClone(skills);
    delete (mutated.potion_pitcher as unknown as Record<string, unknown>).iconResource;
    expect(beforeSoloAlchemySkills(mutated).potion_pitcher.iconResource).toBeUndefined();
  });
});
