import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, applyCommand } from '../engine';
import { buildApp } from '../server/app';
import { MemoryAccountStore } from './portal-fixture';

const catalog = rawCatalog as unknown as Catalog;
const connectionA = '1bd3543b-12fd-4c9c-a103-45fa1e68ad16';
const connectionB = '71b1d5a9-a1e7-4790-80aa-90ddc19c2b73';
const connectionNew = 'd1ae8d7f-a69d-439c-994b-d91cdf54f727';
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

async function setup(job: 'novice' | 'priest' = 'novice') {
  const accounts = new MemoryAccountStore();
  const tokens = { alpha: 'a'.repeat(43), beta: 'b'.repeat(43) };
  for (const name of ['alpha', 'beta'] as const) {
    let profile = createInitialState(catalog, 1000);
    profile.id = 'profile-' + name;
    profile.name = name;
    profile.job = job;
    if (job === 'priest') {
      profile.jobLevel = 50;
      profile.learnedSkills.pr_impositio = 2;
      profile.learnedSkills.pr_suffragium = 3;
    } else profile.learnedSkills.nv_trickdead = 1;
    profile = applyCommand(profile, catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000);
    await accounts.register({ username: name, passwordHash: 'test-only-password-hash', nameKey: name, profile }, {
      tokenHash: createHash('sha256').update(tokens[name]).digest('hex'), createdAt: 1000, expiresAt: 100000,
    });
  }
  const app = await buildApp({ catalog, accounts, profiles: accounts.profiles, now: () => 1000 });
  apps.push(app);
  return { app, accounts, cookies: {
    alpha: { idle_session: tokens.alpha }, beta: { idle_session: tokens.beta },
  } };
}

describe('authenticated gameplay connection and volatile status ownership', () => {
  it('requires a real account session to open the game connection', async () => {
    const { app } = await setup();
    const response = await app.inject({ method: 'POST', url: '/api/session/open', payload: { connectionId: connectionA } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTH_REQUIRED');
  });

  it('opens only the cookie profile and rejects an obsolete expected identity', async () => {
    const { app, cookies } = await setup();
    const opened = await app.inject({ method: 'POST', url: '/api/session/open', cookies: cookies.alpha,
      payload: { connectionId: connectionA } });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().state.id).toBe('profile-alpha');
    const stale = await app.inject({ method: 'POST', url: '/api/session/open', cookies: cookies.alpha,
      headers: { 'x-idle-expected-identity': JSON.stringify(['wrong-account', 'profile-beta']) },
      payload: { connectionId: connectionB } });
    expect(stale.statusCode).toBe(401);
    expect(stale.json().error.code).toBe('AUTH_REQUIRED');
  });

  it('keeps Suffragium connection-local, available between requests and cleared on reconnect', async () => {
    const { app, accounts, cookies } = await setup('priest');
    const activated = await app.inject({ method: 'POST', url: '/api/command', cookies: cookies.alpha,
      payload: { requestId: 'activate-suffragium-alpha', command: { type: 'useSkill', skillId: 'pr_suffragium' } } });
    expect(activated.statusCode).toBe(200);
    expect(activated.json().state.buffs.pr_suffragium).toBeDefined();
    const durable = await accounts.profiles.forProfile('profile-alpha').read();
    expect(durable.buffs.pr_suffragium).toBeUndefined();
    expect(durable.combatEffects?.buffLevels?.pr_suffragium).toBeUndefined();

    const heartbeat = await app.inject({ method: 'POST', url: '/api/session', cookies: cookies.alpha, payload: {} });
    expect(heartbeat.json().state.buffs.pr_suffragium).toBeDefined();
    await accounts.profiles.forProfile('profile-alpha').transact(null, state => ({
      ...state,
      combatEffects: { ...(state.combatEffects ?? {}),
        buffLevels: { ...(state.combatEffects?.buffLevels ?? {}), pr_suffragium: 3 } },
    }));
    const reconnected = await app.inject({ method: 'POST', url: '/api/session/open', cookies: cookies.alpha,
      payload: { connectionId: connectionNew } });
    expect(reconnected.statusCode).toBe(200);
    expect(reconnected.json().state.buffs.pr_suffragium).toBeUndefined();
    expect(reconnected.json().state.combatEffects?.buffLevels?.pr_suffragium).toBeUndefined();
  });

  it('keeps NoSave buffs between requests per profile and clears only the reconnecting profile', async () => {
    const { app, accounts, cookies } = await setup();
    for (const [name, connectionId] of [['alpha', connectionA], ['beta', connectionB]] as const) {
      const opened = await app.inject({ method: 'POST', url: '/api/session/open', cookies: cookies[name], payload: { connectionId } });
      expect(opened.statusCode).toBe(200);
      const activated = await app.inject({ method: 'POST', url: '/api/command', cookies: cookies[name],
        payload: { requestId: 'activate-no-save-' + name, command: { type: 'toggleBuff', skillId: 'nv_trickdead' } } });
      expect(activated.statusCode).toBe(200);
      expect(activated.json().state.buffs.nv_trickdead).toBeDefined();
      expect((await accounts.profiles.forProfile('profile-' + name).read()).buffs.nv_trickdead).toBeUndefined();
      const heartbeat = await app.inject({ method: 'POST', url: '/api/session', cookies: cookies[name], payload: {} });
      expect(heartbeat.json().state.buffs.nv_trickdead).toBeDefined();
    }
    const reconnected = await app.inject({ method: 'POST', url: '/api/session/open', cookies: cookies.alpha,
      payload: { connectionId: connectionNew } });
    expect(reconnected.statusCode).toBe(200);
    expect(reconnected.json().state.buffs.nv_trickdead).toBeUndefined();
    const other = await app.inject({ method: 'POST', url: '/api/session', cookies: cookies.beta, payload: {} });
    expect(other.json().state.id).toBe('profile-beta');
    expect(other.json().state.buffs.nv_trickdead).toBeDefined();
  });
});
