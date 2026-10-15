import { describe, expect, it } from 'vitest';
import {
    connectedCells, decodeGat, findGridRoute, gridDisplacement, gridRouteLength,
    gridRoutePoint, gridWalkable, nearestConnectedCell, nextRouteSearchGeneration,
    type FieldNavigationGrid, type GridPoint,
} from '../shared/fieldNavigation';

function gat(types: number[], width = types.length, height = 1, version: [number, number] = [1, 2]) {
    const bytes = new Uint8Array(14 + types.length * 20);
    bytes.set([71, 82, 65, 84, version[0], version[1]], 0);
    const view = new DataView(bytes.buffer);
    view.setUint32(6, width, true);
    view.setUint32(10, height, true);
    types.forEach((type, i) => view.setUint32(14 + i * 20 + 16, type, true));
    return bytes;
}

function grid(rows: number[][]): FieldNavigationGrid {
    const height = rows.length, width = rows[0].length;
    const walkable = new Uint8Array(Math.ceil(width * height / 8));
    rows.flat().forEach((open, i) => { if (open) walkable[i >> 3] |= 1 << (i & 7); });
    return { map: 'fixture', width, height, walkable, sourceSha256: 'a'.repeat(64) };
}

const point = (x: number, y: number): GridPoint => ({ x, y });

