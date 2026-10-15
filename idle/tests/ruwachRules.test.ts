import { describe, expect, it } from 'vitest';
import { activeRuwachConcealment, revealRuwachTarget } from '../engine/ruwachRules';

describe('Ruwach concealment rules', () => {
  it('recognizes only live source concealment statuses', () => {
    const statuses = {
      SC_HIDING: { expiresAt: 1000, level: 1 },
      SC_CLOAKING: { expiresAt: 900, level: 2 },
      SC_CAMOUFLAGE: { expiresAt: 1200, level: 1 },
      SC_CLOAKINGEXCEED: { expiresAt: 1000, level: 1 },
      SC_NEWMOON: { expiresAt: 0, level: 1 },
      SC_POISON: { expiresAt: 5000, level: 1 },
    };

    expect(activeRuwachConcealment(statuses, 900)).toEqual([
      'SC_HIDING', 'SC_CAMOUFLAGE', 'SC_CLOAKINGEXCEED',
    ]);
  });

  it('removes all concealment statuses when at least one is still active', () => {
    const statuses = {
      SC_HIDING: { expiresAt: 1000, level: 1 },
      SC_CLOAKING: { expiresAt: 0, level: 1 },
      SC_POISON: { expiresAt: 5000, level: 1 },
    };

    expect(revealRuwachTarget(statuses, 900)).toEqual(['SC_HIDING']);
    expect(statuses).toEqual({ SC_POISON: { expiresAt: 5000, level: 1 } });
  });

  it('does not change visible or expired targets', () => {
    const statuses = { SC_HIDING: { expiresAt: 10, level: 1 }, SC_POISON: { expiresAt: 5000, level: 1 } };
    const before = structuredClone(statuses);

    expect(revealRuwachTarget(statuses, 10)).toEqual([]);
    expect(statuses).toEqual(before);
  });
});
