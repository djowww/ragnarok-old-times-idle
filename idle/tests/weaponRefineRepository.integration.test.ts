import {afterAll,beforeAll,describe,it,expect} from 'vitest';
import {createPool,type Pool} from 'mysql2/promise';
import {randomUUID} from 'node:crypto';
import {GameRepository,migrate} from '../server/repository';
import {SessionStateRepository} from '../server/sessionState';
import {advanceState,applyCommand} from '../engine/index';
import {setupRefine,openRefine,answerRefine} from './weaponRefine-fixture';
describe.skipIf(process.env.IDLE_DB_TEST!=='1')('paid weapon-refine MariaDB transactions',()=>{
 let pool:Pool;const ids:string[]=[];
 beforeAll(async()=>{pool=createPool({host:process.env.DB_HOST??'database',port:Number(process.env.DB_PORT??3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:6,charset:'utf8mb4'});await migrate(pool);});
 afterAll(async()=>{for(const id of ids){await pool.execute('DELETE FROM idle_commands WHERE profile_id = ?',[id]);await pool.execute('DELETE FROM idle_profiles WHERE id = ?',[id]);}await pool.end();});
 function setup(){
  const {s,c}=setupRefine(),id='test-weapon-refine-'+randomUUID();ids.push(id);
  return {c,seedRng:s.rngState,repo:new GameRepository(pool,()=>structuredClone(s),id)};
 }
 it('pays activation only once under concurrent identical receipt retries',async()=>{
  const {c,repo,seedRng}=setup();
  await Promise.all(Array.from({length:5},()=>repo.transact('open',s=>openRefine(s,c),'use-weapon-refine')));
  const saved=await repo.read();expect(saved.sp).toBe(45);expect(saved.weaponRefineMenu).toBeDefined();expect(saved.rngState).toBe(seedRng);
  const restored=new GameRepository(pool,()=>{throw new Error('Existing paid menu must be restored');},repo.profileId);
  expect((await restored.read()).weaponRefineMenu).toEqual(saved.weaponRefineMenu);
  await expect(repo.transact('open',s=>({...s,sp:0}),'different-intention')).rejects.toMatchObject({code:'REQUEST_REUSED'});
  expect((await repo.read()).sp).toBe(45);
 });
 it('allows one effect for two response IDs and retries after an uncertain client reply',async()=>{
  const {c,repo}=setup();const menu=await repo.transact('open',s=>openRefine(s,c));
  const cmd={type:'weaponRefine' as const,menuId:menu.weaponRefineMenu!.id,uid:'weapon'};
  await Promise.all(['answer-a','answer-b','answer-a'].map(id=>repo.transact(id,s=>applyCommand(s,c,cmd,0),'answer')));
  const n=await repo.read();expect(n.sp).toBe(45);expect(n.inventory.find(x=>x.uid==='weapon')?.refine).toBe(1);expect(n.inventory.find(x=>x.itemId===1010)?.quantity).toBe(4);
  expect(n.weaponRefineMenu).toBeUndefined();expect(n.weaponRefineResult?.outcome).toBe('success');
  const before=structuredClone(n);await repo.transact('answer-a',s=>applyCommand(s,c,cmd,0),'answer');expect(await repo.read()).toEqual(before);
 });
 it('serializes cancel versus answer without charging twice or resurrecting a menu',async()=>{
  const {c,repo}=setup();const menu=await repo.transact('open',s=>openRefine(s,c)),id=menu.weaponRefineMenu!.id;
  await Promise.all([
   repo.transact('answer',s=>applyCommand(s,c,{type:'weaponRefine',menuId:id,uid:'weapon'},0)),
   repo.transact('cancel',s=>applyCommand(s,c,{type:'cancelWeaponRefine',menuId:id},0)),
  ]);
  const n=await repo.read();expect(n.weaponRefineMenu).toBeUndefined();expect(n.sp).toBe(45);
  expect(['success','cancelled']).toContain(n.weaponRefineResult?.outcome);
  const success=n.weaponRefineResult?.outcome==='success';
  expect(n.inventory.find(x=>x.itemId===1010)?.quantity).toBe(success?4:5);
  expect(n.inventory.find(x=>x.uid==='weapon')?.refine).toBe(success?1:0);
 });
 it('commits missing-ore rejection with closed menu instead of rolling it back',async()=>{
  const {c,repo}=setup();const menu=await repo.transact('open',s=>openRefine(s,c)),id=menu.weaponRefineMenu!.id;
  await repo.transact('remove-test-ore',s=>({...s,inventory:s.inventory.filter(x=>x.itemId!==1010)}));
  await expect(repo.transact('answer',s=>applyCommand(s,c,{type:'weaponRefine',menuId:id,uid:'weapon'},0))).resolves.toMatchObject({sp:45,weaponRefineResult:{outcome:'rejected'}});
  const n=await repo.read();expect(n.weaponRefineMenu).toBeUndefined();expect(n.weaponRefineResult?.reasonCode).toBe('MATERIAL_REQUIRED');expect(n.rngState).toBe(menu.rngState);
  await repo.transact('second-answer',s=>applyCommand(s,c,{type:'weaponRefine',menuId:id,uid:'weapon'},0));
  expect((await repo.read()).sp).toBe(45);
 });
 it('commits a signature rejection and never selects another UID of the same item',async()=>{
  const {c,repo}=setup();const menu=await repo.transact('open',s=>openRefine(s,c)),id=menu.weaponRefineMenu!.id;
  await repo.transact('replace-test-weapon',s=>{s.inventory[0]={...s.inventory[0],uid:'different-weapon',cards:[4001]};return s;});
  const n=await repo.transact('answer',s=>applyCommand(s,c,{type:'weaponRefine',menuId:id,uid:'weapon'},0));
  expect(n.weaponRefineResult?.outcome).toBe('rejected');expect(n.weaponRefineMenu).toBeUndefined();expect(n.inventory[0].uid).toBe('different-weapon');expect(n.inventory[0].cards).toEqual([4001]);
  expect((await repo.read()).weaponRefineMenu).toBeUndefined();
 });
 it('reconnects and restarts through real session wrappers without another SP debit',async()=>{
  const {c,repo}=setup();const first=new SessionStateRepository(repo,c);
  const n=await first.transact('open',s=>openRefine(s,c));
  await first.endSession();const second=new SessionStateRepository(new GameRepository(pool,()=>{throw new Error('Unexpected reset');},repo.profileId),c);
  const restored=await second.openSession('new-connection',s=>advanceState(s,c,0));
  expect(restored.weaponRefineMenu).toEqual(n.weaponRefineMenu);expect(restored.sp).toBe(45);
  const finished=await second.transact('answer',s=>answerRefine(s,c));expect(finished.weaponRefineResult?.outcome).toBe('success');expect(finished.sp).toBe(45);
 });
 it('keeps distinct authenticated profile storage isolated despite identical item UIDs',async()=>{
  const a=setup(),b=setup();await a.repo.transact('open',s=>openRefine(s,a.c));await b.repo.transact('open',s=>openRefine(s,b.c));
  const before=await a.repo.read();await b.repo.transact('answer',s=>answerRefine(s,b.c));
  expect(await a.repo.read()).toEqual(before);expect((await b.repo.read()).inventory[0].refine).toBe(1);
 });
 it('persists invalidation produced during advance before a matching response',async()=>{
  const {c,repo}=setup();const menu=await repo.transact('open',s=>openRefine(s,c)),id=menu.weaponRefineMenu!.id;
  await repo.transact('defeat-test-state',s=>{s.totals.deaths++;return s;});
  const n=await repo.transact('answer',s=>applyCommand(s,c,{type:'weaponRefine',menuId:id,uid:'weapon'},0));
  expect(n.weaponRefineMenu).toBeUndefined();expect(n.weaponRefineResult?.outcome).toBe('rejected');
  expect((await repo.read()).weaponRefineResult?.reasonCode).toBe('MENU_INVALIDATED');expect(n.sp).toBe(45);
 });
});
