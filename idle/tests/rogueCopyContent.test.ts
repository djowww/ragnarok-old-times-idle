import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import type { Catalog } from '../shared/types';
const c = raw as unknown as Catalog;
describe('pinned Rogue copy catalog', () => {
  it('supports only the two newly executed mechanics with source requirements intact', () => {
    expect(c.skills.rg_plagiarism).toMatchObject({ herculesId: 225, kind: 'passive', maxLevel: 10, implementation: 'supported',
      prerequisites: [{ skillId: 'rg_intimidate', level: 5 }] });
    expect(c.skills.st_preserve).toMatchObject({ herculesId: 475, implementation: 'supported', kind: 'buff', targetType: 'self',
      spCost: [30], castTimeMs: [1000], statusEffect: 'SC_PRESERVE', statusDurationMs: [600000],
      prerequisites: [{ skillId: 'rg_plagiarism', level: 10 }] });
    expect(Object.values(c.skills).filter(skill => skill.implementation === 'supported')).toHaveLength(269);
  });
  it.each(['fire_bolt', 'cold_bolt', 'lightning_bolt', 'soul_strike'])('exports the original AllowPlagiarism flag for %s', id => {
    expect(c.skills[id].allowPlagiarism).toBe(true);
  });
  it('records NPC-only scope, committed casts and volatile Preserve source policy', () => {
    expect((manifest as any).rogueCopy).toMatchObject({ maxCopiedSlots: 1, incomingScope: 'modeled NPC magic',
      preserve: { noSave: true, clearedOnDeath: true }, committedCastSurvivesReplacement: true });
    expect(Object.values(c.skills).find(skill => skill.sourceName === 'NV_FIRSTAID')!.allowPlagiarism).not.toBe(true);
  });
});
