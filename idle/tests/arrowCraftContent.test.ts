import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import recipes from '../content/arrow-recipes.json';
import raw from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import {parseArrowRecipes} from '../tools/arrowRecipes.mjs';
import {openArrowCraft,answerArrowCraft} from '../engine/arrowCraft';
import {createInitialState} from '../engine/index';
import type {Catalog} from '../shared/types';
it('exports every pinned recipe and its real input and outputs',()=>{
 expect(recipes).toHaveLength(136);expect(new Set(recipes.map(r=>r.materialItemId)).size).toBe(136);
 expect(manifest.sources.find(s=>s.path==='db/create_arrow_db.txt')?.sha256).toBe('8b735f3685a18d6fcaa8063b7f8ef9fd1251ac6beba03a56279b24a6b8255eec');
 const c=raw as unknown as Catalog;expect(c.skills.ac_makingarrow).toMatchObject({implementation:'supported',manualUse:'arrowCraft'});
 for(const r of recipes)for(const id of [r.materialItemId,...r.outputs.map(o=>o.itemId)])expect(c.items[id],String(id)).toBeDefined();
});
it('parses literal recipe rows and rejects invalid or duplicate data',()=>{
 expect(parseArrowRecipes('// comment\n713,1770,2 // bottle')).toEqual([{materialItemId:713,outputs:[{itemId:1770,quantity:2}]}]);
 for(const text of ['713,1770,0','713,1770','713,1770,2\n713,1770,3','713,1770,NaN'])expect(()=>parseArrowRecipes(text)).toThrow();
});
it('produces the exact source output for all 136 materials without RNG rolls',()=>{
 const c=raw as unknown as Catalog;
 for(const r of recipes){const s=createInitialState(c,1000);s.job='archer';s.stats.str=99;s.hp=50;s.sp=100;s.learnedSkills.ac_makingarrow=1;s.equipment={};
  s.inventory=[{uid:'material',itemId:r.materialItemId,quantity:1,refine:0,cards:[],favorite:false,identified:true}];
  const rng=s.rngState;openArrowCraft(s,c,1000);answerArrowCraft(s,c,s.arrowCraftMenu!.id,'material',1000);
  expect(s.inventory.filter(e=>e.uid==='material'),String(r.materialItemId)).toHaveLength(0);
  for(const o of r.outputs)expect(s.inventory.filter(e=>e.itemId===o.itemId).reduce((n,e)=>n+e.quantity,0),String(r.materialItemId)).toBe(o.quantity);
  expect(s.rngState).toBe(rng);
 }
},30000);
