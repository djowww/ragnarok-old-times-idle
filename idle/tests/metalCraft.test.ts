import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index.js';
import { craftMetal, metalCraftChance, metalCraftPreview, metalRecipe, metalRecipes } from '../engine/metalCraft.js';
import { fixture } from './engine-fixture.js';
import type { Catalog, Skill } from '../shared/types.js';
function skill(id: string, sourceName: string): Skill {
  return { id, sourceName, name: sourceName, description: '', kind: 'passive', maxLevel: 5,
    spCost: [0, 0, 0, 0, 0], power: [0, 0, 0, 0, 0], cooldownMs: 0, implementation: 'supported', manualUse: 'metalCraft' };
}
function setup(output = 998) {
  const c = fixture() as Catalog;
  const names: Record<number, string> = { 990:'Red Blood',991:'Crystal Blue',992:'Green Live',993:'Wind of Verdure',
    994:'Flame Heart',995:'Mystic Frozen',996:'Great Nature',997:'Rough Wind',998:'Iron',999:'Steel',
    1000:'Star Crumb',1001:'Star Dust',1002:'Iron Ore',1003:'Coal' };
  for (const [rawId,name] of Object.entries(names)) { const id=Number(rawId);
    c.items[id]={...c.items[909],id,name,type:[998,999].includes(id)?'material':'loot',weight:1,shop:false}; }
  c.skills.bs_iron=skill('bs_iron','BS_IRON'); c.skills.bs_steel=skill('bs_steel','BS_STEEL');
  c.skills.bs_enchantedstone=skill('bs_enchantedstone','BS_ENCHANTEDSTONE');
  c.classes.blacksmith={...c.classes.novice,id:'blacksmith',name:'Blacksmith',family:'merchant',tier:2,
    skills:['bs_iron','bs_steel','bs_enchantedstone']};
  const s=createInitialState(c,0); s.rngState=0; s.job='blacksmith'; s.jobLevel=10; s.stats.dex=10; s.stats.luk=10;
  s.hp=100; s.sp=100; s.learnedSkills.bs_iron=1; s.learnedSkills.bs_steel=1; s.learnedSkills.bs_enchantedstone=1;
  s.inventory=metalRecipe(output)!.ingredients.map((x,i)=>({uid:'mat-'+i,itemId:x.itemId,quantity:x.quantity,refine:0,cards:[],favorite:false}));
  s.equipment={}; return {c,s};
}
const count=(s:ReturnType<typeof setup>['s'],id:number)=>s.inventory.filter(x=>x.itemId===id).reduce((n,x)=>n+x.quantity,0);
describe('pinned solo metal crafting', () => {
  it('has seven pinned recipes with exact inputs', () => {
    expect(metalRecipes).toHaveLength(7);
    expect(metalRecipe(998)).toMatchObject({skillName:'BS_IRON',skillLevel:1,ingredients:[{itemId:1002,quantity:1}]});
    expect(metalRecipe(999)).toMatchObject({skillName:'BS_STEEL',ingredients:[{itemId:998,quantity:5},{itemId:1003,quantity:1}]});
    expect(metalRecipe(997)).toMatchObject({skillName:'BS_ENCHANTEDSTONE',ingredients:[{itemId:993,quantity:10}]});
  });
  it('previews source chance and ingredients without changing state', () => {
    const {c,s}=setup(), before=structuredClone(s);
    expect(metalCraftPreview(s,c,998,0)).toMatchObject({available:true,chance:4900,skillLevel:1,
      ingredients:[{itemId:1002,quantity:1,owned:1,missing:0}]});
    expect(metalCraftChance(s,c,metalRecipe(998)!,0)).toBe(4900); expect(s).toEqual(before);
  });
  it('consumes materials before one roll and creates one item on success', () => {
    const {c,s}=setup(), zeny=s.zeny, sp=s.sp; craftMetal(s,c,998,0);
    expect(count(s,1002)).toBe(0); expect(count(s,998)).toBe(1); expect(s.rngState).toBe(1013904223);
    expect(s.zeny).toBe(zeny); expect(s.sp).toBe(sp); expect(s.totals.items[998]).toBeUndefined();
  });
  it('consumes materials and produces nothing on failure', () => {
    const {c,s}=setup(); s.rngState=1000; craftMetal(s,c,998,0);
    expect(count(s,1002)).toBe(0); expect(count(s,998)).toBe(0); expect(s.rngState).toBe(2678429223);
    expect(s.events.at(-1)?.text).toContain('falhou');
  });
  it('keeps one random draw for the guaranteed Star Crumb recipe', () => {
    const {c,s}=setup(1000); craftMetal(s,c,1000,0);
    expect(count(s,1000)).toBe(1); expect(s.rngState).toBe(1013904223);
  });
  it('dispatches the persisted production command through a cloned state', () => {
    const {c,s}=setup(1000), before=structuredClone(s);
    const next=applyCommand(s,c,{type:'craftMetal',itemId:1000},0);
    expect(s).toEqual(before); expect(count(next,1000)).toBe(1);
  });
  it.each(['unlearned','wrong-class','missing-material','resting'])('rejects %s without consuming or rolling',mode => {
    const {c,s}=setup();
    if(mode==='unlearned') delete s.learnedSkills.bs_iron;
    if(mode==='wrong-class') s.job='mage';
    if(mode==='missing-material') s.inventory=[];
    if(mode==='resting') s.status='resting';
    const before=structuredClone(s);
    expect(metalCraftPreview(s,c,998,0).available).toBe(false);
    expect(()=>craftMetal(s,c,998,0)).toThrow(); expect(s).toEqual(before);
  });
});
