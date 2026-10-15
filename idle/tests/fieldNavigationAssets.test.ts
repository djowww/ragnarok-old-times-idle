import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFieldNavigationGrids } from '../server/fieldNavigationAssets';

const dirs: string[] = [];
const currentFieldMaps = ['prt_fild08', 'prt_sewb1', 'prt_fild04', 'prt_fild03', 'pay_dun00', 'iz_dun01', 'gef_fild10',
    'moc_pryd02', 'gef_dun02', 'gl_knt01', 'prt_sewb2', 'pay_dun01', 'iz_dun02', 'orcsdun01', 'prt_fild00',
    'prt_fild01', 'prt_fild02', 'prt_fild05', 'prt_fild06', 'prt_fild07', 'prt_fild09', 'prt_fild10', 'prt_fild11',
    'gef_fild00', 'gef_fild02', 'gef_fild09', 'pay_fild01', 'pay_fild04', 'pay_fild09'];
async function tempCache() {
    const dir = await mkdtemp(join(tmpdir(), 'ragidle-navigation-'));
    dirs.push(dir);
    return dir;
}
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

function gat(type = 0) {
    const data = new Uint8Array(34);
    data.set([71, 82, 65, 84, 1, 2]);
    const view = new DataView(data.buffer);
    view.setUint32(6, 1, true); view.setUint32(10, 1, true); view.setUint32(30, type, true);
    return data;
}
const response = (bytes: Uint8Array, status = 200): Response => new Response(Buffer.from(bytes), { status });

