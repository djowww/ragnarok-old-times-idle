import { afterEach, describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types.js';
import { createInitialState } from '../engine/index.js';
import { buildApp } from './authenticated-game-fixture.js';
import type { StateRepository } from '../server/repository.js';
import { SessionStateRepository, parseSessionOpenRequest, TRICK_DEAD_BUFF_ID } from '../server/sessionState.js';

const catalog = catalogJSON as unknown as Catalog;
const connectionA = '9c5a6405-2716-42b0-91cf-f1cb9e624c77';
const connectionB = 'b7bc2907-94b7-4abc-b6a9-287bf4482a95';

const playDead = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} } as GameState['buffs'][string];
const clone = <T,>(value: T): T => structuredClone(value);

class DurableFixture implements StateRepository {
  rawState: string;
  receipts = new Map<string, string>();
  commits = 0;
  failNextCommit = false;
  cooperativeCalls = 0;

  constructor(state: GameState, cooperative = true) {
    this.rawState = JSON.stringify(state);
    if (cooperative) this.transactCooperatively = async (requestId, action, fingerprint = '') => {
      this.cooperativeCalls++;
      return this.commit(requestId, action, fingerprint);
    };
  }

  transactCooperatively?: StateRepository['transactCooperatively'];

  async transact(requestId: string | null, action: (state: GameState) => GameState, fingerprint = '') {
    return this.commit(requestId, action, fingerprint);
  }

  private async commit(requestId: string | null, action: (state: GameState) => GameState | Promise<GameState>, fingerprint: string) {
    if (requestId && this.receipts.has(requestId)) {
      if (this.receipts.get(requestId) !== fingerprint) throw Object.assign(new Error('request reused'), { code: 'REQUEST_REUSED' });
      return JSON.parse(this.rawState) as GameState;
    }
    const before = JSON.parse(this.rawState) as GameState;
    const next = await action(clone(before));
    next.revision = before.revision + 1;
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error('fixture commit failed');
    }
    this.rawState = JSON.stringify(next);
    if (requestId) this.receipts.set(requestId, fingerprint);
    this.commits++;
    return JSON.parse(this.rawState) as GameState;
  }

  async read() { return JSON.parse(this.rawState) as GameState; }
  async health() { return true; }
}

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

function fixture() {
  const state = createInitialState(catalog, 1000);
  state.id = 'local-djow';
  return new DurableFixture(state);
}

