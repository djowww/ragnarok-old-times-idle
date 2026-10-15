import { afterEach, describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types.js';
import { applyCommand, createInitialState } from '../engine/index.js';
import { buildApp } from './authenticated-game-fixture.js';
import type { StateRepository } from '../server/repository.js';
import { fixture } from './engine-fixture';

const catalog = catalogJSON as unknown as Catalog;
const adminToken = 'admin-test-token-with-at-least-thirty-two-characters';

class MemoryRepository implements StateRepository {
  receipts = new Map<string, string>();
  transactCooperatively?: StateRepository['transactCooperatively'];
  constructor(public state: GameState) {}

  async transact(id: string | null, action: (state: GameState) => GameState | Promise<GameState>, fingerprint = '') {
    if (id && this.receipts.has(id)) {
      if (this.receipts.get(id) !== fingerprint)
        throw Object.assign(new Error('Identificador de comando já utilizado.'), { code: 'REQUEST_REUSED' });
      return structuredClone(this.state);
    }
    const next = await action(structuredClone(this.state));
    next.revision = this.state.revision + 1;
    this.state = next;
    if (id) this.receipts.set(id, fingerprint);
    return structuredClone(next);
  }

  async read() { return structuredClone(this.state); }
  async health() { return true; }
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

function setup(state = createInitialState(catalog, 1000), trustedProxyAddresses?: readonly string[], cooperative = false, testCatalog = catalog) {
  let now = 1000;
  const repository = new MemoryRepository(state);
  if (cooperative) repository.transactCooperatively = (id, action, fingerprint) => repository.transact(id, action, fingerprint);
  const app = buildApp({ catalog: testCatalog, repository, now: () => now, adminToken, trustedProxyAddresses });
  apps.push(app);
  return { app, repository, advance: (ms: number) => { now += ms; } };
}

async function login(app: ReturnType<typeof buildApp>) {
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
  it.each([false, true])('grants two Job levels through normal progression and preserves other progress (cooperative=%s)', async cooperative => {
    const testCatalog = fixture();
    testCatalog.exp.job.normal = [0, 10, 18, 28, ...Array(7).fill(40)];
    testCatalog.classes.novice.jobBonuses = { vit: [0, 5, 19], int: [0, 5, 19] };
    const state = createInitialState(testCatalog, 1000);
    state.baseLevel = 7;
    state.baseExp = 42;
    state.jobExp = 4;
    state.hp = 1;
    state.sp = 1;
    state.recovery = { hpMs: 77, spMs: 88, skillMs: 99 };
    const { app, repository } = setup(state, undefined, cooperative, testCatalog);
    const cookie = await login(app);
    const response = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-two-job-levels', action: { type: 'jobLevels', amount: 2 } } });

    expect(response.statusCode).toBe(200);
    expect(repository.state.jobLevel).toBe(3);
    expect(repository.state.jobExp).toBe(4);
    expect(repository.state.skillPoints).toBe(state.skillPoints + 2);
    expect(repository.state.totals.jobLevels).toBe(2);
    expect(repository.state.totals.jobExp).toBe(28);
    expect(repository.state.hp).toBe(120);
    expect(repository.state.sp).toBe(60);
    expect(repository.state.recovery).toEqual(state.recovery);
    expect(repository.state.baseLevel).toBe(7);
    expect(repository.state.baseExp).toBe(42);
    expect(repository.state.statPoints).toBe(state.statPoints);
    expect(repository.state.totals.baseExp).toBe(0);
    expect(repository.state.job).toBe('novice');
    expect(repository.state.gender).toBe(state.gender);
    expect(repository.state.inventory).toEqual(state.inventory);
    expect(repository.state.lastSeenAt).toBe(state.lastSeenAt);
    expect(repository.state.contactTotals).toEqual(state.contactTotals);
    expect(repository.state.events.filter(event => event.kind === 'level').map(event => event.text)).toEqual(['Job 2!', 'Job 3!']);
    expect(repository.state.events.at(-1)?.kind).toBe('admin');
  });

  it.each([
    ['novice', 10, false], ['archer', 50, false], ['sniper', 70, false],
    ['novice', 10, true], ['archer', 50, true], ['sniper', 70, true],
  ] as const)('grants Job up to the %s catalog cap of %s (cooperative=%s)', async (job, cap, cooperative) => {
    const state = createInitialState(catalog, 1000);
    state.job = job;
    state.jobLevel = cap - 1;
    state.jobExp = 1;
    const { app, repository } = setup(state, undefined, cooperative);
    const cookie = await login(app);
    const response = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-job-cap-partial', action: { type: 'jobLevels', amount: 20 } } });
    expect(response.statusCode).toBe(200);
    expect(repository.state.jobLevel).toBe(cap);
    expect(repository.state.jobExp).toBe(0);
    expect(repository.state.skillPoints).toBe(state.skillPoints + 1);
    expect(repository.state.totals.jobLevels).toBe(1);

    const capped = structuredClone(repository.state);
    const rejected = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-job-cap-rejected', action: { type: 'jobLevels', amount: 1 } } });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('JOB_LEVEL_CAP');
    expect(repository.state).toEqual(capped);
    expect(repository.receipts.has('admin-job-cap-rejected')).toBe(false);
  });

  it.each([0, -1, 21, 1.5, '2', null])('rejects invalid Job grant amount %s atomically', async amount => {
    const { app, repository } = setup();
    const cookie = await login(app);
    const before = structuredClone(repository.state);
    const response = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-job-invalid', action: { type: 'jobLevels', amount } } });
    expect(response.statusCode).toBe(400);
    expect(repository.state).toEqual(before);
    expect(repository.receipts.size).toBe(0);
  });

  it.each([false, true])('applies a Job grant receipt once and rejects altered retries (cooperative=%s)', async cooperative => {
    const { app, repository } = setup(undefined, undefined, cooperative);
    const cookie = await login(app);
    const payload = { requestId: 'admin-job-receipt-retry', action: { type: 'jobLevels', amount: 2 } };
    const first = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie }, payload });
    expect(first.statusCode).toBe(200);
    const granted = structuredClone(repository.state);
    const retry = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie }, payload });
    expect(retry.statusCode).toBe(200);
    expect(repository.state).toEqual(granted);
    const conflict = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { ...payload, action: { type: 'jobLevels', amount: 3 } } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('REQUEST_REUSED');
    expect(repository.state).toEqual(granted);
    expect(repository.state.jobLevel).toBe(3);
    expect(repository.state.events.filter(event => event.kind === 'admin')).toHaveLength(1);
  });

  const genderCatalog = () => {
    const result = fixture();
    result.classes.bard = { ...result.classes.hunter, id: 'bard', name: 'Bardo', gender: 'male' };
    result.classes.dancer = { ...result.classes.hunter, id: 'dancer', name: 'Odalisca', gender: 'female' };
    return result;
  };

  it.each([
    ['male', 'dancer', false], ['female', 'bard', false],
    ['male', 'dancer', true], ['female', 'bard', true],
  ] as const)('rejects admin class %s to %s without changing state (cooperative=%s)', async (gender, classId, cooperative) => {
    const testCatalog = genderCatalog();
    const state = createInitialState(testCatalog, 1000);
    state.gender = gender;
    state.baseLevel = 30;
    state.baseExp = 42;
    state.learnedSkills.firstaid = 1;
    state.rotation = ['firstaid'];
    state.skillReadyAt.firstaid = 3000;
    const { app, repository } = setup(state, undefined, cooperative, testCatalog);
    const before = structuredClone(repository.state);
    const cookie = await login(app);
    const response = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-gender-class-reject', action: { type: 'class', classId } } });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CLASS_GENDER_MISMATCH');
    expect(repository.state).toEqual(before);
    expect(repository.receipts.size).toBe(0);
  });

  it.each([
    ['male', 'bard', false], ['female', 'dancer', false],
    ['male', 'bard', true], ['female', 'dancer', true],
  ] as const)('allows admin class %s to %s (cooperative=%s)', async (gender, classId, cooperative) => {
    const testCatalog = genderCatalog();
    const state = createInitialState(testCatalog, 1000);
    state.gender = gender;
    const { app, repository } = setup(state, undefined, cooperative, testCatalog);
    const cookie = await login(app);
    const response = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-gender-class-allowed', action: { type: 'class', classId } } });

    expect(response.statusCode).toBe(200);
    expect(repository.state.job).toBe(classId);
    expect(repository.state.gender).toBe(gender);
    expect(repository.state.baseLevel).toBe(state.baseLevel);
    expect(repository.state.inventory).toEqual(state.inventory);
  });

  it.each([
    ['baseLevels', false], ['jobLevels', false], ['baseLevels', true], ['jobLevels', true],
  ] as const)('settles elapsed hunting before %s without consuming player contact accounting (cooperative=%s)', async (type, cooperative) => {
    const state = applyCommand(createInitialState(catalog, 1000), catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000);
    const { app, repository, advance } = setup(state, undefined, cooperative);
    const cookie = await login(app);
    advance(5000);
    const response = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie },
      payload: { requestId: 'admin-elapsed-grant-01', action: { type, amount: 1 } } });
    expect(response.statusCode).toBe(200);
    expect(repository.state.lastSimulatedAt).toBe(6000);
    expect(repository.state.lastSeenAt).toBe(1000);
    expect(repository.state.contactTotals).toEqual(state.contactTotals);
    expect(repository.state.events.at(-1)?.kind).toBe('admin');
  });

  it('isolates login locks by sanitized client IP from an explicitly trusted proxy', async () => {
    const { app } = setup(undefined, ['127.0.0.1']);
    for (let attempt = 0; attempt < 5; attempt++) await app.inject({ method: 'POST', url: '/api/admin/session',
      remoteAddress: '127.0.0.1', headers: { 'x-real-ip': '203.0.113.10' }, payload: { token: 'wrong' } });
    const locked = await app.inject({ method: 'POST', url: '/api/admin/session', remoteAddress: '127.0.0.1',
      headers: { 'x-real-ip': '203.0.113.10' }, payload: { token: adminToken } });
    expect(locked.statusCode).toBe(429);
    const other = await app.inject({ method: 'POST', url: '/api/admin/session', remoteAddress: '127.0.0.1',
      headers: { 'x-real-ip': '203.0.113.11' }, payload: { token: adminToken } });
    expect(other.statusCode).toBe(200);
  });

  it.each([undefined, ['127.0.0.2']])('ignores spoofed client IP headers with untrusted proxy configuration %s', async trusted => {
    const { app } = setup(undefined, trusted);
    for (let attempt = 0; attempt < 5; attempt++) await app.inject({ method: 'POST', url: '/api/admin/session',
      headers: { 'x-real-ip': `203.0.113.${attempt + 1}`, 'x-forwarded-for': `203.0.113.${attempt + 1}` }, payload: { token: 'wrong' } });
    const response = await app.inject({ method: 'POST', url: '/api/admin/session', headers: { 'x-real-ip': '203.0.113.99' }, payload: { token: adminToken } });
    expect(response.statusCode).toBe(429);
  });
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
});
