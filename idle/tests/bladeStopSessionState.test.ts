import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/index.js';
import type { GameState } from '../shared/types.js';
import { SessionStateRepository } from '../server/sessionState.js';
import type { StateRepository } from '../server/repository.js';
import { fixture } from './engine-fixture.js';

class MemoryStateRepository implements StateRepository {
  constructor(public state: GameState) {}
  async transact(_requestId: string | null, action: (state: GameState) => GameState) {
    this.state = structuredClone(action(structuredClone(this.state)));
    return structuredClone(this.state);
  }
  async read() { return structuredClone(this.state); }
  async health() { return true; }
}

describe('Blade Stop NoSave status', () => {
  it('keeps the live pair, writes a resumed durable state, drops A on reconnect/restart and preserves B', async () => {
    const c = fixture(), initial = createInitialState(c, 0);
    const enemy = { id: 'enemy-a', monsterId: 1002, hp: 10, maxHp: 10, startedAt: 0,
      arrivedAt: 10_000, approachPausedAt: 1_000, enemyNextAttackAt: 1000, spawnDirection: 0, position: { x: 0, y: 0 },
      statuses: {} };
    initial.lastSimulatedAt = 5_000;
    initial.fieldHero = { areaId: initial.areaId!, from: { x: 0, y: 0 }, position: { x: 1, y: 0 },
      startedAt: 0, arrivedAt: 10_000, routeIndex: 0, moveBlockedUntil: 60_000 };
    initial.battle = { monsterId: 1002, hp: 10, maxHp: 10, startedAt: 0,
      playerNextAttackAt: 0, enemyNextAttackAt: 1000, enemies: [enemy] };
    initial.areaId = 'prontera'; initial.status = 'hunting';
    const roaming = [1, 2].map(index => ({ ...structuredClone(enemy), id: `enemy-a-${index}`,
      startedAt: 1_000, arrivedAt: 2_000 + index * 1_000, approachPausedAt: undefined, statuses: {} }));
    initial.fieldPopulation = { areaId: 'prontera', generation: 3,
      enemies: [structuredClone(enemy), ...roaming], respawns: [] };
    initial.battle.enemies = [structuredClone(enemy), ...structuredClone(roaming)];
    const durable = new MemoryStateRepository(initial), repository = new SessionStateRepository(durable);
    const durableB = new MemoryStateRepository(structuredClone(initial));
    durableB.state.id = 'profile-b';
    const repositoryB = new SessionStateRepository(durableB);
    await repositoryB.openSession('connection-b', state => state);
    await repositoryB.transact(null, state => {
      state.combatEffects = { bladeStopLink: { level: 5, partnerActorId: enemy.id, areaId: null, expiresAt: 60_000 } };
      state.battle!.enemies![0].statuses!.SC_BLADESTOP = { level: 5, expiresAt: 60_000,
        sourceActorId: state.id, partnerActorId: state.id, skillId: 'MO_BLADESTOP' };
      state.fieldPopulation!.enemies[0].statuses!.SC_BLADESTOP = structuredClone(state.battle!.enemies![0].statuses!.SC_BLADESTOP);
      return state;
    });
    await repository.openSession('connection-one', state => state);
    const inConnection = await repository.transact(null, state => {
      state.combatEffects = { bladeStopLink: { level: 5, partnerActorId: enemy.id, areaId: null, expiresAt: 60_000 },
        bladeStopWait: { level: 4, expiresAt: 1300 } };
      state.battle!.enemies![0].statuses!.SC_BLADESTOP = { level: 5, expiresAt: 60_000,
        sourceActorId: state.id, partnerActorId: state.id, skillId: 'MO_BLADESTOP' };
      state.fieldPopulation!.enemies[0].statuses!.SC_BLADESTOP = structuredClone(state.battle!.enemies![0].statuses!.SC_BLADESTOP);
      state.fieldHero!.moveBlockedUntil = 60_000;
      return state;
    });
    expect(inConnection.combatEffects?.bladeStopLink).toBeDefined();
    expect(inConnection.battle?.enemies?.[0].statuses?.SC_BLADESTOP).toBeDefined();
    expect(inConnection.fieldPopulation?.enemies?.[0].statuses?.SC_BLADESTOP).toBeDefined();
    expect(inConnection.battle?.enemies?.[0]).toMatchObject({ startedAt: 0, arrivedAt: 10_000, approachPausedAt: 1_000 });
    expect(inConnection.fieldHero?.moveBlockedUntil).toBe(60_000);
    expect(durable.state.combatEffects?.bladeStopLink).toBeUndefined();
    expect(durable.state.combatEffects?.bladeStopWait).toBeUndefined();
    expect(durable.state.battle?.enemies?.[0].statuses?.SC_BLADESTOP).toBeUndefined();
    expect(durable.state.fieldPopulation?.enemies?.[0].statuses?.SC_BLADESTOP).toBeUndefined();
    expect(durable.state.fieldHero?.moveBlockedUntil).toBeUndefined();
    expect(durable.state.battle?.enemies?.[0]).toMatchObject({ startedAt: 4_000, arrivedAt: 14_000 });
    expect(durable.state.fieldPopulation?.enemies?.[0]).toMatchObject({ startedAt: 4_000, arrivedAt: 14_000 });
    expect(durable.state.battle?.enemies?.[0].approachPausedAt).toBeUndefined();
    expect(durable.state.fieldPopulation?.enemies?.slice(1)).toMatchObject([
      { startedAt: 1_000, arrivedAt: 3_000 }, { startedAt: 1_000, arrivedAt: 4_000 },
    ]);
    const readInConnection = await repository.read();
    expect(readInConnection.combatEffects?.bladeStopLink).toBeDefined();
    expect(readInConnection.battle?.enemies?.[0].approachPausedAt).toBe(1_000);
    expect(readInConnection.fieldPopulation?.enemies?.[0].approachPausedAt).toBe(1_000);
    await repository.transact(null, state => state);
    const sameConnection = await repository.openSession('connection-one', state => state);
    expect(sameConnection.combatEffects?.bladeStopLink).toBeDefined();
    const afterProcessRestart = await new SessionStateRepository(durable).read();
    expect(afterProcessRestart.combatEffects?.bladeStopLink).toBeUndefined();
    expect(afterProcessRestart.battle?.enemies?.[0].statuses?.SC_BLADESTOP).toBeUndefined();
    expect(afterProcessRestart.fieldPopulation?.enemies?.[0].statuses?.SC_BLADESTOP).toBeUndefined();
    expect(afterProcessRestart.battle?.enemies?.[0]).toMatchObject({ startedAt: 4_000, arrivedAt: 14_000 });
    expect(afterProcessRestart.fieldHero?.moveBlockedUntil).toBeUndefined();
    const reconnected = await repository.openSession('connection-two', state => state);
    expect(reconnected.combatEffects?.bladeStopLink).toBeUndefined();
    expect(reconnected.combatEffects?.bladeStopWait).toBeUndefined();
    expect(reconnected.battle?.enemies?.[0].statuses?.SC_BLADESTOP).toBeUndefined();
    expect(reconnected.fieldPopulation?.enemies?.[0].statuses?.SC_BLADESTOP).toBeUndefined();
    const profileB = await repositoryB.read();
    expect(profileB.id).toBe('profile-b');
    expect(profileB.combatEffects?.bladeStopLink).toBeDefined();
    expect(profileB.battle?.enemies?.[0].statuses?.SC_BLADESTOP).toBeDefined();
    expect(profileB.fieldPopulation?.enemies?.[0].statuses?.SC_BLADESTOP).toBeDefined();
  });
});