describe('private field navigation asset loader', () => {
    it('loads every requested map from the exact upstream data path', async () => {
        const requested: string[] = [];
        const result = await loadFieldNavigationGrids({ maps: ['prt_fild08', 'prt_sewb1', 'gef_fild00'],
            assetOrigin: 'https://play.example.test:8443/assets/', fetchImpl: async input => {
                requested.push(String(input)); return response(gat());
            } });
        expect(requested).toEqual(['https://play.example.test:8443/assets/data/prt_fild08.gat',
            'https://play.example.test:8443/assets/data/prt_sewb1.gat', 'https://play.example.test:8443/assets/data/gef_fild00.gat']);
        expect([...result.grids.keys()]).toEqual(['prt_fild08', 'prt_sewb1', 'gef_fild00']);
    });

    it('loads all 29 current field and dungeon maps before returning a complete grid set', async () => {
        const requested: string[] = [];
        const result = await loadFieldNavigationGrids({ maps: currentFieldMaps, assetOrigin: 'https://play.example.test:8443/assets', fetchImpl: async input => {
            requested.push(String(input)); return response(gat());
        } });
        expect(requested).toHaveLength(29);
        expect([...result.grids.keys()]).toEqual(currentFieldMaps);
        expect(result.cacheFallbackMaps).toEqual([]);
    });

    it('keeps concurrent upstream fetches at two or fewer', async () => {
        let active = 0, peak = 0;
        const result = await loadFieldNavigationGrids({ maps: ['a_01', 'a_02', 'a_03', 'a_04', 'a_05'], assetOrigin: 'https://assets.test', fetchImpl: async () => {
            active++; peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active--; return response(gat());
        } });
        expect(result.grids.size).toBe(5);
        expect(peak).toBe(2);
    });

    it('retries transient upstream failures a bounded number of times', async () => {
        let calls = 0;
        const result = await loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', fetchImpl: async () => {
            calls++;
            return calls < 3 ? response(gat(), 503) : response(gat());
        } });
        expect(calls).toBe(3);
        expect(result.grids.size).toBe(1);
    });

    it('passes an abort signal so a stalled upstream request has a timeout', async () => {
        const signals: AbortSignal[] = [];
        let calls = 0;
        const pending = loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', fetchImpl: async (_input, init) => {
            calls++;
            const signal = init?.signal as AbortSignal;
            signals.push(signal);
            return await new Promise<Response>((_resolve, reject) => signal.addEventListener('abort',
                () => reject(new DOMException('Request aborted', 'AbortError')), { once: true }));
        } });
        const error = await pending.then(() => new Error('expected timeout to reject'), reason => reason as Error);
        expect(error.message).toMatch(/field navigation unavailable for prt_fild08/i);
        expect(calls).toBe(3);
        expect(signals).toHaveLength(3);
        expect(signals.every(signal => signal.aborted)).toBe(true);
        expect((error.cause as Error).cause).toMatchObject({ message: expect.stringMatching(/timed out/i) });
    }, 10_000);

    it('writes an atomic cache entry with source and mask checksums and decoder metadata', async () => {
        const cacheDir = await tempCache(), bytes = gat();
        const result = await loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', cacheDir, fetchImpl: async () => response(bytes) });
        const metadata = JSON.parse(await readFile(join(cacheDir, 'prt_fild08.navigation.json'), 'utf8'));
        expect(metadata).toMatchObject({ map: 'prt_fild08', width: 1, height: 1, decoderRevision: expect.any(String),
            sourceSha256: createHash('sha256').update(bytes).digest('hex'), maskSha256: expect.any(String) });
        expect(metadata.maskSha256).toBe(createHash('sha256').update(Buffer.from(metadata.walkable, 'base64')).digest('hex'));
        expect(metadata.formatVersion).toBe(2);
        expect(metadata.wallSha256).toBe(createHash('sha256').update(Buffer.from(metadata.wall, 'base64')).digest('hex'));
        expect(result.cacheFallbackMaps).toEqual([]);
    });

    it('uses only a validated private cache after upstream failure and reports the fallback map', async () => {
        const cacheDir = await tempCache(), bytes = gat();
        await loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', cacheDir, fetchImpl: async () => response(bytes) });
        const fallback = await loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', cacheDir,
            fetchImpl: async () => { throw new Error('offline'); } });
        expect(fallback.cacheFallbackMaps).toEqual(['prt_fild08']);
        expect(fallback.grids.get('prt_fild08')?.sourceSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
        expect(Array.from(fallback.grids.get('prt_fild08')?.wall ?? [])).toEqual([0]);
    });

    it.each(['old-version', 'missing-wall', 'wall-checksum', 'wall-base64', 'wall-length'])(
      'fails closed on %s cache after upstream loss', async defect => {
        const cacheDir = await tempCache(), path = join(cacheDir, 'prt_fild08.navigation.json');
        await loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', cacheDir,
          fetchImpl: async () => response(gat(5)) });
        const record = JSON.parse(await readFile(path, 'utf8'));
        if (defect === 'old-version') record.formatVersion = 1;
        if (defect === 'missing-wall') delete record.wall;
        if (defect === 'wall-checksum') record.wallSha256 = '0'.repeat(64);
        if (defect === 'wall-base64') record.wall += '!';
        if (defect === 'wall-length') { record.wall = 'AAAA'; record.wallSha256 = createHash('sha256').update(Buffer.from(record.wall, 'base64')).digest('hex'); }
        await writeFile(path, JSON.stringify(record));
        await expect(loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', cacheDir,
          fetchImpl: async () => response(gat(), 404) })).rejects.toThrow(/field navigation unavailable/i);
      });

    it('rejects private cache metadata with non-positive dimensions', async () => {
        const cacheDir = await tempCache(), bytes = gat();
        await loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', cacheDir, fetchImpl: async () => response(bytes) });
        const path = join(cacheDir, 'prt_fild08.navigation.json');
        const record = JSON.parse(await readFile(path, 'utf8'));
        record.width = -1; record.height = -1;
        await writeFile(path, JSON.stringify(record));
        await expect(loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', cacheDir,
            fetchImpl: async () => response(gat(), 404) })).rejects.toThrow(/field navigation unavailable/i);
    });

    it('cancels an over-limit stream while reading incrementally without a content-length header', async () => {
        let produced = 0, cancelled = false;
        const body = new ReadableStream<Uint8Array>({
            pull(controller) { produced++; controller.enqueue(new Uint8Array(10_000_000)); },
            cancel() { cancelled = true; },
        }, { highWaterMark: 0 });
        const pending = loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', fetchImpl: async () => new Response(body) });
        const error = await pending.then(() => new Error('expected an oversized response to fail'), reason => reason as Error);
        expect((error.cause as Error).message).toMatch(/too large/i);
        expect(produced).toBeLessThanOrEqual(3);
        expect(cancelled).toBe(true);
    });

    it('fails when both upstream and a corrupted cache are unavailable', async () => {
        const cacheDir = await tempCache();
        await (await import('node:fs/promises')).writeFile(join(cacheDir, 'prt_fild08.navigation.json'), '{broken');
        await expect(loadFieldNavigationGrids({ maps: ['prt_fild08'], assetOrigin: 'https://assets.test', cacheDir,
            fetchImpl: async () => response(gat(), 404) })).rejects.toThrow(/prt_fild08/i);
    });

    it('rejects traversal names before making a network request', async () => {
        const fetchImpl = vi.fn(async () => response(gat()));
        await expect(loadFieldNavigationGrids({ maps: ['../secret'], assetOrigin: 'https://assets.test', fetchImpl })).rejects.toThrow(/map|name/i);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
