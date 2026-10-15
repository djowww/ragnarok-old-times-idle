import { readFile } from 'node:fs/promises';
import type { Catalog } from '../shared/types.js';
import {
  createFieldNavigationRuntime,
  type FieldNavigationAreaSpec,
  type SimulationContext,
} from '../engine/fieldNavigation.js';
import { loadFieldNavigationGrids } from './fieldNavigationAssets.js';

interface FieldNavigationSidecar { version: 1; areas: FieldNavigationAreaSpec[] }
interface RuntimeOptions {
  sidecarPath?: string;
  assetOrigin: string;
  cacheDir?: string;
  readJson?: (path: string) => Promise<unknown>;
  loadGrids?: typeof loadFieldNavigationGrids;
}

export function resolveFieldNavigationAssetOrigin(configured?: string): string {
  return configured?.trim() || 'http://asset-service:8080';
}

/** Keep legacy profile creation behind successful navigation startup. */
export async function initializeLegacyProfileIfReady(navigationReady: boolean,
  initialize: () => Promise<unknown>): Promise<void> {
  if (navigationReady) await initialize();
}

function validInteger(point: unknown): point is { x: number; y: number } {
  if (!point || typeof point !== 'object') return false;
  const value = point as { x?: unknown; y?: unknown };
  return Number.isSafeInteger(value.x) && Number.isSafeInteger(value.y);
}

async function readSidecar(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

function validateSidecar(value: unknown, catalog: Catalog): FieldNavigationSidecar {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid field navigation sidecar');
  const sidecar = value as Partial<FieldNavigationSidecar>;
  if (sidecar.version !== 1 || !Array.isArray(sidecar.areas)) throw new Error('Invalid field navigation sidecar version');
  if (sidecar.areas.length !== catalog.areas.length) throw new Error('Field navigation sidecar coverage differs from catalog');
  const catalogById = new Map(catalog.areas.map(area => [area.id, area]));
  const seen = new Set<string>();
  for (const candidate of sidecar.areas) {
    if (!candidate || typeof candidate !== 'object' || typeof candidate.areaId !== 'string' || seen.has(candidate.areaId))
      throw new Error('Invalid or duplicate field navigation area');
    const area = catalogById.get(candidate.areaId);
    if (!area) throw new Error(`Field navigation contains unknown catalog area ${candidate.areaId}`);
    if (candidate.map !== area.map) throw new Error(`Field navigation map does not match catalog for ${candidate.areaId}`);
    if (!validInteger(candidate.origin) || !Array.isArray(candidate.homeOffsets) || candidate.homeOffsets.length !== 4 ||
        candidate.homeOffsets.some(point => !validInteger(point)))
      throw new Error(`Invalid field navigation origin or homes for ${candidate.areaId}`);
    seen.add(candidate.areaId);
  }
  if (seen.size !== catalogById.size) throw new Error('Field navigation sidecar coverage differs from catalog');
  return sidecar as FieldNavigationSidecar;
}

/** Loads all private grids and returns a catalog with only safe map projection metadata. */
export async function loadCatalogFieldNavigation(catalog: Catalog, options: RuntimeOptions): Promise<{
  catalog: Catalog;
  context: SimulationContext;
  cacheFallbackMaps: readonly string[];
}> {
  const sidecarPath = options.sidecarPath ?? 'content/field-navigation.json';
  const sidecar = validateSidecar(await (options.readJson ?? readSidecar)(sidecarPath), catalog);
  const specs = sidecar.areas;
  const maps = [...new Set(specs.map(spec => spec.map))];
  const loaded = await (options.loadGrids ?? loadFieldNavigationGrids)({
    maps, assetOrigin: options.assetOrigin, cacheDir: options.cacheDir,
  });
  const navigation = createFieldNavigationRuntime(specs, loaded.grids, loaded.cacheFallbackMaps);
  const publicByArea = navigation.publicAreas;
  const safeCatalog: Catalog = {
    ...catalog,
    areas: catalog.areas.map(area => ({ ...area, fieldNavigation: publicByArea[area.id] })),
  };
  return { catalog: safeCatalog, context: { navigation }, cacheFallbackMaps: loaded.cacheFallbackMaps };
}
