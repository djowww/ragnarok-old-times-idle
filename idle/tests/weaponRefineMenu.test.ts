import {describe,it,expect} from 'vitest';
import {advanceState,applyCommand} from '../engine/index';
import {parseCommandRequest} from '../server/validation';
import {setupRefine,openRefine,answerRefine} from './weaponRefine-fixture';
import type {GameCommand} from '../shared/types';
describe('paid durable weapon-refine menu',()=>{
 it('pays five SP at activation, captures learned10 despite use preference1',()=>{
  const {s,c}=setupRefine();s.skillUseLevels={ws_weaponrefine:1};const before=structuredClone(s);
  const next=openRefine(s,c);expect(next.sp).toBe(45);expect(next.zeny).toBe(s.zeny);
  expect(next.weaponRefineMenu?.learnedLimit).toBe(10);expect(next.weaponRefineMenu?.offeredWeapons.map(x=>x.uid)).toEqual(['weapon']);
  expect(next.rngState).toBe(s.rngState);expect(next.inventory).toEqual(s.inventory);expect(s).toEqual(before);
 });
 it('charges empty opening and returns a persistent empty result',()=>{
  const {s,c}=setupRefine();s.inventory=s.inventory.filter(x=>x.uid!=='weapon');
  const n=openRefine(s,c);expect(n.sp).toBe(45);expect(n.weaponRefineMenu).toBeUndefined();expect(n.weaponRefineResult?.outcome).toBe('empty');
 });
 it('keeps menu reopening free and unchanged',()=>{
  const {s,c}=setupRefine();const n=openRefine(s,c);const again=openRefine(n,c);
  expect(again.sp).toBe(45);expect(again.weaponRefineMenu).toEqual(n.weaponRefineMenu);expect(again.rngState).toBe(n.rngState);
 });
 it('uses existing SP modifiers instead of a parallel flat debit',()=>{
  const {s,c}=setupRefine();c.items[2301].effects={spCostReductionPct:50};s.inventory.push({uid:'armor',itemId:2301,quantity:1,cards:[],refine:0,favorite:false,identified:true});s.equipment.armor='armor';
  expect(openRefine(s,c).sp).toBe(48);
 });
 it('preserves a valid paid menu through JSON reload and elapsed time',()=>{
  const {s,c}=setupRefine();const n=openRefine(s,c);const loaded=advanceState(JSON.parse(JSON.stringify(n)),c,0);
  expect(loaded.weaponRefineMenu).toEqual(n.weaponRefineMenu);expect(loaded.sp).toBe(45);
 });
 it.each(['novice','hunter'])('rejects illegal activation for %s even with stale learned skill',job=>{
  const {s,c}=setupRefine();s.job=job;expect(()=>openRefine(s,c)).toThrow();expect(s.sp).toBe(50);
 });
 it('does not accept only a copied skill or insufficient SP',()=>{
  const {s,c}=setupRefine();s.learnedSkills={};s.copiedSkill={skillId:'ws_weaponrefine',level:10};expect(()=>openRefine(s,c)).toThrow();
  s.learnedSkills.ws_weaponrefine=10;s.sp=4;expect(()=>openRefine(s,c)).toThrow();expect(s.sp).toBe(4);
 });
 it('cancels once without refund, a new opening has a new ID and SP cost',()=>{
  const {s,c}=setupRefine();const n=openRefine(s,c),id=n.weaponRefineMenu!.id;
  const end=applyCommand(n,c,{type:'cancelWeaponRefine',menuId:id},0);expect(end.weaponRefineMenu).toBeUndefined();expect(end.sp).toBe(45);expect(end.weaponRefineResult?.outcome).toBe('cancelled');
  const again=applyCommand(end,c,{type:'cancelWeaponRefine',menuId:id},0);expect(again.sp).toBe(45);
  const fresh=openRefine(end,c);expect(fresh.sp).toBe(40);expect(fresh.weaponRefineMenu!.id).not.toBe(id);
 });
 it('does not let a wrong menu ID close a valid paid menu',()=>{
  const {s,c}=setupRefine();const n=openRefine(s,c),before=structuredClone(n);
  expect(()=>applyCommand(n,c,{type:'cancelWeaponRefine',menuId:'wrong'},0)).toThrow();expect(n).toEqual(before);
 });
 it('clears paid menu on death, warp, incompatible class and catalog revision without refund',()=>{
  const {s,c}=setupRefine();const n=openRefine(s,c);
  for(const mutate of [(v:typeof n)=>{v.hp=0},(v:typeof n)=>{v.totals.deaths++},(v:typeof n)=>{v.job='novice'},(v:typeof n)=>{v.status='hunting';v.areaId='prontera'}]){
   const v=structuredClone(n);mutate(v);const out=advanceState(v,c,0);expect(out.weaponRefineMenu).toBeUndefined();expect(out.sp).toBe(45);expect(out.weaponRefineResult?.outcome).toBe('rejected');
  }
  const changed={...c,version:'changed'};expect(advanceState(n,changed,0).weaponRefineMenu).toBeUndefined();
 });
 it('invalidates catalog provenance changes even when package version stays constant',()=>{
  const {s,c}=setupRefine();const n=openRefine(s,c),changed=structuredClone(c);changed.source.hash='changed-native-data';
  expect(changed.version).toBe(c.version);
  const next=advanceState(n,changed,0);expect(next.weaponRefineMenu).toBeUndefined();expect(next.weaponRefineResult?.outcome).toBe('rejected');expect(next.sp).toBe(45);
 });
 it.each(['field','recovery'] as const)('refuses activation while seated for %s rest without paying',restMode=>{
  const {s,c}=setupRefine();s.status='resting';s.restMode=restMode;s.restUntil=30000;s.areaId=restMode==='field'?'prontera':null;
  const before=structuredClone(s);expect(()=>openRefine(s,c)).toThrow();expect(s).toEqual(before);
 });
 it('does not repeat the seated activation gate for an already paid menu response',()=>{
  const {s,c}=setupRefine();const n=openRefine(s,c);n.status='resting';n.restMode='recovery';n.restUntil=30000;n.sp=0;
  expect(answerRefine(n,c).weaponRefineResult?.outcome).toBe('success');
 });
 it('normalizes malformed legacy menu without throwing or granting authorization',()=>{
  const {s,c}=setupRefine();expect(advanceState(s,c,0).weaponRefineMenu).toBeUndefined();
  (s as any).weaponRefineMenu={id:'bad',offeredWeapons:[null]};
  expect(()=>advanceState(s,c,0)).not.toThrow();expect(advanceState(s,c,0).weaponRefineMenu).toBeUndefined();
 });
 it('validates exact response/cancel schemas and denies client-controlled chance or price',()=>{
  for(const command of [{type:'weaponRefine',menuId:'wr-1',uid:'weapon'},{type:'cancelWeaponRefine',menuId:'wr-1'}] as GameCommand[])
   expect(parseCommandRequest({requestId:'refine-1',command}).command).toEqual(command);
  for(const extra of [{chance:100},{price:0},{learnedLimit:10},{itemId:1201},{quantity:2}])
   expect(()=>parseCommandRequest({requestId:'refine-bad',command:{type:'weaponRefine',menuId:'wr-1',uid:'weapon',...extra}})).toThrow();
 });
});
