import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import type { Catalog } from '../shared/types';
const c = rawCatalog as unknown as Catalog;
describe('Pick Stone source export', () => {
  it('supports the real production dispatcher while retaining source timing, cost and tree', () => {
    expect(c.skills.tf_pickstone).toMatchObject({ implementation: 'supported', maxLevel: 1,
      kind: 'buff', targetType: 'self', damageType: 'none', spCost: [3], castTimeMs: [500],
      afterCastDelayMs: [0], cooldownMs: 0, interruptCast: false, requiredState: 'NotOverWeight', minimumJobLevel: 1 });
    expect(c.skills.tf_pickstone.statusEffect).toBeUndefined(); expect(c.skills.tf_pickstone.effects).toBeUndefined();
    expect(c.items[7049]).toMatchObject({ type: 'loot', weight: 3, shop: false, buyPrice: 0 });
    expect(c.skills.tf_throwstone.itemCostByLevel).toEqual([[{ itemId: 7049, quantity: 1 }]]);
    for (const job of ['thief', 'high_thief', 'assassin', 'assassin_cross', 'rogue', 'stalker']) {
      expect(c.classes[job].skills).toContain('tf_pickstone');
      expect(c.skills.tf_pickstone.prerequisitesByClass?.[job]).toEqual([]);
    }
  });
  it('counts only the new supported branch in the source manifest', () => {
    expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 253, unsupported: 95 });
    expect(manifest.skillSources.tf_pickstone.implementation).toBe('supported');
    expect(manifest.skillCoverage.unavailable.some(skill => skill.sourceName === 'TF_PICKSTONE')).toBe(false);
  });
});
