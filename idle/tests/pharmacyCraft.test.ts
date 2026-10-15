import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index.js';
import { craftPharmacy, pharmacyCraftPreview, pharmacyBaseChance, pharmacyRoll } from '../engine/pharmacyCraft.js';
import { pharmacyRecipes } from '../shared/pharmacyRecipes.js';
import { parseCommandRequest } from '../server/validation.js';
import { itemPurchasePrice } from '../shared/prices.js';
import { GameRepository } from '../server/repository.js';
import type { Pool } from 'mysql2/promise';
import { fixture } from './engine-fixture.js';
import type { GameState } from '../shared/types.js';

function setup(itemId=7135, quantity=2) {
  const c=fixture();
  c.classes.alchemist={...c.classes.mage,id:'alchemist',tier:2,skills:['am_pharmacy','am_learningpotion']};
  c.classes.creator={...c.classes.alchemist,id:'creator',trans:true};
  c.skills.am_pharmacy={id:'am_pharmacy',sourceName:'AM_PHARMACY',name:'Preparar Pocao',description:'',kind:'buff',maxLevel:10,
    spCost:Array(10).fill(5),power:[0],cooldownMs:0,implementation:'supported',manualUse:'pharmacyCraft',
    itemCostByLevel:Array.from({length:10},()=>[{itemId:7134,quantity:1}])};
  c.skills.am_learningpotion={...c.skills.am_pharmacy,id:'am_learningpotion',sourceName:'AM_LEARNINGPOTION',kind:'passive',manualUse:undefined};
  const s=createInitialState(c,0);s.job='alchemist';s.jobLevel=10;s.hp=100;s.sp=100;s.stats={str:1,agi:1,vit:1,int:5,dex:20,luk:30};
  s.learnedSkills={am_pharmacy:3,am_learningpotion:5};s.inventory=[];s.equipment={};s.rngState=1;
  const recipe=pharmacyRecipes().find(r=>r.outputItemId===itemId)!;
  for(const id of new Set([itemId,7134,recipe.guideItemId,...recipe.ingredients.map(i=>i.itemId)]))
    c.items[id]={...c.items[909],id,type:'material',weight:1,shop:false};
  for(const [id,n] of [[7134,quantity],[recipe.guideItemId,1],...recipe.ingredients.map(i=>[i.itemId,i.quantity*quantity])])
    s.inventory.push({uid:'item-'+id,itemId:id,quantity:n,refine:0,cards:[],favorite:false});
  return {s,c};
}
const count=(s:GameState,id:number)=>s.inventory.filter(e=>e.itemId===id).reduce((n,e)=>n+e.quantity,0);
const advance=(seed:number,n:number)=>{for(let i=0;i<n;i++)seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};

