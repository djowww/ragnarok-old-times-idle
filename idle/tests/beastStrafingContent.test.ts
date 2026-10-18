import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import rules from '../content/rules.json';

describe('Beast Strafing solo-hunt content', () => {
  it('declares the source combo and real arrow cost in canonical rules and exported content', () => {
    const rule = rules.skills.find(skill => skill.source === 'HT_POWER');
    expect(rule).toMatchObject({
      source: 'HT_POWER',
      requiredState: 'combo',
      itemCost: { itemId: 1750, quantity: 1 },
      handledRequirements: ['AmmoTypes', 'AmmoAmount'],
    });

    expect(catalog.skills.ht_power).toMatchObject({
      sourceName: 'HT_POWER',
      implementation: 'supported',
      kind: 'physical',
      damageType: 'weapon',
      targetType: 'enemy',
      requiredState: 'combo',
      requiredWeapon: ['bow'],
      spCost: [12],
      power: [100],
      hitCount: [2],
      itemCostByLevel: [[{ itemId: 1750, quantity: 1 }]],
    });
    expect(catalog.skills.ht_power).not.toHaveProperty("unsupportedReason");

    const doubleRule = rules.skills.find(skill => skill.source === 'AC_DOUBLE');
    expect(doubleRule).toMatchObject({
      itemCost: { itemId: 1750, quantity: 1 },
      handledRequirements: ['AmmoTypes', 'AmmoAmount'],
    });
    expect(catalog.skills.double_strafe.itemCostByLevel).toHaveLength(10);
    expect(catalog.skills.double_strafe.itemCostByLevel?.every(level =>
      level.some(cost => cost.itemId === 1750 && cost.quantity === 1))).toBe(true);
    expect(manifest.skillSources.double_strafe.unsupportedRequirements)
      .not.toContain('AmmoAmount');

    expect(manifest.skillSources.ht_power).toMatchObject({
      implementation: 'supported',
      adaptation: expect.stringContaining('AC_DOUBLE'),
      unsupportedRequirements: [],
    });
  });

  it('updates current skill coverage without changing the source skill count', () => {
    expect(manifest.skillCoverage).toMatchObject({
      classes: 40,
      skills: 348,
      supported: 275,
      unsupported: 73,
    });
    expect(manifest.skillCoverage.byClass.hunter).toMatchObject({
      sourceTree: 28,
      supported: 24,
      unsupported: 4,
    });
    expect(manifest.skillCoverage.byClass.sniper).toMatchObject({
      sourceTree: 32,
      supported: 28,
      unsupported: 4,
    });
  });
});
