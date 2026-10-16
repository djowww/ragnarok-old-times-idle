import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import catalogJSON from '../content/catalog.json';
import { createInitialState } from '../engine';
import { buildApp } from '../server/app';
import type { AccountView } from '../shared/portal-types';
import type { StateRepository } from '../server/repository';
import type { Catalog } from '../shared/types';
import { MemoryAccountStore } from './portal-fixture';

const catalog = catalogJSON as unknown as Catalog;
const adminToken = 'synthetic-cross-account-admin-token-long-enough';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

async function setup(restrictToAlpha = false) {
  const accounts = new MemoryAccountStore();
  const identities: Record<string, AccountView> = {};
  const tokens: Record<string, string> = {};
  for (const name of ['alpha', 'beta']) {
    const profile = createInitialState(catalog, 1000);
    profile.id = `admin-cross-${name}`;
    profile.name = name;
    tokens[name] = name === 'alpha' ? 'a'.repeat(43) : 'b'.repeat(43);
    identities[name] = await accounts.register({ username: name, nameKey: name,
      passwordHash: 'test-only', profile }, { tokenHash: createHash('sha256').update(tokens[name]).digest('hex'),
      createdAt: 1000, expiresAt: 100000 });
  }
  const target = await accounts.profiles.forProfile(identities.beta.profileId).read();
  const beta = { ...identities.beta, classId: target.job, baseLevel: target.baseLevel,
    jobLevel: target.jobLevel, gender: target.gender, status: target.status, zeny: target.zeny };
  const directory = { search: vi.fn(async () => [beta]),
    find: vi.fn(async (profileId: string) => profileId === beta.profileId ? beta : null) };
  const app = await buildApp({ catalog, accounts, profiles: accounts.profiles, now: () => 1000,
    adminToken, adminDirectory: directory,
    ...(restrictToAlpha ? { adminAccountId: identities.alpha.accountId } : {}) } as Parameters<typeof buildApp>[0]);
  apps.push(app);
  const login = await app.inject({ method: 'POST', url: '/api/admin/session',
    cookies: { idle_session: tokens.alpha }, payload: { token: adminToken } });
  expect(login.statusCode).toBe(200);
  const setCookie = login.headers['set-cookie'];
  const adminCookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0].split('=')[1];
  const cookies = { idle_session: tokens.alpha, ragidle_admin: adminCookie };
  const headers = { 'x-idle-expected-identity': JSON.stringify([identities.alpha.accountId, identities.alpha.profileId]) };
  return { app, accounts, identities, tokens, cookies, headers, directory };
}

it('lets only an authenticated admin search linked characters', async () => {
  const { app, cookies, headers, directory } = await setup();
  const denied = await app.inject({ method: 'GET', url: '/api/admin/characters?query=be',
    cookies: { idle_session: cookies.idle_session }, headers });
  expect(denied.statusCode).toBe(401);
  expect(directory.search).not.toHaveBeenCalled();
  const allowed = await app.inject({ method: 'GET', url: '/api/admin/characters?query=be', cookies, headers });
  expect(allowed.statusCode).toBe(200);
  expect(allowed.json().characters).toMatchObject([{ profileId: 'admin-cross-beta', username: 'beta' }]);
  expect(allowed.json().characters[0]).not.toHaveProperty('accountId');
});

it('grants zeny to a server-resolved target without changing the caller', async () => {
  const { app, accounts, identities, cookies, headers, directory } = await setup();
  const actorBefore = await accounts.profiles.forProfile(identities.alpha.profileId).read();
  const targetRepository = accounts.profiles.forProfile(identities.beta.profileId);
  const targetBefore = await targetRepository.read();
  const transaction = vi.spyOn(targetRepository as StateRepository & {
    transactCooperatively: NonNullable<StateRepository['transactCooperatively']>
  }, 'transactCooperatively');
  const response = await app.inject({ method: 'POST', url: '/api/admin/action', cookies, headers,
    payload: { requestId: 'admin-cross-zeny-01', targetProfileId: identities.beta.profileId,
      action: { type: 'zeny', amount: 500 } } });
  expect(response.statusCode).toBe(200);
  expect(directory.find).toHaveBeenCalledWith(identities.beta.profileId);
  expect(transaction.mock.calls[0]?.[3]).toMatchObject({
    actorAccountId: identities.alpha.accountId, actorProfileId: identities.alpha.profileId,
    targetAccountId: identities.beta.accountId, targetProfileId: identities.beta.profileId,
    actionType: 'zeny', actionJson: JSON.stringify({ type: 'zeny', amount: 500 }), at: 1000,
  });
  expect((await accounts.profiles.forProfile(identities.beta.profileId).read()).zeny).toBe(targetBefore.zeny + 500);
  expect((await accounts.profiles.forProfile(identities.alpha.profileId).read()).zeny).toBe(actorBefore.zeny);
});

