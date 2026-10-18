export interface FieldNavigationGrid {
    map: string;
    width: number;
    height: number;
    /** Row-major packed bits; bit 0 of byte 0 is cell (0, 0). */
    walkable: Uint8Array;
    /** Independent Hercules CELL_CHKWALL mask. Always present on decoded production grids. */
    wall?: Uint8Array;
    /** GAT type 3 is walkable water in Hercules map_gat2cell. */
    water?: Uint8Array;
    sourceSha256: string;
}

export interface GridPoint { x: number; y: number }

export const FIELD_NAVIGATION_DECODER_REVISION = 'roBrowserLegacy:d88a3cd4acde0582530e3fc1908532a92e9accea/src/Loaders/Altitude.js:hercules410b9738-cell-chkwall-water-v3';
const MAX_CELLS = 1_000_000;
const RAW_WALKABILITY = new Map<number, boolean>([
    [0, true], [1, false], [2, true], [3, true], [4, true], [5, false], [6, true],
    [0x80000000, true], [0x80000001, false], [0x80000002, true], [0x80000003, true],
    [0x80000004, false], [0x80000005, true], [0x80000006, true], [0x80000007, false],
    [0x80000008, false], [0x80000009, false],
]);

function isSafeMapName(map: string): boolean {
    return /^[a-z][a-z0-9_]*$/.test(map);
}

function validSha256(value: string): boolean { return /^[a-f0-9]{64}$/i.test(value); }

function assertGridShape(grid: FieldNavigationGrid): void {
    if (!isSafeMapName(grid.map) || !Number.isInteger(grid.width) || !Number.isInteger(grid.height) ||
        grid.width <= 0 || grid.height <= 0 || grid.width * grid.height > MAX_CELLS ||
        !(grid.walkable instanceof Uint8Array) || grid.walkable.byteLength !== Math.ceil(grid.width * grid.height / 8) ||
        !validSha256(grid.sourceSha256)) throw new TypeError('Invalid field navigation grid');
}

function cellAt(grid: FieldNavigationGrid, p: GridPoint): number | null {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x >= grid.width || p.y >= grid.height) return null;
    return Math.floor(p.y) * grid.width + Math.floor(p.x);
}

function bitIsSet(bits: Uint8Array, id: number): boolean { return (bits[id >> 3] & (1 << (id & 7))) !== 0; }
function setBit(bits: Uint8Array, id: number): void { bits[id >> 3] |= 1 << (id & 7); }
function isWalkableCell(grid: FieldNavigationGrid, id: number): boolean { return bitIsSet(grid.walkable, id); }

/** Parse the pinned roBrowserLegacy 1.2 GAT representation into a compact collision mask. */
export function decodeGat(map: string, bytes: Uint8Array, sourceSha256: string): FieldNavigationGrid {
    if (!isSafeMapName(map)) throw new TypeError(`Invalid map name: ${map}`);
    if (!validSha256(sourceSha256)) throw new TypeError('Invalid GAT source SHA-256');
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 14) throw new Error('Truncated GAT header');
    if (bytes[0] !== 71 || bytes[1] !== 82 || bytes[2] !== 65 || bytes[3] !== 84) throw new Error('Invalid GAT magic');
    if (bytes[4] !== 1 || bytes[5] !== 2) throw new Error(`Unsupported GAT version ${bytes[4]}.${bytes[5]}`);

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(6, true), height = view.getUint32(10, true);
    const cells = width * height;
    if (width === 0 || height === 0 || !Number.isSafeInteger(cells) || cells > MAX_CELLS) throw new Error('Invalid GAT dimensions');
    if (bytes.byteLength !== 14 + cells * 20) throw new Error('Invalid GAT length: expected exactly 14 + 20 bytes per cell');

    const walkable = new Uint8Array(Math.ceil(cells / 8));
    const wall = new Uint8Array(walkable.byteLength);
    const water = new Uint8Array(walkable.byteLength);
    for (let id = 0; id < cells; id++) {
        const rawType = view.getUint32(14 + id * 20 + 16, true);
        const isWalkable = RAW_WALKABILITY.get(rawType);
        if (isWalkable === undefined) throw new Error(`Unknown GAT cell type ${rawType} at cell ${id}`);
        if (isWalkable) setBit(walkable, id);
        // map.c map_gat2cell: type1 is wall; type5 is a shootable cliff.
        // Hercules's default zeroed cell treats extended types as wall. Actor
        // movement retains the existing roBrowser extended-type interpretation.
        if (rawType === 1 || rawType > 6) setBit(wall, id);
        if (rawType === 3) setBit(water, id);
    }
    return { map, width, height, walkable, wall, water, sourceSha256 };
}

