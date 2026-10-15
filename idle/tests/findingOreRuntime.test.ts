import {afterEach,describe,expect,it,vi} from 'vitest';
import {advanceState,createInitialState} from '../engine/index';
import {findingOreItem} from '../engine/findingOre';
import {beginBattle} from '../engine/encounters';
import {fixture} from './engine-fixture';
import * as tools from '../engine/state';
import catalogJson from '../content/catalog.json';
import type {Catalog,GameState} from '../shared/types';
function setup(learned=true){
 const c=fixture();c.skills.bs_findingore={...structuredClone(catalogJson.skills.bs_findingore),implementation:'supported'} as any;c.classes.novice.skills.push('bs_findingore');c.items[1002]={...c.items[909],id:1002,type:'loot',name:'Iron Ore'};
 c.monsters[1002].drops=[];c.monsters[1002].hp=1;c.monsters[1002].attack=[1,1];c.monsters[1002].baseExp=0;c.monsters[1002].jobExp=0;
 const s=createInitialState(c,0);s.rotation=[];s.learnedSkills=learned?{bs_findingore:1}:{};s.status='challenge';s.autoPotion={hpThreshold:0,spThreshold:0};beginBattle(s,c,1002,0,'mastering');const enemy=s.battle!.enemies![0];Object.assign(enemy,{startedAt:0,arrivedAt:0,enemyNextAttackAt:999999,position:{x:.48,y:.65},approachFrom:{x:.48,y:.65}});s.battle!.playerNextAttackAt=0;s.battle!.playerActionReadyAt=0;
 const spy=vi.spyOn(tools,'random').mockImplementation(state=>{state.rngState=0;return 0;});return{s,c,spy};
}
afterEach(()=>vi.restoreAllMocks());
describe('Finding Ore actual kill integration',()=>{
 it('rolls the native chain on the actual player-owned kill and leaves an ordinary ground drop',()=>{
  const {s,c}=setup();const next=advanceState(s,c,1000);expect(next.totals.kills).toBe(1);expect(next.events.filter(e=>e.kind==='loot'&&e.itemId===1002)).toHaveLength(1);expect(next.inventory.filter(e=>e.itemId===1002).reduce((n,e)=>n+e.quantity,0)).toBe(1);
 });
 it('uses exactly two extra RNG draws only for an eligible learned passive',()=>{
  const without=setup(false);advanceState(without.s,without.c,1000);const base=without.spy.mock.calls.length;vi.restoreAllMocks();const withOre=setup(true);advanceState(withOre.s,withOre.c,1000);expect(withOre.spy.mock.calls.length).toBe(base+2);
 });
 it('does not credit an unavailable passive or repeat a dead enemy proc after reconnect',()=>{
  const {s,c}=setup();c.skills.bs_findingore.implementation='unsupported';let next=advanceState(s,c,1000);expect(next.events.some(e=>e.kind==='loot'&&e.itemId===1002)).toBe(false);
  c.skills.bs_findingore.implementation='supported';next=advanceState(JSON.parse(JSON.stringify(next)),c,2000);expect(next.events.some(e=>e.kind==='loot'&&e.itemId===1002)).toBe(false);
 });
 it('rejects a non-PC owner and dead PC before any random draw',()=>{
  const {s,c,spy}=setup();spy.mockClear();expect(findingOreItem(s,c,false)).toBeUndefined();s.hp=0;expect(findingOreItem(s,c,true)).toBeUndefined();expect(spy).not.toHaveBeenCalled();
 });
 it('retains an overweight ore exactly once with its original enemy identity',()=>{
  const {s,c}=setup();c.items[1002].weight=999999;const id=s.battle!.enemies![0].id;
  const next=advanceState(s,c,1000);expect(next.totals.kills).toBe(1);expect(next.pendingLoot?.filter(e=>e.entry.itemId===1002)).toMatchObject([{enemyId:id,monsterId:1002,source:'skill',entry:{quantity:1}}]);
  expect(next.totals.items[1002]).toBe(1);const resumed=advanceState(JSON.parse(JSON.stringify(next)),c,2000);expect(resumed.pendingLoot?.filter(e=>e.entry.itemId===1002)).toHaveLength(1);expect(resumed.totals.items[1002]).toBe(1);
 });

});
