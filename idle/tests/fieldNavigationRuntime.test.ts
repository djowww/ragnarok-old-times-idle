import { describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../shared/types.js';
import { initializeLegacyProfileIfReady, loadCatalogFieldNavigation, resolveFieldNavigationAssetOrigin } from '../server/fieldNavigationRuntime.js';
import type { FieldNavigationGrid } from '../shared/fieldNavigation.js';

function catalog(): Catalog {
  return {
    version: 'test', source: { commit: 'test', files: [], hash: 'test' }, rates: { baseExp: 1, jobExp: 1, drop: 1 },
    monsters: {}, items: {}, classes: {}, skills: {},
    areas: [
      { id: 'test_area', name: 'Test', map: 'test_map', minLevel: 1, description: '', monsters: [], scene: 'field' },
    ], quests: [], challenges: [], exp: { base: [], job: {} },
  } as Catalog;
}

const spec = { version: 1, areas: [{ areaId: 'test_area', map: 'test_map', origin: { x: 2, y: 2 },
  homeOffsets: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 }] }] };
function grid(): FieldNavigationGrid {
  return { map: 'test_map', width: 5, height: 5, walkable: new Uint8Array([255, 255, 255, 255]), sourceSha256: 'a'.repeat(64) };
}

describe('server field navigation runtime', () => {
  it('defaults GAT loads to the same internal asset service used by the app', () => {
    expect(resolveFieldNavigationAssetOrigin()).toBe('http://asset-service:8080');
    expect(resolveFieldNavigationAssetOrigin('http://asset-service:8080/')).toBe('http://asset-service:8080/');
  });
  it('does not initialize the legacy profile before navigation is ready', async () => {
    const initialize = vi.fn(async () => undefined);
    await initializeLegacyProfileIfReady(false, initialize);
    expect(initialize).not.toHaveBeenCalled();
    await initializeLegacyProfileIfReady(true, initialize);
    expect(initialize).toHaveBeenCalledOnce();
  });
  it('loads every catalog map before publishing only safe area metadata', async () => {
    const readJson = vi.fn(async () => spec);
    const loadGrids = vi.fn(async ({ maps }: { maps: string[] }) => ({ grids: new Map([['test_map', grid()], ['prontera', { ...grid(), map: 'prontera' }]]), cacheFallbackMaps: [] }));
    const loaded = await loadCatalogFieldNavigation(catalog(), { sidecarPath: 'private-spec.json', assetOrigin: 'https://assets.test', readJson, loadGrids });

    expect(loadGrids).toHaveBeenCalledWith(expect.objectContaining({ maps: ['test_map', 'prontera'], assetOrigin: 'https://assets.test' }));
    expect(loaded.catalog.areas[0].fieldNavigation).toEqual({ map: 'test_map', origin: { x: 2, y: 2 }, homeOffsets: spec.areas[0].homeOffsets });
    expect(JSON.stringify(loaded.catalog.areas[0])).not.toMatch(/walkable|sourceSha256|maskSha256|navigation\.json/);
    expect(loaded.context.navigation?.areaIds).toEqual(['test_area']);
  });

  it('fails closed when sidecar coverage or map identity differs from catalog', async () => {
    await expect(loadCatalogFieldNavigation(catalog(), { sidecarPath: 'private-spec.json', assetOrigin: 'https://assets.test',
      readJson: async () => ({ version: 1, areas: [] }), loadGrids: vi.fn() })).rejects.toThrow(/coverage/i);
    await expect(loadCatalogFieldNavigation(catalog(), { sidecarPath: 'private-spec.json', assetOrigin: 'https://assets.test',
      readJson: async () => ({ ...spec, areas: [{ ...spec.areas[0], map: 'other_map' }] }), loadGrids: vi.fn() })).rejects.toThrow(/map/i);
  });
  it('loads Prontera terrain and derives the viewer center without adding a hunt area or private masks to the public catalog', async () => {
    const prontera = { ...grid(), map: 'prontera', width: 312, height: 392,
      walkable: new Uint8Array(Math.ceil(312 * 392 / 8)).fill(255), wall: new Uint8Array(Math.ceil(312 * 392 / 8)) };
    let maps: string[] = [];
    const loaded = await loadCatalogFieldNavigation(catalog(), { assetOrigin: 'https://assets.test', readJson: async () => spec,
      loadGrids: async options => { maps = options.maps; return { grids: new Map([['test_map', grid()], ['prontera', prontera]]), cacheFallbackMaps: [] }; } });
    expect(maps).toEqual(['test_map', 'prontera']);
    expect(loaded.catalog.sceneNavigation?.prontera).toEqual({ map: 'prontera', origin: { x: 156, y: 196 } });
    expect(loaded.context.navigation?.areaIds).toEqual(['test_area']);
    expect(JSON.stringify(loaded.catalog.sceneNavigation)).not.toMatch(/walkable|wall|Sha256/);
  });
});
