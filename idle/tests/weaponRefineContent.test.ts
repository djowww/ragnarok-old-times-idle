import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {WEAPON_REFINE_NORMAL_RATES} from '../shared/weaponRefineRules';
const read=(f:string)=>JSON.parse(readFileSync(new URL('../content/'+f,import.meta.url),'utf8'));
describe('native weapon-refine content contract',()=>{
 it('promotes only the real manual skill with native costs and full learned limit',()=>{
  const c=read('catalog.json'),s=c.skills.ws_weaponrefine;
  expect(s.implementation).toBe('supported');expect(s.manualUse).toBe('weaponRefine');expect(s.maxLevel).toBe(10);expect(s.spCost).toEqual(Array(10).fill(5));
  expect(s.castTimeMs).toEqual(Array(10).fill(0));expect(s.afterCastDelayMs).toEqual(Array(10).fill(0));expect(s.cooldownMs).toBe(0);
 });
 it('pins and records normal-rate rows and answer-phase ore and probability contracts',()=>{
  const m=read('source-manifest.json');expect(m.weaponRefine.normalRates).toEqual(WEAPON_REFINE_NORMAL_RATES);
  expect(m.weaponRefine.materialByWeaponLevel).toEqual([1010,1011,984,984]);expect(m.weaponRefine.baseSpOnOpen).toBe(5);expect(m.weaponRefine.zenyCost).toBe(0);
  expect(m.sources.find((s:any)=>s.path==='db/pre-re/refine_db.conf')?.sha256).toBe('379b165bb1885627a7d0838ace7a9c6c6748e2ef5eb6a02d540aeb5d29c9349e');
  expect(m.sources.find((s:any)=>s.path==='src/map/refine.c')?.sha256).toBe('f37278ea0f021009c6a5a75983cbc44fed2bcd62c3767f05481c6303005a0bc0');
  expect(m.sources.find((s:any)=>s.path==='src/map/clif.h')?.sha256).toBe('625470b65d182fc5bdd3f4c62545d6271bcf6fe041eaa773dd24ce9be88476e3');
 });
 it('protects the three native ores without changing native prices',()=>{
  const c=read('catalog.json');expect([1010,1011,984].map(id=>c.items[id].type)).toEqual(['material','material','material']);
  expect([1010,1011].map(id=>[c.items[id].buyPrice,c.items[id].sellPrice])).toEqual([[200,100],[1000,500]]);
 });
});
