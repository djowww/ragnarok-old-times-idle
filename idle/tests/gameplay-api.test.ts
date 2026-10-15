import { afterEach, describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types.js';
import { createInitialState, applyCommand } from '../engine/index.js';
import { derivedStats } from '../engine/stats.js';
import { buildApp } from './authenticated-game-fixture.js';
import type { StateRepository } from '../server/repository.js';
import { mkdtemp, writeFile, mkdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
function setup(allowedOrigins?: readonly string[]) {
  let now = 1000;
  const repository = new MemoryRepository(createInitialState(catalog, now));
  const app = buildApp({ catalog, repository, now: () => now, ...(allowedOrigins ? { allowedOrigins } : {}) });
  apps.push(app);
  return { app, repository, advance: (ms: number) => { now += ms; } };
}
describe('idle HTTP intentions', () => {
  it('always serves fresh entry HTML across releases while caching only hashed assets', async () => {
    const webRoot = await mkdtemp(join(tmpdir(), 'ragidle-cache-'));
    const app = buildApp({ catalog, repository: new MemoryRepository(createInitialState(catalog, 1000)), now: () => 1000, webRoot });
    apps.push(app);
    try {
      await writeFile(join(webRoot, 'index.html'), '<html>release-one</html>');
      await utimes(join(webRoot, 'index.html'), 0, 0);
      await mkdir(join(webRoot, 'ui-assets')); await writeFile(join(webRoot, 'ui-assets/index-abc123.js'), 'console.log(1)');
      const first = await app.inject('/');
      const headers = { 'if-modified-since': first.headers['last-modified'] ?? 'Thu, 01 Jan 1970 00:00:00 GMT',
        'if-none-match': first.headers.etag ?? '"stale-release"' };
      await writeFile(join(webRoot, 'index.html'), '<html>release-two</html>');
      await utimes(join(webRoot, 'index.html'), 0, 0);
      for (const url of ['/', '/index.html', '/character/select']) for (const conditional of [headers,
        { 'if-modified-since': 'Thu, 01 Jan 1970 00:00:00 GMT' }, { 'if-none-match': '*' },
        { 'if-match': '"stale-release"' }, { 'if-unmodified-since': 'Thu, 01 Jan 1970 00:00:00 GMT' }]) {
        const current = await app.inject({ url, headers: conditional });
        expect(current.statusCode, url).toBe(200); expect(current.body).toContain('release-two');
        expect(current.headers['cache-control']).toBe('no-store');
        expect(current.headers.etag).toBeUndefined(); expect(current.headers['last-modified']).toBeUndefined();
      }
      const asset = await app.inject('/ui-assets/index-abc123.js');
      expect(asset.statusCode).toBe(200); expect(asset.headers['cache-control']).toContain('immutable');
      expect((await app.inject('/ui-assets/index-missing.js')).statusCode).toBe(404);
    } finally { await app.close(); apps.splice(apps.indexOf(app), 1); await rm(webRoot, { recursive: true, force: true }); }
  });
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
  it('accepts the configured production origin for API writes', async () => {
    const { app } = setup(['https://play.example.test:8443']);
    const res = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'https://play.example.test:8443' } });
    expect(res.statusCode).toBe(200);
    const foreign = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'https://example.invalid' } });
    expect(foreign.statusCode).toBe(403);
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
  it('repairs broken gear once across a request retry', async () => {
    const { app, repository } = setup();
    const weapon = repository.state.inventory.find(entry => entry.itemId === 1201)!;
    weapon.broken = true;
    delete repository.state.equipment.weapon;
    repository.state.zeny = 5000;
    const payload = { requestId: 'repair-all-0001', command: { type: 'repairAll' } };
    const first = await app.inject({ method: 'POST', url: '/api/command', payload });
    expect(first.statusCode).toBe(200);
    expect(first.json().state.zeny).toBe(0);
    expect(first.json().state.inventory.find((entry: { uid: string }) => entry.uid === weapon.uid)).not.toHaveProperty('broken');
    const retry = await app.inject({ method: 'POST', url: '/api/command', payload });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().state.zeny).toBe(0);
  });
  it('replays a manual Sacrifice activation receipt without charging SP twice or resetting charges twice', async () => {
    const { app, repository } = setup();
    const state = repository.state;
    state.job = 'paladin'; state.baseLevel = 99; state.jobLevel = 50; state.status = 'town'; state.battle = null;
    state.nextEncounterAt = Number.MAX_SAFE_INTEGER;
    state.learnedSkills.pa_sacrifice = 5; state.learnedSkills.sm_endure = 1;
    state.learnedSkills.cr_trust = 5; state.learnedSkills.cr_devotion = 3;
    state.hp = 1; state.sp = 200;
    const expectedSp = Math.min(state.sp, derivedStats(state, catalog).maxSp) - catalog.skills.pa_sacrifice.spCost[4];
    const payload = { requestId: 'manual-sacrifice-01', command: { type: 'useSkill', skillId: 'pa_sacrifice' } };

    const first = await app.inject({ method: 'POST', url: '/api/command', payload });
    const retry = await app.inject({ method: 'POST', url: '/api/command', payload });

    expect(first.statusCode).toBe(200);
    expect(first.json().state.sp).toBe(expectedSp);
    expect(first.json().state.hp).toBe(1);
    expect(first.json().state.combatEffects.sacrifice).toEqual({ level: 5, charges: 5 });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().state.sp).toBe(expectedSp);
    expect(retry.json().state.combatEffects.sacrifice).toEqual({ level: 5, charges: 5 });
    expect(repository.receipts.size).toBe(1);
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
