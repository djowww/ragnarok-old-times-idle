import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/index.js';
import { grantReward } from '../engine/progression.js';
import { addItem, GameError, random } from '../engine/state.js';
import { attemptSteal } from '../engine/steal.js';
import { registerAdminRoutes } from '../server/admin.js';
import type { BattleEnemy, GameState } from '../shared/types.js';
import type { StateRepository } from '../server/repository.js';
import { fixture } from './engine-fixture.js';

const adminToken = 'admin-test-token-with-at-least-thirty-two-characters';
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

class MemoryRepository implements StateRepository {
  receipts = new Map<string, string>();
  constructor(public state: GameState) {}
  async transact(id: string | null, action: (state: GameState) => GameState | Promise<GameState>, fingerprint = '') {
    if (id && this.receipts.has(id)) {
      if (this.receipts.get(id) !== fingerprint) throw Object.assign(new Error('request reused'), { code: 'REQUEST_REUSED' });
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

function setup() {
  const c = fixture();
  const s = createInitialState(c, 100);
  s.inventory = [];
  s.equipment = {};
  return { c, s };
}

describe('capacity-aware non-monster acquisitions', () => {
  it('retains successful Steal with its enemy origin and single equipment roll', () => {
    const { c, s } = setup();
    c.classes.novice.baseWeight = 0;
    c.items[1201].weight = 1;
    c.monsters[1002].drops = [{ itemId: 1201, chance: 10000 }];
    s.stats.str = 0;
    s.learnedSkills.steal = 10;
    s.stats.dex = 200;
    s.areaId = 'prontera';
    const target: BattleEnemy = { id: 'enemy-7', monsterId: 1002, hp: 50, maxHp: 50, startedAt: 0,
      arrivedAt: 0, enemyNextAttackAt: 999, spawnDirection: 0, position: { x: 12, y: 8 } };
    s.rngState = 1972;
    const rolled = structuredClone(s);
    random(rolled); // The successful drop check happens before equipment generation.
    addItem(rolled, c, 1201, 1, true);

    attemptSteal(s, c, { ...c.skills.firstaid, id: 'steal', sourceName: 'TF_STEAL', maxLevel: 10 }, 10, target, 101);

    expect(target.stolenItem).toBe(true);
    expect(s.inventory).toEqual([]);
    expect(s.pendingLoot?.map(row => row.entry)).toEqual(rolled.inventory);
    expect(s.pendingLoot?.[0]).toMatchObject({ source: 'steal', areaId: 'prontera', enemyId: 'enemy-7',
      monsterId: 1002, position: { x: 12, y: 8 }, acquiredAt: 101 });
    expect(s.nextItemId).toBe(rolled.nextItemId);
    expect(s.rngState).toBe(rolled.rngState);
    expect(s.totals.items[1201]).toBe(1);
  });

  it.each([
    [{ source: 'quest', questId: 'firstkill' } as const, 'quest', 'firstkill'],
    [{ source: 'challenge', challengeId: 'mastering' } as const, 'challenge', 'mastering'],
  ])('preserves $1 reward origin while granting the item once', (origin, source, reference) => {
    const { c, s } = setup();
    c.classes.novice.baseWeight = 0;
    c.items[501].weight = 1;
    s.stats.str = 0;

    grantReward(s, c, { zeny: 0, baseExp: 0, jobExp: 0, items: [{ itemId: 501, quantity: 1 }] }, 102, origin);

    expect(s.pendingLoot?.map(row => [row.entry.itemId, row.entry.quantity])).toEqual([[501, 1]]);
    expect(s.pendingLoot?.[0]).toMatchObject({ source, acquiredAt: 102, [source === 'quest' ? 'questId' : 'challengeId']: reference });
    expect(s.totals.items[501]).toBe(1);
    expect(s.inventory).toEqual([]);
  });

  it('rejects an over-capacity admin item grant before changing inventory, rolls, events, or receipt', async () => {
    const { c, s } = setup();
    c.classes.novice.baseWeight = 0;
    c.items[501].weight = 1;
    s.stats.str = 1;
    addItem(s, c, 501, 30);
    const repository = new MemoryRepository(s);
    let now = 100;
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof GameError) return reply.code(409).send({ error: { code: error.code } });
      return reply.code(500).send({ error: { code: 'INTERNAL' } });
    });
    registerAdminRoutes(app, async () => repository, c, () => now, adminToken);
    apps.push(app);
    const login = await app.inject({ method: 'POST', url: '/api/admin/session', payload: { token: adminToken } });
    const cookieHeader = login.headers['set-cookie'];
    const cookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader)!.split(';', 1)[0];
    const before = structuredClone(repository.state);

    const response = await app.inject({ method: 'POST', url: '/api/admin/action', headers: { cookie }, payload: {
      requestId: 'admin-weight-reject', action: { type: 'item', itemId: 501, quantity: 1 },
    } });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('WEIGHT_LIMIT');
    expect(repository.state).toEqual(before);
    expect(repository.receipts.has('admin-weight-reject')).toBe(false);
    expect(now).toBe(100);
  });
});