/** Fail closed when a wall-sensitive consumer receives an old walkability-only grid. */
export function gridWall(grid: FieldNavigationGrid, p: GridPoint): boolean {
    if (!(grid.wall instanceof Uint8Array) || grid.wall.byteLength !== grid.walkable.byteLength)
        throw new TypeError('Navigation terrain wall mask is unavailable');
    // map.c3199: outside/final-border cells return true only for CHKNOPASS,
    // so CELL_CHKWALL is false. Unit destination checks separately use REACH.
    if (p.x < 0 || p.y < 0 || p.x >= grid.width - 1 || p.y >= grid.height - 1) return false;
    const id = cellAt(grid, p);
    return id !== null && bitIsSet(grid.wall, id);
}

export function gridWalkable(grid: FieldNavigationGrid, p: GridPoint): boolean {
    const id = cellAt(grid, p);
    return id !== null && isWalkableCell(grid, id);
}

/** Fail closed when source GAT water terrain was not retained. */
export function gridWater(grid: FieldNavigationGrid, p: GridPoint): boolean {
    if (!(grid.water instanceof Uint8Array) || grid.water.byteLength !== grid.walkable.byteLength)
        throw new TypeError('Navigation terrain water mask is unavailable');
    const id = cellAt(grid, p);
    return id !== null && bitIsSet(grid.water, id);
}

/** Hercules map_getcellp's useful CELL_CHKPASS domain excludes the final row and column. */
export function herculesCellPassable(grid: FieldNavigationGrid, point: GridPoint): boolean {
    return Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.y >= 0 &&
        point.x < grid.width - 1 && point.y < grid.height - 1 && gridWalkable(grid, point);
}

/**
 * Source-compatible directional push: test only each next cell and stop at
 * the first blocked destination. Hercules path_blownpos does not route around
 * walls or impose the navigation search's diagonal corner restriction.
 */
export function gridHerculesDisplacement(grid: FieldNavigationGrid, from: GridPoint,
    dx: number, dy: number, count: number): GridPoint {
    assertGridShape(grid);
    if (!herculesCellPassable(grid, from) || !Number.isSafeInteger(count) || count < 1 ||
        !Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy))
        return { ...from };
    let moved = 0;
    for (let step = 1; step <= count; step++) {
        if (!herculesCellPassable(grid, { x: from.x + dx * step, y: from.y + dy * step })) break;
        moved = step;
    }
    return { x: from.x + dx * moved, y: from.y + dy * moved };
}

const NEIGHBOR_OFFSETS = [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

function neighbors(grid: FieldNavigationGrid, id: number, out: number[]): number[] {
    out.length = 0;
    const x = id % grid.width, y = Math.floor(id / grid.width);
    // Stable y-major order is also the tie-break order for equal A* routes.
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
        const next = ny * grid.width + nx;
        if (!isWalkableCell(grid, next)) continue;
        if (dx !== 0 && dy !== 0 &&
            (!isWalkableCell(grid, y * grid.width + nx) || !isWalkableCell(grid, ny * grid.width + x))) continue;
        out.push(next);
    }
    return out;
}

/** Return the compact bitset of cells reachable from a legal start. */
export function connectedCells(grid: FieldNavigationGrid, start: GridPoint): Uint8Array {
    assertGridShape(grid);
    const component = new Uint8Array(grid.walkable.length), startId = cellAt(grid, start);
    if (startId === null || !isWalkableCell(grid, startId)) return component;
    const queue = new Int32Array(grid.width * grid.height);
    let head = 0, tail = 0;
    const adjacent: number[] = [];
    queue[tail++] = startId; setBit(component, startId);
    while (head < tail) {
        const current = queue[head++];
        for (const next of neighbors(grid, current, adjacent)) {
            if (bitIsSet(component, next)) continue;
            setBit(component, next); queue[tail++] = next;
        }
    }
    return component;
}

