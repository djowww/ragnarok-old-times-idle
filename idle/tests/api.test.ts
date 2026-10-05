import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { applyCommand } from '../engine/index.js';
import { buildApp } from '../server/app.js';
import { MemoryAccountStore } from './portal-fixture.js';

const catalog = catalogJSON as unknown as Catalog;
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });
async function setup() {
  let now = 1000;
  const accounts = new MemoryAccountStore();
  const app = await buildApp({ catalog, accounts, profiles: accounts.profiles, now: () => now });
  const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'fixture', characterName: 'Fixture', gender: 'male', password: 'valid-password', confirmation: 'valid-password' } });
  expect(registered.statusCode).toBe(201);
  const token = registered.cookies[0].value;
  const profileId = registered.json().profileId;
  const repository = accounts.profiles.forProfile(profileId);
  apps.push(app);
  return { app, accounts, token, profileId, repository, advance: (ms: number) => { now += ms; } };
}
describe('idle HTTP intentions', () => {
  it('rejects invalid purchase amounts and unsolicited XP without changing balances', async () => {
    const { app, token, repository } = await setup();
    const res = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/command', payload: { requestId: 'invalid-0001', command: { type: 'buy', itemId: 501, quantity: -1 } } });
    expect(res.statusCode).toBe(400);
    expect((await repository.read()).zeny).toBe(200);
    const xp = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/command', payload: { requestId: 'invalid-0002', command: { type: 'grantExperience', amount: 1000 } } });
    expect(xp.statusCode).toBe(400);
    expect((await repository.read()).baseExp).toBe(0);
  });
  it('rejects another website from issuing gameplay actions', async () => {
    const { app, token, repository } = await setup();
    const res = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/command', headers: { origin: 'https://example.invalid' }, payload: { requestId: 'origin-0001', command: { type: 'buy', itemId: 501, quantity: 1 } } });
    expect(res.statusCode).toBe(403);
    expect((await repository.read()).zeny).toBe(200);
  });
  it('executes a purchase once across a retry and returns the real inventory', async () => {
    const { app, token } = await setup();
    const payload = { requestId: 'purchase-0001', command: { type: 'buy', itemId: 501, quantity: 2 } };
    const first = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/command', payload });
    expect(first.statusCode).toBe(200);
    expect(first.json().state.zeny).toBe(100);
    const retry = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/command', payload });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().state.zeny).toBe(100);
    expect(retry.json().state.inventory.filter((i: { itemId: number }) => i.itemId === 501).reduce((n: number, i: { quantity: number }) => n + i.quantity, 0)).toBe(22);
  });
  it('reconciles previous absence before updating contact and allows dismissing the summary once', async () => {
    const { app, token, repository, advance } = await setup();
    await repository.transact(null, state => applyCommand(state, catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000));
    advance(60_000);
    const back = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/session', payload: {} });
    expect(back.statusCode).toBe(200);
    expect(back.json().state.lastSeenAt).toBe(61_000);
    expect(back.json().offlineSummary.elapsedMs).toBe(60_000);
    const kills = back.json().state.totals.kills;
    const dismissed = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/command', payload: { requestId: 'dismiss-0001', command: { type: 'dismissOffline' } } });
    expect(dismissed.statusCode).toBe(200);
    expect(dismissed.json().offlineSummary).toBeNull();
    const again = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/session', payload: {} });
    expect(again.json().state.totals.kills).toBe(kills);
    expect(again.json().offlineSummary).toBeNull();
  });
  it('caps previous absence before a fresh contact can extend hunting', async () => {
    const { app, token, repository, advance } = await setup();
    await repository.transact(null, state => applyCommand(state, catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000));
    advance(13 * 60 * 60 * 1000);
    const back = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/session', payload: {} });
    expect(back.statusCode).toBe(200);
    expect(back.json().state.status).toBe('paused');
    expect(back.json().offlineSummary.elapsedMs).toBe(12 * 60 * 60 * 1000);
    expect(back.json().state.lastSeenAt).toBe(13 * 60 * 60 * 1000 + 1000);
  });
});

