import { describe, expect, it, vi } from 'vitest';
import { castSetup } from './cast-control-fixture';
import { MemoryGameProfiles } from './portal-fixture';
import { SessionStateRepository } from '../server/sessionState';
import type { BattleEnemy, GameState } from '../shared/types';

const connection = '1bd3543b-12fd-4c9c-a103-45fa1e68ad16';
const freshConnection = '71b1d5a9-a1e7-4790-80aa-90ddc19c2b73';
const meltdown = { startsAt: 1000, expiresAt: 61000, effects: {} };
const weaponStrip = { startsAt: 2000, expiresAt: 77000, level: 0, sourceActorId: 'monster-self' };
const rogueArmorStrip = { startsAt: 3000, expiresAt: 108000, level: 3, sourceActorId: 'rogue' };
function setup() {
  const { s, c, e } = castSetup();
  const fieldEnemy = { ...structuredClone(e), id: 'alchemy-field-1', fieldSlot: 0 };
  s.fieldPopulation = { areaId: 'prontera', generation: 1, enemies: [fieldEnemy], respawns: [] };
  s.skillUseLevels = { potion_pitcher: 4 };
  const memory = new MemoryGameProfiles(); memory.add(s);
  const durable = memory.forProfile(s.id), repository = new SessionStateRepository(durable, c);
  return { s, c, e, durable, repository };
}
function arm(state: GameState): GameState {
  state.buffs.ws_meltdown = structuredClone(meltdown);
  ((state.combatEffects ??= {}).buffLevels ??= {}).ws_meltdown = 10;
  (state.battle!.enemies![0].statuses ??= {}).SC_NOEQUIPWEAPON = structuredClone(weaponStrip);
  (state.fieldPopulation!.enemies[0].statuses ??= {}).SC_NOEQUIPARMOR = structuredClone(rogueArmorStrip);
  return state;
}
function expectStrips(state: GameState): void {
  expect(state.battle!.enemies![0].statuses?.SC_NOEQUIPWEAPON).toEqual(weaponStrip);
  expect(state.fieldPopulation!.enemies[0].statuses?.SC_NOEQUIPARMOR).toEqual(rogueArmorStrip);
}
function expectNoDurableAlchemy(state: GameState): void {
  expect(state.buffs.ws_meltdown).toBeUndefined();
  expect(state.combatEffects?.buffLevels?.ws_meltdown).toBeUndefined();
  for (const enemy of [...state.battle!.enemies!, ...state.fieldPopulation!.enemies]) {
    expect(enemy.statuses?.SC_NOEQUIPWEAPON).toBeUndefined();
    expect(enemy.statuses?.SC_NOEQUIPARMOR).toBeUndefined();
  }
}
describe('Meltdown and monster strip source NoSave lifecycle', () => {
  it.each([false, true])('keeps exact captured values across polls, actions and receipts, outside durable JSON (cooperative=%s)', async cooperative => {
    const { durable, repository } = setup();
    const transact = (id: string | null, action: (state: GameState) => GameState, fingerprint?: string) => cooperative
      ? repository.transactCooperatively!(id, async state => action(state), fingerprint)
      : repository.transact(id, action, fingerprint);
    await repository.openSession(connection, state => state);
    await transact('arm-alchemy', arm, 'arm');
    const stored = await durable.read(), before = await repository.read();
    expectNoDurableAlchemy(stored); expectStrips(before);
    expect(before.buffs.ws_meltdown).toEqual(meltdown);
    expect(before.combatEffects?.buffLevels?.ws_meltdown).toBe(10);
    expect(stored.skillUseLevels).toEqual({ potion_pitcher: 4 });
    await transact(null, state => { state.lastSimulatedAt = 5000; state.zeny += 1; return state; });
    const polled = await repository.read(); expectStrips(polled);
    expect(polled.buffs.ws_meltdown).toEqual(meltdown);
    const replay = await transact('arm-alchemy', () => { throw Error('receipt must skip action'); }, 'arm');
    expectStrips(replay); expect(replay.combatEffects?.buffLevels?.ws_meltdown).toBe(10);
    expect(replay.lastSimulatedAt).toBe(5000); expectNoDurableAlchemy(await durable.read());
  });
  it.each([false, true])('new connection clears player buff and level, while living target strips and preferences survive (cooperative=%s)', async cooperative => {
    const { durable, repository } = setup();
    await repository.openSession(connection, state => state);
    await repository.transact(null, arm);
    const open = (id: string, action: (state: GameState) => GameState) => cooperative
      ? repository.openSessionCooperatively!(id, async state => action(state))
      : repository.openSession(id, action);
    const same = await open(connection, state => state);
    expect(same.buffs.ws_meltdown).toEqual(meltdown); expectStrips(same);
    const fresh = await open(freshConnection, state => {
      expect(state.buffs.ws_meltdown).toBeUndefined();
      expect(state.combatEffects?.buffLevels?.ws_meltdown).toBeUndefined();
      expectStrips(state); state.lastSimulatedAt = 8000; return state;
    });
    expectStrips(fresh); expect(fresh.buffs.ws_meltdown).toBeUndefined();
    expect(fresh.combatEffects?.buffLevels?.ws_meltdown).toBeUndefined();
    expect(fresh.skillUseLevels).toEqual({ potion_pitcher: 4 });
    expectNoDurableAlchemy(await durable.read());
  });
  it.each([false, true])('keeps a newly paid Meltdown cast made by the opening action, after removing the old capture (cooperative=%s)', async cooperative => {
    const { durable, repository } = setup();
    await repository.openSession(connection, state => state); await repository.transact(null, arm);
    const recast = { startsAt: 12000, expiresAt: 57000, effects: {} };
    const action = (state: GameState) => {
      expect(state.buffs.ws_meltdown).toBeUndefined();
      expect(state.combatEffects?.buffLevels?.ws_meltdown).toBeUndefined();
      expectStrips(state);
      state.buffs.ws_meltdown = structuredClone(recast);
      ((state.combatEffects ??= {}).buffLevels ??= {}).ws_meltdown = 7; return state;
    };
    const opened = cooperative
      ? await repository.openSessionCooperatively!(freshConnection, async state => action(state))
      : await repository.openSession(freshConnection, action);
    expect(opened.buffs.ws_meltdown).toEqual(recast);
    expect(opened.combatEffects?.buffLevels?.ws_meltdown).toBe(7);
    expectStrips(await repository.read()); expectNoDurableAlchemy(await durable.read());
  });
  it('does not resurrect cleared player buff or expired strips when an old receipt is replayed', async () => {
    const { repository } = setup();
    await repository.openSession(connection, state => state);
    await repository.transact('arm-alchemy', arm, 'arm');
    await repository.openSession(freshConnection, state => state);
    await repository.transact(null, state => {
      delete state.battle!.enemies![0].statuses!.SC_NOEQUIPWEAPON;
      delete state.fieldPopulation!.enemies[0].statuses!.SC_NOEQUIPARMOR;
      state.lastSimulatedAt = 110000; return state;
    });
    const replay = await repository.transact('arm-alchemy', () => { throw Error('must not run'); }, 'arm');
    expectNoDurableAlchemy(replay); expect(replay.lastSimulatedAt).toBe(110000);
    expect(replay.skillUseLevels?.potion_pitcher).toBe(4);
  });
  it('keeps strips by monster instance, supports both scene collections and never assigns them to a respawn slot', async () => {
    const { repository, durable } = setup();
    await repository.openSession(connection, state => state);
    await repository.transact(null, state => {
      arm(state);
      const duplicate = structuredClone(state.battle!.enemies![0]);
      duplicate.id = 'unstripped-neighbor'; delete duplicate.statuses;
      state.battle!.enemies!.push(duplicate); return state;
    });
    const before = await repository.read(); expectStrips(before);
    expect(before.battle!.enemies![1].statuses?.SC_NOEQUIPWEAPON).toBeUndefined();
    await repository.transact(null, state => {
      const respawn: BattleEnemy = { ...structuredClone(state.fieldPopulation!.enemies[0]), id: 'alchemy-field-2' };
      delete respawn.statuses;
      state.fieldPopulation!.enemies = [respawn];
      state.battle!.enemies = [state.battle!.enemies![1]]; return state;
    });
    const after = await repository.read();
    expect(after.fieldPopulation!.enemies[0].fieldSlot).toBe(0);
    expect(after.fieldPopulation!.enemies[0].statuses?.SC_NOEQUIPARMOR).toBeUndefined();
    expect(after.battle!.enemies![0].statuses?.SC_NOEQUIPWEAPON).toBeUndefined();
    expectNoDurableAlchemy(await durable.read());
  });
  it('preserves stronger Rogue strip records exactly through hydration, without downgrading or extending them', async () => {
    const { repository } = setup();
    await repository.transact(null, arm);
    await repository.transact(null, state => {
      expect(state.fieldPopulation!.enemies[0].statuses?.SC_NOEQUIPARMOR).toEqual(rogueArmorStrip);
      state.learnedSkills.ws_meltdown = 1; return state;
    });
    expectStrips(await repository.read());
    expect((await repository.read()).combatEffects?.buffLevels?.ws_meltdown).toBe(10);
  });
  it('removes orphan captured levels when the engine removes the buff, without changing selected use levels', async () => {
    const { repository, durable } = setup();
    await repository.transact(null, arm);
    await repository.transact(null, state => { delete state.buffs.ws_meltdown; return state; });
    expect((await repository.read()).combatEffects?.buffLevels?.ws_meltdown).toBeUndefined();
    expect((await durable.read()).combatEffects?.buffLevels?.ws_meltdown).toBeUndefined();
    expect((await repository.read()).skillUseLevels?.potion_pitcher).toBe(4);
    expectStrips(await repository.read());
  });
  it('keeps the previous volatile snapshot after action and durable commit failures', async () => {
    const { repository, durable } = setup(); await repository.transact(null, arm);
    await expect(repository.transact(null, state => {
      delete state.buffs.ws_meltdown;
      delete state.battle!.enemies![0].statuses!.SC_NOEQUIPWEAPON; throw Error('action failed');
    })).rejects.toThrow('action failed');
    const transact = durable.transactCooperatively!.bind(durable);
    const spy = vi.spyOn(durable, 'transactCooperatively').mockImplementationOnce((id, action, fingerprint) =>
      transact(id, async state => { await action(state); throw Error('commit failed'); }, fingerprint));
    await expect(repository.transactCooperatively!(null, async state => {
      delete state.buffs.ws_meltdown;
      delete state.fieldPopulation!.enemies[0].statuses!.SC_NOEQUIPARMOR; return state;
    })).rejects.toThrow('commit failed'); spy.mockRestore();
    const after = await repository.read(); expectStrips(after);
    expect(after.buffs.ws_meltdown).toEqual(meltdown);
    expect(after.combatEffects?.buffLevels?.ws_meltdown).toBe(10);
  });
  it('serializes logout after pending work, retains monster status in this process, and isolates profiles', async () => {
    const a = setup(), b = setup();
    await a.repository.openSession(connection, state => state);
    await a.repository.transact(null, arm); await b.repository.transact(null, arm);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const pending = a.repository.transactCooperatively!(null, async state => {
      entered(); await gate;
      state.fieldPopulation!.enemies[0].statuses!.SC_NOEQUIPARMOR.expiresAt = 115000; return state;
    });
    await started; const clear = a.repository.endSession(); release(); await pending; await clear;
    const after = await a.repository.openSession(connection, state => state);
    expect(after.buffs.ws_meltdown).toBeUndefined();
    expect(after.combatEffects?.buffLevels?.ws_meltdown).toBeUndefined();
    expect(after.fieldPopulation!.enemies[0].statuses?.SC_NOEQUIPARMOR.expiresAt).toBe(115000);
    expect(after.battle!.enemies![0].statuses?.SC_NOEQUIPWEAPON).toEqual(weaponStrip);
    expect(after.skillUseLevels?.potion_pitcher).toBe(4);
    expect((await b.repository.read()).buffs.ws_meltdown).toEqual(meltdown);
    expectNoDurableAlchemy(await a.durable.read());
    const restarted = new SessionStateRepository(a.durable, a.c);
    expectNoDurableAlchemy(await restarted.read());
  });
  it('drops NoSave values injected into durable JSON on a fresh process wrapper, including Rogue levels', async () => {
    const { durable, c } = setup(); await durable.transact(null, arm);
    const repository = new SessionStateRepository(durable, c);
    const after = await repository.read(); expectNoDurableAlchemy(after);
    expect(after.skillUseLevels?.potion_pitcher).toBe(4);
    await repository.transact(null, state => state); expectNoDurableAlchemy(await durable.read());
  });
});
