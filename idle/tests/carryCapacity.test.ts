import { describe, expect, it } from 'vitest';
import { fixture } from './engine-fixture.js';
import { createInitialState } from '../engine/index.js';
import { inventoryLoad } from '../engine/stats.js';
import { addItem } from '../engine/state.js';
import { grantReward } from '../engine/progression.js';
import { executeCommand } from '../engine/commands.js';
import type { GameState, InventoryEntry } from '../shared/types.js';

function setup() {
  const c = fixture(); c.classes.novice.baseWeight = 0;
  c.items[909].weight = .1; c.items[501].weight = .1; c.items[505].weight = .2;
  const s = createInitialState(c, 0); s.inventory = []; s.equipment = {};
  return { s, c };
}
const pending = (s: GameState) => (s as any).pendingLoot as Array<{entry:InventoryEntry; acquiredAt:number; source:string}> | undefined;
const reward = (itemId:number,quantity=1) => ({zeny:0,baseExp:0,jobExp:0,items:[{itemId,quantity}]});

describe('durable capacity-aware reward pickup', () => {
  it('calculates fractional weight in exact Hercules units', () => {
    const { s, c } = setup(); addItem(s,c,501,1); addItem(s,c,505,1);
    expect(inventoryLoad(s,c).weight).toBe(.3);
  });
  it('accepts a reward ending exactly at max weight and queues the next reward', () => {
    const { s, c } = setup(); addItem(s,c,909,298);
    grantReward(s,c,reward(505),100);
    expect(inventoryLoad(s,c).weight).toBe(30);
    grantReward(s,c,reward(501),101);
    expect(inventoryLoad(s,c).weight).toBe(30);
    expect(pending(s)).toHaveLength(1);
    expect(pending(s)![0]).toMatchObject({entry:{itemId:501,quantity:1},acquiredAt:101});
    expect(s.totals.items).toEqual({505:1,501:1});
  });
  it('creates each blocked equipment only once with its original UID and rarity rolls', () => {
    const { s, c } = setup(); c.items[1201].weight = 31;
    const control = structuredClone(s);
    addItem(control,c,1201,2,true);
    grantReward(s,c,reward(1201,2),100);
    expect(s.inventory).toEqual([]);
    expect(pending(s)?.map(row=>row.entry)).toEqual(control.inventory);
    expect(s.nextItemId).toBe(control.nextItemId);
    expect(s.rngState).toBe(control.rngState);
    expect(s.totals.items[1201]).toBe(2);
  });
  it('retains a blocked stack and every subsequent reward without growing inventory', () => {
    const { s, c } = setup(); addItem(s,c,909,300);
    grantReward(s,c,{...reward(501),items:[{itemId:501,quantity:20},{itemId:505,quantity:10},{itemId:1201,quantity:2}]},100);
    expect(inventoryLoad(s,c).weight).toBe(30);
    expect(pending(s)?.map(row=>[row.entry.itemId,row.entry.quantity])).toEqual([[501,20],[505,10],[1201,1],[1201,1]]);
    expect(s.totals.items).toEqual({501:20,505:10,1201:2});
  });
  it('leaves an already overweight legacy inventory intact', () => {
    const { s, c } = setup(); addItem(s,c,909,400);
    const inventory = structuredClone(s.inventory);
    grantReward(s,c,reward(501),100);
    expect(s.inventory).toEqual(inventory);
    expect(pending(s)).toHaveLength(1);
  });
  it('supports old saves with no pending field and ordinary fitting rewards', () => {
    const { s, c } = setup(); expect(pending(s)).toBeUndefined();
    grantReward(s,c,reward(909,2),100);
    expect(s.inventory).toMatchObject([{itemId:909,quantity:2}]);
    expect(inventoryLoad(s,c).weight).toBe(.2);
    expect(pending(s)??[]).toHaveLength(0);
  });
});

describe('pending reclaim command', () => {
  it('moves a saved rolled entry intact without RNG, IDs or totals changing', () => {
    const { s, c } = setup();
    const entry:InventoryEntry={uid:'item-99',itemId:1201,quantity:1,refine:3,cards:[4001],favorite:true,
      identified:false,rarity:'legendary',rarityBonus:{stat:'dex',value:5},broken:true};
    (s as any).pendingLoot=[{entry:structuredClone(entry),acquiredAt:1,source:'monster',areaId:'prontera',enemyId:'original'}];
    s.nextItemId=100; s.totals.items[1201]=1;
    const saved=JSON.parse(JSON.stringify(s)) as GameState;
    const before={rng:saved.rngState,next:saved.nextItemId,totals:structuredClone(saved.totals)};
    executeCommand(saved,c,{type:'collectPendingLoot'} as any,100);
    expect(saved.inventory).toContainEqual(entry);
    expect(pending(saved)??[]).toHaveLength(0);
    expect(saved.rngState).toBe(before.rng); expect(saved.nextItemId).toBe(before.next);
    expect(saved.totals).toEqual(before.totals);
    executeCommand(saved,c,{type:'collectPendingLoot'} as any,101);
    expect(saved.inventory.filter(row=>row.uid===entry.uid)).toHaveLength(1);
  });
  it('reclaims entries that fit while preserving a larger entry for increased capacity', () => {
    const { s, c } = setup(); c.items[1201].weight=31;
    const heavy={uid:'item-10',itemId:1201,quantity:1,refine:0,cards:[],favorite:false};
    const small={uid:'item-11',itemId:501,quantity:1,refine:0,cards:[],favorite:false};
    (s as any).pendingLoot=[{entry:heavy,acquiredAt:1,source:'reward'},{entry:small,acquiredAt:1,source:'reward'}];
    executeCommand(s,c,{type:'collectPendingLoot'} as any,100);
    expect(s.inventory).toEqual([small]); expect(pending(s)?.map(row=>row.entry)).toEqual([heavy]);
    s.stats.str=2;
    executeCommand(s,c,{type:'collectPendingLoot'} as any,101);
    expect(s.inventory).toEqual([small,heavy]); expect(pending(s)??[]).toHaveLength(0);
  });
  it('refuses a full bag without changing any saved state or pending roll', () => {
    const { s, c } = setup(); addItem(s,c,909,300);
    (s as any).pendingLoot=[{entry:{uid:'item-100',itemId:1201,quantity:1,refine:0,cards:[],favorite:false,identified:false,rarity:'epic'},acquiredAt:1,source:'monster'}];
    const before=structuredClone(s);
    expect(()=>executeCommand(s,c,{type:'collectPendingLoot'} as any,100)).toThrowError(expect.objectContaining({code:'WEIGHT_LIMIT'}));
    expect(s).toEqual(before);
  });
});
