import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Readable } from 'node:stream';
import type { Catalog } from '../shared/types.js';
import { getSnapshot, GameError } from '../engine/index.js';
import { ValidationError } from './validation.js';
import { registerChatRoutes, type ChatRepository } from './chat.js';
import { registerAdminRoutes } from './admin.js';
import { PortalError, type AccountStore, type GameProfiles } from './identity/types.js';
import { createAuthService } from './identity/service.js';
import { assertAllowedMutation, LOCAL_ORIGINS, registerAuthRoutes } from './identity/routes.js';
import { callerRepository, registerGameRoutes, resolveGameRepository } from './game-routes.js';
import type { PortalQueries } from './portal/types.js';
import { loadNews } from './portal/news.js';
import { registerPortalRoutes } from './portal/routes.js';
export interface AppOptions { catalog: Catalog; accounts: AccountStore; profiles: GameProfiles; now: () => number; portal?: PortalQueries; chatRepository?: ChatRepository; assetOrigin?: string; webRoot?: string; publicOrigin?: string; allowedOrigins?: readonly string[]; adminToken?: string; }
export async function buildApp({ catalog, accounts, profiles, portal, chatRepository, now, publicOrigin, allowedOrigins: configuredOrigins = [], assetOrigin = 'http://asset-service:8080', webRoot, adminToken }: AppOptions) {
  const app = Fastify({ bodyLimit: 16384, logger: false });
  const allowedMutationOrigins = [...new Set([...LOCAL_ORIGINS, ...configuredOrigins, ...(publicOrigin ? [new URL(publicOrigin).origin] : [])])];
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (request.method === 'POST') assertAllowedMutation({ origin: request.headers.origin, secFetchSite: request.headers['sec-fetch-site'] as string | undefined, contentType: request.headers['content-type'] }, allowedMutationOrigins);
  });
  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof PortalError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
    const failure = error as Error & { code?: string; statusCode?: number };
    const code = failure.code;
    if (error instanceof ValidationError || failure.statusCode === 400 || failure.statusCode === 413) return reply.code(failure.statusCode === 413 ? 413 : 400).send({ error: { code: 'INVALID_COMMAND', message: 'Comando inválido.' } });
    if (error instanceof GameError || code === 'REQUEST_REUSED') {
      const repository = callerRepository(request);
      const snapshot = repository ? await repository.read().then(state => getSnapshot(state, catalog, now())).catch(() => undefined) : undefined;
      return reply.code(409).send({ error: { code, message: failure.message }, snapshot });
    }
    return reply.code(503).send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'O servidor está indisponível. Tente novamente.' } });
  });
  const secureCookie = (publicOrigin ? new URL(publicOrigin).protocol === 'https:' : false) || configuredOrigins.some(origin => new URL(origin).protocol === 'https:');
  const auth = createAuthService({ accounts, catalog, now, secureCookie });
  await registerAuthRoutes(app, auth);
  if (portal) await registerPortalRoutes(app, { queries: portal, catalog, now, news: await loadNews() });
  await registerGameRoutes(app, { auth, profiles, catalog, now });
  registerChatRoutes(app, chatRepository, async request => resolveGameRepository(request, auth, profiles), now);
  registerAdminRoutes(app, request => resolveGameRepository(request, auth, profiles), catalog, now, adminToken);
  app.get('/api/catalog', async () => catalog);
  app.get('/api/health', async (_request, reply) => {
    const healthy = (await accounts.health()) && (await profiles.health());
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'unavailable', catalogVersion: catalog.version });
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
    app.register(fastifyStatic, { root: webRoot, prefix: '/' });
    app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') || request.url.startsWith('/assets/') ? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } }) : reply.sendFile('index.html'));
  }
  return app;
}
