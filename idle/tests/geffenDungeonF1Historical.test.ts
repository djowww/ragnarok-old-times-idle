import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import baseline from './fixtures/geffenDungeonF1Baseline.json';
import { beforeGeffenDungeonFloorCatalog, beforeGeffenDungeonFloorManifest } from './geffen-dungeon-f1-historical';

const fileSha = (value: unknown) => createHash('sha256')
  .update(JSON.stringify(value, null, 2) + '\n').digest('hex');

describe('Geffen Dungeon first-floor catalog projection', () => {
  it('reconstructs the exact catalog before the new floor and corrected labels', () => {
    expect(fileSha(beforeGeffenDungeonFloorCatalog(catalog))).toBe(baseline.catalog.beforeFileSha256);
  });

  it('reconstructs the manifest checksum before the new floor', () => {
    expect(fileSha(beforeGeffenDungeonFloorManifest(manifest))).toBe(baseline.manifest.beforeFileSha256);
  });

  it('keeps edits to the new area and renamed legacy areas visible', () => {
    const changedManifest = structuredClone(manifest);
    changedManifest.catalogSha256 = 'unreviewed';
    expect(beforeGeffenDungeonFloorManifest(changedManifest).catalogSha256).toBe('unreviewed');
    const changed = structuredClone(catalog);
    changed.areas.find(area => area.id === 'geffen_dungeon_f1')!.description += ' alterado';
    changed.areas.find(area => area.id === 'geffen_dungeon_first')!.minLevel++;
    const projected = beforeGeffenDungeonFloorCatalog(changed);
    expect(projected.areas.find(area => area.id === 'geffen_dungeon_f1')).toEqual(
      changed.areas.find(area => area.id === 'geffen_dungeon_f1'));
    expect(projected.areas.find(area => area.id === 'geffen_dungeon_first')).toEqual(
      changed.areas.find(area => area.id === 'geffen_dungeon_first'));
  });
});
