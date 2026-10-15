import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import { randomUUID, randomBytes } from 'node:crypto';
import { GameRepository, migrate } from '../server/repository.js';
import type { GameState } from '../shared/types.js';
import type { Catalog } from '../shared/types.js';
import catalogJSON from '../content/catalog.json';
import { applyCommand, advanceState } from '../engine/index.js';
import { SqlAccountStore } from '../server/identity/repository.js';
import { SqlGameProfiles } from '../server/profiles.js';
import { accountSeed, sessionSeed } from './portal-fixture.js';
import { createHash } from 'node:crypto';
import { buildApp } from '../server/app.js';

// SQL persistence tests run in the Compose network; never mutate a player's profile.
describe.skipIf(process.env.IDLE_DB_TEST !== '1')('MariaDB persistence', () => {
  let pool: Pool;
  const profileIds: string[] = [];
  function repository() {
    const id = `test-${randomUUID()}`;
    profileIds.push(id);
    // Repository treats JSON opaquely: this hand-checked state tests its storage boundary.
    const seed = { id, schemaVersion: 1, revision: 0, name: 'Teste', zeny: 200, inventory: [], lastSimulatedAt: 1000, lastSeenAt: 1000 } as unknown as GameState;
    return new GameRepository(pool, () => structuredClone(seed), id);
  }
  beforeAll(() => {
    pool = createPool({ host: process.env.DB_HOST ?? 'database', port: Number(process.env.DB_PORT ?? 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
      connectionLimit: 6, charset: 'utf8mb4' });
  });
  afterAll(async () => {
    for (const id of profileIds) { await pool.execute('DELETE FROM idle_accounts WHERE profile_id = ?', [id]); await pool.execute('DELETE FROM idle_profiles WHERE id = ?', [id]); }
    await pool.end();
  });
  it('creates only the two idle tables required for transactional state and receipts', async () => {
    await migrate(pool);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('idle_profiles', 'idle_commands')");
    expect(Number(rows[0].n)).toBe(2);
  });
  it('persists a command and reuses its receipt without spending twice', async () => {
    await migrate(pool);
    const repo = repository();
    await repo.transact('purchase-0001', state => ({ ...state, zeny: state.zeny - 50 }), 'purchase');
    await repo.transact('purchase-0001', state => ({ ...state, zeny: state.zeny - 50 }), 'purchase');
    expect((await repo.read()).zeny).toBe(150);
    const reopened = new GameRepository(pool, () => { throw new Error('Existing state must be restored, not reset'); }, repo.profileId);
    expect((await reopened.read()).zeny).toBe(150);
  });
  it('serializes concurrent commands and retries under a row lock', async () => {
    await migrate(pool);
    const repo = repository();
    await Promise.all(Array.from({ length: 6 }, () => repo.transact('purchase-0002', state => ({ ...state, zeny: state.zeny - 50 }), 'same')));
    expect((await repo.read()).zeny).toBe(150);
    await Promise.all(['separate-0001', 'separate-0002'].map(id => repo.transact(id, state => ({ ...state, zeny: state.zeny - 10 }), id)));
    expect((await repo.read()).zeny).toBe(130);
  });
  it('rolls back a failed action and allows the same retry identifier after failure', async () => {
    await migrate(pool);
    const repo = repository();
    await repo.transact(null, state => state);
    await expect(repo.transact('rollback-0001', state => { state.zeny = 0; throw new Error('rejected'); })).rejects.toThrow('rejected');
    expect((await repo.read()).zeny).toBe(200);
    await repo.transact('rollback-0001', state => ({ ...state, zeny: 175 }));
    expect((await repo.read()).zeny).toBe(175);
  });
  it('rejects reusing a successful request identifier for a different intention', async () => {
    await migrate(pool);
    const repo = repository();
    await repo.transact('reuse-0001', state => ({ ...state, zeny: 180 }), 'buy');
    await expect(repo.transact('reuse-0001', state => ({ ...state, zeny: 0 }), 'sell')).rejects.toThrow();
    expect((await repo.read()).zeny).toBe(180);
  });
  async function authenticatedRepository() {
    const seed = accountSeed(`u_${randomUUID().slice(0,8)}`, `N${randomUUID().slice(0,8)}`); profileIds.push(seed.profile.id);
    const token = randomBytes(32).toString('base64url'); const session = sessionSeed(); session.tokenHash = createHash('sha256').update(token).digest('hex');
    const accounts = new SqlAccountStore(pool); await accounts.register(seed, session);
    const repo = new GameRepository(pool, () => { throw new Error('Unexpected reset'); }, seed.profile.id);
    return { repo, accounts, profiles: new SqlGameProfiles(pool), token, id: seed.profile.id };
  }
  it('scopes the same purchase receipt to independent owned SQL profiles', async () => {
    const catalog = catalogJSON as unknown as Catalog;
    const a = await authenticatedRepository(); const b = await authenticatedRepository();
    for (const repository of [a.repo, a.repo, b.repo]) await repository.transact('shared-purchase', state => applyCommand(state, catalog, { type: 'buy', itemId: 501, quantity: 2 }, 1000), 'buy-two');
    expect((await a.profiles.forProfile(a.id).read()).zeny).toBe(100);
    expect((await b.profiles.forProfile(b.id).read()).zeny).toBe(100);
    expect((await a.repo.read()).inventory.find(i => i.itemId === 501)?.quantity).toBe(22);
    expect((await b.repo.read()).inventory.find(i => i.itemId === 501)?.quantity).toBe(22);
  });
  it('restores a real hunt after restart and reconciles the same absence only once', async () => {
    const catalog = catalogJSON as unknown as Catalog;
    const { repo, accounts, profiles, token, id } = await authenticatedRepository();
    await repo.transact('hunt-start', s => applyCommand(s, catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000), 'start');
    // A scheduler persists progress but does not extend the last browser contact.
    await repo.transact(null, s => advanceState(s, catalog, 31_000));
    expect((await repo.read()).lastSeenAt).toBe(1000);
    const reopened = new GameRepository(pool, () => { throw new Error('Unexpected reset'); }, id);
    const app = await buildApp({ catalog, accounts, profiles, now: () => 61_000 });
    try {
      const first = await app.inject({ method: 'POST', url: '/api/session', cookies: { idle_session: token }, payload: {} });
      expect(first.statusCode).toBe(200);
      expect(first.json().offlineSummary.elapsedMs).toBe(60_000);
      const again = await app.inject({ method: 'POST', url: '/api/session', cookies: { idle_session: token }, payload: {} });
      expect(again.json().state.totals).toEqual(first.json().state.totals);
      expect(again.json().state.rngState).toBe(first.json().state.rngState);
      expect(again.json().state.inventory).toEqual(first.json().state.inventory);
    } finally { await app.close(); }
  });
  it('persists the 12-hour limit across restart before registering fresh contact', async () => {
    const catalog = catalogJSON as unknown as Catalog;
    const { repo, accounts, profiles, token, id } = await authenticatedRepository();
    await repo.transact('hunt-start', s => applyCommand(s, catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000), 'start');
    const reopened = new GameRepository(pool, () => { throw new Error('Unexpected reset'); }, id);
    const app = await buildApp({ catalog, accounts, profiles, now: () => 13 * 3600000 + 1000 });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/session', cookies: { idle_session: token }, payload: {} });
      expect(response.statusCode).toBe(200);
      const value = response.json();
      expect(value.state.status).toBe('paused');
      expect(value.offlineSummary.elapsedMs).toBe(12 * 3600000);
      const persisted = await reopened.read();
      expect(persisted.lastSimulatedAt).toBe(12 * 3600000 + 1000);
      expect(persisted.lastSeenAt).toBe(13 * 3600000 + 1000);
    } finally { await app.close(); }
  });
});
