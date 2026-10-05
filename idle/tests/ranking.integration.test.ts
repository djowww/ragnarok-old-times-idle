import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPool, type RowDataPacket } from 'mysql2/promise';
import catalogJSON from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types.js';
import { SqlPortalQueries } from '../server/portal/repository.js';
import { SqlAccountStore } from '../server/identity/repository.js';
import { SqlGameProfiles } from '../server/profiles.js';
import { migrate } from '../server/repository.js';
import { buildApp } from '../server/app.js';
import { accountSeed, sessionSeed } from './portal-fixture.js';
import { createDbFixture } from './db-fixture.js';

const catalog = catalogJSON as unknown as Catalog;
describe.skipIf(process.env.IDLE_DB_TEST !== '1')('read-only SQL portal', () => {
  let db: Awaited<ReturnType<typeof createDbFixture>>;
  let queries: SqlPortalQueries;
  let accounts: SqlAccountStore;
  let profiles: SqlGameProfiles;
  const ids: string[] = [];
  const query = { category: 'level' as const, classId: null, page: 1, pageSize: 20 };
  beforeAll(async () => {
    db = await createDbFixture(); await migrate(db.pool);
    queries = new SqlPortalQueries(db.pool); accounts = new SqlAccountStore(db.pool); profiles = new SqlGameProfiles(db.pool);
  });
  afterAll(async () => { if (db) await db.cleanup(); });
  async function add(name: string, patch: Partial<GameState> = {}, linked = true, id?: string) {
    const seed = accountSeed(`u_${randomUUID().slice(0, 8)}`, `${name} ${randomUUID().slice(0, 6)}`);
    Object.assign(seed.profile, patch); if (id) seed.profile.id = id;
    db.profileIds.push(seed.profile.id); ids.push(seed.profile.id);
    if (linked) await accounts.register(seed, sessionSeed());
    else await db.pool.execute('INSERT INTO idle_profiles (id, state_json) VALUES (?, ?)', [seed.profile.id, JSON.stringify(seed.profile)]);
    return seed.profile;
  }
  async function rows() {
    const [rows] = await db.pool.query<RowDataPacket[]>('SELECT id, state_json, updated_at FROM idle_profiles ORDER BY id'); return rows;
  }
  it('returns an empty ranking and real zero counts before accounts exist', async () => {
    expect(await queries.ranking(query, 1000)).toEqual({ ...query, rows: [], total: 0, updatedAt: 1000 });
    expect(await queries.status(catalog, 1000)).toEqual({ status: 'ok', accounts: 0, hunting: 0, rates: catalog.rates, checkedAt: 1000 });
  });
  it('orders rebirth above level 99, excludes unlinked legacy/fixtures and never mutates saved state', async () => {
    const reborn = await add('Reborn', { reborn: true, baseLevel: 1, jobLevel: 7, status: 'hunting', zeny: 9 });
    const veteran = await add('Veteran', { baseLevel: 99, job: 'swordsman', status: 'resting', zeny: 100, totals: { ...reborn.totals, kills: 11 } });
    await add('Legacy', { reborn: true, baseLevel: 99, status: 'hunting', zeny: 999999 }, false, 'local-djow');
    await add('UnlinkedFixture', { reborn: true, baseLevel: 99, status: 'hunting' }, false);
    const before = await rows(); const beforeVeteran = await profiles.forProfile(veteran.id).read();
    const page = await queries.ranking(query, 1000);
    expect(page.rows.map(r => r.characterName)).toEqual([reborn.name, veteran.name]);
    expect(page.total).toBe(2); expect(page.updatedAt).toBe(1000);
    expect(page.rows[0]).toEqual({ rank: 1, characterName: reborn.name, classId: 'novice', reborn: true, baseLevel: 1, jobLevel: 7, value: 1 });
    expect((await queries.ranking({ ...query, category: 'zeny' }, 2000)).rows.map(r => r.value)).toEqual([100, 9]);
    expect((await queries.ranking({ ...query, category: 'kills' }, 2000)).rows.map(r => r.value)).toEqual([11, 0]);
    const filtered = await queries.ranking({ ...query, classId: 'swordsman' }, 2000);
    expect(filtered.total).toBe(1); expect(filtered.rows[0]).toMatchObject({ rank: 1, characterName: veteran.name });
    expect(await queries.status(catalog, 2000)).toEqual({ status: 'ok', accounts: 2, hunting: 2, rates: catalog.rates, checkedAt: 2000 });
    expect(await profiles.forProfile(veteran.id).read()).toEqual(beforeVeteran);
    expect(await rows()).toEqual(before);
  });
  it('uses every level tiebreaker numerically and final profile id ascending', async () => {
    const tag = randomUUID().slice(0, 8);
    const common = { job: 'mage', baseLevel: 10, baseExp: 2, jobLevel: 3, jobExp: 2 };
    const a = await add('TieA', common, true, `test-rank-${tag}-a`);
    const b = await add('TieB', common, true, `test-rank-${tag}-b`);
    const jobExp = await add('JobEXP', { ...common, jobExp: 10 }, true, `test-rank-${tag}-c`);
    const jobLevel = await add('JobLevel', { ...common, jobLevel: 4 }, true, `test-rank-${tag}-d`);
    const baseExp = await add('BaseEXP', { ...common, baseExp: 10 }, true, `test-rank-${tag}-e`);
    const baseLevel = await add('BaseLevel', { ...common, baseLevel: 11, status: 'challenge' }, true, `test-rank-${tag}-f`);
    const page = await queries.ranking({ ...query, classId: 'mage' }, 3000);
    expect(page.rows.map(r => r.characterName)).toEqual([baseLevel.name, baseExp.name, jobLevel.name, jobExp.name, a.name, b.name]);
    expect(page.rows.map(r => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const category of ['zeny', 'kills'] as const) expect((await queries.ranking({ ...query, category, classId: 'mage' }, 3000)).rows.map(r => r.characterName)).toEqual([a.name, b.name, jobExp.name, jobLevel.name, baseExp.name, baseLevel.name]);
    expect(await queries.status(catalog, 3000)).toMatchObject({ accounts: 8, hunting: 3 });
    expect((await queries.ranking({ ...query, classId: 'Mage' }, 3000)).total).toBe(0);
    expect((await queries.ranking({ ...query, classId: "mage' OR 1=1 --" }, 3000)).total).toBe(0);
  });
  it('filters before pagination, assigns position 21 on page two and handles numeric balances', async () => {
    const names: string[] = [];
    for (let i = 0; i < 23; i++) names.push((await add(`Archer${i}`, { job: 'archer', zeny: 100 - i, totals: { ...(await profiles.forProfile(ids[0]).read()).totals, kills: 100 - i } })).name);
    for (const category of ['level', 'zeny', 'kills'] as const) {
      const first = await queries.ranking({ ...query, category, classId: 'archer' }, 4000);
      const second = await queries.ranking({ ...query, category, classId: 'archer', page: 2 }, 4000);
      expect(first.rows).toHaveLength(20); expect(second.rows).toHaveLength(3);
      expect(second.rows.map(r => r.rank)).toEqual([21, 22, 23]); expect(second.total).toBe(23);
      if (category !== 'level') expect(second.rows.map(r => r.characterName)).toEqual(names.slice(20));
    }
    expect((await queries.ranking({ ...query, classId: 'archer', page: 3 }, 4000)).rows).toEqual([]);
  });
  it('exposes only public DTO fields through the composed SQL ranking route', async () => {
    const app = await buildApp({ catalog, accounts, profiles, portal: queries, now: () => 5000 });
    const before = await rows();
    try {
      const response = await app.inject('/api/portal/ranking?class=mage');
      expect(response.statusCode).toBe(200);
      expect(response.json().total).toBe(6);
      for (const row of response.json().rows) expect(Object.keys(row).sort()).toEqual(['baseLevel', 'characterName', 'classId', 'jobLevel', 'rank', 'reborn', 'value']);
      expect(response.body).not.toMatch(/password|username|token|state_json|inventory|lastSeenAt|profileId|accountId/);
      expect(await rows()).toEqual(before);
    } finally { await app.close(); }
  });
  it('returns 503 for real connection failure without state or secret leakage', async () => {
    const deadPool = createPool({ host: '127.0.0.1', port: 1, user: 'private-user', password: 'private-password', connectTimeout: 500 });
    const app = await buildApp({ catalog, accounts, profiles, portal: new SqlPortalQueries(deadPool), now: () => 5000 });
    try {
      for (const route of ['ranking', 'status']) {
        const response = await app.inject(`/api/portal/${route}`);
        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({ error: { code: 'SERVICE_UNAVAILABLE', message: expect.any(String) } });
        expect(response.body).not.toMatch(/private|ECONNREFUSED|state_json|password|username/);
      }
    } finally { await app.close(); await deadPool.end(); }
  });
});
