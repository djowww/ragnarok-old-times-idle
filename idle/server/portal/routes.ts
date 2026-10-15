import type { FastifyInstance } from 'fastify';
import type { Catalog } from '../../shared/types.js';
import type { NewsEntry, RankingQuery } from '../../shared/portal-types.js';
import type { PortalQueries } from './types.js';
import { PortalError } from '../identity/types.js';

function invalid(): never { throw new PortalError('INVALID_RANKING_QUERY', 400, 'Filtros do ranking inválidos.'); }
function integer(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return invalid();
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= max ? number : invalid();
}
function rankingQuery(raw: Record<string, unknown>, catalog: Catalog): RankingQuery {
  const category = raw.category ?? 'level';
  if (category !== 'level' && category !== 'zeny' && category !== 'kills') return invalid();
  const classId = raw.class ?? 'all';
  if (typeof classId !== 'string' || (classId !== 'all' && !Object.hasOwn(catalog.classes, classId))) return invalid();
  const page = integer(raw.page, 1); const pageSize = integer(raw.pageSize, 20, 50);
  if (!Number.isSafeInteger((page - 1) * pageSize)) return invalid();
  return { category, classId: classId === 'all' ? null : classId, page, pageSize };
}

export async function registerPortalRoutes(app: FastifyInstance, { queries, catalog, now, news }: { queries: PortalQueries; catalog: Catalog; now: () => number; news: NewsEntry[] }): Promise<void> {
  const entries = [...news].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug));
  app.get('/api/portal/news', async () => entries.map(({ body: _body, ...summary }) => summary));
  app.get('/api/portal/news/:slug', async request => {
    const entry = entries.find(news => news.slug === (request.params as { slug: string }).slug);
    if (!entry) throw new PortalError('NEWS_NOT_FOUND', 404, 'Notícia não encontrada.');
    return entry;
  });
  app.get('/api/portal/ranking', async request => queries.ranking(rankingQuery(request.query as Record<string, unknown>, catalog), now()));
  app.get('/api/portal/status', async () => queries.status(catalog, now()));
}