describe('GAT field navigation', () => {
    it('decodes every raw type in the pinned roBrowser table and rejects unknown types', () => {
        const raw = [0, 1, 2, 3, 4, 5, 6,
            0x80000000, 0x80000001, 0x80000002, 0x80000003, 0x80000004,
            0x80000005, 0x80000006, 0x80000007, 0x80000008, 0x80000009];
        const expected = [1, 0, 1, 1, 1, 0, 1,
            1, 0, 1, 1, 0, 1, 1, 0, 0, 0];
        const decoded = decodeGat('prt_fild08', gat(raw), 'b'.repeat(64));
        expect(raw.map((_, i) => gridWalkable(decoded, point(i + 0.5, 0.5)) ? 1 : 0)).toEqual(expected);
        expect(() => decodeGat('fixture', gat([7]), 'b'.repeat(64))).toThrow(/unknown.*type|type.*unknown/i);
    });

    it('rejects wrong magic, non-1.2 version, dimensions above the cell limit, and non-exact lengths', () => {
        const wrongMagic = gat([0]); wrongMagic[0] = 0;
        const wrongVersion = gat([0], 1, 1, [1, 3]);
        const tooLarge = gat([0]); new DataView(tooLarge.buffer).setUint32(6, 1_000_001, true);
        const truncated = gat([0]).slice(0, 33);
        const extra = new Uint8Array([...gat([0]), 0]);
        for (const bytes of [wrongMagic, wrongVersion, tooLarge, truncated, extra]) {
            expect(() => decodeGat('fixture', bytes, 'b'.repeat(64))).toThrow();
        }
    });

    it('builds a connected component without cutting diagonal corners', () => {
        const map = grid([[1, 0], [0, 1]]);
        const component = connectedCells(map, point(0.5, 0.5));
        expect([...component]).toEqual([1]);
        expect(findGridRoute(map, point(0.5, 0.5), point(1.5, 1.5))).toBeNull();
    });

    it('returns the same deterministic shortest eight-neighbor detour on repeated searches', () => {
        const map = grid([[1, 1, 1], [1, 0, 1], [1, 1, 1]]);
        const from = point(0.5, 1.5), to = point(2.5, 1.5);
        const route = findGridRoute(map, from, to)!;
        expect(route).toEqual([from, point(0.5, 0.5), point(1.5, 0.5), point(2.5, 0.5), to]);
        expect(findGridRoute(map, from, to)).toEqual(route);
        expect(gridRouteLength(route)).toBe(4);
    });

    it('keeps deterministic routes when searches interleave across different grid sizes', () => {
        const first = grid([[1, 1, 1], [1, 0, 1], [1, 1, 1]]);
        const larger = grid([[1, 1, 1, 1, 1], [1, 1, 0, 1, 1], [1, 1, 1, 1, 1]]);
        const from = point(0.5, 1.5), to = point(2.5, 1.5);
        const largerFrom = point(0.5, 1.5), largerTo = point(4.5, 1.5);
        const firstRoute = findGridRoute(first, from, to)!;
        const largerRoute = findGridRoute(larger, largerFrom, largerTo)!;
        expect(findGridRoute(first, from, to)).toEqual(firstRoute);
        expect(findGridRoute(larger, largerFrom, largerTo)).toEqual(largerRoute);
        expect(firstRoute).toEqual([from, point(0.5, 0.5), point(1.5, 0.5), point(2.5, 0.5), to]);
        expect(gridRouteLength(largerRoute)).toBeCloseTo(4 + 2 * (Math.SQRT2 - 1));
    });

    it('clears generation stamps when the search counter wraps', () => {
        const seenAt = new Uint32Array([1, 0xffff_ffff, 8]);
        const closedAt = new Uint32Array([5, 6, 7]);
        expect(nextRouteSearchGeneration(0xffff_ffff, seenAt, closedAt)).toBe(1);
        expect([...seenAt]).toEqual([0, 0, 0]);
        expect([...closedAt]).toEqual([0, 0, 0]);
        expect(nextRouteSearchGeneration(41, seenAt, closedAt)).toBe(42);
    });

    it('keeps same-cell fractional endpoints without adding a cell-center tail', () => {
        const from = point(0.2, 0.3), to = point(0.8, 0.9);
        const route = findGridRoute(grid([[1]]), from, to)!;
        expect(route).toEqual([from, to]);
        expect(gridRouteLength(route)).toBeCloseTo(Math.hypot(0.6, 0.6));
    });

    it('keeps fractional endpoints on a multi-cell route with matching length and interpolation', () => {
        const from = point(0.2, 0.5), to = point(2.8, 0.5);
        const route = findGridRoute(grid([[1, 1, 1]]), from, to)!;
        expect(route).toEqual([from, point(1.5, 0.5), to]);
        expect(gridRouteLength(route)).toBeCloseTo(2.6);
        expect(gridRoutePoint(route, 0.5).x).toBeCloseTo(1.5);
        expect(gridRoutePoint(route, 0.5).y).toBeCloseTo(0.5);
        expect(gridRoutePoint(route, 1)).toEqual(to);
    });

    it('routes to a legal cell within stop range when the target cell itself is blocked', () => {
        const map = grid([[1, 1, 0, 1]]);
        const from = point(0.5, 0.5), blockedTarget = point(2.5, 0.5);
        expect(findGridRoute(map, from, blockedTarget, 0)).toBeNull();
        expect(findGridRoute(map, from, blockedTarget, 1)).toEqual([from, point(1.5, 0.5)]);
    });

    it('returns null when the destination is disconnected or the start is blocked', () => {
        const map = grid([[1, 0, 1]]);
        expect(findGridRoute(map, point(0.5, 0.5), point(2.5, 0.5))).toBeNull();
        expect(findGridRoute(map, point(1.5, 0.5), point(2.5, 0.5))).toBeNull();
    });

    it('chooses distinct walkable cells from the supplied component when selecting homes', () => {
        const map = grid([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
        const component = connectedCells(map, point(1.5, 1.5));
        const first = nearestConnectedCell(map, point(1.2, 1.2), component);
        const second = nearestConnectedCell(map, point(1.2, 1.2), component, [first!]);
        expect(first).toEqual(point(1.5, 1.5));
        expect(second).not.toEqual(first);
        expect(gridWalkable(map, second!)).toBe(true);
    });

    it('stops a ray displacement before it enters a blocked cell', () => {
        const map = grid([[1, 1, 0, 1]]);
        const end = gridDisplacement(map, point(0.5, 0.5), 2.5, 0);
        expect(end.x).toBeGreaterThan(1.5);
        expect(end.x).toBeLessThan(2);
        expect(gridWalkable(map, end)).toBe(true);
    });

    it('interpolates at exact cumulative route distances and preserves exact endpoints', () => {
        const route = [point(0.5, 0.5), point(2.5, 0.5), point(2.5, 2.5)];
        expect(gridRoutePoint(route, 0)).toEqual(point(0.5, 0.5));
        expect(gridRoutePoint(route, 0.25)).toEqual(point(1.5, 0.5));
        expect(gridRoutePoint(route, 0.5)).toEqual(point(2.5, 0.5));
        expect(gridRoutePoint(route, 1)).toEqual(point(2.5, 2.5));
    });
});
