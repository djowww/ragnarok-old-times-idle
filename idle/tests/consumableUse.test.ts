import {consumeItem} from '../engine/consumables';
import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState, advanceState, getSnapshot } from '../engine/index.js';
import { derivedStats } from '../engine/stats.js';
import { parseCommandRequest } from '../server/validation.js';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameCommand, GameState } from '../shared/types.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Inventory from '../web/panels/Inventory.js';
function setup(id=545) {
 const c=structuredClone(catalogJson) as unknown as Catalog;
 const s=createInitialState(c,0);s.inventory=[{uid:'drink',itemId:id,quantity:3,refine:0,cards:[],favorite:true}];s.equipment={};s.hp=1;s.sp=0;s.autoPotion={hpThreshold:0,spThreshold:0};
 return {s,c};
}
const drink=(s:GameState,c:Catalog,at=0)=>applyCommand(s,c,{type:'consumeItem',uid:'drink'} as unknown as GameCommand,at);
describe('explicit authoritative consumable use',()=>{
 it.each([[545,55],[546,205],[547,365]])('enables Slim%s using the documented native midpoint%s', (id,hp)=>{
  const {c}=setup(id);expect(c.items[id]).toMatchObject({type:'consumable',healHP:hp,healSP:0});expect(c.items[id].unsupportedEffect).not.toBe(true);
 });
 it('consumes exactly one owned favorite Slim, heals, shares potion timer and leaves input unchanged',()=>{
  const {s,c}=setup();s.baseLevel=10;const before=structuredClone(s);const next=drink(s,c);expect(next.hp).toBe(57);expect(next.inventory[0].quantity).toBe(2);expect(next.potionReadyAt).toBe(2000);expect(next.totals.potions).toBe(1);expect(next.events.at(-1)).toMatchObject({kind:'potion',itemId:545,quantity:1});expect(s).toEqual(before);
 });
 it('uses VIT/Recovery/LearningPotion recovery in the same path as ordinary potions',()=>{
  const {s,c}=setup();s.job='alchemist';s.baseLevel=99;s.stats.vit=10;s.learnedSkills.am_learningpotion=10;s.hp=1;
  const next=drink(s,c);expect(next.hp).toBe(1+Math.floor(55*(100+20+50)/100));
 });
 it('also permits supported ordinary HP/SP potions and clamps to real maxima',()=>{
  const {s,c}=setup(505);const next=drink(s,c);expect(next.sp).toBe(derivedStats(next,c).maxSp);expect(next.inventory[0].quantity).toBe(2);
 });
 it.each([7142,7135,909,1201])('rejects material/equipment%s without consuming or changing state',id=>{
  const {s,c}=setup(id);const before=structuredClone(s);expect(()=>drink(s,c)).toThrow();expect(s).toEqual(before);
 });
 it('rejects a UID outside this profile and enforces shared cooldown before charging',()=>{
  const {s,c}=setup();s.inventory[0].uid='someone-else';expect(()=>drink(s,c)).toThrow();s.inventory[0].uid='drink';s.potionReadyAt=1;expect(()=>drink(s,c)).toThrow();expect(s.inventory[0].quantity).toBe(3);
 });
 it.each(['dead','berserk','trickdead'])('blocks item use under%s without charging',mode=>{
  const {s,c}=setup();if(mode==='dead')s.hp=0;else s.buffs[mode==='berserk'?'lk_berserk':'nv_trickdead']={expiresAt:10000,effects:{}};
  expect(()=>drink(s,c)).toThrow();expect(s.inventory[0].quantity).toBe(3);
 });
 it('accepts the strict receipt envelope and rejects quantity/effects/forged extra fields',()=>{
  expect(parseCommandRequest({requestId:'consume-request-1',command:{type:'consumeItem',uid:'drink'}}).command).toEqual({type:'consumeItem',uid:'drink'});
  for(const extra of [{quantity:2},{effects:{atk:999}},{itemId:545}])expect(()=>parseCommandRequest({requestId:'consume-request-1',command:{type:'consumeItem',uid:'drink',...extra}})).toThrow();
 });
 it('offers the real use action from the inventory with cooldown feedback',()=>{
  const {s,c}=setup();const html=renderToStaticMarkup(createElement(Inventory,{catalog:c,snapshot:getSnapshot(s,c,0),busy:false,command:async()=>true}));expect(html).toContain('Usar item');
  s.potionReadyAt=1500;const cooldown=renderToStaticMarkup(createElement(Inventory,{catalog:c,snapshot:getSnapshot(s,c,0),busy:false,command:async()=>true}));expect(cooldown).toContain('Aguarde');
 });
});

