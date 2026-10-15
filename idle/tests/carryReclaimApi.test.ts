import { afterEach, describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import { buildApp } from '../server/app.js';
import { SessionGameProfiles } from '../server/profiles.js';
import type { Catalog, GameState, InventoryEntry, PendingLoot } from '../shared/types.js';
import { MemoryAccountStore } from './portal-fixture.js';

const catalog = catalogJSON as unknown as Catalog;
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

async function setup() {
  const accounts = new MemoryAccountStore();
  const profiles = new SessionGameProfiles(accounts.profiles);
  const app = await buildApp({ catalog, accounts, profiles, now: () => 1000 });
  apps.push(app);

  async function register(suffix: string) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: {
      username: `carry_reclaim_${suffix}`, characterName: `Reclaim ${suffix.toUpperCase()}`,
      gender: 'male', password: 'valid-password', confirmation: 'valid-password',
    } });
    expect(response.statusCode).toBe(201);
    return {
      token: response.cookies.find(cookie => cookie.name === 'idle_session')!.value,
      profileId: response.json().profileId as string,
      repository: accounts.profiles.forProfile(response.json().profileId as string),
    };
  }

  return { app, accounts, register };
}

function rolledEntry(uid: string): InventoryEntry {
  return { uid, itemId: 1201, quantity: 1, refine: 3, cards: [4001], favorite: true,
    identified: false, rarity: 'legendary', rarityBonus: { stat: 'dex', value: 5 }, broken: true };
}

async function seedPending(repository: { transact: (id: string | null, action: (state: GameState) => GameState) => Promise<GameState> }, entry: InventoryEntry) {
  const row: PendingLoot = { source: 'monster', areaId: 'prontera', enemyId: `enemy-${entry.uid}`,
    monsterId: 1002, position: { x: 14, y: 20 }, entry: structuredClone(entry), acquiredAt: 900 };
  await repository.transact(null, state => {
    state.stats.str = 1000;
    state.pendingLoot = [row];
    state.totals.items[entry.itemId] = 1;
    state.rngState = 123456789;
    state.nextItemId = 900;
    return state;
  });
}

describe('authenticated pending loot reclaim', () => {
  it('reclaims once per profile across retries and identical request IDs', async () => {
    const { app, register } = await setup();
    const a = await register('a');
    const b = await register('b');
    const entryA = rolledEntry('reclaim-uid-a');
    const entryB = rolledEntry('reclaim-uid-b');
    await seedPending(a.repository, entryA);
    await seedPending(b.repository, entryB);
    const beforeA = await a.repository.read();
    const beforeB = await b.repository.read();
    const payload = { requestId: 'reclaim-shared-request', command: { type: 'collectPendingLoot' } };

    const firstA = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: a.token }, payload });
    expect(firstA.statusCode).toBe(200);
    const afterA = await a.repository.read();
    const retryA = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: a.token }, payload });
    expect(retryA.statusCode).toBe(200);
    expect(await a.repository.read()).toEqual(afterA);

    const sameRequestIdB = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: b.token }, payload });
    expect(sameRequestIdB.statusCode).toBe(200);
    const afterB = await b.repository.read();

    expect(afterA.inventory.filter(item => item.uid === entryA.uid)).toEqual([entryA]);
    expect(afterA.inventory.some(item => item.uid === entryB.uid)).toBe(false);
    expect(afterA.pendingLoot).toBeUndefined();
    expect(afterA.rngState).toBe(beforeA.rngState);
    expect(afterA.nextItemId).toBe(beforeA.nextItemId);
    expect(afterA.totals).toEqual(beforeA.totals);
    expect(afterB.inventory.filter(item => item.uid === entryB.uid)).toEqual([entryB]);
    expect(afterB.inventory.some(item => item.uid === entryA.uid)).toBe(false);
    expect(afterB.pendingLoot).toBeUndefined();
    expect(afterB.rngState).toBe(beforeB.rngState);
    expect(afterB.nextItemId).toBe(beforeB.nextItemId);
    expect(afterB.totals).toEqual(beforeB.totals);
  });

  it('does not persist or consume a request receipt when no pending item fits', async () => {
    const { app, register } = await setup();
    const account = await register('full');
    const entry = rolledEntry('reclaim-after-capacity');
    await seedPending(account.repository, entry);
    const before = await account.repository.transact(null, state => {
      state.stats.str = 1;
      state.inventory = [{ uid: 'legacy-overweight-stack', itemId: 909, quantity: 100_000,
        refine: 0, cards: [], favorite: false }];
      return state;
    });
    const payload = { requestId: 'reclaim-capacity-request', command: { type: 'collectPendingLoot' } };

    const rejected = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: account.token }, payload });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('WEIGHT_LIMIT');
    expect(await account.repository.read()).toEqual(before);

    await account.repository.transact(null, state => { state.stats.str = 1_000_000; return state; });
    const retry = await app.inject({ method: 'POST', url: '/api/command', cookies: { idle_session: account.token }, payload });
    expect(retry.statusCode).toBe(200);
    const reclaimed = await account.repository.read();
    expect(reclaimed.inventory.filter(item => item.uid === entry.uid)).toEqual([entry]);
    expect(reclaimed.pendingLoot).toBeUndefined();
  });
});