describe('Pharmacy source recipes and independent chance oracle',()=>{
 it('contains exactly20native recipes; guides are separate and never consumed',()=>{
  expect(pharmacyRecipes().map(r=>r.outputItemId)).toEqual([501,503,504,505,545,546,547,7135,7136,7137,7138,7139,12118,12119,12120,12121,605,606,970,7142]);
  expect(pharmacyRecipes().find(r=>r.outputItemId===7135)).toMatchObject({guideItemId:7128,ingredients:[{itemId:970,quantity:1},{itemId:1059,quantity:1},{itemId:713,quantity:1}]});
  expect(pharmacyRecipes().find(r=>r.outputItemId===505)).toMatchObject({guideItemId:7144,ingredients:[{itemId:510,quantity:1},{itemId:911,quantity:1},{itemId:1093,quantity:1}]});
  const recipes=pharmacyRecipes();recipes[0].ingredients[0].quantity=99;expect(pharmacyRecipes()[0].ingredients[0].quantity).toBe(1);
 });
 it('uses learned skill levels, Job and integer effective INT/DEX/LUK',()=>{
  expect(pharmacyBaseChance(5,3,10,{int:5,dex:20,luk:30})).toBe(1870);
  expect(pharmacyBaseChance(5,3,10,{int:6,dex:20,luk:30})).toBe(1880);
 });
 it('retains minimum1, strict roll boundary and no upper cap',()=>{
  let draws=[99,0,777];expect(pharmacyRoll(710,7139,n=>draws.shift()!%n)).toEqual({chance:1,success:true});expect(draws).toEqual([]);
  draws=[99,1];expect(pharmacyRoll(710,7139,n=>draws.shift()!%n)).toEqual({chance:1,success:false});expect(draws).toEqual([]);
  draws=[99,9999,123];expect(pharmacyRoll(8650,501,n=>draws.shift()!%n)).toEqual({chance:11650,success:true});expect(draws).toEqual([]);
 });
 it('repeats the exact draw order on failure then success',()=>{
  const draws=[99,9999,0,0,1234],mods:number[]=[];const draw=(n:number)=>{mods.push(n);return draws.shift()!%n;};
  expect(pharmacyRoll(1870,7135,draw)).toEqual({chance:2870,success:false});
  expect(pharmacyRoll(1870,7135,draw)).toEqual({chance:1880,success:true});
  expect(mods).toEqual([100,10000,100,10000,10000]);expect(draws).toEqual([]);
 });
 it('has no adjustment draw for BluePotion/slimRed/Embryo/resistance',()=>{
  for(const item of [505,545,605,606,7142,12118,12119,12120,12121]){
   const mods:number[]=[];pharmacyRoll(10000,item,n=>{mods.push(n);return 0;});expect(mods).toEqual([10000,10000]);
  }
 });
});
describe('manual authoritative Pharmacy production',()=>{
 it('has a pure preview with one bowl and one5SP payment per attempt',()=>{
  const {s,c}=setup();const before=structuredClone(s);const p=pharmacyCraftPreview(s,c,7135,2);
  expect(p).toMatchObject({available:true,spPerAttempt:5,spTotal:10,guide:{itemId:7128,owned:1}});
  expect(p.ingredients).toContainEqual({itemId:7134,quantity:2,owned:2,missing:0});expect(s).toEqual(before);
 });
 it('consumes two recipes/bowls/SP on failed attempts but keeps guides/favorite leftovers',()=>{
  const {s,c}=setup();s.rngState=1;const totals=structuredClone(s.totals);
  const expectedRng=advance(1,5); // Source modulo rolls5467(fail),565(success),then the inner draw.
  craftPharmacy(s,c,7135,2);expect(s.sp).toBe(90);expect(count(s,7134)).toBe(0);expect(count(s,7128)).toBe(1);
  expect(count(s,970)).toBe(0);expect(count(s,7135)).toBe(1);expect(s.rngState).toBe(expectedRng);
  expect(s.events.at(-1)).toMatchObject({kind:'craft',itemId:7135,quantity:1,attempts:2,failures:1});expect(s.totals).toEqual(totals);
 });
 it('uses effective reduction for each activation and learned levels despite lower use-level',()=>{
  const {s,c}=setup(501,2);s.learnedSkills.am_pharmacy=10;s.learnedSkills.am_learningpotion=10;s.jobLevel=70;s.stats.int=150;s.stats.dex=150;s.stats.luk=150;
  c.items[2301].effects.spCostReductionPct=50;s.inventory.push({uid:'armor',itemId:2301,quantity:1,refine:0,cards:[],favorite:false,identified:true});s.equipment.armor='armor';
  s.skillUseLevels={am_pharmacy:1};s.sp=4;const p=pharmacyCraftPreview(s,c,501,2);expect(p.spPerAttempt).toBe(2);expect(p.spTotal).toBe(4);expect(p.chanceMin).toBeGreaterThan(10000);
  craftPharmacy(s,c,501,2);expect(s.sp).toBe(0);expect(count(s,501)).toBe(2);expect(s.rngState).toBe(advance(1,6));
 });
 it('dispatches using the cloned command path and preserves its input',()=>{
  const {s,c}=setup();s.sp=50;const before=structuredClone(s);const next=applyCommand(s,c,{type:'craftPharmacy',itemId:7135,quantity:2},0);
  expect(next.sp).toBe(40);expect(s).toEqual(before);
 });
 it.each([0,-1,1.5,1001,Infinity,NaN])('rejects invalid quantity%s atomically',quantity=>{
  const {s,c}=setup();const before=structuredClone(s);expect(()=>craftPharmacy(s,c,7135,quantity)).toThrow();expect(s).toEqual(before);
 });
 it.each(['item','unlearned','wrong-class','unsupported','level','field','dead','sp','bowl','guide','material','silence','support-cast','weight','capacity'])('rejects%s before any cost or RNG',why=>{
  const {s,c}=setup();let output=7135;
  if(why==='item')output=502;if(why==='unlearned')delete s.learnedSkills.am_pharmacy;if(why==='wrong-class')s.job='mage';
  if(why==='unsupported')c.skills.am_pharmacy.implementation='unsupported';if(why==='level')s.learnedSkills.am_pharmacy=11;
  if(why==='field')s.status='hunting';if(why==='dead')s.hp=0;if(why==='sp')s.sp=9;
  if(why==='bowl')s.inventory=s.inventory.filter(i=>i.itemId!==7134);if(why==='guide')s.inventory=s.inventory.filter(i=>i.itemId!==7128);
  if(why==='material')s.inventory=s.inventory.filter(i=>i.itemId!==1059);
  if(why==='silence')s.playerStatuses={SC_SILENCE:{startsAt:0,expiresAt:1000,level:1}};
  if(why==='support-cast')s.supportCast={skillId:'other',level:1,startedAt:0,endsAt:1000,actionId:'pending'};
  if(why==='weight')s.inventory[0].quantity=2000;if(why==='capacity')c.items[output].weight=3000;
  const before=structuredClone(s);expect(pharmacyCraftPreview(s,c,output,2).available).toBe(false);expect(()=>craftPharmacy(s,c,output,2)).toThrow();expect(s).toEqual(before);
 });
 it('prevents worst-case intermediate90% overflow even when final inputs could fit',()=>{
  const {s,c}=setup(501,3);c.items[501].weight=1000;expect(pharmacyCraftPreview(s,c,501,3).available).toBe(false);
 });
 it.each([501,503,504,505,545,546,547,7135,7136,7137,7138,7139,12118,12119,12120,12121,605,606,970,7142])('accepts native recipe%i and Creator inheritance',id=>{
  const {s,c}=setup(id,1);s.job='creator';expect(pharmacyCraftPreview(s,c,id,1).available).toBe(true);
 });
});