/** Find the nearest component cell center, breaking equal distances by row then column. */
export function nearestConnectedCell(grid: FieldNavigationGrid, p: GridPoint, component: Uint8Array,
    excluded: readonly GridPoint[] = []): GridPoint | null {
    assertGridShape(grid);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || component.length !== grid.walkable.length) return null;
    const skip = new Set<number>();
    for (const entry of excluded) { const id = cellAt(grid, entry); if (id !== null) skip.add(id); }
    let best = -1, bestDistance = Number.POSITIVE_INFINITY;
    for (let id = 0; id < grid.width * grid.height; id++) {
        if (!bitIsSet(component, id) || !isWalkableCell(grid, id) || skip.has(id)) continue;
        const x = id % grid.width + 0.5, y = Math.floor(id / grid.width) + 0.5;
        const distance = (x - p.x) ** 2 + (y - p.y) ** 2;
        if (distance < bestDistance) { best = id; bestDistance = distance; }
    }
    return best < 0 ? null : { x: best % grid.width + 0.5, y: Math.floor(best / grid.width) + 0.5 };
}

interface OpenNode { id: number; g: number; h: number; order: number }
interface RouteScratch {
    costs: Float64Array; previous: Int32Array; seenAt: Uint32Array; closedAt: Uint32Array;
    generation: number; open: OpenNode[]; adjacent: number[];
}
let sharedRouteScratch: RouteScratch | undefined;

/** @internal Shared by both synchronous planners and exposed for wrap-boundary coverage. */
export function nextRouteSearchGeneration(generation: number, seenAt: Uint32Array, closedAt: Uint32Array): number {
    if (generation >= 0xffff_ffff) {
        seenAt.fill(0); closedAt.fill(0);
        return 1;
    }
    return generation + 1;
}

function routeScratch(count: number): RouteScratch {
    let scratch = sharedRouteScratch;
    if (!scratch || scratch.costs.length < count) {
        scratch = { costs: new Float64Array(count), previous: new Int32Array(count),
            seenAt: new Uint32Array(count), closedAt: new Uint32Array(count),
            generation: 0, open: [], adjacent: [] };
        sharedRouteScratch = scratch;
    }
    scratch.generation = nextRouteSearchGeneration(scratch.generation, scratch.seenAt, scratch.closedAt);
    scratch.open.length = 0;
    return scratch;
}

function less(a: OpenNode, b: OpenNode): boolean {
    const af = a.g + a.h, bf = b.g + b.h;
    return af < bf || (af === bf && (a.h < b.h || (a.h === b.h && a.order < b.order)));
}

function heapPush(heap: OpenNode[], value: OpenNode): void {
    let i = heap.length; heap.push(value);
    while (i > 0) { const parent = (i - 1) >> 1; if (!less(value, heap[parent])) break; heap[i] = heap[parent]; i = parent; }
    heap[i] = value;
}
function heapPop(heap: OpenNode[]): OpenNode | undefined {
    if (!heap.length) return undefined;
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
        let i = 0;
        while (true) {
            const left = i * 2 + 1, right = left + 1;
            if (left >= heap.length) break;
            const child = right < heap.length && less(heap[right], heap[left]) ? right : left;
            if (!less(heap[child], last)) break;
            heap[i] = heap[child]; i = child;
        }
        heap[i] = last;
    }
    return first;
}

