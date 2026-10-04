import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Catalog, GameState, RewardSummary } from '../shared/types.js';
import type { StateRepository } from './repository.js';
import { advanceState, applyCommand, getSnapshot, GameError } from '../engine/index.js';
import { parseCommandRequest, ValidationError } from './validation.js';
export interface AppOptions { catalog: Catalog; repository: StateRepository; now: () => number; assetOrigin?: string; webRoot?: string; }
function difference(total: RewardSummary, previous: RewardSummary): RewardSummary {
  const result = structuredClone(total);
  for (const key of Object.keys(result) as Array<keyof RewardSummary>) {
    if (key !== 'items') result[key] = Math.max(0, total[key] - previous[key]);
  }
  result.items = {};
  for (const [id, amount] of Object.entries(total.items)) if (amount > (previous.items[Number(id)] ?? 0)) result.items[Number(id)] = amount - (previous.items[Number(id)] ?? 0);
  return result;
}
function contact(state: GameState, catalog: Catalog, now: number): GameState {
  const result = advanceState(state, catalog, now);
  if (now - state.lastSeenAt >= 30_000) {
    const summary = difference(result.totals, state.contactTotals);
    if (result.offlineSummary) {
      for (const key of Object.keys(summary) as Array<keyof RewardSummary>) if (key !== 'items') result.offlineSummary[key] += summary[key];
      for (const [id, amount] of Object.entries(summary.items)) result.offlineSummary.items[Number(id)] = (result.offlineSummary.items[Number(id)] ?? 0) + amount;
    } else result.offlineSummary = summary;
  }
  result.lastSeenAt = Math.max(state.lastSeenAt, now);
  result.contactTotals = structuredClone(result.totals);
  return result;
}
export function buildApp({ catalog, repository, now, assetOrigin = 'http://asset-service:8080', webRoot }: AppOptions) {
  const app = Fastify({ bodyLimit: 16384, logger: false });
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (request.method === 'POST' && request.headers.origin) {
      const allowed = ['http://localhost:3339', 'http://127.0.0.1:3339', 'http://localhost:5173', 'http://127.0.0.1:5173'];
      if (!allowed.includes(request.headers.origin)) return reply.code(403).send({ error: { code: 'ORIGIN_REJECTED', message: 'Origem não permitida.' } });
    }
  });
  app.setErrorHandler(async (error, _request, reply) => {
    const failure = error as Error & { code?: string; statusCode?: number };
    const code = failure.code;
    if (error instanceof ValidationError || failure.statusCode === 400 || failure.statusCode === 413) return reply.code(failure.statusCode === 413 ? 413 : 400).send({ error: { code: 'INVALID_COMMAND', message: 'Comando inválido.' } });
    if (error instanceof GameError || code === 'REQUEST_REUSED') {
      const snapshot = await repository.read().then(state => getSnapshot(state, catalog, now())).catch(() => undefined);
      return reply.code(409).send({ error: { code, message: failure.message }, snapshot });
    }
    return reply.code(503).send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'O servidor está indisponível. Tente novamente.' } });
  });
  app.get('/api/catalog', async () => catalog);
  app.get('/api/health', async (_request, reply) => {
    const healthy = await repository.health();
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'unavailable', catalogVersion: catalog.version });
  });
  app.post('/api/session', async () => {
    const at = now();
    const state = await repository.transact(null, old => contact(old, catalog, at));
    return getSnapshot(state, catalog, at);
  });
  app.post('/api/command', async request => {
    const input = parseCommandRequest(request.body);
    const at = now();
    const fingerprint = createHash('sha256').update(JSON.stringify(input.command)).digest('hex');
    const state = await repository.transact(input.requestId, old => applyCommand(contact(old, catalog, at), catalog, input.command, at), fingerprint);
    return getSnapshot(state, catalog, at);
  });
  app.get('/assets/*', async (request, reply) => {
    const path = (request.params as { '*': string })['*'];
    if (!/^(data|BGM|System|AI)\//i.test(path) || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..' || part === '.')) return reply.code(400).send({ error: { code: 'INVALID_ASSET', message: 'Recurso inválido.' } });
    const upstream = new URL(assetOrigin);
    upstream.pathname = '/' + path.split('/').map(encodeURIComponent).join('/');
    try {
      const response = await fetch(upstream, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok || !response.body) return reply.code(404).send({ error: { code: 'ASSET_UNAVAILABLE', message: 'Recurso do cliente não encontrado.' } });
      reply.header('Content-Type', response.headers.get('content-type') ?? 'application/octet-stream');
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream));
    } catch { return reply.code(503).send({ error: { code: 'ASSET_UNAVAILABLE', message: 'Recursos do cliente indisponíveis.' } }); }
  });
  if (webRoot) {
    app.register(fastifyStatic, { root: webRoot, prefix: '/' });
    app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') || request.url.startsWith('/assets/') ? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } }) : reply.sendFile('index.html'));
  }
  return app;
}
