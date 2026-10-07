import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import type { AuthResult, AuthService } from './service.js';
import { PortalError } from './types.js';
import { AttemptLimiter, AuthLimitError } from './limits.js';
import { validateLogin, validatePassword, validateRegistration } from './validation.js';
import { assertExpectedIdentity } from '../game-routes.js';

export const LOCAL_ORIGINS = ['http://localhost:3339', 'http://127.0.0.1:3339', 'http://localhost:5173', 'http://127.0.0.1:5173'];
export function assertAllowedMutation(headers: { origin?: string; secFetchSite?: string; contentType?: string }, allowedOrigins: string[] = LOCAL_ORIGINS): void {
  if (headers.secFetchSite === 'cross-site' || (headers.origin !== undefined && (headers.origin === 'null' || !allowedOrigins.includes(headers.origin)))) {
    throw new PortalError('ORIGIN_REJECTED', 403, 'Origem não permitida.');
  }
  if (headers.contentType?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new PortalError('JSON_REQUIRED', 400, 'Envie os dados em JSON.');
  }
}

/** Task 3 applies assertAllowedMutation globally with its configured origins. */
export async function registerAuthRoutes(app: FastifyInstance, auth: AuthService): Promise<void> {
  const limits = new AttemptLimiter(auth.now);
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: auth.secureCookie };
  if (!app.hasRequestDecorator('cookies')) await app.register(cookie);
  await app.register(async scope => {
    scope.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
    // Encapsulation preserves the parent application's game/public error handler.
    scope.setErrorHandler((error, _request, reply) => {
      if (error instanceof PortalError) {
        if (error instanceof AuthLimitError) reply.header('Retry-After', error.retryAfter);
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
      }
      const failure = error as { statusCode?: number };
      if (failure.statusCode === 400 || failure.statusCode === 413 || failure.statusCode === 415) {
        return reply.code(failure.statusCode === 413 ? 413 : 400).send({ error: { code: 'VALIDATION_ERROR', message: 'Dados de formulário inválidos.' } });
      }
      return reply.code(503).send({ error: { code: 'SERVICE_UNAVAILABLE', message: 'O servidor está indisponível. Tente novamente.' } });
    });
    const sendSession = (reply: import('fastify').FastifyReply, result: AuthResult, status = 200) => {
      reply.setCookie('idle_session', result.token, { ...cookieOptions, maxAge: 604800, expires: new Date(result.expiresAt) });
      return reply.code(status).send(result.account);
    };
    scope.post('/api/auth/register', async (request, reply) => {
      limits.consume(`register:ip:${request.ip}`, 5, 3600000);
      return sendSession(reply, await auth.register(validateRegistration(request.body)), 201);
    });
    scope.post('/api/auth/login', async (request, reply) => {
      limits.consume(`login:ip:${request.ip}`, 10, 900000);
      const input = validateLogin(request.body);
      limits.consume(`login:user:${input.username}`, 5, 900000);
      return sendSession(reply, await auth.login(input));
    });
    scope.get('/api/auth/me', async request => {
      const account = await auth.resolve(request.cookies.idle_session);
      if (!account) throw new PortalError('AUTH_REQUIRED', 401, 'Entre na sua conta para continuar.');
      return account;
    });
    scope.post('/api/auth/logout', async (request, reply) => {
      const account = await auth.resolve(request.cookies.idle_session);
      assertExpectedIdentity(request.headers, account);
      await auth.logout(request.cookies.idle_session);
      reply.clearCookie('idle_session', { ...cookieOptions, maxAge: 0 });
      return { ok: true };
    });
    scope.post('/api/auth/password', async (request, reply) => {
      const account = await auth.resolve(request.cookies.idle_session);
      if (!account) throw new PortalError('AUTH_REQUIRED', 401, 'Entre na sua conta para continuar.');
      assertExpectedIdentity(request.headers, account);
      limits.consume(`password:account:${account.accountId}`, 5, 900000);
      return sendSession(reply, await auth.changePassword(account, validatePassword(request.body)));
    });
  });
}
