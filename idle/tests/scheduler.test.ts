import { describe, it, expect, vi } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import type { GameProfiles } from '../server/identity/types.js';
import { createInitialState, applyCommand } from '../engine/index.js';
import { MemoryGameProfiles } from './portal-fixture.js';
import { createScheduler } from '../server/scheduler.js';
const catalog = catalogJSON as unknown as Catalog;

describe('profile scheduler', () => {
  it('advances hunting/challenge/resting without contact and pauses at twelve hours', async () => {
    const profiles = new MemoryGameProfiles();
    for (const [id, status] of [['a', 'hunting'], ['b', 'challenge'], ['c', 'resting']] as const) {
      let state = createInitialState(catalog, 1000); state.id = id;
      state = applyCommand(state, catalog, { type: 'startHunt', areaId: catalog.areas[0].id }, 1000);
      // Challenges use the same persisted active status and real engine behavior.
      if (status === 'challenge') { state = createInitialState(catalog, 1000); state.baseLevel = 99; state = applyCommand(state, catalog, { type: 'challenge', challengeId: 'mastering' }, 1000); }
      state.id = id; if (status === 'resting') { state.status = 'resting'; state.hp = 1; }
      profiles.add(state);
    }
    let at = 61000; const errors: unknown[] = [];
    const scheduler = createScheduler({ profiles, catalog, now: () => at, reportError: (_id, error) => errors.push(error) });
    await scheduler.runCycle();
    for (const id of ['a', 'b', 'c']) {
      const state = await profiles.forProfile(id).read();
      expect(state.lastSimulatedAt).toBe(61000); expect(state.lastSeenAt).toBe(1000);
      expect(state.contactTotals.elapsedMs).toBe(0); expect(state.offlineSummary).toBeNull();
    }
    expect((await profiles.forProfile('c').read()).hp).toBeGreaterThan(1);
    at = 13 * 3600000 + 1000;
    await scheduler.runCycle();
    expect((await profiles.forProfile('a').read()).status).toBe('paused');
    expect((await profiles.forProfile('a').read()).lastSimulatedAt).toBe(12 * 3600000 + 1000);
    expect(errors).toEqual([]);
  }, 15000);
  it('pages at fifty, limits transactions to two, resets its cursor, skips overlap and continues errors', async () => {
    const ids = Array.from({ length: 103 }, (_, i) => `p${String(i).padStart(3, '0')}`);
    let active = 0; let peak = 0; const visited: string[] = []; const cursors: Array<string | null> = []; const errors: string[] = [];
    let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
    const profiles: GameProfiles = {
      async health() { return true; },
      async eligible(after, limit) { expect(limit).toBe(50); cursors.push(after); return ids.filter(id => after === null || id > after).slice(0, limit); },
      forProfile(id) {
        return {
          async health() { return true; }, async read() { throw new Error('No read before transaction'); },
          async transact() { throw new Error('Must cooperate'); },
          async transactCooperatively(requestId, action) {
            expect(requestId).toBeNull(); active++; peak = Math.max(peak, active);
            try { await barrier; visited.push(id); if (id === 'p001') throw new Error('fixture failure'); return await action(createInitialState(catalog, 1000)); }
            finally { active--; }
          },
        };
      },
    };
    const scheduler = createScheduler({ profiles, catalog, now: () => 2000, reportError: id => errors.push(id) });
    const cycle = scheduler.runCycle(); void cycle.catch(() => {}); await Promise.resolve(); await Promise.resolve();
    await scheduler.runCycle(); release(); await cycle;
    expect(peak).toBe(2); expect(visited).toEqual(ids); expect(errors).toEqual(['p001']);
    expect(cursors).toEqual([null, 'p049', 'p099']);
    await scheduler.runCycle(); expect(visited).toHaveLength(206); expect(cursors[3]).toBeNull();
  });
  it('starts one timer and stop cancels future cycles', async () => {
    vi.useFakeTimers();
    try {
      let cycles = 0;
      const profiles: GameProfiles = { forProfile() { throw new Error('empty'); }, async health() { return true; }, async eligible() { cycles++; return []; } };
      const scheduler = createScheduler({ profiles, catalog, now: Date.now, reportError() {} });
      scheduler.start(); scheduler.start(); await vi.advanceTimersByTimeAsync(15000); expect(cycles).toBe(3);
      await scheduler.stop(); await vi.advanceTimersByTimeAsync(15000); expect(cycles).toBe(3);
    } finally { vi.useRealTimers(); }
  });
  it('drains an in-flight cycle before stop completes and avoids later work', async () => {
    let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void; const entry = new Promise<void>(resolve => { entered = resolve; });
    let cycles = 0;
    const profiles: GameProfiles = {
      forProfile() { throw new Error('empty'); }, async health() { return true; },
      async eligible() { cycles++; entered(); await barrier; return []; },
    };
    const scheduler = createScheduler({ profiles, catalog, now: () => 1000, reportError() {} });
    const cycle = scheduler.runCycle(); await entry;
    let stopped = false; const stopping = Promise.resolve(scheduler.stop()).then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false);
    release(); await cycle; await stopping; expect(stopped).toBe(true);
    await scheduler.runCycle(); expect(cycles).toBe(1);
  });
});
