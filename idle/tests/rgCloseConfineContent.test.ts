import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';

describe('RG_CLOSECONFINE content adaptation', () => {
  it('exports the Hercules range, SP cost, paired status and field-only adaptation as supported', () => {
    expect(catalog.skills.rg_closeconfine).toMatchObject({
      name: 'Confinamento', sourceName: 'RG_CLOSECONFINE', implementation: 'supported',
      kind: 'buff', targetType: 'enemy', damageType: 'none', range: [1], spCost: [25],
      statusEffect: 'SC_RG_CCONFINE_S', statusDurationMs: [10000],
    });
    expect('unsupportedReason' in catalog.skills.rg_closeconfine).toBe(false);
    expect(manifest.skillSources.rg_closeconfine).toMatchObject({ implementation: 'supported',
      adaptation: expect.stringContaining('last linked target dies') });
    expect(manifest.skillCoverage.supportedSourceNames).toContain('RG_CLOSECONFINE');
    expect(manifest.skillCoverage.combatExpansion).toContain('RG_CLOSECONFINE');
    expect(manifest.skillCoverage.unavailable.some(skill => skill.skillId === 'rg_closeconfine')).toBe(false);
    expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 267, unsupported: 81 });
  });
});
