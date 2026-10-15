import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Catalog, GameState, Item } from '../shared/types.js';
import { classSkills, healFull } from '../engine/stats.js';
import { removeIneligible } from '../engine/commands.js';
import { addItem, event, GameError } from '../engine/state.js';
import { gainExp } from '../engine/progression.js';
import type { StateRepository } from './repository.js';
import { ValidationError } from './validation.js';

const SESSION_MS = 8 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_TRACKED_LOGIN_IPS = 10_000;
const COOKIE_NAME = 'ragidle_admin';
const ZENY_CAP = 2_147_483_647;

type AdminAction =
  | { type: 'baseLevels'; amount: number }
  | { type: 'class'; classId: string }
  | { type: 'zeny'; amount: number }
  | { type: 'item'; itemId: number; quantity: number };

type LoginAttempts = { startedAt: number; count: number; lockedUntil: number };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseAction(value: unknown): AdminAction {
  if (!object(value) || typeof value.type !== 'string') throw new ValidationError();
  const integer = (key: string, min: number, max: number) => {
    const item = value[key];
    if (typeof item !== 'number' || !Number.isSafeInteger(item) || item < min || item > max)
      throw new ValidationError();
    return item;
  };
  const exactKeys = (...keys: string[]) => {
    if (Object.keys(value).some(key => key !== 'type' && !keys.includes(key))) throw new ValidationError();
    if (keys.some(key => !Object.hasOwn(value, key))) throw new ValidationError();
  };
  switch (value.type) {
    case 'baseLevels':
      exactKeys('amount');
      return { type: 'baseLevels', amount: integer('amount', 1, 20) };
    case 'class':
      exactKeys('classId');
      if (typeof value.classId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.classId)) throw new ValidationError();
      return { type: 'class', classId: value.classId };
    case 'zeny':
      exactKeys('amount');
      return { type: 'zeny', amount: integer('amount', 1, 1_000_000_000) };
    case 'item':
      exactKeys('itemId', 'quantity');
      return { type: 'item', itemId: integer('itemId', 1, 1_000_000), quantity: integer('quantity', 1, 9_999) };
    default:
      throw new ValidationError();
  }
}

function parseAdminActionRequest(value: unknown): { requestId: string; action: AdminAction } {
  if (!object(value) || Object.keys(value).length !== 2 ||
      !Object.hasOwn(value, 'requestId') || !Object.hasOwn(value, 'action') ||
      typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{12,64}$/.test(value.requestId))
    throw new ValidationError();
  return { requestId: value.requestId, action: parseAction(value.action) };
}

function pruneLoginFailures(failures: Map<string, LoginAttempts>, at: number, preserveIp: string): void {
  for (const [ip, attempt] of failures)
    if (at - attempt.startedAt >= ATTEMPT_WINDOW_MS && attempt.lockedUntil <= at)
      failures.delete(ip);
  while (failures.size >= MAX_TRACKED_LOGIN_IPS) {
    let oldestIp: string | undefined;
    let oldestAt = Infinity;
    for (const [ip, attempt] of failures) {
      if (ip !== preserveIp && attempt.startedAt < oldestAt) { oldestAt = attempt.startedAt; oldestIp = ip; }
    }
    if (!oldestIp) break;
    failures.delete(oldestIp);
  }
}

