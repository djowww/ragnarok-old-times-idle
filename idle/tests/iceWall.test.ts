import { battleCellFromWorldPoint } from '../web/assets/mapProjection.js';
import rulesJson from '../content/rules.json';
import { describe, expect, it } from 'vitest';
import { activeIceWallCells, iceWallFootprint, ICE_WALL_RESTRICTED_MAPS } from '../engine/iceWall.js';
import { createFieldNavigationRuntime, type FieldNavigationAreaSpec } from '../engine/fieldNavigation.js';
import type { FieldNavigationGrid } from '../shared/fieldNavigation.js';

const area: FieldNavigationAreaSpec = { areaId: 'icewall_field', map: 'icewall_field', origin: { x: 10, y: 10 },
  homeOffsets: [{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}] };
const navGrid: FieldNavigationGrid = { map: area.map, width: 24, height: 24,
  walkable: new Uint8Array(72).fill(255), wall: new Uint8Array(72), water: new Uint8Array(72), sourceSha256: 'a'.repeat(64) };
const navigation = createFieldNavigationRuntime([area], new Map([[area.map, navGrid]]));


function expectPointsClose(actual: Array<{x:number;y:number}>, expected: Array<{x:number;y:number}>) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index].x, 10);
    expect(point.y).toBeCloseTo(expected[index].y, 10);
  });
}

describe('WZ_ICEWALL source layout', () => {
  it('restricts exactly the active pinned noicewall maps', () => {
    expect([...ICE_WALL_RESTRICTED_MAPS].sort()).toEqual((rulesJson as { iceWallRestrictedMaps: string[] }).iceWallRestrictedMaps.sort());
  });
  it('maps the projected world cell back to the matching battle grid cell', () => {
    const origin = { x: 10, y: 10 };
    const target = battleCellFromWorldPoint([14.5, 0, 17.5], origin);
    expect(navigation.toGridPoint(area.areaId, target)).toEqual({ x: 14.5, y: 17.5 });
  });
  it('creates the pinned five-cell directional layout', () => {
    expectPointsClose(iceWallFootprint({x:2/12,y:2/12},{x:8/12,y:2/12}), [-2,-1,0,1,2].map(n=>({x:(8+n)/12,y:2/12}))); 
    expectPointsClose(iceWallFootprint({x:2/12,y:2/12},{x:2/12,y:8/12}), [-2,-1,0,1,2].map(n=>({x:2/12,y:(8+n)/12}))); 
    expectPointsClose(iceWallFootprint({x:2/12,y:2/12},{x:8/12,y:8/12}), [-2,-1,0,1,2].map(n=>({x:(8+n)/12,y:(8+n)/12}))); 
    expectPointsClose(iceWallFootprint({x:8/12,y:2/12},{x:2/12,y:8/12}), [-2,-1,0,1,2].map(n=>({x:(2+n)/12,y:(8-n)/12}))); 
  });
  it('only exposes live wall cells to pathfinding until the offline deadline expires', () => {
    const skill = { sourceName: 'WZ_ICEWALL' };
    const position = navigation.toBattlePoint(area.areaId, {x:10.5,y:10.5});
    const cells = [position];
    const units = [{skillId:'ice_wall', expiresAt:5000, cells}, {skillId:'other', expiresAt:8000, cells}];
    expect(activeIceWallCells(navigation, area.areaId, units, {ice_wall:skill}, 4999).size).toBe(1);
    expect(activeIceWallCells(navigation, area.areaId, units, {ice_wall:skill}, 5000).size).toBe(0);
  });
});
