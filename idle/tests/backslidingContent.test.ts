import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import manifestJson from '../content/source-manifest.json';
import { classSkills } from '../engine/stats.js';
import type { Catalog } from '../shared/types.js';

const catalog = catalogJson as unknown as Catalog;
const manifest = manifestJson as any;

describe('TF_BACKSLIDING source promotion', () => {
  it('exports a source-matched level-one manual self skill for the Thief family only', () => {
    const skill = catalog.skills.tf_backsliding;
    expect(skill).toMatchObject({
      sourceName: 'TF_BACKSLIDING', implementation: 'supported', manualUse: 'activate',
      maxLevel: 1, targetType: 'self', range: [0], spCost: [7],
      castTimeMs: [0], afterCastDelayMs: [0], cooldownMs: 0, interruptCast: false,
    });
    expect(skill?.unsupportedReason).toBeUndefined();
    expect(manifest.skillSources.tf_backsliding).toMatchObject({
      id: 150, name: 'TF_BACKSLIDING', sourceMaxLevel: 1, implementation: 'supported',
      sourceRequirements: { SPCost: 7 },
    });
    const eligible = ['thief', 'high_thief', 'assassin', 'assassin_cross', 'rogue', 'stalker'];
    for (const job of eligible) expect(classSkills(catalog, job)).toContain(skill.id);
    for (const job of Object.keys(catalog.classes).filter(job => !eligible.includes(job)))
      expect(classSkills(catalog, job), job).not.toContain(skill.id);
    expect(manifest.skillCoverage).toMatchObject({ skills: 348, supported: 263, unsupported: 85 });
  });

  it('keeps the movement action out of automatic rotation', () => {
    const skill = catalog.skills.tf_backsliding;
    expect(skill.manualUse).toBe('activate');
    expect(skill.implementation).toBe('supported');
    // The rotation contract admits only its explicit allowlist of manual actions.
    expect(['CR_SHRINK', 'PA_SACRIFICE', 'MO_BLADESTOP', 'SA_MAGICROD']).not.toContain(skill.sourceName);
  });
});
