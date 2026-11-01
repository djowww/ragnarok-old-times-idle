import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Catalog, GameState, RewardSummary } from '../shared/types.js';
import type { StateRepository } from './repository.js';
import { advanceState, advanceStateCooperatively, applyCommand, getSnapshot, GameError } from '../engine/index.js';
import { parseCommandRequest, ValidationError } from './validation.js';
import { registerChatRoutes, type ChatRepository } from './chat.js';
import { registerAdminRoutes } from './admin.js';
import { parseSessionOpenRequest, SessionStateRepository } from './sessionState.js';
export interface AppOptions { catalog: Catalog; repository: StateRepository; chatRepository?: ChatRepository; now: () => number; assetOrigin?: string; webRoot?: string; allowedOrigins?: readonly string[]; adminToken?: string; trustedProxyAddresses?: readonly string[]; }
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3339', 'http://127.0.0.1:3339', 'http://localhost:5173', 'http://127.0.0.1:5173'];
const OFFLINE_SUMMARY_THRESHOLD_MS = 30_000;
const SESSION_CONTACT_INTERVAL_MS = 10_000;
function difference(total: RewardSummary, previous: RewardSummary): RewardSummary {
  const result = structuredClone(total);
  for (const key of Object.keys(result) as Array<keyof RewardSummary>) {
    if (key !== 'items') result[key] = Math.max(0, total[key] - previous[key]);
  }
  result.items = {};
  for (const [id, amount] of Object.entries(total.items)) if (amount > (previous.items[Number(id)] ?? 0)) result.items[Number(id)] = amount - (previous.items[Number(id)] ?? 0);
  return result;
}
function recordContact(state: GameState, result: GameState, now: number): GameState {
  if (now - state.lastSeenAt >= OFFLINE_SUMMARY_THRESHOLD_MS) {
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
function contact(state: GameState, catalog: Catalog, now: number): GameState {
  return recordContact(state, advanceState(state, catalog, now), now);
}
async function contactCooperatively(state: GameState, catalog: Catalog, now: number): Promise<GameState> {
  return recordContact(state, await advanceStateCooperatively(state, catalog, now), now);
}
export function buildApp({ catalog, repository, chatRepository, now, assetOrigin = 'http://asset-service:8080', webRoot, allowedOrigins: origins = DEFAULT_ALLOWED_ORIGINS, adminToken, trustedProxyAddresses }: AppOptions) {
  const app = Fastify({ bodyLimit: 16384, logger: false });
  const sessionRepository = repository instanceof SessionStateRepository ? repository : new SessionStateRepository(repository);
  const allowedOrigins = new Set(origins);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (request.method === 'POST' && request.headers.origin) {
      if (!allowedOrigins.has(request.headers.origin)) return reply.code(403).send({ error: { code: 'ORIGIN_REJECTED', message: 'Origem não permitida.' } });
    }
  });
  app.setErrorHandler(async (error, _request, reply) => {
    const failure = error as Error & { code?: string; statusCode?: number };
    const code = failure.code;
    if (error instanceof ValidationError || failure.statusCode === 400 || failure.statusCode === 413) return reply.code(failure.statusCode === 413 ? 413 : 400).send({ error: { code: 'INVALID_COMMAND', message: 'Comando inválido.' } });
    if (error instanceof GameError || code === 'REQUEST_REUSED') {
      const snapshot = await sessionRepository.read().then(state => getSnapshot(state, catalog, now())).catch(() => undefined);
      return reply.code(409).send({ error: { code, message: failure.message }, snapshot });
    }
    return reply.code(503).send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'O servidor está indisponível. Tente novamente.' } });
  });
  registerChatRoutes(app, chatRepository, sessionRepository, now);
  registerAdminRoutes(app, sessionRepository, catalog, now, adminToken, trustedProxyAddresses);
  app.get('/api/catalog', async () => catalog);
  app.get('/api/health', async (_request, reply) => {
    const healthy = await sessionRepository.health();
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'unavailable', catalogVersion: catalog.version });
  });
  app.post('/api/session/open', async request => {
    const connectionId = parseSessionOpenRequest(request.body);
    const at = now();
    const state = sessionRepository.openSessionCooperatively
      ? await sessionRepository.openSessionCooperatively(connectionId, old => contactCooperatively(old, catalog, at))
      : await sessionRepository.openSession(connectionId, old => contact(old, catalog, at));
    return getSnapshot(state, catalog, at);
  });
  app.post('/api/session', async () => {
    const at = now();
    const current = await sessionRepository.read();
    // Keep persisted heartbeats below the offline-summary threshold so an
    // active browser session is never mistaken for a player returning later.
    if (at - current.lastSeenAt < SESSION_CONTACT_INTERVAL_MS)
      return getSnapshot(advanceState(current, catalog, at), catalog, at);
    const state = sessionRepository.transactCooperatively
      ? await sessionRepository.transactCooperatively(null, old => contactCooperatively(old, catalog, at))
      : await sessionRepository.transact(null, old => contact(old, catalog, at));
    return getSnapshot(state, catalog, at);
  });
  app.post('/api/command', async request => {
    const input = parseCommandRequest(request.body);
    const at = now();
    const fingerprint = createHash('sha256').update(JSON.stringify(input.command)).digest('hex');
    const state = sessionRepository.transactCooperatively
      ? await sessionRepository.transactCooperatively(input.requestId, async old => applyCommand(await contactCooperatively(old, catalog, at), catalog, input.command, at), fingerprint)
      : await sessionRepository.transact(input.requestId, old => applyCommand(contact(old, catalog, at), catalog, input.command, at), fingerprint);
    return getSnapshot(state, catalog, at);
  });
  // Explicit HEAD avoids Fastify's generated HEAD hook replacing the upstream
  // representation length with zero when the handler intentionally has no body.
  app.route({ method: ['GET', 'HEAD'], url: '/assets/*', handler: async (request, reply) => {
    const path = (request.params as { '*': string })['*'];
    if (!/^(data|BGM|System|AI)\//i.test(path) || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..' || part === '.')) return reply.code(400).send({ error: { code: 'INVALID_ASSET', message: 'Recurso inválido.' } });
    const upstream = new URL(assetOrigin);
    upstream.pathname = '/' + path.split('/').map(encodeURIComponent).join('/');
    try {
      // Keep byte ranges intact for the native audio player. Identity encoding
      // also keeps the forwarded Content-Length consistent with the stream.
      const headers = new Headers({ 'Accept-Encoding': 'identity' });
      for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
        const value = request.headers[name];
        if (typeof value === 'string') headers.set(name, value);
      }
      const response = await fetch(upstream, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok && response.status !== 304 && response.status !== 416)
        return response.status === 404
          ? reply.code(404).send({ error: { code: 'ASSET_UNAVAILABLE', message: 'Recurso do cliente não encontrado.' } })
          : reply.code(503).send({ error: { code: 'ASSET_UNAVAILABLE', message: 'Recursos do cliente indisponíveis.' } });
      reply.code(response.status);
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const value = response.headers.get(name);
        if (value !== null) reply.header(name, value);
      }
      reply.header('Cache-Control', response.headers.get('cache-control') ?? 'public, max-age=86400');
      if (request.method === 'HEAD' || response.status === 304 || !response.body) return reply.send();
      return reply.send(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream));
    } catch { return reply.code(503).send({ error: { code: 'ASSET_UNAVAILABLE', message: 'Recursos do cliente indisponíveis.' } }); }
  } });
  if (webRoot) {
    app.addHook('onRequest', async (request) => {
      if (!['GET', 'HEAD'].includes(request.method) || ['/api/', '/assets/'].some(prefix => request.url.startsWith(prefix))) return;
      // The installed sender also accepts wildcard/time validators without an
      // ETag/Last-Modified. Frontend URLs use no-store or content-hashed cache.
      for (const name of ['if-modified-since', 'if-none-match', 'if-match', 'if-unmodified-since']) delete request.raw.headers[name];
    });
    // Release archives can share size/mtime: entry HTML must never validate as
    // an older bundle. Content-hashed UI assets have immutable URLs instead.
    app.register(fastifyStatic, { root: webRoot, prefix: '/', etag: false, lastModified: false, cacheControl: false,
      setHeaders(response, file) {
        const hashed = /[\\/]ui-assets[\\/]index-[A-Za-z0-9_-]+\.(?:js|css)$/.test(file);
        response.header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-store');
      },
    });
    app.setNotFoundHandler((request, reply) => ['/api/', '/assets/', '/ui-assets/'].some(prefix => request.url.startsWith(prefix)) ? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } }) : reply.sendFile('index.html'));
  }
  return app;
}
