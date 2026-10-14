import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { buildApp } from '../server/app.js';
import { MemoryAccountStore } from './portal-fixture.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function setup(report = vi.fn()) {
  const accounts = new MemoryAccountStore();
  const app = await buildApp({ catalog: rawCatalog as unknown as Catalog, accounts, profiles: accounts.profiles,
    now: () => 1000, assetOrigin: 'http://assets.test:8080', assetFailureReporter: report });
  apps.push(app); return { app, report };
}

describe('private asset proxy failure diagnostics', () => {
  it('records an upstream failure without query, headers, body or upstream URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream body', { status: 502 })));
    const { app, report } = await setup();
    const response = await app.inject({ url: '/assets/data/poring.spr?private=secret-query',
      headers: { authorization: 'Bearer secret-header', cookie: 'secret-cookie' } });
    expect(response.statusCode).toBe(503);
    expect(report).toHaveBeenCalledTimes(1);
    const record = report.mock.calls[0][0];
    expect(record).toMatchObject({ method: 'GET', assetPath: 'data/poring.spr', kind: 'upstream', upstreamStatus: 502 });
    expect(record.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(record)).not.toMatch(/secret|private|assets\.test|body|Bearer/);
    expect(response.json().error).toEqual({ code: 'ASSET_UNAVAILABLE', message: 'Recursos do cliente indisponíveis.' });
  });
  it('distinguishes a connection failure and keeps only a bounded machine code', async () => {
    const error = new TypeError('secret stack and message', { cause: { code: 'UND_ERR_SOCKET', token: 'secret-cause' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    const { app, report } = await setup();
    expect((await app.inject({ method: 'HEAD', url: '/assets/data/body.spr' })).statusCode).toBe(503);
    expect(report.mock.calls[0][0]).toMatchObject({ method: 'HEAD', kind: 'transport', code: 'UND_ERR_SOCKET' });
    expect(JSON.stringify(report.mock.calls)).not.toContain('secret');
  });
  it('distinguishes an upstream timeout without extending the existing ten-second budget', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('secret timeout message', 'TimeoutError')));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { app, report } = await setup();
    expect((await app.inject({ url: '/assets/data/body.spr' })).statusCode).toBe(503);
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(report.mock.calls[0][0].kind).toBe('timeout');
    expect(JSON.stringify(report.mock.calls)).not.toContain('secret');
  });
  it.each([200, 304, 404, 416])('does not report a normal %s asset response', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(status === 304 ? null : 'asset', { status })));
    const { app, report } = await setup();
    expect((await app.inject({ url: '/assets/data/body.spr' })).statusCode).toBe(status);
    expect(report).not.toHaveBeenCalled();
  });
  it('records a failed upstream body stream once', async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(new TypeError('secret stream')); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    const { app, report } = await setup();
    await app.inject({ url: '/assets/data/body.spr' });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({ kind: 'stream', assetPath: 'data/body.spr' });
    expect(JSON.stringify(report.mock.calls)).not.toContain('secret stream');
  });
  it('keeps the normal error response when the diagnostic sink throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failure')));
    const { app, report } = await setup(vi.fn(() => { throw Error('sink failed'); }));
    const response = await app.inject({ url: '/assets/data/body.spr' });
    expect(response.statusCode).toBe(503); expect(response.json().error.code).toBe('ASSET_UNAVAILABLE');
    expect(report).toHaveBeenCalledTimes(1);
  });
  it('omits unexpected error text posing as a machine code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network', { cause: { code: 'secret-token/invalid' } })));
    const { app, report } = await setup(); await app.inject({ url: '/assets/data/body.spr' });
    expect(report.mock.calls[0][0].code).toBeUndefined();
    expect(JSON.stringify(report.mock.calls)).not.toContain('secret-token');
  });
});
