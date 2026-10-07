import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { SqlAccountStore } from '../server/identity/repository.js';
import { GameRepository, migrate } from '../server/repository.js';
import { accountSeed, sessionSeed } from './portal-fixture.js';
import { createDbFixture } from './db-fixture.js';

describe.skipIf(process.env.IDLE_DB_TEST !== '1')('SQL accounts', () => {
  let db: Awaited<ReturnType<typeof createDbFixture>>;
  let store: SqlAccountStore;
  function seed(username = `u_${randomUUID().replaceAll('-', '').slice(0, 20)}`, name = `N${randomUUID().slice(0, 20)}`) {
    const result = accountSeed(username, name); db.profileIds.push(result.profile.id); return result;
  }
  async function counts() {
    const [rows] = await db.pool.query<RowDataPacket[]>('SELECT (SELECT COUNT(*) FROM idle_accounts) AS accounts, (SELECT COUNT(*) FROM idle_profiles) AS profiles, (SELECT COUNT(*) FROM idle_sessions) AS sessions');
    return { accounts: Number(rows[0].accounts), profiles: Number(rows[0].profiles), sessions: Number(rows[0].sessions) };
  }
  beforeAll(async () => { db = await createDbFixture(); await migrate(db.pool); store = new SqlAccountStore(db.pool); });
  afterAll(async () => { if (db) await db.cleanup(); });
  it('registers account profile session atomically', async () => {
    const input = seed(); const session = sessionSeed(); const before = await counts();
    const account = await store.register(input, session);
    expect(await counts()).toEqual({ accounts: before.accounts + 1, profiles: before.profiles + 1, sessions: before.sessions + 1 });
    expect(account).toMatchObject({ username: input.username, profileId: input.profile.id, characterName: input.profile.name });
    expect(await store.getSession(session.tokenHash, session.createdAt)).toEqual(account);
    const [metadata] = await db.pool.query<RowDataPacket[]>('SELECT created_at_ms FROM idle_accounts WHERE id = ?', [account.accountId]);
    expect(Number(metadata[0].created_at_ms)).toBe(1000);
    const restored = await new GameRepository(db.pool, () => { throw new Error('must not reset'); }, account.profileId).read();
    expect(restored).toMatchObject({ baseLevel: 1, jobLevel: 1, zeny: 200 });
    expect(restored).toEqual(input.profile);
    expect(await store.findCredentials(input.username.toUpperCase())).toMatchObject({ ...account, passwordHash: 'test-hash', credentialVersion: 1 });
  });
  it('rolls back duplicate canonical username and NFC character name', async () => {
    const suffix = randomUUID().slice(0, 8); const username = `hero_${suffix}`;
    await store.register(seed(username, `Éowyn ${suffix}`), sessionSeed());
    const before = await counts();
    await expect(store.register(seed(username.toUpperCase()), sessionSeed())).rejects.toMatchObject({ code: 'USERNAME_TAKEN', statusCode: 409, fields: { username: expect.any(String) } });
    await expect(store.register(seed(undefined, `E\u0301OWYN ${suffix}`), sessionSeed())).rejects.toMatchObject({ code: 'CHARACTER_NAME_TAKEN', statusCode: 409, fields: { characterName: expect.any(String) } });
    expect(await counts()).toEqual(before);
  });
  it('serializes concurrent duplicate registrations without orphan profiles', async () => {
    const username = `same_${randomUUID().slice(0, 8)}`; const before = await counts();
    const outcomes = await Promise.allSettled([store.register(seed(username), sessionSeed()), store.register(seed(username.toUpperCase()), sessionSeed())]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'USERNAME_TAKEN' } });
    expect(await counts()).toEqual({ accounts: before.accounts + 1, profiles: before.profiles + 1, sessions: before.sessions + 1 });
    const name = `Twin ${randomUUID().slice(0, 8)}`; const next = await counts();
    const names = await Promise.allSettled([store.register(seed(undefined, name), sessionSeed()), store.register(seed(undefined, name.toUpperCase()), sessionSeed())]);
    expect(names.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(names.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'CHARACTER_NAME_TAKEN' } });
    expect(await counts()).toEqual({ accounts: next.accounts + 1, profiles: next.profiles + 1, sessions: next.sessions + 1 });
  });
  it('rolls back account and profile if inserting the session fails', async () => {
    const session = sessionSeed(); await store.register(seed(), session); const before = await counts();
    await expect(store.register(seed(), session)).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });
  it('keeps accented character identities distinct under binary key comparison', async () => {
    const suffix = randomUUID().slice(0, 8);
    const accented = await store.register(seed(undefined, `Éowyn ${suffix}`), sessionSeed());
    const plain = await store.register(seed(undefined, `Eowyn ${suffix}`), sessionSeed());
    expect(accented.profileId).not.toBe(plain.profileId);
    expect(accented.characterName).toBe(`Éowyn ${suffix}`);
    expect(plain.characterName).toBe(`Eowyn ${suffix}`);
  });
  it('expired session is unreadable', async () => {
    const session = sessionSeed(); await store.register(seed(), session);
    expect(await store.getSession(session.tokenHash, session.expiresAt - 1)).not.toBeNull();
    expect(await store.getSession(session.tokenHash, session.expiresAt)).toBeNull();
    expect(await store.getSession('missing', session.createdAt)).toBeNull();
  });
  it('changes password revokes sessions and rejects stale credential issuance', async () => {
    const first = sessionSeed(); const account = await store.register(seed(), first); const second = sessionSeed();
    await store.issueSession(account.accountId, 1, second);
    const replacement = sessionSeed(); await store.changePassword(account.accountId, 1, 'new-hash', replacement);
    expect(await store.getSession(first.tokenHash, first.createdAt)).toBeNull();
    expect(await store.getSession(second.tokenHash, second.createdAt)).toBeNull();
    expect(await store.getSession(replacement.tokenHash, replacement.createdAt)).toEqual(account);
    expect(await store.findCredentials(account.username)).toMatchObject({ passwordHash: 'new-hash', credentialVersion: 2 });
    await expect(store.issueSession(account.accountId, 1, sessionSeed())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(store.changePassword(account.accountId, 1, 'stale', sessionSeed())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await store.revokeSession(replacement.tokenHash);
    expect(await store.getSession(replacement.tokenHash, replacement.createdAt)).toBeNull();
    expect(await store.health()).toBe(true);
  });
  it('rolls back password and revocation when replacement session fails', async () => {
    const existing = sessionSeed(); await store.register(seed(), existing);
    const current = sessionSeed(); const account = await store.register(seed(), current);
    await expect(store.changePassword(account.accountId, 1, 'new-hash', existing)).rejects.toThrow();
    expect(await store.getSession(current.tokenHash, current.createdAt)).toEqual(account);
    expect(await store.findCredentials(account.username)).toMatchObject({ passwordHash: 'test-hash', credentialVersion: 1 });
  });
  it('never leaves a valid old-version session when login issuance races password rotation', async () => {
    const account = await store.register(seed(), sessionSeed()); const login = sessionSeed(); const replacement = sessionSeed();
    const [issued, changed] = await Promise.allSettled([
      store.issueSession(account.accountId, 1, login),
      store.changePassword(account.accountId, 1, 'new-hash', replacement),
    ]);
    expect(changed.status).toBe('fulfilled');
    if (issued.status === 'rejected') expect(issued.reason).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await store.getSession(login.tokenHash, login.createdAt)).toBeNull();
    expect(await store.getSession(replacement.tokenHash, replacement.createdAt)).toEqual(account);
  });
  it('migration preserves legacy JSON and receipts', async () => {
    const [existing] = await db.pool.query<RowDataPacket[]>('SELECT id FROM idle_profiles WHERE id = ?', ['local-djow']);
    expect(existing).toHaveLength(0); // This fixture owns the legacy identity only in the disposable DB.
    db.profileIds.push('local-djow');
    const legacy = accountSeed('unused', 'djow').profile; legacy.id = 'local-djow'; legacy.zeny = 987;
    await db.pool.execute('INSERT INTO idle_profiles (id, state_json) VALUES (?, ?)', [legacy.id, JSON.stringify(legacy)]);
    const unlinked = seed(undefined, 'Unlinked');
    await db.pool.execute('INSERT INTO idle_profiles (id, state_json) VALUES (?, ?)', [unlinked.profile.id, JSON.stringify(unlinked.profile)]);
    await db.pool.execute('INSERT INTO idle_commands (profile_id, request_id, fingerprint) VALUES (?, ?, ?)', [legacy.id, 'legacy-receipt', 'original']);
    const [before] = await db.pool.query<RowDataPacket[]>('SELECT state_json, updated_at FROM idle_profiles WHERE id = ?', [legacy.id]);
    const [receipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id = ?', [legacy.id]);
    await migrate(db.pool); await migrate(db.pool);
    const [after] = await db.pool.query<RowDataPacket[]>('SELECT state_json, updated_at, character_name_key FROM idle_profiles WHERE id = ?', [legacy.id]);
    const [afterReceipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id = ?', [legacy.id]);
    expect(after[0].state_json).toEqual(before[0].state_json);
    expect(after[0].updated_at).toEqual(before[0].updated_at);
    expect(afterReceipts).toEqual(receipts);
    expect(after[0].character_name_key).toBe('djow');
    const [untouched] = await db.pool.query<RowDataPacket[]>('SELECT character_name_key FROM idle_profiles WHERE id = ?', [unlinked.profile.id]);
    expect(untouched[0].character_name_key).toBeNull();
    expect(await store.findCredentials('djow')).toBeNull();
  });
  it('adds unknown creation dates to preexisting accounts without changing credentials, profiles, sessions or receipts', async () => {
    // Disposable fixture only: recreate the exact pre-date schema by removing the optional column.
    const [columns] = await db.pool.query<RowDataPacket[]>("SHOW COLUMNS FROM idle_accounts LIKE 'created_at_ms'");
    if (columns.length) await db.pool.query('ALTER TABLE idle_accounts DROP COLUMN created_at_ms');
    const input = seed(); const accountId = randomUUID(); const session = sessionSeed();
    await db.pool.execute('INSERT INTO idle_profiles (id, state_json, character_name_key) VALUES (?, ?, ?)', [input.profile.id, JSON.stringify(input.profile), input.nameKey]);
    await db.pool.execute('INSERT INTO idle_accounts (id, username, password_hash, credential_version, profile_id) VALUES (?, ?, ?, ?, ?)', [accountId, input.username, 'historical-hash', 7, input.profile.id]);
    await db.pool.execute('INSERT INTO idle_sessions (token_hash, account_id, credential_version, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?, ?)', [session.tokenHash, accountId, 7, session.createdAt, session.expiresAt]);
    await db.pool.execute('INSERT INTO idle_commands (profile_id, request_id, fingerprint) VALUES (?, ?, ?)', [input.profile.id, 'historical-receipt', 'original']);
    async function capture() {
      const [accounts] = await db.pool.query<RowDataPacket[]>('SELECT id, username, password_hash, credential_version, profile_id FROM idle_accounts WHERE id = ?', [accountId]);
      const [profiles] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_profiles WHERE id = ?', [input.profile.id]);
      const [sessions] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_sessions WHERE account_id = ?', [accountId]);
      const [receipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id = ?', [input.profile.id]);
      return { accounts, profiles, sessions, receipts };
    }
    const before = await capture(); await migrate(db.pool); await migrate(db.pool);
    expect(await capture()).toEqual(before);
    const [metadata] = await db.pool.query<RowDataPacket[]>('SELECT created_at_ms FROM idle_accounts WHERE id = ?', [accountId]);
    expect(metadata[0].created_at_ms).toBeNull();
    expect(await store.getSession(session.tokenHash, 1000)).toMatchObject({ accountId, profileId: input.profile.id });
  });
});