describe('Trick Dead NoSave session storage', () => {
  it('keeps Sight Blaster volatile across requests and same-session replay, then clears it on a new connection', async () => {
    const durable = fixture();
    const repository = new SessionStateRepository(durable);
    const sightBlaster = 'sight_blaster';
    await repository.openSession(connectionA, state => state);
    const armed = { expiresAt: 120001, effects: {} } as GameState['buffs'][string];
    await repository.transact('arm-sight-01', state => {
      state.buffs[sightBlaster] = clone(armed);
      return state;
    }, 'arm-sight');

    expect(JSON.parse(durable.rawState).buffs).not.toHaveProperty(sightBlaster);
    expect((await repository.read()).buffs[sightBlaster]).toEqual(armed);
    const replay = await repository.transact('arm-sight-01', state => {
      delete state.buffs[sightBlaster];
      return state;
    }, 'arm-sight');
    expect(replay.buffs[sightBlaster]).toEqual(armed);
    expect((await repository.openSession(connectionA, state => state)).buffs[sightBlaster]).toEqual(armed);

    let newConnectionSawSightBlaster = true;
    const opened = await repository.openSession(connectionB, state => {
      newConnectionSawSightBlaster = !!state.buffs[sightBlaster];
      return state;
    });
    expect(newConnectionSawSightBlaster).toBe(false);
    expect(opened.buffs[sightBlaster]).toBeUndefined();
    expect(JSON.parse(durable.rawState).buffs).not.toHaveProperty(sightBlaster);
  });

  it('validates a UUID-like open body, enforces API origin, and returns a normal snapshot', async () => {
    const durable = fixture();
    const app = buildApp({ catalog, repository: durable, now: () => 1000, allowedOrigins: ['https://idle.example'] });
    apps.push(app);

    const malformed = await app.inject({ method: 'POST', url: '/api/session/open', payload: { connectionId: 'bad' } });
    expect(malformed.statusCode).toBe(400);
    const foreign = await app.inject({ method: 'POST', url: '/api/session/open', headers: { origin: 'https://other.example' }, payload: { connectionId: connectionA } });
    expect(foreign.statusCode).toBe(403);
    const opened = await app.inject({ method: 'POST', url: '/api/session/open', payload: { connectionId: connectionA } });
    expect(opened.statusCode).toBe(200);
    expect(opened.json()).toHaveProperty('state.id', 'local-djow');
    expect(opened.json()).toHaveProperty('serverTime', 1000);
    expect(durable.commits).toBe(1);
    expect(() => parseSessionOpenRequest({ connectionId: connectionA, extra: true })).toThrow();
  });

  it('keeps volatile Trick Dead through the app poll, command receipt replay, and error snapshot', async () => {
    const durable = fixture();
    const repository = new SessionStateRepository(durable);
    const app = buildApp({ catalog, repository, now: () => 1000 });
    apps.push(app);
    await repository.openSession(connectionA, state => state);
    await repository.transact('activate03', state => {
      state.buffs[TRICK_DEAD_BUFF_ID] = clone(playDead);
      return state;
    }, 'activate');

    const poll = await app.inject({ method: 'POST', url: '/api/session' });
    expect(poll.statusCode).toBe(200);
    expect(poll.json().state.buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);

    const payload = { requestId: 'autosave-01', command: { type: 'setAutoResume', enabled: true } };
    const first = await app.inject({ method: 'POST', url: '/api/command', payload });
    const replay = await app.inject({ method: 'POST', url: '/api/command', payload });
    expect(first.statusCode).toBe(200);
    expect(first.json().state.buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);
    expect(replay.json().state.buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);
    expect(JSON.parse(durable.rawState).buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);

    const failed = await app.inject({ method: 'POST', url: '/api/command', payload: {
      requestId: 'sell-none-01', command: { type: 'sell', uid: 'missing-item', quantity: 1 },
    } });
    expect(failed.statusCode).toBe(409);
    expect(failed.json().snapshot.state.buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);
  });

  it('keeps the buff volatile through reads, durable writes, and command receipt replay', async () => {
    const durable = fixture();
    const repository = new SessionStateRepository(durable);
    let effects = 0;

    await repository.transact('activate01', state => {
      state.buffs[TRICK_DEAD_BUFF_ID] = clone(playDead);
      effects++;
      return state;
    }, 'activate');
    expect(JSON.parse(durable.rawState).buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);
    expect((await repository.read()).buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);

    const replay = await repository.transact('activate01', state => {
      effects++;
      delete state.buffs[TRICK_DEAD_BUFF_ID];
      return state;
    }, 'activate');
    expect(effects).toBe(1);
    expect(replay.buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);
    expect((await repository.transact(null, state => state)).buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);
    expect(JSON.parse(durable.rawState).buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);
  });

  it('clears once before a new session action, but a same-id retry preserves a later activation', async () => {
    const durable = fixture();
    const repository = new SessionStateRepository(durable);
    await repository.openSession(connectionA, state => state);
    await repository.transact('activate02', state => {
      state.buffs[TRICK_DEAD_BUFF_ID] = clone(playDead);
      return state;
    }, 'activate');

    let retrySawBuff = false;
    const retry = await repository.openSession(connectionA, state => {
      retrySawBuff = !!state.buffs[TRICK_DEAD_BUFF_ID];
      return state;
    });
    expect(retrySawBuff).toBe(true);
    expect(retry.buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);

    let newSessionSawBuff = true;
    const next = await repository.openSession(connectionB, state => {
      newSessionSawBuff = !!state.buffs[TRICK_DEAD_BUFF_ID];
      return state;
    });
    expect(newSessionSawBuff).toBe(false);
    expect(next.buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);
    expect(JSON.parse(durable.rawState).buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);
  });

  it('retains retries for the newest 256 connections and treats an evicted FIFO id as new', async () => {
    const durable = fixture();
    const repository = new SessionStateRepository(durable);
    const ids = Array.from({ length: 257 }, (_, index) =>
      `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`);
    for (const connectionId of ids) await repository.openSession(connectionId, state => state);
    await repository.transact(null, state => {
      state.buffs[TRICK_DEAD_BUFF_ID] = clone(playDead);
      return state;
    });

    let newestRetrySawBuff = false;
    await repository.openSession(ids[256], state => {
      newestRetrySawBuff = !!state.buffs[TRICK_DEAD_BUFF_ID];
      return state;
    });
    expect(newestRetrySawBuff).toBe(true);

    let evictedRetrySawBuff = true;
    await repository.openSession(ids[0], state => {
      evictedRetrySawBuff = !!state.buffs[TRICK_DEAD_BUFF_ID];
      return state;
    });
    expect(evictedRetrySawBuff).toBe(false);
  });

  it('leaves volatile state and connection id unchanged after callback or commit failure', async () => {
    const durable = fixture();
    const repository = new SessionStateRepository(durable);
    await repository.transact(null, state => {
      state.buffs[TRICK_DEAD_BUFF_ID] = clone(playDead);
      return state;
    });
    const before = durable.rawState;

    await expect(repository.openSession(connectionB, state => {
      expect(state.buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);
      throw new Error('catch-up failed');
    })).rejects.toThrow('catch-up failed');
    expect((await repository.read()).buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);
    expect(durable.rawState).toBe(before);

    durable.failNextCommit = true;
    await expect(repository.transact(null, state => {
      delete state.buffs[TRICK_DEAD_BUFF_ID];
      return state;
    })).rejects.toThrow('fixture commit failed');
    expect((await repository.read()).buffs[TRICK_DEAD_BUFF_ID]).toEqual(playDead);
    expect(durable.rawState).toBe(before);

    let retrySawBuff = true;
    await repository.openSession(connectionB, state => {
      retrySawBuff = !!state.buffs[TRICK_DEAD_BUFF_ID];
      return state;
    });
    expect(retrySawBuff).toBe(false);
  });

  it('ignores an old durable raw buff after process restart and removes it on new open', async () => {
    const oldDurable = fixture();
    const original = JSON.parse(oldDurable.rawState) as GameState;
    original.buffs[TRICK_DEAD_BUFF_ID] = clone(playDead);
    oldDurable.rawState = JSON.stringify(original);

    const restarted = new SessionStateRepository(oldDurable);
    expect((await restarted.read()).buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);
    let caughtUpWithBuff = true;
    await restarted.openSession(connectionA, state => {
      caughtUpWithBuff = !!state.buffs[TRICK_DEAD_BUFF_ID];
      return state;
    });
    expect(caughtUpWithBuff).toBe(false);
    expect(JSON.parse(oldDurable.rawState).buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);
  });

  it('does not expose an async wrapper when the durable repository only supports sync transactions', async () => {
    const syncOnly = new SessionStateRepository(fixtureNoCoop());
    expect(syncOnly.transactCooperatively).toBeUndefined();
    const saved = await syncOnly.transact(null, state => {
      state.name = 'sync transaction';
      return state;
    });
    expect(saved.name).toBe('sync transaction');
  });

  it('serializes session open behind asynchronous contact and observes the cleared state before catch-up', async () => {
    const durable = fixture();
    const repository = new SessionStateRepository(durable);
    await repository.transact(null, state => {
      state.buffs[TRICK_DEAD_BUFF_ID] = clone(playDead);
      return state;
    });
    const gate = deferred<void>();
    const started = deferred<void>();
    const slowContact = repository.transactCooperatively!(null, async state => {
      started.resolve();
      await gate.promise;
      state.sp--;
      return state;
    });
    await started.promise;

    let opened = false;
    let catchupSawBuff = true;
    const opening = repository.openSessionCooperatively!(connectionA, async state => {
      catchupSawBuff = !!state.buffs[TRICK_DEAD_BUFF_ID];
      opened = true;
      return state;
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(opened).toBe(false);
    gate.resolve();
    await Promise.all([slowContact, opening]);
    expect(opened).toBe(true);
    expect(catchupSawBuff).toBe(false);
    expect((await repository.read()).buffs).not.toHaveProperty(TRICK_DEAD_BUFF_ID);
  });
});

function fixtureNoCoop() { return new DurableFixture(createInitialState(catalog, 1000), false); }

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