function octileToGoal(x: number, y: number, targetX: number, targetY: number, range: number): number {
    const dx = Math.max(0, Math.abs(x - targetX) - range), dy = Math.max(0, Math.abs(y - targetY) - range);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/** Deterministic A* over eight neighbors with diagonal corner cutting forbidden. */
export function findGridRoute(grid: FieldNavigationGrid, from: GridPoint, to: GridPoint, stopRange = 0, blockedCells?: ReadonlySet<string>): GridPoint[] | null {
    assertGridShape(grid);
    const startId = cellAt(grid, from), targetId = cellAt(grid, to);
    const isBlocked = (id: number) => blockedCells?.has(`${id % grid.width},${Math.floor(id / grid.width)}`) ?? false;
    if (startId === null || targetId === null || !isWalkableCell(grid, startId) ||
        !Number.isInteger(stopRange) || stopRange < 0 ||
        (stopRange === 0 && (!isWalkableCell(grid, targetId) || isBlocked(targetId)))) return null;
    const startX = startId % grid.width, startY = Math.floor(startId / grid.width);
    const targetX = targetId % grid.width, targetY = Math.floor(targetId / grid.width);
    if (isBlocked(startId)) return null;
    const isGoal = (id: number) => Math.max(Math.abs(id % grid.width - targetX), Math.abs(Math.floor(id / grid.width) - targetY)) <= stopRange;
    if (isGoal(startId)) return startId === targetId ? [from, ...(from.x === to.x && from.y === to.y ? [] : [to])] : [from];

    const scratch = routeScratch(grid.width * grid.height), { costs, previous, seenAt, closedAt, open, adjacent } = scratch;
    const generation = scratch.generation;
    let order = 0;
    seenAt[startId] = generation; costs[startId] = 0;
    heapPush(open, { id: startId, g: 0, h: octileToGoal(startX, startY, targetX, targetY, stopRange), order: order++ });
    let goal = -1;
    while (open.length) {
        const current = heapPop(open)!;
        if (closedAt[current.id] === generation || seenAt[current.id] !== generation || current.g !== costs[current.id]) continue;
        if (isGoal(current.id)) { goal = current.id; break; }
        closedAt[current.id] = generation;
        for (const next of neighbors(grid, current.id, adjacent)) {
            if (closedAt[next] === generation || isBlocked(next)) continue;
            const g = current.g + (next % grid.width !== current.id % grid.width && Math.floor(next / grid.width) !== Math.floor(current.id / grid.width) ? Math.SQRT2 : 1);
            if (seenAt[next] === generation && g >= costs[next]) continue;
            seenAt[next] = generation;
            costs[next] = g; previous[next] = current.id;
            const h = octileToGoal(next % grid.width, Math.floor(next / grid.width), targetX, targetY, stopRange);
            heapPush(open, { id: next, g, h, order: order++ });
        }
    }
    if (goal < 0) return null;
    const ids: number[] = [];
    for (let id = goal; id >= 0; id = previous[id]) { ids.push(id); if (id === startId) break; }
    if (ids[ids.length - 1] !== startId) return null;
    ids.reverse();
    const route: GridPoint[] = [from];
    for (let i = 1; i < ids.length - 1; i++) route.push({ x: ids[i] % grid.width + 0.5, y: Math.floor(ids[i] / grid.width) + 0.5 });
    if (goal === targetId) route.push(to);
    else route.push({ x: goal % grid.width + 0.5, y: Math.floor(goal / grid.width) + 0.5 });
    open.length = 0;
    return route;
}

export function gridRouteLength(route: readonly GridPoint[]): number {
    let length = 0;
    for (let i = 1; i < route.length; i++) length += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
    return length;
}

export function gridRoutePoint(route: readonly GridPoint[], fraction: number): GridPoint {
    if (!route.length || !Number.isFinite(fraction)) throw new TypeError('A route and finite fraction are required');
    if (fraction <= 0 || route.length === 1) return { ...route[0] };
    if (fraction >= 1) return { ...route[route.length - 1] };
    const total = gridRouteLength(route);
    if (total === 0) return { ...route[0] };
    let remaining = total * fraction;
    for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i], segment = Math.hypot(b.x - a.x, b.y - a.y);
        if (segment === 0) continue;
        if (remaining <= segment) {
            const t = remaining / segment;
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        remaining -= segment;
    }
    return { ...route[route.length - 1] };
}

/** Move along a straight displacement in small legal increments, stopping before blocked terrain. */
export function gridDisplacement(grid: FieldNavigationGrid, from: GridPoint, dx: number, dy: number): GridPoint {
    assertGridShape(grid);
    if (!gridWalkable(grid, from) || !Number.isFinite(dx) || !Number.isFinite(dy)) return { ...from };
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 32));
    let last = { ...from }, previousCell = cellAt(grid, from)!;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps, next = { x: from.x + dx * t, y: from.y + dy * t }, nextCell = cellAt(grid, next);
        if (nextCell === null || !isWalkableCell(grid, nextCell)) break;
        const oldX = previousCell % grid.width, oldY = Math.floor(previousCell / grid.width);
        const newX = nextCell % grid.width, newY = Math.floor(nextCell / grid.width);
        if (oldX !== newX && oldY !== newY &&
            (!gridWalkable(grid, { x: oldX + (newX > oldX ? 1 : -1) + 0.5, y: oldY + 0.5 }) ||
                !gridWalkable(grid, { x: oldX + 0.5, y: oldY + (newY > oldY ? 1 : -1) + 0.5 }))) break;
        last = next; previousCell = nextCell;
    }
    return last;
}
