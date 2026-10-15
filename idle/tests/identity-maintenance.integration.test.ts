import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { SqlAccountStore } from '../server/identity/repository.js';
import { migrate } from '../server/repository.js';
import { characterKey } from '../server/identity/validation.js';
import { accountSeed, sessionSeed } from './portal-fixture.js';
import { createDbFixture } from './db-fixture.js';

describe.skipIf(process.env.IDLE_DB_TEST !== '1')('SQL identity maintenance', () => {
  let db: Awaited<ReturnType<typeof createDbFixture>>;
  let store: SqlAccountStore;

  beforeAll(async () => {
    db = await createDbFixture();
    await migrate(db.pool);
    store = new SqlAccountStore(db.pool);
  });
  afterAll(async () => { if (db) await db.cleanup(); });

  it('reserves the local-default legacy name idempotently without linking or changing progress and rejects duplicate registration', async () => {
    const legacyName = `Legacy Keeper ${randomUUID().slice(0, 8)}`;
    const legacy = accountSeed('not-an-account', legacyName).profile;
    legacy.id = 'local-default';
    db.profileIds.push(legacy.id);
    const [existing] = await db.pool.query<RowDataPacket[]>('SELECT id FROM idle_profiles WHERE id = ?', [legacy.id]);
    expect(existing).toHaveLength(0);

    await db.pool.execute('INSERT INTO idle_profiles (id, state_json) VALUES (?, ?)', [legacy.id, JSON.stringify(legacy)]);
    await db.pool.execute('INSERT INTO idle_commands (profile_id, request_id, fingerprint) VALUES (?, ?, ?)', [legacy.id, 'maintenance-receipt', 'unchanged']);
    const [before] = await db.pool.query<RowDataPacket[]>('SELECT state_json, updated_at FROM idle_profiles WHERE id = ?', [legacy.id]);
    const [receipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id = ?', [legacy.id]);

    await migrate(db.pool);
    await migrate(db.pool);

    const [after] = await db.pool.query<RowDataPacket[]>('SELECT state_json, updated_at, character_name_key FROM idle_profiles WHERE id = ?', [legacy.id]);
    const [afterReceipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id = ?', [legacy.id]);
    expect(after[0].character_name_key).toBe(characterKey(legacyName));
    expect(after[0].state_json).toEqual(before[0].state_json);
    expect(after[0].updated_at).toEqual(before[0].updated_at);
    expect(afterReceipts).toEqual(receipts);
    const [linked] = await db.pool.query<RowDataPacket[]>('SELECT id FROM idle_accounts WHERE profile_id = ?', [legacy.id]);
    expect(linked).toHaveLength(0);

    const duplicate = accountSeed(`duplicate_${randomUUID().slice(0, 8)}`, legacyName);
    db.profileIds.push(duplicate.profile.id);
    await expect(store.register(duplicate, sessionSeed())).rejects.toMatchObject({ code: 'CHARACTER_NAME_TAKEN', statusCode: 409 });
    const [created] = await db.pool.query<RowDataPacket[]>('SELECT id FROM idle_profiles WHERE id = ?', [duplicate.profile.id]);
    expect(created).toHaveLength(0);
    expect(await store.findCredentials(duplicate.username)).toBeNull();

    await db.pool.execute('DELETE FROM idle_profiles WHERE id = ?', [legacy.id]);
  });

  it('fails explicitly on an existing name-key collision without replacing either profile', async () => {
    const name = `Collision ${randomUUID().slice(0, 8)}`;
    const key = characterKey(name);
    const legacy = accountSeed('unused-legacy', name).profile;
    legacy.id = 'local-default';
    const existingOwner = accountSeed('unused-owner', `Other ${randomUUID().slice(0, 8)}`).profile;
    existingOwner.id = `collision-owner-${randomUUID()}`;
    db.profileIds.push(legacy.id, existingOwner.id);
    const [existing] = await db.pool.query<RowDataPacket[]>('SELECT id FROM idle_profiles WHERE id IN (?, ?)', [legacy.id, existingOwner.id]);
    expect(existing).toHaveLength(0);
    await db.pool.execute('INSERT INTO idle_profiles (id, state_json) VALUES (?, ?)', [legacy.id, JSON.stringify(legacy)]);
    await db.pool.execute('INSERT INTO idle_profiles (id, state_json, character_name_key) VALUES (?, ?, ?)', [existingOwner.id, JSON.stringify(existingOwner), key]);
    await db.pool.execute('INSERT INTO idle_commands (profile_id, request_id, fingerprint) VALUES (?, ?, ?)', [legacy.id, 'collision-receipt', 'unchanged']);

    const capture = async () => {
      const [profiles] = await db.pool.query<RowDataPacket[]>('SELECT id, state_json, updated_at, character_name_key FROM idle_profiles WHERE id IN (?, ?) ORDER BY id', [legacy.id, existingOwner.id]);
      const [receipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id = ?', [legacy.id]);
      return { profiles, receipts };
    };
    const before = await capture();
    await expect(migrate(db.pool)).rejects.toThrow(/legacy character name.*already belongs to another profile/i);
    expect(await capture()).toEqual(before);
    const [linked] = await db.pool.query<RowDataPacket[]>('SELECT id FROM idle_accounts WHERE profile_id IN (?, ?)', [legacy.id, existingOwner.id]);
    expect(linked).toHaveLength(0);
  });

  it('removes at most 250 expired sessions per sweep and preserves active sessions, account, profile, progress and receipts', async () => {
    const input = accountSeed(`maint_${randomUUID().slice(0, 8)}`, `Maint ${randomUUID().slice(0, 8)}`);
    db.profileIds.push(input.profile.id);
    const registeredSession = { ...sessionSeed(), createdAt: 2_000, expiresAt: 900_000 };
    const account = await store.register(input, registeredSession);
    const activeHash = createHash('sha256').update(randomUUID()).digest('hex');
    await db.pool.execute('INSERT INTO idle_sessions (token_hash, account_id, credential_version, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?, ?)', [activeHash, account.accountId, 1, 2_000, 900_000]);
    const expiredValues = Array.from({ length: 251 }, (_, i) => [createHash('sha256').update(`${randomUUID()}-${i}`).digest('hex'), account.accountId, 1, 1, 100]);
    for (const [hash, accountId, version, createdAt, expiresAt] of expiredValues) {
      await db.pool.execute('INSERT INTO idle_sessions (token_hash, account_id, credential_version, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?, ?)', [hash, accountId, version, createdAt, expiresAt]);
    }
    await db.pool.execute('INSERT INTO idle_commands (profile_id, request_id, fingerprint) VALUES (?, ?, ?)', [input.profile.id, 'maintenance-session-receipt', 'unchanged']);

    const [beforeProfile] = await db.pool.query<RowDataPacket[]>('SELECT state_json, updated_at FROM idle_profiles WHERE id = ?', [input.profile.id]);
    const [beforeAccount] = await db.pool.query<RowDataPacket[]>('SELECT id, username, password_hash, credential_version, profile_id FROM idle_accounts WHERE id = ?', [account.accountId]);
    const [beforeReceipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id = ?', [input.profile.id]);
    const cleanupStore = new SqlAccountStore(db.pool);

    expect(await cleanupStore.getSession('missing-after-first-sweep', 2_000)).toBeNull();
    const [remainingExpired] = await db.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM idle_sessions WHERE account_id = ? AND expires_at_ms <= ?', [account.accountId, 2_000]);
    expect(Number(remainingExpired[0].count)).toBe(1);
    expect(await cleanupStore.getSession(activeHash, 2_000)).toMatchObject(account);
    expect(await cleanupStore.getSession(registeredSession.tokenHash, 2_000)).toMatchObject(account);

    expect(await cleanupStore.getSession('missing-after-second-sweep', 62_001)).toBeNull();
    const [afterExpired] = await db.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM idle_sessions WHERE account_id = ? AND expires_at_ms <= ?', [account.accountId, 62_001]);
    expect(Number(afterExpired[0].count)).toBe(0);
    const [afterProfile] = await db.pool.query<RowDataPacket[]>('SELECT state_json, updated_at FROM idle_profiles WHERE id = ?', [input.profile.id]);
    const [afterAccount] = await db.pool.query<RowDataPacket[]>('SELECT id, username, password_hash, credential_version, profile_id FROM idle_accounts WHERE id = ?', [account.accountId]);
    const [afterReceipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id = ?', [input.profile.id]);
    expect(afterProfile).toEqual(beforeProfile);
    expect(afterAccount).toEqual(beforeAccount);
    expect(afterReceipts).toEqual(beforeReceipts);
    expect(await cleanupStore.getSession(activeHash, 62_001)).toMatchObject(account);
  });
});