describe('authenticated gameplay isolation', () => {
  it('rejects expected identity mismatches before selecting, contacting or debiting any profile', async()=>{
    const {app,token,accounts,repository,advance}=await setup();
    const a=(await app.inject({url:'/api/auth/me',cookies:{idle_session:token}})).json();
    const registration=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'guard_b',characterName:'Guard B',gender:'female',password:'valid-password',confirmation:'valid-password'}});
    expect(registration.statusCode).toBe(201);const b=registration.json();const bToken=registration.cookies[0].value;
    const bRepository=accounts.profiles.forProfile(b.profileId);const beforeA=await repository.read();const beforeB=await bRepository.read();advance(60_000);
    const selected:string[]=[];const select=accounts.profiles.forProfile.bind(accounts.profiles);accounts.profiles.forProfile=id=>{selected.push(id);return select(id);};
    const expected=JSON.stringify([a.accountId,a.profileId]);
    for(const url of ['/api/session','/api/command']){
      const response=await app.inject({method:'POST',url,cookies:{idle_session:bToken},headers:{'x-idle-expected-identity':expected},payload:url==='/api/session'?{}:{requestId:'guard-purchase',command:{type:'buy',itemId:501,quantity:2}}});
      expect(response.statusCode).toBe(401);expect(response.json().error.code).toBe('AUTH_REQUIRED');expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(selected).toEqual([]);expect(await repository.read()).toEqual(beforeA);expect(await bRepository.read()).toEqual(beforeB);
    for(const invalid of ['{bad','[]',JSON.stringify([a.accountId]),JSON.stringify([a.accountId,a.profileId,'extra']),JSON.stringify([b.accountId,a.profileId]),JSON.stringify([a.accountId,b.profileId])]){
      const response=await app.inject({method:'POST',url:'/api/session',cookies:{idle_session:token},headers:{'x-idle-expected-identity':invalid},payload:{}});expect(response.statusCode).toBe(401);expect(response.json().error.code).toBe('AUTH_REQUIRED');
    }
    expect(selected).toEqual([]);
    const accepted=await app.inject({method:'POST',url:'/api/command',cookies:{idle_session:token},headers:{'x-idle-expected-identity':expected},payload:{profileId:b.profileId,requestId:'guard-purchase',command:{type:'buy',itemId:501,quantity:2}}});
    expect(accepted.statusCode).toBe(200);expect(accepted.json().state.id).toBe(a.profileId);expect(accepted.json().state.zeny).toBe(100);
    const compatible=await app.inject({method:'POST',url:'/api/command',cookies:{idle_session:bToken},headers:{'x-idle-account-id':a.accountId,'x-idle-profile-id':a.profileId},payload:{profileId:a.profileId,requestId:'guard-purchase',command:{type:'buy',itemId:501,quantity:2}}});
    expect(compatible.statusCode).toBe(200);expect(compatible.json().state.id).toBe(b.profileId);expect(compatible.json().state.zeny).toBe(100);
  });
  it.each([[404, 404, 'Recurso do cliente não encontrado.'], [500, 503, 'Recursos do cliente indisponíveis.']])('preserves asset failure mapping for upstream %i', async (upstream, status, message) => {
    const { app } = await setup();
    vi.stubGlobal('fetch', async () => new Response(null, { status: Number(upstream) }));
    try {
      const response = await app.inject('/assets/data/missing.spr');
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: { code: 'ASSET_UNAVAILABLE', message } });
    } finally { vi.unstubAllGlobals(); }
  });
  it('rejects anonymous gameplay and chat including early errors with no-store', async () => {
    const { app } = await setup();
    for (const url of ['/api/session', '/api/command', '/api/chat']) {
      const res = await app.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode).toBe(401); expect(res.json().error.code).toBe('AUTH_REQUIRED');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect((await app.inject('/api/chat')).statusCode).toBe(401);
    const early = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'null' }, payload: {} });
    expect(early.statusCode).toBe(403); expect(early.headers['cache-control']).toBe('no-store');
  });
  it('ignores foreign profile id, scopes conflicts and receipts, and survives reauthentication', async () => {
    const { app, token, accounts, profileId } = await setup();
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'fixture_b', characterName: 'Fixture B', gender: 'female', password: 'valid-password', confirmation: 'valid-password' } });
    expect(registered.statusCode).toBe(201);
    const b = registered.json(); const bToken = registered.cookies[0].value;
    const payload = { profileId: b.profileId, requestId: 'same-purchase', command: { type: 'buy', itemId: 501, quantity: 2 } };
    const first = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: token }, payload });
    expect(first.statusCode).toBe(200); expect(first.json().state.id).toBe(profileId);
    expect((await accounts.profiles.forProfile(b.profileId).read()).zeny).toBe(200);
    const conflict = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: token }, payload: { ...payload, command: { type: 'buy', itemId: 501, quantity: 1 } } });
    expect(conflict.statusCode).toBe(409); expect(conflict.json().snapshot.state.id).toBe(profileId);
    expect(conflict.json().snapshot.state.zeny).toBe(100);
    await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { idle_session: token }, payload: {} });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'fixture', password: 'valid-password' } });
    expect(login.statusCode).toBe(200);
    const retry = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: login.cookies[0].value }, payload });
    expect(retry.statusCode).toBe(200);
    const a = await accounts.profiles.forProfile(profileId).read();
    expect(a.zeny).toBe(100); expect(a.inventory.find(i => i.itemId === 501)?.quantity).toBe(22);
    expect((await accounts.profiles.forProfile(b.profileId).read()).zeny).toBe(200);
    const independent = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: bToken }, payload });
    expect(independent.statusCode).toBe(200); expect(independent.json().state.id).toBe(b.profileId);
    expect(independent.json().state.zeny).toBe(100);
  });
  it('applies one mutation policy to auth/gameplay and configured HTTPS origin', async () => {
    const accounts = new MemoryAccountStore();
    const app = await buildApp({ catalog, accounts, profiles: accounts.profiles, now: () => 1000, publicOrigin: 'https://idle.example' }); apps.push(app);
    const registration = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin: 'https://idle.example' }, payload: { username: 'https_user', characterName: 'HTTPS', gender: 'male', password: 'valid-password', confirmation: 'valid-password' } });
    expect(registration.statusCode).toBe(201); expect(registration.headers['set-cookie']).toContain('Secure');
    const session = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'https://idle.example' }, cookies: { idle_session: registration.cookies[0].value }, payload: {} });
    expect(session.statusCode).toBe(200);
    for (const url of ['/api/session', '/api/auth/logout']) {
      const res = await app.inject({ method: 'POST', url, headers: { 'content-type': 'text/plain' }, payload: '{}' });
      expect(res.statusCode).toBe(400); expect(res.json().error.code).toBe('JSON_REQUIRED');
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
  it('preserves contact throttle and uses cooperative transactions', async () => {
    const { app, token, repository, advance } = await setup();
    const before = await repository.read(); advance(5000);
    expect((await app.inject({ method: 'POST', url: '/api/session', cookies: { idle_session: token }, payload: {} })).statusCode).toBe(200);
    expect((await repository.read()).lastSeenAt).toBe(before.lastSeenAt);
    expect((await repository.read()).revision).toBe(before.revision);
    advance(5000); repository.transact = async () => { throw new Error('Must use cooperative path'); };
    expect((await app.inject({ method: 'POST', url: '/api/session', cookies: { idle_session: token }, payload: {} })).statusCode).toBe(200);
    expect((await repository.read()).lastSeenAt).toBe(11000);
  });
});