function parseCookie(request: FastifyRequest): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const prefix = `${COOKIE_NAME}=`;
  const pair = header.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  const token = pair?.slice(prefix.length);
  return token && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : undefined;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function cookieHeader(request: FastifyRequest, value: string, maxAge: number): string {
  const forwarded = request.headers['x-forwarded-proto'];
  const https = request.headers.origin?.startsWith('https://') ||
    (typeof forwarded === 'string' && forwarded.split(',')[0]?.trim() === 'https');
  return `${COOKIE_NAME}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
}

function authenticated(request: FastifyRequest, sessions: Map<string, number>, at: number): boolean {
  const token = parseCookie(request);
  if (!token) return false;
  const key = digest(token).toString('hex');
  const expiresAt = sessions.get(key);
  if (!expiresAt || expiresAt <= at) {
    sessions.delete(key);
    return false;
  }
  return true;
}

function grantLevels(state: GameState, catalog: Catalog, amount: number, at: number): number {
  let granted = 0;
  for (let index = 0; index < amount && state.baseLevel < 99; index++) {
    const curve = state.reborn ? catalog.exp.baseTrans ?? catalog.exp.base : catalog.exp.base;
    const required = curve[state.baseLevel];
    if (!(required > 0)) break;
    const previous = state.baseLevel;
    gainExp(state, catalog, Math.max(0, required - state.baseExp), 0, at);
    if (state.baseLevel === previous) break;
    granted += state.baseLevel - previous;
  }
  if (!granted) throw new GameError('BASE_LEVEL_CAP', 'O personagem já está no nível Base máximo.');
  event(state, at, 'admin', `Painel administrativo: +${granted} nível${granted === 1 ? '' : 'is'} Base.`);
  return granted;
}

function setClass(state: GameState, catalog: Catalog, classId: string, at: number): void {
  if (state.status !== 'town')
    throw new GameError('TOWN_REQUIRED', 'Retorne à cidade antes de alterar a classe pelo painel administrativo.');
  const next = catalog.classes[classId];
  if (!next) throw new GameError('INVALID_CLASS', 'Essa classe não existe no catálogo.');

  const compatibleSkills = new Set(classSkills(catalog, next.id));
  let refunded = 0;
  for (const [skillId, level] of Object.entries(state.learnedSkills)) {
    if (compatibleSkills.has(skillId)) continue;
    refunded += level;
    delete state.learnedSkills[skillId];
  }
  state.skillPoints += refunded;
  state.rotation = state.rotation.filter(skillId => compatibleSkills.has(skillId) && (state.learnedSkills[skillId] ?? 0) > 0);
  state.skillReadyAt = Object.fromEntries(Object.entries(state.skillReadyAt).filter(([skillId]) => compatibleSkills.has(skillId)));
  state.job = next.id;
  state.jobLevel = 1;
  state.jobExp = 0;
  state.reborn = next.trans;
  if (next.tier > 0) {
    state.family = next.family;
    state.branch = next.tier === 2 ? (next.rebirthOf ?? next.id) : null;
  } else if (next.id !== 'high_novice') {
    state.family = null;
    state.branch = null;
  }
  removeIneligible(state, catalog);
  state.buffs = {};
  state.combatEffects = {};
  state.recovery = { hpMs: 0, spMs: 0, skillMs: 0 };
  healFull(state, catalog);
  event(state, at, 'admin', `Painel administrativo: classe alterada para ${next.name}.`);
}

function applyAction(state: GameState, catalog: Catalog, action: AdminAction, at: number): void {
  switch (action.type) {
    case 'baseLevels':
      grantLevels(state, catalog, action.amount, at);
      return;
    case 'class':
      setClass(state, catalog, action.classId, at);
      return;
    case 'zeny': {
      if (state.zeny + action.amount > ZENY_CAP)
        throw new GameError('ZENY_CAP', 'A quantidade ultrapassaria o limite de zeny do personagem.');
      state.zeny += action.amount;
      event(state, at, 'admin', `Painel administrativo: +${action.amount.toLocaleString('pt-BR')} zeny.`);
      return;
    }
    case 'item': {
      const item: Item | undefined = catalog.items[action.itemId];
      if (!item) throw new GameError('INVALID_ITEM', 'Esse item não existe no catálogo.');
      if (item.type === 'equipment' && action.quantity > 20)
        throw new GameError('INVALID_QUANTITY', 'Conceda no máximo 20 equipamentos por operação.');
      addItem(state, catalog, action.itemId, action.quantity);
      event(state, at, 'admin', `Painel administrativo: ${action.quantity}× ${item.name}.`, undefined, undefined,
        { itemId: action.itemId, quantity: action.quantity });
    }
  }
}

export function registerAdminRoutes(
  app: FastifyInstance,
  resolveRepository: (request: FastifyRequest) => Promise<StateRepository>,
  catalog: Catalog,
  now: () => number,
  configuredToken?: string,
): void {
  const expected = configuredToken && configuredToken.length >= 32 && configuredToken.length <= 256
    ? digest(configuredToken)
    : undefined;
  const sessions = new Map<string, number>();
  const failures = new Map<string, LoginAttempts>();

  app.get('/api/admin/session', async (request) => ({
    enabled: !!expected,
    authenticated: !!expected && authenticated(request, sessions, now()),
  }));

  app.post('/api/admin/session', async (request, reply) => {
    if (!expected) return reply.code(503).send({ error: { code: 'ADMIN_DISABLED', message: 'O painel administrativo não está configurado no servidor.' } });
    const at = now();
    const ip = request.ip;
    pruneLoginFailures(failures, at, ip);
    const prior = failures.get(ip);
    if (prior?.lockedUntil && prior.lockedUntil > at) {
      reply.header('Retry-After', String(Math.ceil((prior.lockedUntil - at) / 1000)));
      return reply.code(429).send({ error: { code: 'ADMIN_LOGIN_THROTTLED', message: 'Muitas tentativas. Aguarde antes de tentar novamente.' } });
    }
    const body = request.body;
    const token = object(body) && Object.keys(body).length === 1 && typeof body.token === 'string' && body.token.length <= 256
      ? body.token
      : '';
    const matched = token.length >= 32 && timingSafeEqual(digest(token), expected);
    if (!matched) {
      const fresh = !prior || at - prior.startedAt >= ATTEMPT_WINDOW_MS;
      const attempt: LoginAttempts = fresh
        ? { startedAt: at, count: 1, lockedUntil: 0 }
        : { ...prior, count: prior.count + 1, lockedUntil: prior.count + 1 >= MAX_LOGIN_ATTEMPTS ? at + ATTEMPT_WINDOW_MS : prior.lockedUntil };
      failures.set(ip, attempt);
      return reply.code(401).send({ error: { code: 'ADMIN_LOGIN_FAILED', message: 'Chave administrativa incorreta.' } });
    }

    failures.delete(ip);
    const sessionToken = randomBytes(32).toString('base64url');
    sessions.set(digest(sessionToken).toString('hex'), at + SESSION_MS);
    for (const [key, expiresAt] of sessions) if (expiresAt <= at) sessions.delete(key);
    reply.header('Set-Cookie', cookieHeader(request, sessionToken, SESSION_MS / 1000));
    return { enabled: true, authenticated: true };
  });

  app.post('/api/admin/logout', async (request, reply) => {
    const token = parseCookie(request);
    if (token) sessions.delete(digest(token).toString('hex'));
    reply.header('Set-Cookie', cookieHeader(request, '', 0));
    return { ok: true };
  });

  app.post('/api/admin/action', async (request, reply) => {
    if (!expected) return reply.code(503).send({ error: { code: 'ADMIN_DISABLED', message: 'O painel administrativo não está configurado no servidor.' } });
    if (!authenticated(request, sessions, now()))
      return reply.code(401).send({ error: { code: 'ADMIN_SESSION_REQUIRED', message: 'Entre novamente no painel administrativo.' } });
    const { requestId, action } = parseAdminActionRequest(request.body);
    const at = now();
    const fingerprint = createHash('sha256').update(`admin:${JSON.stringify(action)}`).digest('hex');
    const repository = await resolveRepository(request);
    await repository.transact(requestId, state => {
      applyAction(state, catalog, action, at);
      return state;
    }, fingerprint);
    return { ok: true };
  });
}
