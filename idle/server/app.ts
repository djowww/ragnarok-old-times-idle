import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Readable } from 'node:stream';
import { assetFailureCode, assetFailureIsTimeout, reportAssetProxyFailure, type AssetProxyFailure } from './assetProxyDiagnostics.js';
import type { Catalog } from '../shared/types.js';
import { getSnapshot, GameError } from '../engine/index.js';
import { ValidationError } from './validation.js';
import { registerChatRoutes, type ChatRepository } from './chat.js';
import { registerAdminRoutes } from './admin.js';
import type { AdminDirectory } from './adminDirectory.js';
import { PortalError, type AccountStore, type GameProfiles } from './identity/types.js';
import { createAuthService } from './identity/service.js';
import { assertAllowedMutation, LOCAL_ORIGINS, registerAuthRoutes } from './identity/routes.js';
import { assertExpectedIdentity, callerRepository, registerGameRoutes, resolveGameRepository } from './game-routes.js';
import type { PortalQueries } from './portal/types.js';
import { loadNews } from './portal/news.js';
import { registerPortalRoutes } from './portal/routes.js';
import { SessionGameProfiles } from './profiles.js';
import type { SimulationContext } from '../engine/fieldNavigation.js';
export interface AppOptions { assetFailureReporter?: (failure: AssetProxyFailure) => void; catalog: Catalog; accounts: AccountStore; profiles: GameProfiles; now: () => number; simulationContext?: SimulationContext; navigationReady?: boolean; portal?: PortalQueries; chatRepository?: ChatRepository; assetOrigin?: string; webRoot?: string; publicOrigin?: string; allowedOrigins?: readonly string[]; adminToken?: string; adminAccountId?: string; adminDirectory?: AdminDirectory; trustedProxyAddresses?: readonly string[]; }
export async function buildApp({ catalog, accounts, profiles, portal, chatRepository, now, simulationContext, navigationReady = true, publicOrigin, allowedOrigins: configuredOrigins = [], assetOrigin = 'http://asset-service:8080', webRoot, adminToken, adminAccountId, adminDirectory, trustedProxyAddresses, assetFailureReporter = reportAssetProxyFailure }: AppOptions) {
  const authorizedAccountId = adminAccountId?.trim();
  if (adminAccountId !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(authorizedAccountId ?? ''))
    throw new Error('Invalid admin account restriction');
  if (authorizedAccountId && !adminDirectory)
    throw new Error('Admin account restriction requires the admin directory');
  const app = Fastify({ bodyLimit: 16384, logger: false });
  const gameProfiles = profiles instanceof SessionGameProfiles ? profiles : new SessionGameProfiles(profiles, catalog);
  const allowedMutationOrigins = [...new Set([...LOCAL_ORIGINS, ...configuredOrigins, ...(publicOrigin ? [new URL(publicOrigin).origin] : [])])];
  const gameplayWritePaths = new Set(['/api/session/open', '/api/session', '/api/command', '/api/admin/action']);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (request.method === 'POST') assertAllowedMutation({ origin: request.headers.origin, secFetchSite: request.headers['sec-fetch-site'] as string | undefined, contentType: request.headers['content-type'] }, allowedMutationOrigins);
    if (!navigationReady && request.method === 'POST' && gameplayWritePaths.has(request.url.split('?', 1)[0]))
      return reply.code(503).send({ error: { code: 'FIELD_NAVIGATION_UNAVAILABLE', message: 'A navegação do mapa está indisponível. O progresso do personagem está temporariamente bloqueado.' } });
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
  await registerAuthRoutes(app, auth, trustedProxyAddresses, profileId => gameProfiles.endSession(profileId));
  if (portal) await registerPortalRoutes(app, { queries: portal, catalog, now, news: await loadNews() });
  await registerGameRoutes(app, { auth, profiles: gameProfiles, catalog, now, context: simulationContext });
  registerChatRoutes(app, chatRepository, async request => resolveGameRepository(request, auth, gameProfiles), now);
  registerAdminRoutes(app, request => resolveGameRepository(request, auth, gameProfiles), catalog, now, adminToken, trustedProxyAddresses, simulationContext,
    adminDirectory ? { directory: adminDirectory, profiles: gameProfiles, authorizedAccountId, resolveActor: async request => {
      const actor = await auth.resolve(request.cookies.idle_session);
      if (!actor) throw new PortalError('AUTH_REQUIRED', 401, 'Entre na sua conta para continuar.');
      assertExpectedIdentity(request.headers, actor);
      return actor;
    } } : undefined);
  app.get('/api/catalog', async () => catalog);
  app.get('/api/health', async (_request, reply) => {
    const healthy = navigationReady && (await accounts.health()) && (await profiles.health());
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'unavailable', catalogVersion: catalog.version });
  });
  // Explicit HEAD avoids Fastify's generated HEAD hook replacing the upstream
  // representation length with zero when the handler intentionally has no body.
  app.route({ method: ['GET', 'HEAD'], url: '/assets/*', handler: async (request, reply) => {
    const path = (request.params as { '*': string })['*'];
    if (!/^(data|BGM|System|AI)\//i.test(path) || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..' || part === '.')) return reply.code(400).send({ error: { code: 'INVALID_ASSET', message: 'Recurso inválido.' } });
    const upstream = new URL(assetOrigin);
    upstream.pathname = '/' + path.split('/').map(encodeURIComponent).join('/');
    const startedAt = performance.now();
    const timeoutSignal = AbortSignal.timeout(10_000);
    let failureReported = false;
    const reportFailure = (kind: AssetProxyFailure['kind'], error?: unknown, upstreamStatus?: number) => {
      if (failureReported) return;
      failureReported = true;
      try {
        assetFailureReporter({ method: request.method, assetPath: path.replace(/[\x00-\x1f\x7f]/g, '?').slice(0, 240),
          kind, elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)), upstreamStatus,
          code: assetFailureCode(error) });
      } catch { /* A diagnostic sink cannot alter the asset response. */ }
    };
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
        headers, signal: timeoutSignal,
      });
      if (!response.ok && response.status !== 304 && response.status !== 416) {
        if (response.status === 404)
          return reply.code(404).send({ error: { code: 'ASSET_UNAVAILABLE', message: 'Recurso do cliente não encontrado.' } });
        reportFailure('upstream', undefined, response.status);
        return reply.code(503).send({ error: { code: 'ASSET_UNAVAILABLE', message: 'Recursos do cliente indisponíveis.' } });
      }
      reply.code(response.status);
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const value = response.headers.get(name);
        if (value !== null) reply.header(name, value);
      }
      reply.header('Cache-Control', response.headers.get('cache-control') ?? 'public, max-age=86400');
      if (request.method === 'HEAD' || response.status === 304 || !response.body) return reply.send();
      const stream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
      stream.once('error', error => reportFailure(assetFailureIsTimeout(error, timeoutSignal) ? 'timeout' : 'stream', error, response.status));
      return reply.send(stream);
    } catch (error) {
      reportFailure(assetFailureIsTimeout(error, timeoutSignal) ? 'timeout' : 'transport', error);
      return reply.code(503).send({ error: { code: 'ASSET_UNAVAILABLE', message: 'Recursos do cliente indisponíveis.' } });
    }
  } });
  if (webRoot) {
    app.addHook('onRequest', async request => {
      if (!['GET', 'HEAD'].includes(request.method) || ['/api/', '/assets/'].some(prefix => request.url.startsWith(prefix))) return;
      for (const name of ['if-modified-since', 'if-none-match', 'if-match', 'if-unmodified-since']) delete request.raw.headers[name];
    });
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
