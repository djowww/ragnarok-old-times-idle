import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { BattleEnemy, Catalog } from '../shared/types.js';
import { makeSenseInspection } from '../engine/senseInspection.js';

const catalog = rawCatalog as unknown as Catalog;
const identity = { areaId: 'prontera_south', fieldGeneration: 4 };

function enemy(monsterId = 1002, changes: Partial<BattleEnemy> = {}): BattleEnemy {
  const monster = catalog.monsters[monsterId];
  return {
    id: 'field-prontera_south-4-2', monsterId, hp: 37, maxHp: 91, startedAt: 0, arrivedAt: 0,
    enemyNextAttackAt: 999999, spawnDirection: 0, position: { x: 0.5, y: 0.5 },
    ...changes,
  };
}

describe('source-faithful Sense inspection packet', () => {
  it('uses current HP and source hard/soft DEF and MDEF flags without applying defPercent', () => {
    const mob = catalog.monsters[1002];
    const result = makeSenseInspection(catalog, enemy(), 1200, identity);
    expect(result).toMatchObject({
      sourceSkill: 'WZ_ESTIMATION', actorId: 'field-prontera_south-4-2', monsterId: 1002,
      areaId: identity.areaId, fieldGeneration: 4, observedAt: 1200,
      classId: mob.id, level: mob.level, size: mob.size, currentHp: 37,
      def: mob.def + mob.stats.vit,
      mdef: mob.mdef + Math.max(1, mob.stats.int + (mob.stats.vit >> 1)),
      race: mob.race, element: mob.element, elementLevel: mob.elementLevel,
    });

    const poisoned = makeSenseInspection(catalog, enemy(1002, { statuses: {
      SC_POISON: { expiresAt: 5000, level: 1 },
    } }), 1200, identity);
    expect(poisoned.def).toBe(result.def);
    expect(poisoned.mdef).toBe(result.mdef);
  });

  it('selects hard and soft packet components from sense_type bits', () => {
    const mob = catalog.monsters[1002];
    const target = enemy();
    expect(makeSenseInspection(catalog, target, 0, identity, 1)).toMatchObject({ def: mob.def, mdef: mob.mdef });
    expect(makeSenseInspection(catalog, target, 0, identity, 2)).toMatchObject({
      def: mob.stats.vit, mdef: Math.max(1, mob.stats.int + (mob.stats.vit >> 1)),
    });
    expect(makeSenseInspection(catalog, target, 0, identity, 0)).toMatchObject({ def: 0, mdef: 0 });
  });

  it('uses the effective instance property and preserves all nine source rate positions', () => {
    const before = structuredClone(catalog.monsters[1002]);
    const target = enemy(1002, { statuses: {
      SC_ARMOR_PROPERTY: { expiresAt: 5000, level: 1, element: 'fire', elementLevel: 4 },
    } });
    const result = makeSenseInspection(catalog, target, 1200, identity);
    expect(result).toMatchObject({ element: 'fire', elementLevel: 4 });
    expect(result.elementRates).toEqual([200, 0, 0, 100, 75, 75, 75, 25, 25]);
    expect(catalog.monsters[1002]).toEqual(before);
  });

  it('indexes elemental rates by attack element first and defender element second', () => {
    const target = enemy(1002, { statuses: {
      SC_ARMOR_PROPERTY: { expiresAt: 5000, level: 1, element: 'fire', elementLevel: 4 },
    } });
    const result = makeSenseInspection(catalog, target, 1200, identity);
    // Catalog tables are [attackElement][defenderElement][levelIndex]. Water attacks
    // deal 200% to Fire 4, while Fire attacks deal 0% to Fire 4.
    expect(result.elementRates[0]).toBe(catalog.elementModifiers!.water.fire[3]);
    expect(result.elementRates[2]).toBe(Math.max(0, catalog.elementModifiers!.fire.fire[3]));
    expect(result.elementRates[0]).not.toBe(result.elementRates[2]);
  });

  it('applies Freeze and petrified Stone before elemental conversion', () => {
    const frozen = enemy(1002, { statuses: {
      SC_FREEZE: { expiresAt: 5000, startsAt: 0, level: 1 },
      SC_ARMOR_PROPERTY: { expiresAt: 5000, level: 1, element: 'fire', elementLevel: 4 },
    } });
    expect(makeSenseInspection(catalog, frozen, 1200, identity)).toMatchObject({ element: 'water', elementLevel: 1 });

    const stoned = enemy(1002, { statuses: {
      SC_STONE: { expiresAt: 10000, startsAt: 0, petrifiesAt: 500, level: 1 },
    } });
    const result = makeSenseInspection(catalog, stoned, 1200, identity);
    expect(result.element).toBe('earth');
    expect(result.def).toBe(Math.floor(catalog.monsters[1002].def / 2) + catalog.monsters[1002].stats.vit);
  });
});
