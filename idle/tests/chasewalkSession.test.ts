import { describe, expect, it, vi } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState } from '../engine';
import { MemoryGameProfiles } from './portal-fixture';
import { SessionGameProfiles } from '../server/profiles';
describe('ChaseWalk durable main and NoSave strength', () => {
  it('keeps main/pulse/level durable and strength only within the current connection', async () => {
    const memory=new MemoryGameProfiles(), wrappers=new SessionGameProfiles(memory);
    const state=createInitialState(raw as unknown as Catalog,0); state.id='chasewalk-test'; memory.add(state);
    const repo=wrappers.forProfile(state.id), connection='1bd3543b-12fd-4c9c-a103-45fa1e68ad16';
    await repo.openSession(connection,s=>s);
    await repo.transact('strength',s=>{
      s.buffs.st_chasewalk={startsAt:1000,expiresAt:Number.MAX_SAFE_INTEGER,effects:{}};
      s.buffs.chasewalk_strength={startsAt:11000,expiresAt:41000,effects:{str:16}};
      s.combatEffects={buffDrainAt:{st_chasewalk:21000},buffLevels:{st_chasewalk:5}};return s;
    },'strength');
    const durable=await memory.forProfile(state.id).read();
    expect(durable.buffs.chasewalk_strength).toBeUndefined();
    expect(durable.combatEffects).toEqual({buffDrainAt:{st_chasewalk:21000},buffLevels:{st_chasewalk:5}});
    expect(durable.buffs.st_chasewalk).toBeDefined();
    expect((await repo.read()).buffs.chasewalk_strength.effects.str).toBe(16);
    const replay=await repo.transact('strength',()=>{throw Error('receipt should skip');},'strength');
    expect(replay.buffs.chasewalk_strength.effects.str).toBe(16);
    await expect(repo.transact(null,s=>{delete s.buffs.chasewalk_strength;throw Error('failed');})).rejects.toThrow('failed');
    expect((await repo.read()).buffs.chasewalk_strength.effects.str).toBe(16);
    const reconnected=await repo.openSession('71b1d5a9-a1e7-4790-80aa-90ddc19c2b73',s=>s);
    expect(reconnected.buffs.chasewalk_strength).toBeUndefined(); expect(reconnected.buffs.st_chasewalk).toBeDefined();
    expect((await new SessionGameProfiles(memory).forProfile(state.id).read()).buffs.chasewalk_strength).toBeUndefined();
  });
  it('does not cross profiles on logout or change strength after a failed durable commit',async()=>{
    const memory=new MemoryGameProfiles(),profiles=new SessionGameProfiles(memory);
    for(const id of ['alpha','beta']){const s=createInitialState(raw as unknown as Catalog,0);s.id=id;memory.add(s);}
    for(const id of ['alpha','beta'])await profiles.forProfile(id).transact(null,s=>{
      s.buffs.st_chasewalk={startsAt:0,expiresAt:Number.MAX_SAFE_INTEGER,effects:{}};
      s.buffs.chasewalk_strength={startsAt:10000,expiresAt:40000,effects:{str:id==='alpha'?16:4}};return s;
    });
    const alpha=profiles.forProfile('alpha'),durable=memory.forProfile('alpha'),before=await durable.read();
    const spy=vi.spyOn(durable,'transact').mockImplementationOnce(async(_id,action)=>{action(structuredClone(before));throw Error('commit failed');});
    await expect(alpha.transact(null,s=>{delete s.buffs.chasewalk_strength;return s;})).rejects.toThrow('commit failed');spy.mockRestore();
    expect((await alpha.read()).buffs.chasewalk_strength.effects.str).toBe(16);
    await profiles.endSession('alpha');
    expect((await alpha.read()).buffs.chasewalk_strength).toBeUndefined();expect((await alpha.read()).buffs.st_chasewalk).toBeDefined();
    expect((await profiles.forProfile('beta').read()).buffs.chasewalk_strength.effects.str).toBe(4);
    expect((await durable.read()).buffs.chasewalk_strength).toBeUndefined();
  });
});