it('rejects a forged caller identity and an unlinked target before any grant', async () => {
  const { app, accounts, identities, cookies, directory } = await setup();
  const targetBefore = await accounts.profiles.forProfile(identities.beta.profileId).read();
  const forged = await app.inject({ method: 'POST', url: '/api/admin/action', cookies,
    headers: { 'x-idle-expected-identity': JSON.stringify([identities.beta.accountId, identities.beta.profileId]) },
    payload: { requestId: 'admin-forged-caller', targetProfileId: identities.beta.profileId,
      action: { type: 'zeny', amount: 500 } } });
  expect(forged.statusCode).toBe(401);
  expect(directory.find).not.toHaveBeenCalled();
  const missing = await app.inject({ method: 'POST', url: '/api/admin/action', cookies,
    payload: { requestId: 'admin-missing-target', targetProfileId: 'unlinked-profile',
      action: { type: 'zeny', amount: 500 } } });
  expect(missing.statusCode).toBe(404);
  expect((await accounts.profiles.forProfile(identities.beta.profileId).read()).zeny).toBe(targetBefore.zeny);
});

it('uses the existing grant actions on a selected character', async () => {
  const { app, accounts, identities, cookies, headers } = await setup();
  const before = await accounts.profiles.forProfile(identities.beta.profileId).read();
  const actions = [
    { type: 'class', classId: 'swordsman' },
    { type: 'baseLevels', amount: 1 },
    { type: 'jobLevels', amount: 1 },
    { type: 'zeny', amount: 500 },
    { type: 'item', itemId: 501, quantity: 2 },
  ];
  for (const [index, action] of actions.entries()) {
    const response = await app.inject({ method: 'POST', url: '/api/admin/action', cookies, headers,
      payload: { requestId: `admin-target-action-${index}`, targetProfileId: identities.beta.profileId, action } });
    expect(response.statusCode).toBe(200);
  }
  const after = await accounts.profiles.forProfile(identities.beta.profileId).read();
  expect(after.job).toBe('swordsman');
  expect(after.baseLevel).toBe(before.baseLevel + 1);
  expect(after.jobLevel).toBe(2);
  expect(after.zeny).toBe(before.zeny + 500);
  expect(after.inventory.filter(item => item.itemId === 501).reduce((sum, item) => sum + item.quantity, 0))
    .toBe(before.inventory.filter(item => item.itemId === 501).reduce((sum, item) => sum + item.quantity, 0) + 2);
});

it('binds the admin session to the account that supplied the administrator key', async () => {
  const { app, accounts, identities, tokens, cookies } = await setup();
  const targetBefore = await accounts.profiles.forProfile(identities.beta.profileId).read();
  const anotherAccountCookies = { idle_session: tokens.beta, ragidle_admin: cookies.ragidle_admin };
  const session = await app.inject({ method: 'GET', url: '/api/admin/session',
    cookies: anotherAccountCookies });
  expect(session.json()).toEqual({ enabled: true, authenticated: false });
  const denied = await app.inject({ method: 'POST', url: '/api/admin/action',
    cookies: anotherAccountCookies,
    payload: { requestId: 'admin-borrowed-cookie', action: { type: 'zeny', amount: 500 } } });
  expect(denied.statusCode).toBe(401);
  expect((await accounts.profiles.forProfile(identities.beta.profileId).read()).zeny).toBe(targetBefore.zeny);
});

it('restricts the admin token and actions to the configured account ID', async () => {
  const { app, accounts, identities, tokens, cookies } = await setup(true);
  const betaCookies = { idle_session: tokens.beta };
  const deniedLogin = await app.inject({ method: 'POST', url: '/api/admin/session',
    cookies: betaCookies, payload: { token: adminToken } });
  expect(deniedLogin.statusCode).toBe(403);
  expect(deniedLogin.headers['set-cookie']).toBeUndefined();
  const borrowed = { ...betaCookies, ragidle_admin: cookies.ragidle_admin };
  const session = await app.inject({ method: 'GET', url: '/api/admin/session', cookies: borrowed });
  expect(session.statusCode).toBe(403);
  const before = await accounts.profiles.forProfile(identities.beta.profileId).read();
  const deniedAction = await app.inject({ method: 'POST', url: '/api/admin/action', cookies: borrowed,
    payload: { requestId: 'admin-restricted-account', action: { type: 'zeny', amount: 500 } } });
  expect(deniedAction.statusCode).toBe(403);
  expect((await accounts.profiles.forProfile(identities.beta.profileId).read()).zeny).toBe(before.zeny);
  const allowed = await app.inject({ method: 'GET', url: '/api/admin/session', cookies });
  expect(allowed.json()).toEqual({ enabled: true, authenticated: true });
});
