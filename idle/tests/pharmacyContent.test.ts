import { describe,expect,it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import { pharmacyRecipes } from '../shared/pharmacyRecipes.js';
import { applyCommand, createInitialState } from '../engine/index.js';
import { pharmacyCraftPreview } from '../engine/pharmacyCraft.js';
import { itemPurchasePrice } from '../shared/prices.js';
import type { Catalog } from '../shared/types.js';
const c=catalog as unknown as Catalog;
describe('pinned Pharmacy content and normal paid acquisition',()=>{
 it('exports a supported manual handler and Pharmacy recipes and source-pinned Deadly Poison',()=>{
  expect(c.skills.am_pharmacy).toMatchObject({implementation:'supported',manualUse:'pharmacyCraft'});
  expect(c.skills.asc_cdp).toMatchObject({implementation:'supported',sourceName:'ASC_CDP',manualUse:'pharmacyCraft',spCost:[50],afterCastDelayMs:[500]});
  const production=(manifest as unknown as {pharmacyCraft:{recipes:{outputItemId:number;ingredients:{itemId:number;quantity:number}[]}[]}}).pharmacyCraft;
  expect(production.recipes.map(r=>({outputItemId:r.outputItemId,guideItemId:r.ingredients.find(i=>i.quantity===0)!.itemId,ingredients:r.ingredients.filter(i=>i.quantity>0)})))
   .toEqual(pharmacyRecipes().filter(r=>r.skillSourceName!=='ASC_CDP').map(({category,skillSourceName,...recipe})=>recipe));
  expect((manifest as unknown as {deadlyPoisonCraft:{recipe:string;skillId:number;spPerAttempt:number;castTimeMs:number;afterCastDelayMs:number;soloCombatUse:string;effectiveSingleOutputChance:number;rngDrawsPerAttempt:number;failureReachableForQuantityOne:boolean;sourceFailureDamagePercentMaxHp:number}}).deadlyPoisonCraft).toMatchObject({recipe:'678,22,407,1,937,1,952,1,939,1,7033,1,972,1,657,1,713,1',skillId:407,spPerAttempt:50,castTimeMs:0,afterCastDelayMs:500,effectiveSingleOutputChance:10000,rngDrawsPerAttempt:1,failureReachableForQuantityOne:false,sourceFailureDamagePercentMaxHp:25,soloCombatUse:expect.stringContaining('ASC_EDP')});
 });
 it('keeps NPCscript fixed prices and normal trader prices separate',()=>{
  const s=createInitialState(c,0);s.job='alchemist';s.learnedSkills.mc_discount=10;
  for(const [id,price] of [[7134,8],[7144,100000],[7127,100000],[7128,100000],[7129,100000],[7130,100000],[7131,100000],[7132,100000],[7133,240000]]){
   expect(c.items[id]).toMatchObject({shop:true,shopPrice:price,shopDiscount:false});expect(itemPurchasePrice(s,c,c.items[id])).toBe(price);
  }
  expect(itemPurchasePrice(s,c,c.items[1092])).toBe(2);expect(itemPurchasePrice(s,c,c.items[1093])).toBe(7);
  expect(c.items[7434].shop).toBe(false);
 });
 it('buys a real manual and bowls with Discount10 then previews and crafts native potion',()=>{
  let s=createInitialState(c,0);s.job='alchemist';s.baseLevel=50;s.jobLevel=40;s.stats.str=30;s.zeny=200000;
  s.learnedSkills={mc_discount:10,am_learningpotion:5,am_pharmacy:3};s.inventory=[];s.equipment={};s.hp=100;s.sp=100;
  s=applyCommand(s,c,{type:'buy',itemId:7144,quantity:1},0);
  s=applyCommand(s,c,{type:'buy',itemId:7134,quantity:2},0);expect(s.zeny).toBe(99984);
  s=applyCommand(s,c,{type:'buy',itemId:1093,quantity:2},0);expect(s.zeny).toBe(99970);
  s.inventory.push({uid:'collected-herbs',itemId:507,quantity:2,refine:0,cards:[],favorite:false});
  expect(pharmacyCraftPreview(s,c,501,2).available).toBe(true);
  const before=s.sp;s=applyCommand(s,c,{type:'craftPharmacy',itemId:501,quantity:2},0);
  expect(s.sp).toBe(before-10);expect(s.inventory.find(i=>i.itemId===7144)?.quantity).toBe(1);
  expect(s.events.at(-1)).toMatchObject({attempts:2,itemId:501});
 });
 it('does not advertise unimplemented item effects or sell the quest-only elemental guide',()=>{
  expect(c.items[7142]).toMatchObject({type:'material',unsupportedEffect:true,effects:{}});
  for(const id of [545,546,547,605,606,12118,12119,12120,12121])expect(c.items[id].unsupportedEffect).not.toBe(true);
  expect(c.items[7434]).toMatchObject({shop:false});
 });
});
