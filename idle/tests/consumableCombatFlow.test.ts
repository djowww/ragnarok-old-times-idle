import {afterEach,describe,expect,it,vi} from 'vitest';
import {advanceState,applyCommand} from '../engine/index';
import {castSetup} from './cast-control-fixture';
import * as tools from '../engine/state';
import {itemElementResistance,itemBuffId} from '../shared/consumables';
import {classicIncomingSkillReduction} from '../engine/classic';
import {MemoryGameProfiles} from './portal-fixture';
import {SessionStateRepository} from '../server/sessionState';
import type {GameState,GameCommand} from '../shared/types';
import catalogJson from '../content/catalog.json';
function bolt(element='fire',ids:number[]=[]) {
 const {s,c,e}=castSetup();
 c.monsters[1175].stats.int=30;
 c.monsters[1175].npcStatusSkills=[{skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',element,hitCount:1,baseSp:17,level:1,rate:10000,castTimeMs:300,delayMs:30000,cancelable:true,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS',sourceRowIndex:9}];
 e.npcCombat={firstAttackDone:false,readyAt:{},cast:{skillId:19,sourceRowIndex:9,baseSp:17,level:1,targetActorId:s.id,startedAt:0,endsAt:300,areaId:s.areaId,actionId:'real-bolt',sourcePosition:{...e.position}}};
 e.enemyNextAttackAt=1000;s.rotation=[];
 for(const id of ids)s.buffs[itemBuffId(id)]={startsAt:0,expiresAt:1200000,effects:{}};
 return {s,c,e};
}
afterEach(()=>vi.restoreAllMocks());
describe('elemental potion damage and ownership',()=>{
 it.each([[12118,'fire',20],[12118,'water',-15],[12119,'water',20],[12119,'wind',-15],[12120,'earth',20],[12120,'fire',-15],[12121,'wind',20],[12121,'earth',-15]])('uses potion%s in real incoming%s damage with additive%s resistance', (id,element,resist)=>{
  vi.spyOn(tools,'random').mockReturnValue(0);const plain=bolt(element as string),protectedState=bolt(element as string,[id as number]);
  const hit=(x:ReturnType<typeof bolt>)=>advanceState(x.s,x.c,500).events.find(e=>e.kind==='damage'&&e.skillId==='mg_firebolt')!.amount!;
  const damage=hit(plain),actual=hit(protectedState);expect(actual).toBe(Math.floor(damage*(100-Number(resist))/100));
 });
 it('combines all four as5percent each, refreshes independently, expires at exact boundary and ignores neutral',()=>{
  const {s}=bolt('fire',[12118,12119,12120,12121]);for(const element of ['fire','water','earth','wind'])expect(itemElementResistance(s,element,0)).toBe(5);
  expect(itemElementResistance(s,'neutral',0)).toBe(0);expect(itemElementResistance(s,'fire',1200000)).toBe(0);
  s.buffs['item:12118'].expiresAt=2400000;expect(itemElementResistance(s,'fire',1200000)).toBe(20);expect(itemElementResistance(s,'water',1200000)).toBe(-15);
  expect(classicIncomingSkillReduction({BS_SKINTEMPER:5},'dragon','fire',20)).toBe(.6);expect(classicIncomingSkillReduction({},'normal','water',-15)).toBe(1.15);
 });
 it('reusing the same resistance refreshes instead of stacking and takes exactly one draw',()=>{
  const {s,c}=bolt();s.status='town';s.areaId=null;s.battle=null;c.items[12118]=structuredClone(catalogJson.items['12118']) as any;s.inventory=[{uid:'drink',itemId:12118,quantity:2,refine:0,cards:[],favorite:false}];s.rngState=1;
  let next=applyCommand(s,c,{type:'consumeItem',uid:'drink'},0);next=applyCommand(next,c,{type:'consumeItem',uid:'drink'},2000);
  expect(itemElementResistance(next,'fire',2000)).toBe(20);expect(next.buffs['item:12118'].expiresAt).toBe(1202000);expect(next.rngState).toBe(1586005467);
 });
 it('death removes elemental and manual Provoke statuses but preserves source Endure',()=>{
  vi.spyOn(tools,'random').mockReturnValue(0);const {s,c}=bolt('fire',[12118,12119]);s.hp=1;s.buffs['item:606']={startsAt:0,expiresAt:30000,effects:{}};
  s.buffs.sm_endure={startsAt:0,expiresAt:10000,effects:{mdef:1}};s.combatEffects={endure:{level:1,charges:7,expiresAt:10000}};
  const next=advanceState(s,c,500);expect(next.hp).toBe(0);expect(next.buffs['item:12118']).toBeUndefined();expect(next.buffs['item:12119']).toBeUndefined();expect(next.buffs['item:606']).toBeUndefined();expect(next.combatEffects?.endure).toMatchObject({level:1,expiresAt:10000});
 });
 it('preserves saved potion expiry across repository restart and idempotent receipt replay',async()=>{
  const {s,c}=bolt();c.items[12118]=structuredClone(catalogJson.items['12118']) as any;s.inventory=[{uid:'drink',itemId:12118,quantity:2,refine:0,cards:[],favorite:false}];const memory=new MemoryGameProfiles();memory.add(s);const durable=memory.forProfile(s.id);let repo=new SessionStateRepository(durable,c);
  await repo.transact('consume-resistance-1',state=>applyCommand(state,c,{type:'consumeItem',uid:'drink'},0),'consume:drink');
  const again=await repo.transact('consume-resistance-1',()=>{throw Error('must not charge twice')},'consume:drink');expect(again.inventory[0].quantity).toBe(1);expect(again.buffs['item:12118'].expiresAt).toBe(1200000);
  repo=new SessionStateRepository(durable,c);const resumed=await repo.read();expect(resumed.buffs['item:12118']).toEqual(again.buffs['item:12118']);
 });
});