describe('Pharmacy boundary and persistent receipt',()=>{
 it('validates the recipe allowlist and strict integer quantity',()=>{
  for(const id of pharmacyRecipes().map(r=>r.outputItemId)) expect(parseCommandRequest({requestId:'pharmacy-test',command:{type:'craftPharmacy',itemId:id,quantity:1}}).command.type).toBe('craftPharmacy');
  for(const id of [502,523,678,12114,0]) expect(()=>parseCommandRequest({requestId:'pharmacy-test',command:{type:'craftPharmacy',itemId:id,quantity:1}})).toThrow();
  for(const q of [0,-1,1.1,1001,NaN,Infinity,'2'])expect(()=>parseCommandRequest({requestId:'pharmacy-test',command:{type:'craftPharmacy',itemId:501,quantity:q}})).toThrow();
 });
 it('revalidates materials after a preview and blocks action lock',()=>{
  const {s,c}=setup();expect(pharmacyCraftPreview(s,c,7135,2).available).toBe(true);
  s.inventory=s.inventory.filter(i=>i.itemId!==1059);const before=structuredClone(s);expect(()=>craftPharmacy(s,c,7135,2)).toThrow();expect(s).toEqual(before);
  const other=setup();other.s.playerCanActAt=1;expect(pharmacyCraftPreview(other.s,other.c,7135,2,0).reason?.code).toBe('SKILL_STATUS_BLOCKED');
 });
 it('replays a committed crafting failure/success without charging or rolling again',async()=>{
  const {s,c}=setup();s.sp=50;let saved=JSON.stringify(s);const receipts=new Map<string,string>();
  const query=async(sql:string,params:unknown[])=>{
   if(sql.startsWith('SELECT id'))return [[{id:s.id}],[]];
   if(sql.startsWith('SELECT state_json'))return [[{state_json:saved}],[]];
   if(sql.startsWith('SELECT fingerprint'))return [receipts.has(String(params[1]))?[{fingerprint:receipts.get(String(params[1]))}]:[],[]];
   throw new Error(sql);
  };
  const execute=async(sql:string,params:unknown[])=>{
   if(sql.startsWith('UPDATE idle_profiles'))saved=String(params[0]);
   else if(sql.startsWith('INSERT INTO idle_commands'))receipts.set(String(params[1]),String(params[2]));else throw new Error(sql);
   return [{affectedRows:1},[]];
  };
  let checkpoint=saved;const connection={query,execute,beginTransaction:async()=>{checkpoint=saved;},commit:async()=>{},rollback:async()=>{saved=checkpoint;},release:()=>{}};
  const pool={query,execute,getConnection:async()=>connection} as unknown as Pool;
  const repo=new GameRepository(pool,()=>{throw new Error('No reset');},s.id), command={type:'craftPharmacy',itemId:7135,quantity:2} as const;
  const action=(state:GameState)=>applyCommand(state,c,command,0);
  const first=await repo.transact('pharmacy-receipt-1',action,JSON.stringify(command));
  expect(first.sp).toBe(40);expect(first.revision).toBe(1);expect(first.events.at(-1)).toMatchObject({attempts:2,failures:1,quantity:1});
  expect(await repo.transact('pharmacy-receipt-1',action,JSON.stringify(command))).toEqual(first);
  expect(await new GameRepository(pool,()=>{throw new Error('No reset');},s.id).read()).toEqual(first);
  await expect(repo.transact('pharmacy-receipt-1',action,'other')).rejects.toMatchObject({code:'REQUEST_REUSED'});
  expect(await repo.read()).toEqual(first);
 });
 it('keeps fixed NPC prices independent of databaseBuy and Merchant discount',()=>{
  const {s,c}=setup();c.skills.discount={...c.skills.am_learningpotion,id:'discount',sourceName:'MC_DISCOUNT',kind:'passive'};
  c.classes.alchemist.skills.push('discount');s.learnedSkills.discount=10;
  const item={...c.items[7134],buyPrice:100,sellPrice:50,shopPrice:8,shopDiscount:false};
  expect(itemPurchasePrice(s,c,item)).toBe(8);
  expect(itemPurchasePrice(s,c,{...item,shopPrice:3,shopDiscount:undefined})).toBe(2);
 });
});
