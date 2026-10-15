import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import raw from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import baseline from './fixtures/dungeonMapExpansionBaseline.json';
import { beforeDungeonExpansionCatalog, beforeDungeonExpansionManifest } from './dungeon-map-historical';

describe('audited dungeon delta preserves strict historical snapshots', () => {
  it('reconstructs the exact prior catalog bytes when only approved changes are reversed', () => {
    const text = JSON.stringify(beforeDungeonExpansionCatalog(raw), null, 2) + '\n';
    expect(createHash('sha256').update(text).digest('hex')).toBe(baseline.baselineSha256);
  });
  it('keeps the exact declared additions and protects each approved reagent', () => {
    expect(baseline.newItemIds).toHaveLength(52); expect(baseline.newMonsterIds).toHaveLength(17);
    expect(baseline.newAreaIds).toEqual(['pyramid_depths', 'glast_heim_cemetery']);
    for (const [id, change] of Object.entries(baseline.itemTypes)) expect((raw.items as Record<string, { type: string }>)[id].type).toBe(change.after);
    expect(beforeDungeonExpansionManifest(manifest).sources).toHaveLength(29);
  });
  it('leaves unexpected changes in existing monsters visible to the old hashes', () => {
    const changed = structuredClone(raw); changed.monsters[1002].hp++;
    expect(beforeDungeonExpansionCatalog(changed).monsters[1002].hp).toBe(raw.monsters[1002].hp + 1);
  });
  it('does not disguise an incorrect reagent type or unaudited spawn source', () => {
    const changed = structuredClone(raw); changed.items[1065].type = 'equipment';
    expect(beforeDungeonExpansionCatalog(changed).items[1065].type).toBe('equipment');
    const changedManifest = structuredClone(manifest); changedManifest.sources.push({ path: 'unreviewed', url: 'https://example.test', sha256: 'invalid' });
    expect(beforeDungeonExpansionManifest(changedManifest).sources.some(source => source.path === 'unreviewed')).toBe(true);
  });
  it('keeps unexpected edits to each newly added record visible', () => {
    const monster = structuredClone(raw); monster.monsters[1192].hp++;
    expect(beforeDungeonExpansionCatalog(monster).monsters[1192]).toEqual(monster.monsters[1192]);
    const item = structuredClone(raw), itemId = String(baseline.newItemIds[0]) as keyof typeof raw.items;
    item.items[itemId].name += ' changed';
    expect(beforeDungeonExpansionCatalog(item).items[itemId]).toEqual(item.items[itemId]);
    const area = structuredClone(raw), cemetery = area.areas.find(row => row.id === 'glast_heim_cemetery')!;
    cemetery.monsters = [1002];
    expect(beforeDungeonExpansionCatalog(area).areas.find(row => row.id === cemetery.id)).toEqual(cemetery);
  });

});
