import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';

describe('MO_BLADESTOP content promotion', () => {
  it('exports only the source-backed skill and labels WAIT reconnection as an Idle adaptation', () => {
    expect(catalog.skills.mo_bladestop).toMatchObject({
      sourceName: 'MO_BLADESTOP', implementation: 'supported', manualUse: 'activate',
      spCost: [10, 10, 10, 10, 10], sphereCost: [1, 1, 1, 1, 1],
      statusEffect: 'SC_BLADESTOP_WAIT', statusDurationMs: [20_000, 30_000, 40_000, 50_000, 60_000],
      description: expect.stringContaining('Golpe de Esferas requer nível 2'),
    });
    expect(manifest.skillCoverage.supportedSourceNames).toContain('MO_BLADESTOP');
    expect(manifest.skillCoverage.combatExpansion).toContain('MO_BLADESTOP');
    expect(manifest.skillSources.mo_bladestop.adaptation).toContain('SC_BLADESTOP_WAIT has no NoSave flag');
    expect(manifest.skillSources.mo_bladestop.adaptation).toContain('explicit Idle lifecycle adaptation');
    expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 253, unsupported: 95 });
  });
});
