import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import manifestJson from '../content/source-manifest.json';
import type { Catalog } from '../shared/types';

const catalog = catalogJson as unknown as Catalog;
const skill = Object.values(catalog.skills).find(candidate => candidate.sourceName === 'WZ_SIGHTBLASTER')!;

describe('Impacto Explosivo Hercules metadata', () => {
  it('exports the supported source contract in both Wizard trees', () => {
    expect(skill).toMatchObject({
      implementation: 'supported',
      maxLevel: 1,
      spCost: [40],
      castTimeMs: [2000],
      afterCastDelayMs: [0],
      interruptCast: true,
      aoeRadius: [1],
      range: [0],
      targetType: 'self',
      element: 'fire',
      statusDurationMs: [120000],
    });
    expect(skill.unsupportedReason).toBeUndefined();
    expect(catalog.classes.wizard.skills).toContain(skill.id);
    expect(catalog.classes.high_wizard.skills).toContain(skill.id);
    expect((manifestJson.skillSources as Record<string, unknown>)[skill.id]).toMatchObject({
      id: 1006,
      name: 'WZ_SIGHTBLASTER',
      implementation: 'supported',
      adaptation: expect.stringContaining('first source-radius contact'),
    });
    expect(manifestJson.sightBlasterSource).toMatchObject({
      statusFlags: expect.stringContaining('NoSave, NoDeathReset'),
      volatileStatusPolicy: expect.stringContaining('cleared on a new connection'),
    });
  });
});
