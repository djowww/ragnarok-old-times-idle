import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import catalogJSON from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { createAuthService, type PasswordHasher } from '../server/identity/service.js';
import { assertAllowedMutation, registerAuthRoutes } from '../server/identity/routes.js';
import { AttemptLimiter } from '../server/identity/limits.js';
import { MemoryAccountStore } from './portal-fixture.js';
import { SqlAccountStore } from '../server/identity/repository.js';
import { migrate } from '../server/repository.js';
import { createDbFixture } from './db-fixture.js';
import type { RowDataPacket } from 'mysql2/promise';

const registration = { username: 'Hero', characterName: 'Éowyn', gender: 'female' as const, password: ' 1234567890 ', confirmation: ' 1234567890 ' };
const fastPasswords: PasswordHasher = { async hash(password) { return `test:${password}`; }, async verify(password, encoded) { return encoded === `test:${password}`; } };
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function fixture(secureCookie = false, passwords = fastPasswords) {
  let at = 1000;
  const accounts = new MemoryAccountStore();
  const auth = createAuthService({ accounts, catalog: catalogJSON as unknown as Catalog, now: () => at, secureCookie, passwords });
  const app = Fastify({ logger: false }); apps.push(app);
  await registerAuthRoutes(app, auth);
  return { app, accounts, auth, setTime(time: number) { at = time; } };
}
function cookie(response: { headers: Record<string, unknown> }): string { return String(response.headers['set-cookie']).split(';')[0]; }

