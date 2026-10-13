import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import type { Catalog } from '../shared/types';

const data = catalog as unknown as Catalog;
const resurrection = data.skills.all_resurrection;
const soulChange = data.skills.pf_soulchange;

describe('executed solo Resurrection and Soul Change catalog', () => {
  it.each(['ALL_RESURRECTION', 'PF_SOULCHANGE'])('exposes the executed monster branch of %s', source => {
    const skill = Object.values(data.skills).find(candidate => candidate.sourceName === source)!;
    expect(skill.implementation).toBe('supported');
    expect(skill.unsupportedReason).toBeUndefined();
    expect(manifest.skillSources[skill.id as keyof typeof manifest.skillSources].implementation).toBe('supported');
    expect(manifest.skillCoverage.unavailable.some(candidate => candidate.sourceName === source)).toBe(false);
  });

  it('routes Resurrection through magical Holy damage without bypassing source MDEF', () => {
    expect(resurrection).toMatchObject({ kind: 'magical', damageType: 'magic', targetType: 'enemy', element: 'holy' });
    expect(resurrection.ignoreDefense).not.toBe(true);
    expect(resurrection.ignoreElement).not.toBe(true);
    expect(resurrection.power).toEqual([0, 0, 0, 0]);
  });

  it('retains all four source Resurrection levels, casting costs and prerequisites', () => {
    expect(resurrection).toMatchObject({
      herculesId: 54, maxLevel: 4,
      iconResource: 'data/texture/유저인터페이스/item/all_resurrection.bmp',
      spCost: [60, 60, 60, 60], range: [9, 9, 9, 9],
      castTimeMs: [6000, 4000, 2000, 0], afterCastDelayMs: [0, 1000, 2000, 3000],
      cooldownMs: 0, interruptCast: true,
      itemCostByLevel: [[{ itemId: 717, quantity: 1 }], [{ itemId: 717, quantity: 1 }],
        [{ itemId: 717, quantity: 1 }], [{ itemId: 717, quantity: 1 }]],
      prerequisitesByClass: {
        priest: [{ skillId: 'pr_strecovery', level: 1 }, { skillId: 'sp_recovery', level: 4 }],
        high_priest: [{ skillId: 'pr_strecovery', level: 1 }, { skillId: 'sp_recovery', level: 4 }],
      },
    });
    expect(data.items[717]).toMatchObject({ type: 'material', shop: true, buyPrice: 600 });
  });

  it('retains source Soul Change utility targeting, timing, cost and Professor prerequisites', () => {
    expect(soulChange).toMatchObject({
      herculesId: 374, maxLevel: 1, kind: 'buff', damageType: 'none', targetType: 'enemy',
      iconResource: 'data/texture/유저인터페이스/item/pf_soulchange.bmp',
      spCost: [5], power: [0], range: [9], castTimeMs: [3000], afterCastDelayMs: [5000],
      cooldownMs: 0, interruptCast: true,
      prerequisitesByClass: { professor: [{ skillId: 'sa_magicrod', level: 3 }, { skillId: 'sa_spellbreaker', level: 2 }] },
    });
    expect(soulChange.effects).toBeUndefined();
    expect(soulChange.itemCostByLevel).toBeUndefined();
  });

  it('preserves unavailable prerequisite rows in learnable source trees', () => {
    for (const [id, classId] of [['sa_magicrod', 'professor']]) {
      expect(data.skills[id].implementation, id).toBe('unsupported');
      expect(data.skills[id].unsupportedReason, id).toBeTruthy();
      expect(data.classes[classId].skills, id).toContain(id);
      expect(manifest.skillSources[id as keyof typeof manifest.skillSources].implementation, id).toBe('unsupported');
    }
  });

  it('preserves all 40 source class trees and the current solo coverage', () => {
    expect(Object.keys(data.classes)).toHaveLength(40);
    expect(Object.keys(data.skills)).toHaveLength(348);
    expect(Object.values(data.skills).filter(skill => skill.implementation === 'supported')).toHaveLength(246);
    expect(Object.values(data.skills).filter(skill => skill.implementation === 'unsupported')).toHaveLength(102);
    expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 246, unsupported: 102 });
  });
});
