import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import { beforeHistoricalClassCadence, historicalCadenceFixture } from './class-cadence-historical';

describe('historical class cadence projection', () => {
  it('records its immutable source and restores only cadence without mutating input or hiding other changes', () => {
    expect(historicalCadenceFixture.sourceCommit).toBe('55c89d70f41687d306179d16667f4a9003e51cc9');
    expect(historicalCadenceFixture.sourceBlobSha).toBe('0e4301ec8454b5cbcf3b0442b9972eae6ba06158');
    expect(Object.keys(historicalCadenceFixture.classes)).toHaveLength(40);
    const source = structuredClone(catalog.classes) as unknown as Record<string, Record<string, unknown>>;
    const before = structuredClone(source);
    const normalized = beforeHistoricalClassCadence(source);
    expect(source).toEqual(before);

    const changed = structuredClone(source);
    changed.novice.hp = [...changed.novice.hp as number[], 1];
    changed.novice.weapons = [...changed.novice.weapons as string[], 'changed'];
    changed.novice.skills = [...changed.novice.skills as string[], 'changed_skill'];
    const normalizedChanged = beforeHistoricalClassCadence(changed);
    expect(normalizedChanged.novice.hp).toEqual(changed.novice.hp);
    expect(normalizedChanged.novice.weapons).toEqual(changed.novice.weapons);
    expect(normalizedChanged.novice.skills).toEqual(changed.novice.skills);
    expect(normalizedChanged.novice).not.toEqual(normalized.novice);
    expect(changed.novice.hp).not.toEqual(source.novice.hp);
  });
});