describe('account auth routes', () => {
  it('rejects stale-panel password and logout under another shared-password account without side effects', async () => {
    const { app, accounts } = await fixture(false, { hash: (await import('../server/identity/password.js')).hashPassword, verify: (await import('../server/identity/password.js')).verifyPassword });
    const a = await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration });
    const b = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ...registration, username: 'other', characterName: 'Other' } });
    const before = await Promise.all(['hero', 'other'].map(name => accounts.findCredentials(name)));
    const headers = { cookie: cookie(b), 'x-idle-expected-identity': JSON.stringify([a.json().accountId, a.json().profileId]) };
    for (const url of ['/api/auth/password', '/api/auth/logout']) {
      const response = await app.inject({ method: 'POST', url, headers, payload: url.endsWith('password') ? { currentPassword: registration.password, newPassword: 'abcdefghij', confirmation: 'abcdefghij' } : {} });
      expect(response.statusCode).toBe(401); expect(response.json().error.code).toBe('AUTH_REQUIRED');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await Promise.all(['hero', 'other'].map(name => accounts.findCredentials(name)))).toEqual(before);
      for (const session of [a, b]) expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(session) } })).json()).toEqual(session.json());
    }
  });
  it.each(['/api/auth/password', '/api/auth/logout'])('rejects malformed expectation before any credential work at %s', async url => {
    let derivations = 0;
    const { app, accounts } = await fixture(false, { ...fastPasswords, async hash(password) { derivations++; return fastPasswords.hash(password); }, async verify(password, encoded) { derivations++; return fastPasswords.verify(password, encoded); } });
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration });
    const before = await accounts.findCredentials('hero'); const workBefore = derivations;
    for (const expectation of ['not-json', '{}', '["a"]', '[1,2]']) {
      const response = await app.inject({ method: 'POST', url, headers: { cookie: cookie(registered), 'x-idle-expected-identity': expectation }, payload: { currentPassword: registration.password, newPassword: 'abcdefghij', confirmation: 'abcdefghij' } });
      expect(response.statusCode).toBe(401); expect(response.json().error.code).toBe('AUTH_REQUIRED'); expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(derivations).toBe(workBefore); expect(await accounts.findCredentials('hero')).toEqual(before);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(registered) } })).statusCode).toBe(200);
  });
  it('rotates matching expected identity and exits idempotently even after the session is absent', async () => {
    const { app } = await fixture();
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration });
    const expectation = JSON.stringify([registered.json().accountId, registered.json().profileId]);
    const changed = await app.inject({ method: 'POST', url: '/api/auth/password', headers: { cookie: cookie(registered), 'x-idle-expected-identity': expectation }, payload: { currentPassword: registration.password, newPassword: 'abcdefghij', confirmation: 'abcdefghij' } });
    expect(changed.statusCode).toBe(200); expect(changed.json()).toEqual(registered.json());
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(registered) } })).statusCode).toBe(401);
    for (const sessionCookie of [cookie(changed), cookie(changed), '']) {
      const exited = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: sessionCookie, 'x-idle-expected-identity': expectation }, payload: {} });
      expect(exited.statusCode).toBe(200); expect(String(exited.headers['set-cookie'])).toContain('Max-Age=0');
    }
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(changed) } })).statusCode).toBe(401);
    const malformed = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { 'x-idle-expected-identity': 'not-json' }, payload: {} });
    expect(malformed.statusCode).toBe(401); expect(malformed.headers['set-cookie']).toBeUndefined();
  });
  it('registers a server-created profile and returns a private projection with a seven-day cookie', async () => {
    const { app, accounts, auth } = await fixture(true);
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ...registration, profile: { id: 'local-djow', zeny: 999999 } } });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const view = response.json();
    expect(Object.keys(view).sort()).toEqual(['accountId', 'characterName', 'profileId', 'username']);
    expect(view).toMatchObject({ username: 'hero', characterName: 'Éowyn' });
    expect(view.profileId).toMatch(/^[0-9a-f-]{36}$/);
    const header = String(response.headers['set-cookie']);
    for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=604800', 'Secure']) expect(header).toContain(attribute);
    const token = cookie(response).slice('idle_session='.length);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(await accounts.getSession(token, 1000)).toBeNull();
    expect(await accounts.getSession(createHash('sha256').update(token).digest('hex'), 1000)).toEqual(view);
    expect(await auth.resolve(token)).toEqual(view);
    expect(await accounts.profiles.forProfile(view.profileId).read()).toMatchObject({ id: view.profileId, name: 'Éowyn', gender: 'female', baseLevel: 1, jobLevel: 1, zeny: 200 });
    const me = await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(response) } });
    expect(me.statusCode).toBe(200); expect(me.json()).toEqual(view);
    expect(me.headers['set-cookie']).toBeUndefined();
  });
  it('logs in, expires at the absolute deadline, and logs out idempotently', async () => {
    const { app, setTime } = await fixture();
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'HERO', password: registration.password } });
    expect(login.statusCode).toBe(200);
    expect(String(login.headers['set-cookie'])).not.toContain('Secure');
    setTime(604800999);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(login) } })).statusCode).toBe(200);
    setTime(604801000);
    const expired = await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(login) } });
    expect(expired.statusCode).toBe(401); expect(expired.json().error.code).toBe('AUTH_REQUIRED');
    setTime(2000);
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookie(login) }, payload: {} });
    expect(logout.statusCode).toBe(200); expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(login) } })).json().error.code).toBe('AUTH_REQUIRED');
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', payload: {} })).statusCode).toBe(200);
  });
  it('keeps valid sessions after wrong current password and revokes every old session on success', async () => {
    const { app } = await fixture();
    const first = await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration });
    const second = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'hero', password: registration.password } });
    const attempt = await app.inject({ method: 'POST', url: '/api/auth/password', headers: { cookie: cookie(first) }, payload: { currentPassword: 'wrong', newPassword: 'abcdefghij', confirmation: 'abcdefghij' } });
    expect(attempt.statusCode).toBe(400); expect(attempt.json().error).toMatchObject({ code: 'CURRENT_PASSWORD_INVALID', fields: { currentPassword: expect.any(String) } });
    expect(attempt.headers['set-cookie']).toBeUndefined();
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(first) } })).statusCode).toBe(200);
    const changed = await app.inject({ method: 'POST', url: '/api/auth/password', headers: { cookie: cookie(first) }, payload: { currentPassword: registration.password, newPassword: 'abcdefghij', confirmation: 'abcdefghij' } });
    expect(changed.statusCode).toBe(200);
    for (const old of [first, second]) expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(old) } })).json().error.code).toBe('AUTH_REQUIRED');
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: cookie(changed) } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'hero', password: registration.password } })).json().error.code).toBe('INVALID_CREDENTIALS');
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'hero', password: 'abcdefghij' } })).statusCode).toBe(200);
  });
  it('keeps form errors distinct and masks unexpected store failures', async () => {
    const { app, accounts } = await fixture();
    const invalid = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ...registration, confirmation: 'wrong' } });
    expect(invalid.statusCode).toBe(400); expect(invalid.json().error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { confirmation: expect.any(String) } });
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration });
    const duplicate = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ...registration, characterName: 'Other' } });
    expect(duplicate.statusCode).toBe(409); expect(duplicate.json().error.code).toBe('USERNAME_TAKEN');
    accounts.findCredentials = async () => { throw new Error('SQL secret'); };
    const unavailable = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'hero', password: registration.password } });
    expect(unavailable.statusCode).toBe(503); expect(unavailable.json().error.code).toBe('SERVICE_UNAVAILABLE'); expect(unavailable.body).not.toContain('SQL secret');
  });
  it('preserves unrelated application error handlers', async () => {
    const { auth } = await fixture();
    const app = Fastify(); apps.push(app);
    app.setErrorHandler((_error, _request, reply) => reply.code(409).send({ error: { code: 'GAME_CONFLICT' } }));
    app.get('/game', () => { throw new Error('game'); });
    app.get('/private', request => ({ token: request.cookies?.idle_session }));
    await registerAuthRoutes(app, auth);
    expect((await app.inject({ url: '/game' })).json().error.code).toBe('GAME_CONFLICT');
    expect((await app.inject({ url: '/private', headers: { cookie: 'idle_session=parsed' } })).json()).toEqual({ token: 'parsed' });
  });
  it('does not log passwords or session tokens', async () => {
    const { auth } = await fixture(); let logs = '';
    const stream = new Writable({ write(chunk, _encoding, done) { logs += String(chunk); done(); } });
    const app = Fastify({ logger: { stream } }); apps.push(app); await registerAuthRoutes(app, auth);
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration });
    expect(response.statusCode).toBe(201);
    expect(logs).not.toContain(registration.password); expect(logs).not.toContain(cookie(response).slice('idle_session='.length));
  });
});

