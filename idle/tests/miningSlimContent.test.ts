import {describe,expect,it} from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import {findingOreChain} from '../shared/findingOre';
const m=manifest as any;
describe('pinned solo mining and compact pitcher content',()=>{
 it('enables only implemented mining and compact pitcher dispatchers',()=>{
  expect(catalog.skills.bs_findingore).toMatchObject({herculesId:106,implementation:'supported',kind:'passive',maxLevel:1});
  expect(catalog.skills.bs_findingore).not.toHaveProperty('manualUse');
  expect(catalog.skills.cr_slimpitcher).toMatchObject({herculesId:478,implementation:'supported',manualUse:'activate',targetType:'ground',kind:'heal',interruptCast:false,spCost:Array(10).fill(30),castTimeMs:Array(10).fill(1000),afterCastDelayMs:Array(10).fill(1000),range:Array(10).fill(3),aoeRadius:Array(10).fill(3)});
  for(const id of ['bs_findingore','cr_slimpitcher']){
   expect(catalog.skills[id as keyof typeof catalog.skills]).not.toHaveProperty('unsupportedReason');
   expect(m.skillSources[id]).toMatchObject({implementation:'supported'});
   expect(m.skillSources[id]).not.toHaveProperty('unsupportedReason');
  }
  for(const id of ['bs_iron','bs_repairweapon','am_callhomun','cr_fullprotection','ht_removetrap'])expect(catalog.skills[id as keyof typeof catalog.skills].implementation,id).toBe('unsupported');
 });
 it('keeps the ordered native chain equal to the runtime table without NPC stock additions',()=>{
  expect(m.findingOre.chain).toEqual(findingOreChain);
  expect(m.findingOre).toMatchObject({selection:'uniform-entry-then-strict-chance',drawsPerEligibleKill:2,dropRateMultiplier:false});
  expect(catalog.items['997']).toMatchObject({id:997,name:'Great Nature',type:'loot',buyPrice:3000,sellPrice:1500,weight:30,shop:false,effects:{}});
  expect(m.skillCoverage).toMatchObject({skills:348,supported:265,unsupported:83});
  expect(Object.keys(catalog.items)).toHaveLength(794);expect(m.sources).toHaveLength(42);
 });
});
