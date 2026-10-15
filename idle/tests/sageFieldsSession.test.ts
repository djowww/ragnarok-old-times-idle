import { describe, expect, it, vi } from 'vitest';
import { castSetup } from './cast-control-fixture';
import { MemoryGameProfiles } from './portal-fixture';
import { SessionStateRepository } from '../server/sessionState';
import { placeSageField } from '../engine/sageFields';
import type { GameState } from '../shared/types';
import { captureGroundPlacement } from '../engine/groundUnitOccupancy';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
const connection = '1bd3543b-12fd-4c9c-a103-45fa1e68ad16';
function setup() {
  const { s, c, e } = castSetup(); c.items[2301].defenseElement = 'water';
  e.hp = e.maxHp = 100;
  c.monsters[e.monsterId].element = 'water';
  const memory = new MemoryGameProfiles(); memory.add(s); const durable = memory.forProfile(s.id);
  const repository = new SessionStateRepository(durable, c);
  return { s, c, durable, repository };
}
describe('Sage ground group source NoSave with current HP preservation', () => {
  it('keeps captured FogWall defense only in the current connection, matching SC_FOGWALL NoSave', async () => {
    const {c,durable,repository}=setup(); c.skills.pf_fogwall=structuredClone((raw as unknown as Catalog).skills.pf_fogwall);
    const field=await repository.transact(null,state=>{
      state.buffs.pf_fogwall={expiresAt:20000,effects:{}};
      captureGroundPlacement(state,c,c.skills.pf_fogwall,1,0,{x:.48,y:.65},{x:.48,y:.65}); return state;
    });
    expect(field.buffs.pf_fogwall).toBeDefined();
    expect((await durable.read()).buffs.pf_fogwall).toBeUndefined();
    expect((await repository.read()).buffs.pf_fogwall).toBeDefined();
    expect((await repository.openSession(connection,state=>state)).buffs.pf_fogwall).toBeUndefined();
  });
  it('keeps fixed neighboring ground geometry in-session but strips it from durable JSON and new connections', async () => {
    const {c,durable,repository}=setup();
    const read=await repository.transact(null,state=>{
      captureGroundPlacement(state,c,c.skills.fire_wall,1,0,{x:.6,y:.65},{x:.48,y:.65}); return state;
    });
    expect(read.groundPlacements).toHaveLength(1);
    expect((await durable.read()).groundPlacements).toBeUndefined();
    expect((await repository.read()).groundPlacements).toEqual(read.groundPlacements);
    expect((await repository.openSession(connection,state=>state)).groundPlacements).toBeUndefined();
  });
  it.each([false, true])('keeps field and excess HP only in the current session (cooperative=%s)', async cooperative => {
    const { s, c, durable, repository } = setup();
    const transact = (id: string | null, action: (state: GameState) => GameState, fingerprint?: string) => cooperative
      ? repository.transactCooperatively!(id, async state => action(state), fingerprint)
      : repository.transact(id, action, fingerprint);
    await repository.openSession(connection, value => value);
    await transact('field', state => {
      placeSageField(state, c, c.skills.sa_deluge, 5, 0, { x: .48, y: .65 });
      state.hp = 1010; state.battle!.enemies![0].hp = 110; return state;
    }, 'field');
    const saved = await durable.read(), read = await repository.read();
    expect(saved.elementalField).toBeUndefined(); expect(saved.hp).toBe(1000);
    expect(saved.battle!.enemies![0]).toMatchObject({ hp: 100, maxHp: 100 });
    expect(saved.battle!.enemies![0].elementalFieldBaseMaxHp).toBeUndefined();
    expect(read.elementalField?.sourceName).toBe('SA_DELUGE'); expect(read.hp).toBe(1010);
    expect(read.battle!.enemies![0]).toMatchObject({ hp: 110, maxHp: 115, elementalFieldBaseMaxHp: 100 });
    await transact(null, state => { state.zeny += 1; return state; });
    expect((await repository.read()).hp).toBe(1010);
    expect((await repository.read()).battle!.enemies![0].hp).toBe(110);
    const replay = await transact('field', () => { throw Error('receipt callback must not run'); }, 'field');
    expect(replay.elementalField?.sourceName).toBe('SA_DELUGE'); expect(replay.hp).toBe(1010);
    const reconnect = await repository.openSession('71b1d5a9-a1e7-4790-80aa-90ddc19c2b73', state => state);
    expect(reconnect.elementalField).toBeUndefined(); expect(reconnect.hp).toBe(1000);
    expect(reconnect.battle!.enemies![0]).toMatchObject({ hp: 100, maxHp: 100 });
    expect(s.revision).toBe(0);
  });
  it('does not replace committed field/HP when callback or durable commit fails', async () => {
    const { c, durable, repository } = setup();
    await repository.transact(null, state => { placeSageField(state, c, c.skills.sa_deluge, 5, 0, { x: .48, y: .65 });
      state.hp = 1010; state.battle!.enemies![0].hp = 110; return state; });
    await expect(repository.transact(null, state => { delete state.elementalField; state.hp = 1; throw Error('callback failed'); })).rejects.toThrow('callback failed');
    const before = await durable.read();
    const spy = vi.spyOn(durable, 'transact').mockImplementationOnce(async (_id, action) => {
      action(structuredClone(before)); throw Error('commit failed');
    });
    await expect(repository.transact(null, state => { delete state.elementalField; state.hp = 1; return state; })).rejects.toThrow('commit failed');
    spy.mockRestore();
    expect((await repository.read()).elementalField?.sourceName).toBe('SA_DELUGE');
    expect((await repository.read()).hp).toBe(1010); expect((await repository.read()).battle!.enemies![0].hp).toBe(110);
  });
  it('clears on logout/restart, isolates another profile and ignores fields injected into durable JSON', async () => {
    const a = setup(), b = setup();
    for (const x of [a, b]) await x.repository.transact(null, state => {
      placeSageField(state, x.c, x.c.skills.sa_deluge, 5, 0, { x: .48, y: .65 }); return state;
    });
    await a.repository.endSession(); expect((await a.repository.read()).elementalField).toBeUndefined();
    expect((await b.repository.read()).elementalField?.sourceName).toBe('SA_DELUGE');
    expect((await new SessionStateRepository(b.durable, b.c).read()).elementalField).toBeUndefined();
    await a.durable.transact(null, state => { placeSageField(state, a.c, a.c.skills.sa_deluge, 5, 0, { x: .48, y: .65 }); return state; });
    expect((await a.repository.read()).elementalField).toBeUndefined();
  });
  it('restores excess HP once when Battle and the field population reference the same monster object', async () => {
    const { c, repository } = setup();
    await repository.transact(null, state => {
      state.fieldPopulation = { areaId: state.areaId!, generation: 0, enemies: state.battle!.enemies!, respawns: [] };
      placeSageField(state, c, c.skills.sa_deluge, 5, 0, { x: .48, y: .65 });
      state.battle!.enemies![0].hp = 110; return state;
    });
    const state = await repository.read();
    expect(state.battle!.enemies![0].hp).toBe(110);
    expect(state.fieldPopulation!.enemies[0].hp).toBe(110);
  });
});
