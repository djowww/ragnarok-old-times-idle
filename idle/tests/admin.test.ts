import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types.js';
import { applyCommand, createInitialState } from '../engine/index.js';
import { GameError } from '../engine/state.js';
import { registerAdminRoutes } from '../server/admin.js';
import type { StateRepository } from '../server/repository.js';
import { ValidationError } from '../server/validation.js';

const catalog = catalogJSON as unknown as Catalog;
const adminToken = 'admin-test-token-with-at-least-thirty-two-characters';

class MemoryRepository implements StateRepository {
  receipts = new Map<string, string>();
  constructor(public state: GameState) {}

  async transact(id: string | null, action: (state: GameState) => GameState, fingerprint = '') {
    if (id && this.receipts.has(id)) {
      if (this.receipts.get(id) !== fingerprint)
        throw Object.assign(new Error('Identificador de comando já utilizado.'), { code: 'REQUEST_REUSED' });
      return structuredClone(this.state);
    }
    const next = action(structuredClone(this.state));
    next.revision = this.state.revision + 1;
    this.state = next;
    if (id) this.receipts.set(id, fingerprint);
    return structuredClone(next);
  }

  async read() { return structuredClone(this.state); }
  async health() { return true; }
}

const apps: FastifyInstance[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

function setup(state = createInitialState(catalog, 1000)) {
  let now = 1000;
  const repository = new MemoryRepository(state);
  const app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ValidationError) return reply.code(400).send({ error: { code: 'INVALID_COMMAND' } });
    if (error instanceof GameError || (error as Error & { code?: string }).code === 'REQUEST_REUSED')
      return reply.code(409).send({ error: { code: (error as Error & { code?: string }).code ?? 'GAME_ERROR' } });
    return reply.code(500).send({ error: { code: 'INTERNAL' } });
  });
  registerAdminRoutes(app, async () => repository, catalog, () => now, adminToken);
  apps.push(app);
  return { app, repository, advance: (ms: number) => { now += ms; } };
}

async function login(app: FastifyInstance) {
  const response = await app.inject({ method: 'POST', url: '/api/admin/session', headers: { 'x-forwarded-proto': 'https' }, payload: { token: adminToken } });
  expect(response.statusCode).toBe(200);
  const header = response.headers['set-cookie'];
  const setCookie = Array.isArray(header) ? header[0] : header;
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('SameSite=Strict');
  expect(setCookie).toContain('Secure');
  return setCookie!.split(';', 1)[0];
}

describe('admin actions', () => {
  it('requires an authenticated admin session before changing the profile', async () => {
    const { app, repository } = setup();
    const response = await app.inject({
      method: 'POST', url: '/api/admin/action',
      payload: { requestId: 'admin-action-unauthorized', action: { type: 'zeny', amount: 500 } },
    });
    expect(response.statusCode).toBe(401);
    expect(repository.state.zeny).toBe(200);
  });

  it('throttles repeated invalid logins and expires the lock after its window', async () => {
    const { app, advance } = setup();
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await app.inject({ method: 'POST', url: '/api/admin/session', payload: { token: 'wrong-admin-token-with-at-least-32-chars' } });
      expect(response.statusCode).toBe(401);
    }
    const locked = await app.inject({ method: 'POST', url: '/api/admin/session', payload: { token: adminToken } });
    expect(locked.statusCode).toBe(429);
    advance(15 * 60 * 1000 + 1);
    const recovered = await app.inject({ method: 'POST', url: '/api/admin/session', payload: { token: adminToken } });
    expect(recovered.statusCode).toBe(200);
  });

  it('removes equipment incompatible with the class chosen by admin while retaining the item', async () => {
    const state = createInitialState(catalog, 1000);
    const weaponUid = 'admin-review-bow';
    state.job = 'archer';
    state.family = 'archer';
    state.inventory.push({ uid: weaponUid, itemId: 1701, quantity: 1, refine: 0, cards: [], favorite: false, identified: true });
    state.equipment.weapon = weaponUid;
    const { app, repository } = setup(state);
    const cookie = await login(app);

    const response = await app.inject({
      method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-change-class-01', action: { type: 'class', classId: 'swordsman' } },
    });

    expect(response.statusCode).toBe(200);
    expect(repository.state.job).toBe('swordsman');
    expect(repository.state.equipment.weapon).toBeUndefined();
    expect(repository.state.inventory.some(item => item.uid === weaponUid)).toBe(true);
    expect(repository.state.events.at(-1)?.kind).toBe('admin');
  });

  it('rejects class changes during a live encounter without mutating a pending cast', async () => {
    let state = createInitialState(catalog, 1000);
    state.baseLevel = 15;
    state.job = 'mage';
    state.learnedSkills.firebolt = 1;
    state.rotation = ['firebolt'];
    state = applyCommand(state, catalog, { type: 'challenge', challengeId: 'mastering' }, 1000);
    const battle = state.battle!;
    const enemy = battle.enemies![0];
    battle.cast = { skillId: 'firebolt', level: 1, targetId: enemy.id, startedAt: 1000, endsAt: 3000 };
    const { app, repository } = setup(state);
    const cookie = await login(app);

    const response = await app.inject({
      method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-change-class-battle', action: { type: 'class', classId: 'archer' } },
    });

    expect(response.statusCode).toBe(409);
    expect(repository.state.job).toBe('mage');
    expect(repository.state.status).toBe('challenge');
    expect(repository.state.battle?.cast?.skillId).toBe('firebolt');
  });

  it('applies a retried zeny grant once for the same request id', async () => {
    const { app, repository } = setup();
    const cookie = await login(app);
    const payload = {
      requestId: 'admin-zeny-grant-retry',
      action: { type: 'zeny', amount: 500 },
    };

    const first = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie }, payload });
    const retry = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie }, payload });
    const conflict = await app.inject({
      method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { ...payload, action: { type: 'zeny', amount: 700 } },
    });

    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(conflict.statusCode).toBe(409);
    expect(repository.state.zeny).toBe(700);
    expect(repository.state.events.filter(event => event.kind === 'admin' && event.text.includes('500 zeny'))).toHaveLength(1);
  });

  it('grants Base levels through the catalog EXP curve', async () => {
    const { app, repository } = setup();
    const cookie = await login(app);

    const response = await app.inject({
      method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-base-levels-01', action: { type: 'baseLevels', amount: 2 } },
    });

    expect(response.statusCode).toBe(200);
    expect(repository.state.baseLevel).toBe(3);
    expect(repository.state.baseExp).toBe(0);
    expect(repository.state.events.at(-1)).toMatchObject({ kind: 'admin', text: 'Painel administrativo: +2 níveis Base.' });
  });

  it('adds requested equipment to inventory already identified', async () => {
    const { app, repository } = setup();
    const cookie = await login(app);
    const existingIds = new Set(repository.state.inventory.map(item => item.uid));

    const response = await app.inject({
      method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-item-grant-01', action: { type: 'item', itemId: 1201, quantity: 2 } },
    });

    expect(response.statusCode).toBe(200);
    const granted = repository.state.inventory.filter(item => item.itemId === 1201 && !existingIds.has(item.uid));
    expect(granted).toHaveLength(2);
    expect(granted.every(item => item.identified)).toBe(true);
    expect(repository.state.events.at(-1)).toMatchObject({ kind: 'admin', itemId: 1201, quantity: 2 });
  });
});
