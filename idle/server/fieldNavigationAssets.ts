import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeGat, FIELD_NAVIGATION_DECODER_REVISION, type FieldNavigationGrid } from '../shared/fieldNavigation.js';

const MAX_CELLS = 1_000_000;
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 3_000;

export interface LoadFieldNavigationOptions {
    maps: string[];
    assetOrigin: string;
    cacheDir?: string;
    fetchImpl?: typeof fetch;
}

export interface LoadedFieldNavigationGrids {
    grids: ReadonlyMap<string, FieldNavigationGrid>;
    cacheFallbackMaps: string[];
}

interface NavigationCacheRecord {
    formatVersion: 1;
    map: string;
    width: number;
    height: number;
    decoderRevision: string;
    sourceSha256: string;
    maskSha256: string;
    walkable: string;
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function isSafeMapName(map: string): boolean { return /^[a-z][a-z0-9_]*$/.test(map); }
function isSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }

function assetUrl(assetOrigin: string, map: string): string {
    let parsed: URL;
    try { parsed = new URL(assetOrigin); } catch { throw new TypeError('Invalid navigation asset origin'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash || parsed.username || parsed.password) {
        throw new TypeError('Navigation asset origin must be an HTTP(S) URL without credentials, query, or fragment');
    }
    return `${assetOrigin.replace(/\/+$/, '')}/data/${map}.gat`;
}

function cachePath(cacheDir: string, map: string): string { return join(cacheDir, `${map}.navigation.json`); }

async function readBoundedGatBody(response: Response, map: string): Promise<Uint8Array> {
    const limit = 14 + MAX_CELLS * 20;
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > limit) {
                await reader.cancel().catch(() => undefined);
                throw new Error(`GAT response is too large for ${map}`);
            }
            chunks.push(value);
        }
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
}

async function readValidatedCache(cacheDir: string, map: string): Promise<FieldNavigationGrid | null> {
    let value: unknown;
    try { value = JSON.parse(await readFile(cachePath(cacheDir, map), 'utf8')); }
    catch { return null; }
    if (!value || typeof value !== 'object') return null;
    const record = value as Partial<NavigationCacheRecord>;
    if (record.formatVersion !== 1 || record.map !== map || record.decoderRevision !== FIELD_NAVIGATION_DECODER_REVISION ||
        !Number.isInteger(record.width) || !Number.isInteger(record.height) || record.width! <= 0 || record.height! <= 0 ||
        record.width! * record.height! > MAX_CELLS || !isSha(record.sourceSha256) || !isSha(record.maskSha256) ||
        typeof record.walkable !== 'string') return null;
    const cells = record.width! * record.height!, expectedLength = Math.ceil(cells / 8);
    const walkable = Buffer.from(record.walkable, 'base64');
    if (walkable.length !== expectedLength || walkable.toString('base64') !== record.walkable || sha256(walkable) !== record.maskSha256) return null;
    return { map, width: record.width!, height: record.height!, walkable, sourceSha256: record.sourceSha256 };
}

async function writeCache(cacheDir: string, grid: FieldNavigationGrid): Promise<void> {
    await mkdir(cacheDir, { recursive: true, mode: 0o700 });
    const record: NavigationCacheRecord = {
        formatVersion: 1,
        map: grid.map,
        width: grid.width,
        height: grid.height,
        decoderRevision: FIELD_NAVIGATION_DECODER_REVISION,
        sourceSha256: grid.sourceSha256,
        maskSha256: sha256(grid.walkable),
        walkable: Buffer.from(grid.walkable).toString('base64'),
    };
    const destination = cachePath(cacheDir, grid.map);
    const temporary = join(cacheDir, `.${grid.map}.${randomUUID()}.tmp`);
    try {
        await writeFile(temporary, JSON.stringify(record), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        await rename(temporary, destination);
    } catch (error) {
        const { unlink } = await import('node:fs/promises');
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
}

async function fetchGat(map: string, url: string, fetchImpl: typeof fetch): Promise<Uint8Array> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
        const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
        try {
            const response = await fetchImpl(url, { signal });
            if (!response.ok) {
                const error = new Error(`GAT upstream returned HTTP ${response.status} for ${map}`);
                if (response.status !== 408 && response.status !== 429 && response.status < 500) throw error;
                lastError = error;
            } else {
                const contentLength = Number(response.headers.get('content-length'));
                if (Number.isFinite(contentLength) && contentLength > 14 + MAX_CELLS * 20) {
                    await response.body?.cancel().catch(() => undefined);
                    throw new Error(`GAT response is too large for ${map}`);
                }
                return await readBoundedGatBody(response, map);
            }
        } catch (error) {
            if (signal.aborted) lastError = new Error(`GAT request timed out for ${map}`, { cause: error });
            if (error instanceof Error && error.message.startsWith('GAT upstream returned HTTP') && !/HTTP (408|429|5\d\d)/.test(error.message)) throw error;
            if (error instanceof Error && error.message.startsWith('GAT response is too large')) throw error;
            if (!signal.aborted) lastError = error;
        }
        if (attempt < MAX_FETCH_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 100 * attempt));
    }
    throw new Error(`Unable to load GAT for ${map} after ${MAX_FETCH_ATTEMPTS} attempts`, { cause: lastError });
}

/** Load private GAT-derived masks, with a bounded upstream fetch and a checksum-validated private cache. */
export async function loadFieldNavigationGrids(options: LoadFieldNavigationOptions): Promise<LoadedFieldNavigationGrids> {
    if (!Array.isArray(options.maps) || !options.maps.length || options.maps.some(map => typeof map !== 'string' || !isSafeMapName(map))) {
        throw new TypeError('Navigation map list contains an invalid map name');
    }
    if (new Set(options.maps).size !== options.maps.length) throw new TypeError('Navigation map list contains duplicates');
    const urls = new Map(options.maps.map(map => [map, assetUrl(options.assetOrigin, map)]));
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    const grids = new Map<string, FieldNavigationGrid>(), cacheFallbackMaps: string[] = [];
    let next = 0, failure: unknown;

    const worker = async () => {
        while (failure === undefined) {
            const index = next++;
            if (index >= options.maps.length) return;
            const map = options.maps[index];
            try {
                const bytes = await fetchGat(map, urls.get(map)!, fetchImpl);
                const grid = decodeGat(map, bytes, sha256(bytes));
                if (options.cacheDir) await writeCache(options.cacheDir, grid);
                grids.set(map, grid);
            } catch (upstreamError) {
                const cached = options.cacheDir ? await readValidatedCache(options.cacheDir, map) : null;
                if (cached) {
                    grids.set(map, cached);
                    cacheFallbackMaps.push(map);
                } else {
                    failure = new Error(`Field navigation unavailable for ${map}; upstream failed and no valid private cache exists`, { cause: upstreamError });
                }
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(2, options.maps.length) }, worker));
    if (failure !== undefined) throw failure;
    return { grids, cacheFallbackMaps: options.maps.filter(map => cacheFallbackMaps.includes(map)) };
}
