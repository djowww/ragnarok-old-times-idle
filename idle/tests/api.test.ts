import { afterEach, describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types.js';
import { createInitialState, applyCommand } from '../engine/index.js';
import { buildApp } from '../server/app.js';
import type { StateRepository } from '../server/repository.js';

const catalog = catalogJSON as unknown as Catalog;
class MemoryRepository implements StateRepository {
  constructor(public state: GameState) {}
  receipts = new Map<string, string>();
  async transact(id: string | null, action: (s: GameState) => GameState, fingerprint = '') {
    if (id && this.receipts.has(id)) {
      if (this.receipts.get(id) !== fingerprint) throw Object.assign(new Error('retry identifier reused'), { code: 'REQUEST_REUSED' });
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
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });
function setup() {
  let now = 1000;
  const repository = new MemoryRepository(createInitialState(catalog, now));
  const app = buildApp({ catalog, repository, now: () => now });
  apps.push(app);
  return { app, repository, advance: (ms: number) => { now += ms; } };
}
describe('idle HTTP intentions', () => {
  it('rejects invalid purchase amounts and unsolicited XP without changing balances', async () => {
    const { app, repository } = setup();
    const res = await app.inject({ method: 'POST', url: '/api/command', payload: { requestId: 'invalid-0001', command: { type: 'buy', itemId: 501, quantity: -1 } } });
    expect(res.statusCode).toBe(400);
    expect(repository.state.zeny).toBe(200);
    const xp = await app.inject({ method: 'POST', url: '/api/command', payload: { requestId: 'invalid-0002', command: { type: 'grantExperience', amount: 1000 } } });
    expect(xp.statusCode).toBe(400);
    expect(repository.state.baseExp).toBe(0);
  });
  it('rejects another website from issuing gameplay actions', async () => {
    const { app, repository } = setup();
    const res = await app.inject({ method: 'POST', url: '/api/command', headers: { origin: 'https://example.invalid' }, payload: { requestId: 'origin-0001', command: { type: 'buy', itemId: 501, quantity: 1 } } });
    expect(res.statusCode).toBe(403);
    expect(repository.state.zeny).toBe(200);
  });
  it('executes a purchase once across a retry and returns the real inventory', async () => {
    const { app } = setup();
    const payload = { requestId: 'purchase-0001', command: { type: 'buy', itemId: 501, quantity: 2 } };
    const first = await app.inject({ method: 'POST', url: '/api/command', payload });
    expect(first.statusCode).toBe(200);
    expect(first.json().state.zeny).toBe(100);
    const retry = await app.inject({ method: 'POST', url: '/api/command', payload });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().state.zeny).toBe(100);
    expect(retry.json().state.inventory.filter((i: { itemId: number }) => i.itemId === 501).reduce((n: number, i: { quantity: number }) => n + i.quantity, 0)).toBe(22);
  });
  it('reconciles previous absence before updating contact and allows dismissing the summary once', async () => {
    const { app, repository, advance } = setup();
    repository.state = applyCommand(repository.state, catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000);
    advance(60_000);
    const back = await app.inject({ method: 'POST', url: '/api/session' });
    expect(back.statusCode).toBe(200);
    expect(back.json().state.lastSeenAt).toBe(61_000);
    expect(back.json().offlineSummary.elapsedMs).toBe(60_000);
    const kills = back.json().state.totals.kills;
    const dismissed = await app.inject({ method: 'POST', url: '/api/command', payload: { requestId: 'dismiss-0001', command: { type: 'dismissOffline' } } });
    expect(dismissed.statusCode).toBe(200);
    expect(dismissed.json().offlineSummary).toBeNull();
    const again = await app.inject({ method: 'POST', url: '/api/session' });
    expect(again.json().state.totals.kills).toBe(kills);
    expect(again.json().offlineSummary).toBeNull();
  });
  it('caps previous absence before a fresh contact can extend hunting', async () => {
    const { app, repository, advance } = setup();
    repository.state = applyCommand(repository.state, catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000);
    advance(13 * 60 * 60 * 1000);
    const back = await app.inject({ method: 'POST', url: '/api/session' });
    expect(back.statusCode).toBe(200);
    expect(back.json().state.status).toBe('paused');
    expect(back.json().offlineSummary.elapsedMs).toBe(12 * 60 * 60 * 1000);
    expect(back.json().state.lastSeenAt).toBe(13 * 60 * 60 * 1000 + 1000);
  });
});
