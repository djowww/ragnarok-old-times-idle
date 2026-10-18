import { describe, expect, it } from 'vitest';
import { createFieldNavigationRuntime, type FieldNavigationAreaSpec } from '../engine/fieldNavigation.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { findGridRoute } from '../shared/fieldNavigation.js';
import type { FieldNavigationGrid } from '../shared/fieldNavigation.js';

const area: FieldNavigationAreaSpec = {
  areaId: 'icewall_field', map: 'icewall_field', origin: { x: 3, y: 2 },
  homeOffsets: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }],
};
function grid(walkable = new Uint8Array([255, 255, 255, 255, 255])): FieldNavigationGrid {
  return { map: area.map, width: 7, height: 5, walkable,
    wall: new Uint8Array(5), water: new Uint8Array(5), sourceSha256: 'a'.repeat(64) };
}
const at = (x: number, y: number) => ({
  x: BATTLE_HERO.x + (x + 0.5 - (area.origin.x + 0.5)) / BATTLE_CELLS_PER_UNIT,
  y: BATTLE_HERO.y + (y + 0.5 - (area.origin.y + 0.5)) / BATTLE_CELLS_PER_UNIT,
});

describe('Ice Wall path obstruction', () => {
  it('routes actors around a live Ice Wall cell instead of walking through it', () => {
    const nav = createFieldNavigationRuntime([area], new Map([[area.map, grid()]]));
    const route = nav.routeToRange(area.areaId, at(1, 2), at(5, 2), 0, 'square', new Set(['3,2']));
    expect(route).not.toBeNull();
    expect(route!.route.points.map(point => { const cell = nav.toGridPoint(area.areaId, point); return `${Math.floor(cell.x)},${Math.floor(cell.y)}`; }))
      .not.toContain('3,2');
  });

  it('reports no route when live Ice Wall cells seal the only corridor', () => {
    const nav = createFieldNavigationRuntime([area], new Map([[area.map, grid(new Uint8Array([0, 192, 31, 0, 0]))]]));
    const blockers = new Set(['3,2']);
    expect(nav.routeToRange(area.areaId, at(1, 2), at(5, 2), 0, 'square', blockers)).toBeNull();
  });
});


it('does not cut a diagonal corner through dynamic Ice Wall blockers in either router', () => {
  const walkable = new Uint8Array(5);
  for (const id of [8, 9, 15, 16, 10, 11, 12, 18]) walkable[id >> 3] |= 1 << (id & 7);
  const sparse = grid(walkable);
  const blockers = new Set(['2,1', '1,2']);
  const from = { x: 1.5, y: 1.5 }, to = { x: 2.5, y: 2.5 };

  expect(findGridRoute(sparse, from, to, 0, blockers)).toBeNull();
  const sparseArea = { ...area, origin: { x: 4, y: 1 }, homeOffsets: [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] };
  const atSparse = (x: number, y: number) => ({
    x: BATTLE_HERO.x + (x + 0.5 - (sparseArea.origin.x + 0.5)) / BATTLE_CELLS_PER_UNIT,
    y: BATTLE_HERO.y + (y + 0.5 - (sparseArea.origin.y + 0.5)) / BATTLE_CELLS_PER_UNIT,
  });
  const nav = createFieldNavigationRuntime([sparseArea], new Map([[area.map, sparse]]));
  expect(nav.route(area.areaId, atSparse(1, 1), atSparse(2, 2), blockers)).toBeNull();
  expect(nav.routeToRange(area.areaId, atSparse(1, 1), atSparse(2, 2), 0, 'square', blockers)).toBeNull();
});
