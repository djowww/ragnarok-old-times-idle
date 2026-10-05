import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../server/app.js';
import Fastify from 'fastify';
import { registerPortalRoutes } from '../server/portal/routes.js';
import type { PortalQueries } from '../server/portal/types.js';
import type { Catalog } from '../shared/types.js';
import catalogJSON from '../content/catalog.json';
import { MemoryAccountStore } from './portal-fixture.js';

const catalog = catalogJSON as unknown as Catalog;
const queries: PortalQueries = {
  async ranking(query, now) { return { ...query, rows: [], total: 0, updatedAt: now }; },
  async status(c, now) { return { status: 'ok', accounts: 0, hunting: 0, rates: c.rates, checkedAt: now }; },
};
let app: FastifyInstance;
async function setup(portal = queries) {
  const accounts = new MemoryAccountStore();
  app = await buildApp({ catalog, accounts, profiles: accounts.profiles, portal, now: () => 1000 });
}
afterEach(async () => { await app?.close(); });
describe('public portal', () => {
  it('sorts supplied news by publication and returns literal paragraphs without HTML rendering', async () => {
    app = Fastify();
    await registerPortalRoutes(app, { queries, catalog, now: () => 1000, news: [
      { slug: 'older', title: 'Older', category: 'Guide', publishedAt: '2026-10-03T12:00:00Z', summary: 'Older entry', body: ['<b>Literal text</b>'] },
      { slug: 'newer', title: 'Newer', category: 'Guide', publishedAt: '2026-10-04T12:00:00Z', summary: 'Newer entry', body: ['Plain paragraph'] },
    ] });
    expect((await app.inject('/api/portal/news')).json().map((entry: { slug: string }) => entry.slug)).toEqual(['newer', 'older']);
    const detail = await app.inject('/api/portal/news/older');
    expect(detail.headers['content-type']).toContain('application/json');
    expect(detail.json().body).toEqual(['<b>Literal text</b>']);
  });
  it('lists three factual dated news summaries and opens complete plain-text paragraphs', async () => {
    await setup();
    const response = await app.inject('/api/portal/news');
    expect(response.statusCode).toBe(200);
    const news = response.json();
    expect(news).toHaveLength(3);
    expect(news.map((n: { publishedAt: string }) => n.publishedAt)).toEqual([...news.map((n: { publishedAt: string }) => n.publishedAt)].sort().reverse());
    for (const entry of news) {
      expect(Object.keys(entry).sort()).toEqual(['category', 'publishedAt', 'slug', 'summary', 'title']);
      expect(Number.isFinite(Date.parse(entry.publishedAt))).toBe(true);
      const detail = await app.inject(`/api/portal/news/${entry.slug}`);
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject(entry);
      expect(detail.json().body.length).toBeGreaterThan(0);
      expect(detail.json().body.every((p: unknown) => typeof p === 'string' && p.length > 0 && !/<\/?[a-z]/i.test(p))).toBe(true);
    }
    expect((await app.inject('/api/portal/news/missing')).statusCode).toBe(404);
  });
  it('defaults to level, all classes and twenty rows with a real empty page', async () => {
    await setup();
    const response = await app.inject('/api/portal/ranking');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ category: 'level', classId: null, page: 1, pageSize: 20, rows: [], total: 0, updatedAt: 1000 });
    const filtered = await app.inject('/api/portal/ranking?category=kills&class=novice&page=2&pageSize=50');
    expect(filtered.json()).toEqual({ category: 'kills', classId: 'novice', page: 2, pageSize: 50, rows: [], total: 0, updatedAt: 1000 });
    expect((await app.inject('/api/portal/ranking?pageSize=1')).statusCode).toBe(200);
  });
  it.each(['category=invalid', 'class=Novice', 'class=toString', 'page=0', 'page=-1', 'page=1.5', 'page=abc', 'page=9007199254740992', 'page=9007199254740991', 'pageSize=0', 'pageSize=51', 'pageSize=2.5', 'category=level&category=kills', 'class=novice&class=all'])('rejects invalid ranking query %s', async query => {
    await setup();
    const response = await app.inject(`/api/portal/ranking?${query}`);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_RANKING_QUERY');
  });
  it('returns public real counts and catalog rates', async () => {
    await setup();
    const response = await app.inject('/api/portal/status');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', accounts: 0, hunting: 0, rates: catalog.rates, checkedAt: 1000 });
  });
  it.each(['ranking', 'status'])('returns genuine 503 without SQL details or fabricated counts for unavailable %s', async endpoint => {
    const unavailable = async () => { throw new Error('SQL secret credentials'); };
    await setup({ ranking: unavailable, status: unavailable });
    const response = await app.inject(`/api/portal/${endpoint}`);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: { code: 'SERVICE_UNAVAILABLE', message: expect.any(String) } });
    expect(response.body).not.toContain('secret');
    expect(response.json().status).toBeUndefined();
    expect(response.json().accounts).toBeUndefined();
  });
});