describe('source status potions',()=>{
 it('Anodyne grants source Endure1 without SP/skill ownership/canact changes',()=>{
  const {s,c}=setup(605);s.playerCanActAt=9999;const d=derivedStats(s,c);const next=drink(s,c);
  expect(next.sp).toBe(0);expect(next.playerCanActAt).toBe(9999);expect(next.combatEffects?.endure).toEqual({level:1,charges:7,expiresAt:10000});expect(next.skillReadyAt.sm_endure).toBe(10000);expect(derivedStats(next,c).hardMdef).toBe((d.hardMdef??0)+1);
 });
 it('Anodyne keeps a higher Endure, pays item and advances one status RNG draw',()=>{
  const {s,c}=setup(605);s.combatEffects={endure:{level:10,charges:3,expiresAt:37000}};s.buffs.sm_endure={expiresAt:37000,effects:{mdef:10}};s.rngState=1;
  const next=drink(s,c);expect(next.combatEffects?.endure).toEqual(s.combatEffects.endure);expect(next.buffs.sm_endure).toEqual(s.buffs.sm_endure);expect(next.rngState).toBe(1015568748);expect(next.inventory[0].quantity).toBe(2);
 });
 it.each([605,606])('blocks itemskill%s while casting/sitting but not because of silence',id=>{
  const {s,c}=setup(id);s.supportCast={skillId:'firstaid',level:1,startedAt:0,endsAt:1000,actionId:'cast'};expect(()=>drink(s,c)).toThrow();delete s.supportCast;s.status='resting';s.restMode='field';expect(()=>drink(s,c)).toThrow();s.status='town';s.playerStatuses={SC_SILENCE:{startsAt:0,expiresAt:10000,level:1}};expect(drink(s,c).inventory[0].quantity).toBe(2);
 });
 it('shares the native Endure cooldown with learned casts',()=>{
  const {s,c}=setup(605);s.skillReadyAt.sm_endure=5000;expect(()=>drink(s,c)).toThrow();expect(s.inventory[0].quantity).toBe(3);
 });
 it('Aloevera adds5percent ATK and reduces only VIT defense10percent for30s',()=>{
  const {s,c}=setup(606);s.stats.vit=50;const before=derivedStats(s,c);const next=drink(s,c),after=derivedStats(next,c);
  expect(after.sourceAttackPercent).toBe(105);expect(after.softDef).toBe(45);expect(after.def).toBe(before.def);expect(next.buffs['item:606']).toMatchObject({startsAt:0,expiresAt:30000});
  const later=structuredClone(next);later.lastSimulatedAt=30000;expect(derivedStats(later,c).sourceAttackPercent).toBe(100);
 });
 it('AutoBerserk replacement discards manual Provoke so healing does not resurrect it',()=>{
  const {s,c}=setup(606);s.hp=derivedStats(s,c).maxHp;let next=drink(s,c);next.buffs.sm_autoberserk={expiresAt:999999,effects:{}};next.hp=1;
  // A healing item observes the source low-HP Provoke replacement before restoring HP.
  next.inventory=[{uid:'drink',itemId:504,quantity:1,refine:0,cards:[],favorite:false}];next.potionReadyAt=0;next=drink(next,c);
  expect(next.hp).toBeGreaterThan(derivedStats(next,c).maxHp/4);expect(next.buffs['item:606']).toBeUndefined();expect(derivedStats(next,c).sourceAttackPercent).toBe(100);
 });
 it.each([[12118,'fire','water'],[12119,'water','wind'],[12120,'earth','fire'],[12121,'wind','earth']])('gives potion%s correct strong%s and weak%s', (id,strong,weak)=>{
  const {s,c}=setup(id as number);const next=drink(s,c);const active=next.buffs[`item:${id}`];expect(active).toMatchObject({startsAt:0,expiresAt:1200000});
  const html=renderToStaticMarkup(createElement(Inventory,{catalog:c,snapshot:getSnapshot(next,c,0),busy:false,command:async()=>true}));
  const names:Record<string,string>={fire:'Fogo',water:'Água',wind:'Vento',earth:'Terra'};expect(html).toContain(`resistência a ${names[strong as string]} +20%`);expect(html).toContain(`a ${names[weak as string]} −15%`);
 });
});

describe('itemskill movement scene ownership regression',()=>{
 it.each(['town','challenge'] as const)('preserves saved hunt position while using Anodyne/Aloevera in%s',status=>{
  for(const id of [605,606]){
   const {s,c}=setup(id);s.status=status;s.areaId='cached-hunt';s.fieldHero={areaId:'cached-hunt',from:{x:.7,y:.8},position:{x:.9,y:.9},startedAt:0,arrivedAt:1000,routeIndex:4,movementRoute:[{x:.7,y:.8},{x:.9,y:.9}]};
   const before=structuredClone(s.fieldHero);consumeItem(s,c,'drink',500);expect(s.fieldHero).toEqual(before);expect(s.inventory[0].quantity).toBe(2);
  }
 });
 it('stops only a live hunt at its interpolated point without resetting action clocks',()=>{
  const {s,c}=setup(605);s.status='hunting';s.areaId='cached-hunt';s.playerCanActAt=9999;s.fieldHero={areaId:'cached-hunt',from:{x:.6,y:.8},position:{x:.8,y:.9},startedAt:0,arrivedAt:1000,routeIndex:4};
  consumeItem(s,c,'drink',500);expect(s.fieldHero.position.x).toBeCloseTo(.7);expect(s.fieldHero.position.y).toBeCloseTo(.85);expect(s.fieldHero.arrivedAt).toBe(500);expect(s.fieldHero.startedAt).toBe(500);expect(s.playerCanActAt).toBe(9999);
 });
});
