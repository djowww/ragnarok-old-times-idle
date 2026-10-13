import { createHash } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import { createInitialState } from '../engine';
import { buildApp } from '../server/app';
import type { AccountView } from '../shared/portal-types';
import type { Catalog } from '../shared/types';
import { MemoryAccountStore } from './portal-fixture';

const catalog = catalogJSON as unknown as Catalog;
const adminToken = 'synthetic-admin-identity-test-token-32-characters';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

async function setup() {
  const accounts = new MemoryAccountStore();
  const identities: Record<string, AccountView> = {};
  const tokens = { alpha: 'a'.repeat(43), beta: 'b'.repeat(43) };
  for (const name of ['alpha', 'beta'] as const) {
    const profile = createInitialState(catalog, 1000);
    profile.id = `admin-profile-${name}`; profile.name = name;
    identities[name] = await accounts.register({ username: name, nameKey: name, passwordHash: 'test-only', profile }, {
      tokenHash: createHash('sha256').update(tokens[name]).digest('hex'), createdAt: 1000, expiresAt: 100000,
    });
  }
  const app = await buildApp({ catalog, accounts, profiles: accounts.profiles, now: () => 1000, adminToken });
  apps.push(app);
  const identityHeader = (name: string) => JSON.stringify([identities[name].accountId, identities[name].profileId]);
  const opened = await app.inject({ method: 'POST', url: '/api/admin/session', cookies: { idle_session: tokens.alpha },
    headers: { 'x-idle-expected-identity': identityHeader('alpha') }, payload: { token: adminToken } });
  expect(opened.statusCode).toBe(200);
  const setCookie = opened.headers['set-cookie'];
  const adminCookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0].split('=')[1];
  return { app, accounts, identityHeader, cookies: { idle_session: tokens.beta, ragidle_admin: adminCookie } };
}

it.each([
  ['GET', '/api/admin/session'],
  ['POST', '/api/admin/session'],
  ['POST', '/api/admin/logout'],
] as const)('rejects stale identity on %s %s without changing the current admin cookie', async (method, url) => {
  const { app, accounts, cookies, identityHeader } = await setup();
  const before = await accounts.profiles.forProfile('admin-profile-beta').read();
  const stale = await app.inject({ method, url, cookies,
    headers: { 'x-idle-expected-identity': identityHeader('alpha') },
    ...(method === 'POST' ? { payload: url.endsWith('/session') ? { token: adminToken } : {} } : {}),
  });
  expect(stale.statusCode).toBe(401);
  expect(stale.json().error.code).toBe('AUTH_REQUIRED');
  expect(stale.headers['set-cookie']).toBeUndefined();
  const current = await app.inject({ method: 'GET', url: '/api/admin/session', cookies,
    headers: { 'x-idle-expected-identity': identityHeader('beta') } });
  expect(current.json()).toEqual({ enabled: true, authenticated: true });
  expect(await accounts.profiles.forProfile('admin-profile-beta').read()).toEqual(before);
});

it('lets the current identity revoke its shared admin session', async () => {
  const { app, cookies, identityHeader } = await setup();
  const headers = { 'x-idle-expected-identity': identityHeader('beta') };
  const logout = await app.inject({ method: 'POST', url: '/api/admin/logout', cookies, headers, payload: {} });
  expect(logout.statusCode).toBe(200);
  expect(logout.headers['set-cookie']).toContain('Max-Age=0');
  const current = await app.inject({ method: 'GET', url: '/api/admin/session', cookies, headers });
  expect(current.json()).toEqual({ enabled: true, authenticated: false });
});