describe('service credential concurrency', () => {
  it('uses real password hashes and creates independent untruncated Unicode profiles', async () => {
    const accounts = new MemoryAccountStore();
    const auth = createAuthService({ accounts, catalog: catalogJSON as unknown as Catalog, now: () => 1000, secureCookie: false });
    const characterName = '𐐀'.repeat(24);
    const first = await auth.register({ ...registration, characterName });
    const second = await auth.register({ ...registration, username: 'other', characterName: 'Other' });
    const initial = await accounts.profiles.forProfile(first.account.profileId).read();
    const other = await accounts.profiles.forProfile(second.account.profileId).read();
    expect(initial.name).toBe(characterName); expect(initial.id).not.toBe(other.id);
    expect(initial.rngState).not.toBe(other.rngState);
    const loggedIn = await auth.login({ username: 'hero', password: registration.password });
    expect(await auth.resolve(loggedIn.token)).toEqual(first.account);
    await expect(auth.login({ username: 'missing', password: registration.password })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(auth.login({ username: 'hero', password: registration.password.trim() })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect((await accounts.findCredentials('hero'))?.passwordHash).not.toContain(registration.password);
  });
  it('rejects old credentials when password rotation completes after verification but before issuance', async () => {
    let release!: () => void; let arrived!: () => void;
    const barrier = new Promise<void>(resolve => { arrived = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let pause = false;
    const passwords: PasswordHasher = { ...fastPasswords, async verify(password, encoded) { const result = await fastPasswords.verify(password, encoded); if (pause) { pause = false; arrived(); await gate; } return result; } };
    const { auth } = await fixture(false, passwords);
    const first = await auth.register(registration); pause = true;
    const login = auth.login({ username: 'hero', password: registration.password });
    const result = expect(login).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
    await barrier;
    const changed = await auth.changePassword(first.account, { currentPassword: registration.password, newPassword: 'abcdefghij', confirmation: 'abcdefghij' });
    release(); await result;
    expect(await auth.resolve(first.token)).toBeNull(); expect(await auth.resolve(changed.token)).toEqual(first.account);
  });
  it('performs password derivation for nonexistent users using a valid reserve hash', async () => {
    let reserve = '';
    const { auth } = await fixture(false, { ...fastPasswords, async verify(_password, encoded) { reserve = encoded; return true; } });
    await expect(auth.login({ username: 'missing', password: 'abcdefghij' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(reserve).toMatch(/^scrypt\$v1\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  });
});

describe.skipIf(process.env.IDLE_DB_TEST !== '1')('SQL auth service', () => {
  let db: Awaited<ReturnType<typeof createDbFixture>>;
  let accounts: SqlAccountStore;
  beforeAll(async () => { db = await createDbFixture(); await migrate(db.pool); accounts = new SqlAccountStore(db.pool); });
  afterAll(async () => { if (db) await db.cleanup(); });
  it('stores only token hashes and rejects an old-password login paused after verification', async () => {
    let release!: () => void; let arrived!: () => void; let pause = false;
    const barrier = new Promise<void>(resolve => { arrived = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const passwords: PasswordHasher = { ...fastPasswords, async verify(password, encoded) { const verified = await fastPasswords.verify(password, encoded); if (pause) { pause = false; arrived(); await gate; } return verified; } };
    const auth = createAuthService({ accounts, catalog: catalogJSON as unknown as Catalog, now: () => 1000, secureCookie: false, passwords });
    const suffix = randomUUID().slice(0, 8);
    const first = await auth.register({ ...registration, username: `sql_${suffix}`, characterName: `SQL ${suffix}` });
    db.profileIds.push(first.account.profileId);
    const [metadata] = await db.pool.query<RowDataPacket[]>('SELECT created_at_ms FROM idle_accounts WHERE id = ?', [first.account.accountId]);
    expect(Number(metadata[0].created_at_ms)).toBe(1000);
    const [stored] = await db.pool.query<RowDataPacket[]>('SELECT token_hash FROM idle_sessions WHERE account_id = ?', [first.account.accountId]);
    expect(stored).toHaveLength(1);
    expect(stored[0].token_hash).toBe(createHash('sha256').update(first.token).digest('hex'));
    expect(stored[0].token_hash).not.toBe(first.token);
    pause = true;
    const login = auth.login({ username: first.account.username, password: registration.password });
    const rejected = expect(login).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
    await barrier;
    try {
      const changed = await auth.changePassword(first.account, { currentPassword: registration.password, newPassword: 'abcdefghij', confirmation: 'abcdefghij' });
      release(); await rejected;
      expect(await auth.resolve(first.token)).toBeNull(); expect(await auth.resolve(changed.token)).toEqual(first.account);
      const [sessions] = await db.pool.query<RowDataPacket[]>('SELECT token_hash, credential_version FROM idle_sessions WHERE account_id = ?', [first.account.accountId]);
      expect(sessions).toHaveLength(1); expect(Number(sessions[0].credential_version)).toBe(2);
    } finally { release(); }
  });
});

describe('authentication attempt limits', () => {
  it('allows ten login attempts per IP and five per canonical username with Retry-After', async () => {
    const { app, setTime } = await fixture();
    for (let i = 0; i < 5; i++) expect((await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: `10.0.0.${i}`, payload: { username: i % 2 ? 'HERO' : 'hero', password: 'wrong' } })).statusCode).toBe(401);
    const limitedUser = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.0.0.9', payload: { username: 'hero', password: 'wrong' } });
    expect(limitedUser.statusCode).toBe(429); expect(limitedUser.headers['retry-after']).toBe('900');
    for (let i = 0; i < 10; i++) expect((await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.0.1.1', payload: { username: `user${i}`, password: 'wrong' } })).statusCode).toBe(401);
    const limitedIp = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.0.1.1', payload: { username: 'nextuser', password: 'wrong' } });
    expect(limitedIp.statusCode).toBe(429); expect(limitedIp.headers['retry-after']).toBe('900');
    setTime(901000);
    expect((await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.0.1.1', payload: { username: 'hero', password: 'wrong' } })).statusCode).toBe(401);
  });
  it('limits registrations to five per hour and password changes to five per account per fifteen minutes', async () => {
    const { app, setTime } = await fixture();
    let firstCookie = '';
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ...registration, username: `user${i}`, characterName: `Name${i}` } });
      expect(response.statusCode).toBe(201); if (!i) firstCookie = cookie(response);
    }
    const limited = await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration });
    expect(limited.statusCode).toBe(429); expect(limited.headers['retry-after']).toBe('3600');
    for (let i = 0; i < 5; i++) expect((await app.inject({ method: 'POST', url: '/api/auth/password', headers: { cookie: firstCookie }, payload: { currentPassword: 'wrong', newPassword: 'abcdefghij', confirmation: 'abcdefghij' } })).statusCode).toBe(400);
    const passwordLimit = await app.inject({ method: 'POST', url: '/api/auth/password', headers: { cookie: firstCookie }, payload: { currentPassword: registration.password, newPassword: 'abcdefghij', confirmation: 'abcdefghij' } });
    expect(passwordLimit.statusCode).toBe(429); expect(passwordLimit.headers['retry-after']).toBe('900');
    setTime(3601000);
    expect((await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration })).statusCode).toBe(201);
  });
  it('refuses new keys at ten thousand without evicting active limits and reclaims expired keys', () => {
    let at = 1000; const limits = new AttemptLimiter(() => at);
    for (let i = 0; i < 10000; i++) limits.consume(`key${i}`, 1, 900000);
    expect(() => limits.consume('overflow', 1, 900000)).toThrow(expect.objectContaining({ code: 'RATE_LIMITED', statusCode: 429, retryAfter: 900 }));
    expect(() => limits.consume('key0', 1, 900000)).toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }));
    at = 901000;
    expect(() => limits.consume('overflow', 1, 900000)).not.toThrow();
    expect(() => limits.consume('key0', 1, 900000)).not.toThrow();
  });
});

describe('mutation request policy', () => {
  it.each([
    { origin: 'http://evil.test', contentType: 'application/json' },
    { origin: 'null', contentType: 'application/json' },
    { origin: 'http://localhost:3339', secFetchSite: 'cross-site', contentType: 'application/json' },
  ])('rejects hostile browser provenance %#', headers => {
    expect(() => assertAllowedMutation(headers)).toThrow(expect.objectContaining({ code: 'ORIGIN_REJECTED', statusCode: 403 }));
  });
  it.each([undefined, 'text/plain', 'application/jsonp', 'application/x-www-form-urlencoded'])('requires JSON for POST bodies (%s)', contentType => {
    expect(() => assertAllowedMutation({ contentType })).toThrow(expect.objectContaining({ code: 'JSON_REQUIRED', statusCode: 400 }));
  });
  it('accepts local and configured origins plus non-browser JSON clients', () => {
    for (const origin of ['http://localhost:3339', 'http://127.0.0.1:3339', 'http://localhost:5173', 'http://127.0.0.1:5173', undefined]) {
      expect(() => assertAllowedMutation({ origin, contentType: 'application/json; charset=utf-8' })).not.toThrow();
    }
    expect(() => assertAllowedMutation({ origin: 'https://idle.example', contentType: 'application/json' }, ['https://idle.example'])).not.toThrow();
  });
});
