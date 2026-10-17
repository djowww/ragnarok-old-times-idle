import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import rawManifest from '../content/source-manifest.json';
import rules from '../content/rules.json';
import baseline from './fixtures/fourMapExpansionBaseline.json';
import { beforeGeffenDungeonFloorCatalog, beforeGeffenDungeonFloorManifest } from './geffen-dungeon-f1-historical';
import {
  beforeFourMapExpansionCatalog,
  beforeFourMapExpansionManifest,
  beforeFourMapExpansionRules,
} from './four-map-expansion-historical';

const catalog = beforeGeffenDungeonFloorCatalog(rawCatalog);
const manifest = beforeGeffenDungeonFloorManifest(rawManifest);

const fileSha = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value, null, 2) + '\n').digest('hex');

describe('exact four-map historical projection', () => {
  it('reconstructs all three previous files byte for byte', () => {
    expect(fileSha(catalog)).toBe(baseline.catalog.afterFileSha256);
    expect(fileSha(manifest)).toBe(baseline.manifest.afterFileSha256);
    expect(fileSha(rules)).toBe(baseline.rules.afterFileSha256);
    expect(fileSha(beforeFourMapExpansionCatalog(catalog))).toBe(baseline.catalog.beforeFileSha256);
    expect(fileSha(beforeFourMapExpansionManifest(manifest))).toBe(baseline.manifest.beforeFileSha256);
    expect(fileSha(beforeFourMapExpansionRules(rules))).toBe(baseline.rules.beforeFileSha256);
  });

  it('inverts exactly four areas, ten monsters, thirty-five items and their manifest records', () => {
    expect(Object.keys(baseline.catalog.addedAreas)).toHaveLength(4);
    expect(Object.keys(baseline.catalog.addedMonsters)).toHaveLength(10);
    expect(Object.keys(baseline.catalog.addedItems)).toHaveLength(35);
    expect(Object.keys(baseline.manifest.addedInertDrops)).toHaveLength(18);
    expect(baseline.manifest.addedMaps).toHaveLength(4);
    const old = beforeFourMapExpansionCatalog(catalog);
    for (const id of Object.keys(baseline.catalog.addedMonsters)) expect(old.monsters[id as keyof typeof old.monsters]).toBeUndefined();
    for (const id of Object.keys(baseline.catalog.addedItems)) expect(old.items[id as keyof typeof old.items]).toBeUndefined();
    expect(beforeFourMapExpansionCatalog(old)).toEqual(old);
  });

  it('leaves edited old or new records visible instead of hiding drift', () => {
    const changed = structuredClone(catalog);
    changed.monsters[1002].hp++;
    const addedMonster = Object.keys(baseline.catalog.addedMonsters)[0] as keyof typeof changed.monsters;
    changed.monsters[addedMonster].hp++;
    const addedItem = Object.keys(baseline.catalog.addedItems)[0] as keyof typeof changed.items;
    changed.items[addedItem].name += ' changed';
    const addedArea = changed.areas.find(area => area.id === Object.keys(baseline.catalog.addedAreas)[0])!;
    addedArea.monsters = [1002];
    changed.source.hash = 'unreviewed';
    const projected = beforeFourMapExpansionCatalog(changed);
    expect(projected.monsters[1002]).toEqual(changed.monsters[1002]);
    expect(projected.monsters[addedMonster]).toEqual(changed.monsters[addedMonster]);
    expect(projected.items[addedItem]).toEqual(changed.items[addedItem]);
    expect(projected.areas.find(area => area.id === addedArea.id)).toEqual(addedArea);
    expect(projected.source.hash).toBe('unreviewed');
    expect(fileSha(projected)).not.toBe(baseline.catalog.beforeFileSha256);

    const changedManifest = structuredClone(manifest);
    changedManifest.inertDropItems[0].aegisName += ' changed';
    changedManifest.mapSpawnValidation.maps[0] = 'unreviewed';
    expect(beforeFourMapExpansionManifest(changedManifest).inertDropItems[0]).toEqual(changedManifest.inertDropItems[0]);
    expect(beforeFourMapExpansionManifest(changedManifest).mapSpawnValidation.maps[0]).toBe('unreviewed');
    expect(fileSha(beforeFourMapExpansionManifest(changedManifest))).not.toBe(baseline.manifest.beforeFileSha256);

    const changedNewDrop = structuredClone(manifest);
    const newDropId = Number(Object.keys(baseline.manifest.addedInertDrops)[0]);
    const newDrop = changedNewDrop.inertDropItems.find(entry => entry.itemId === newDropId)!;
    newDrop.aegisName += ' changed';
    expect(beforeFourMapExpansionManifest(changedNewDrop).inertDropItems).toContainEqual(newDrop);
    const changedBehavior = structuredClone(manifest);
    changedBehavior.monsterBehavior.aggressiveMonsterIds.push(999999);
    expect(beforeFourMapExpansionManifest(changedBehavior).monsterBehavior.aggressiveMonsterIds)
      .toContain(999999);

    const changedRules = structuredClone(rules);
    const ruleArea = changedRules.areas.find(area => area.id === Object.keys(baseline.rules.addedAreas)[0])!;
    ruleArea.name += ' changed';
    expect(beforeFourMapExpansionRules(changedRules).areas.find(area => area.id === ruleArea.id)).toEqual(ruleArea);
  });
});
