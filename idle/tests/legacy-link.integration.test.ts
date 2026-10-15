import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { createDbFixture } from './db-fixture.js';
import { accountSeed, sessionSeed } from './portal-fixture.js';
import { migrate } from '../server/repository.js';
import { SqlAccountStore } from '../server/identity/repository.js';
import { SqlGameProfiles } from '../server/profiles.js';
import { linkLegacyAccount } from '../server/link-legacy.js';
describe.skipIf(process.env.IDLE_DB_TEST !== '1')('legacy maintenance in disposable SQL', () => {
  let db: Awaited<ReturnType<typeof createDbFixture>>;
  let accounts: SqlAccountStore;
  let owner: Awaited<ReturnType<SqlAccountStore['register']>>;
  let rival: typeof owner;
  const session = sessionSeed();
  beforeAll(async () => {
    db = await createDbFixture(); await migrate(db.pool); accounts = new SqlAccountStore(db.pool);
    const [existing] = await db.pool.query<RowDataPacket[]>('SELECT id FROM idle_profiles WHERE id = ?', ['local-djow']);
    expect(existing).toHaveLength(0);
    const legacy = accountSeed('unused', 'djow').profile; legacy.id = 'local-djow'; legacy.status = 'hunting'; legacy.zeny = 987;
    db.profileIds.push(legacy.id);
    await db.pool.execute('INSERT INTO idle_profiles (id, state_json, character_name_key) VALUES (?, ?, ?)', [legacy.id, JSON.stringify(legacy), 'djow']);
    await db.pool.execute('INSERT INTO idle_commands (profile_id, request_id, fingerprint) VALUES (?, ?, ?)', [legacy.id, 'legacy-receipt', 'legacy']);
    for (const name of ['Owner', 'Rival']) {
      const seed = accountSeed(`u_${randomUUID().slice(0, 8)}`, `${name} ${randomUUID().slice(0, 8)}`); db.profileIds.push(seed.profile.id); seed.profile.status = 'hunting';
      const account = await accounts.register(seed, name === 'Owner' ? session : sessionSeed());
      if (name === 'Owner') owner = account; else rival = account;
    }
    await db.pool.execute('INSERT INTO idle_commands (profile_id, request_id, fingerprint) VALUES (?, ?, ?)', [owner.profileId, 'prior-receipt', 'prior']);
  });
  afterAll(async () => { if (db) await db.cleanup(); });
  it('selects owned active profiles and legacy only, bounds pages and never creates absent profiles', async () => {
    const profiles = new SqlGameProfiles(db.pool);
    const unlinked = accountSeed('unused', 'unlinked'); db.profileIds.push(unlinked.profile.id); unlinked.profile.status = 'challenge';
    await db.pool.execute('INSERT INTO idle_profiles (id, state_json) VALUES (?, ?)', [unlinked.profile.id, JSON.stringify(unlinked.profile)]);
    const ids = await profiles.eligible(null, 9999);
    expect(ids).toContain(owner.profileId); expect(ids).toContain(rival.profileId); expect(ids).toContain('local-djow'); expect(ids).not.toContain(unlinked.profile.id);
    expect(await profiles.eligible(null, 1)).toEqual([ids[0]]);
    expect(await profiles.eligible(ids[0], 50)).toEqual(ids.slice(1));
    expect(await profiles.health()).toBe(true);
    await expect(profiles.forProfile('missing-fixture').read()).rejects.toThrow();
    await expect(profiles.forProfile('missing-fixture').transact(null, s => s)).rejects.toThrow();
    const [missing] = await db.pool.query<RowDataPacket[]>('SELECT id FROM idle_profiles WHERE id = ?', ['missing-fixture']); expect(missing).toHaveLength(0);
    await profiles.forProfile(rival.profileId).transact(null, s => ({ ...s, status: 'town' }));
    expect(await profiles.eligible(null, 50)).not.toContain(rival.profileId);
  });
  it('links explicitly, preserves both JSON/receipts, revokes sessions and rejects a second owner', async () => {
    const [before] = await db.pool.query<RowDataPacket[]>('SELECT id, state_json, updated_at FROM idle_profiles WHERE id IN (?, ?) ORDER BY id', ['local-djow', owner.profileId]);
    const [receipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id IN (?, ?) ORDER BY profile_id, request_id', ['local-djow', owner.profileId]);
    const results = await Promise.allSettled([linkLegacyAccount(db.pool, owner.username.toUpperCase()), linkLegacyAccount(db.pool, owner.username)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'LEGACY_OWNED' } });
    const linked = (results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof linkLegacyAccount>>>).value;
    expect(linked).toEqual({ account: { ...owner, profileId: 'local-djow', characterName: 'djow' }, previousProfileId: owner.profileId });
    expect(await accounts.getSession(session.tokenHash, 1000)).toBeNull();
    expect((await accounts.findCredentials(owner.username))?.credentialVersion).toBe(2);
    await expect(accounts.issueSession(owner.accountId, 1, sessionSeed())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const [after] = await db.pool.query<RowDataPacket[]>('SELECT id, state_json, updated_at FROM idle_profiles WHERE id IN (?, ?) ORDER BY id', ['local-djow', owner.profileId]);
    const [afterReceipts] = await db.pool.query<RowDataPacket[]>('SELECT * FROM idle_commands WHERE profile_id IN (?, ?) ORDER BY profile_id, request_id', ['local-djow', owner.profileId]);
    expect(after).toEqual(before); expect(afterReceipts).toEqual(receipts);
    expect(await new SqlGameProfiles(db.pool).eligible(null, 50)).not.toContain(owner.profileId);
    await expect(linkLegacyAccount(db.pool, rival.username)).rejects.toMatchObject({ code: 'LEGACY_OWNED' });
    await expect(linkLegacyAccount(db.pool, owner.username)).rejects.toMatchObject({ code: 'LEGACY_OWNED' });
    expect((await accounts.findCredentials(rival.username))?.profileId).toBe(rival.profileId);
    await expect(linkLegacyAccount(db.pool, 'missing-user')).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
  });
});
