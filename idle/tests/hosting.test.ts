import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { buildApp } from '../server/app.js';
import { MemoryAccountStore } from './portal-fixture.js';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function setup(assetOrigin?: string, allowedOrigins?: string[]) {
  const webRoot = await mkdtemp(join(tmpdir(), 'idle-hosting-'));
  cleanups.push(() => rm(webRoot, { recursive: true, force: true }));
  const html = '<!doctype html><html><body><div id="root">Portal fixture</div></body></html>';
  await writeFile(join(webRoot, 'index.html'), html);
  const accounts = new MemoryAccountStore();
  const app = await buildApp({ catalog: catalogJSON as unknown as Catalog, accounts, profiles: accounts.profiles, now: () => 1000, webRoot, assetOrigin, allowedOrigins });
  cleanups.push(() => app.close());
  return { app, html };
}

describe('portal hosting', () => {
  it.each(['/', '/registro', '/cadastro', '/noticias/primeiros-passos', '/ranking', '/painel', '/jogar'])('serves the SPA on direct GET %s', async url => {
    const { app, html } = await setup();
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toBe(html);
  });
  it('keeps missing API and invalid client assets out of the SPA fallback', async () => {
    const { app } = await setup();
    const api = await app.inject({ method: 'GET', url: '/api/recurso-inexistente' });
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe('NOT_FOUND');
    const asset = await app.inject({ method: 'GET', url: '/assets/path-invalido' });
    expect(asset.statusCode).toBe(400);
    expect(asset.json().error.code).toBe('INVALID_ASSET');
    for (const response of [api, asset]) expect(response.headers['content-type']).toContain('application/json');
  });
  it('never caches authenticated identity, game responses or authentication failures', async () => {
    const { app } = await setup();
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'hosting', characterName: 'Hosting', gender: 'male', password: 'hosting-password', confirmation: 'hosting-password' } });
    expect(registered.statusCode).toBe(201);
    const cookies = { idle_session: registered.cookies[0].value };
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', cookies });
    const session = await app.inject({ method: 'POST', url: '/api/session', cookies, payload: {} });
    const anonymous = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(me.statusCode).toBe(200);
    expect(session.statusCode).toBe(200);
    expect(anonymous.statusCode).toBe(401);
    for (const response of [registered, me, session, anonymous]) expect(response.headers['cache-control']).toBe('no-store');
  });
  it('accepts configured public origins and uses secure session cookies behind HTTPS', async () => {
    const publicOrigin = 'https://tibia74.tech:8443';
    const { app } = await setup(undefined, [publicOrigin]);
    const accepted = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin: publicOrigin, 'sec-fetch-site': 'same-origin' }, payload: { username: 'publicuser', characterName: 'Public User', gender: 'male', password: 'public-user-password', confirmation: 'public-user-password' } });
    expect(accepted.statusCode).toBe(201);
    expect(String(accepted.headers['set-cookie'])).toContain('Secure');
    const rejected = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, payload: { username: 'intruder', characterName: 'Intruder', gender: 'male', password: 'intruder-password', confirmation: 'intruder-password' } });
    expect(rejected.statusCode).toBe(403);
  });
  it('keeps an upstream missing client bitmap as JSON 404', async () => {
    const upstream = createServer((_request, response) => { response.writeHead(404); response.end('missing'); });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve())));
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Expected upstream TCP address');
    const { app } = await setup(`http://127.0.0.1:${address.port}`);
    const response = await app.inject({ method: 'GET', url: '/assets/data/missing.bmp' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json().error.code).toBe('ASSET_UNAVAILABLE');
  });
});
