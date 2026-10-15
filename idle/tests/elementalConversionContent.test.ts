import {describe,it,expect} from 'vitest';
import data from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import baseline from './fixtures/priestControl225Baseline.json';
import rules from '../content/rules.json';
import type {Catalog} from '../shared/types';
const c=data as unknown as Catalog;
describe('exact source-pinned converter package',()=>{
 it('preserves Priest225 and accounts for the two solo postures after Guardian',()=>{
  const names=Object.values(c.skills).filter(s=>s.implementation==='supported').map(s=>s.sourceName!);
  expect(baseline.supportedSourceNames).toHaveLength(225);
  expect(baseline.supportedSourceNames.filter(name=>!names.includes(name))).toEqual([]);
  expect(names.filter(name=>!baseline.supportedSourceNames.includes(name)).sort()).toEqual(['AL_RUWACH','BA_PANGVOICE','CR_SHRINK','DC_DONTFORGETME','DC_WINKCHARM','LK_JOINTBEAT','MO_BLADESTOP','MO_BODYRELOCATION','NV_TRICKDEAD','PA_SACRIFICE','PF_FOGWALL','PF_MINDBREAKER','RG_CLOSECONFINE','SA_CREATECON','SA_ELEMENTFIRE','SA_ELEMENTGROUND','SA_ELEMENTWATER','SA_ELEMENTWIND','SA_FREECAST','WZ_ESTIMATION','WZ_SIGHTBLASTER']);
  expect(manifest.skillCoverage).toMatchObject({classes:40,skills:348,supported: 246, unsupported: 102});
  expect(c.skills.sa_createcon).toMatchObject({implementation:'supported',manualUse:'converterCraft',maxLevel:1,spCost:[30]});
  const reagents={sa_elementfire:12114,sa_elementwater:12115,sa_elementground:12116,sa_elementwind:12117};
  for(const [id,itemId] of Object.entries(reagents))expect(c.skills[id]).toMatchObject({implementation:'supported',maxLevel:1,spCost:[30],range:[9],castTimeMs:[2000],afterCastDelayMs:[1000],cooldownMs:0,itemCostByLevel:[[{itemId,quantity:1}]]});
  for(const source of ['SA_DISPELL','SA_FROSTWEAPON','SA_SEISMICWEAPON','SA_FLAMELAUNCHER','SA_LIGHTNINGLOADER','SA_ABRACADABRA','AM_PHARMACY','AC_MAKINGARROW'])expect(Object.values(c.skills).find(skill=>skill.sourceName===source)?.implementation,source).toBe('unsupported');
 });
 it('preserves all22 prior source paths and hashes and adds only exact recipes and NPC shop source',()=>{
  for(const source of baseline.sources)expect(manifest.sources).toContainEqual(source);
  for(const [path,hash] of Object.entries(baseline.sourceHashes))expect((rules.sourceHashes as Record<string,string>)[path],path).toBe(hash);
  expect(manifest.sources).toHaveLength(27);
  expect(manifest.sources.filter(source=>!baseline.sources.some(old=>old.path===source.path)).map(source=>source.path).sort()).toEqual(['db/pre-re/unit_parameters_db.conf','db/produce_db.txt','npc/merchants/shops.txt','src/map/clif.c','src/map/pc.h']);
  expect(manifest.sources).toContainEqual(expect.objectContaining({path:'db/produce_db.txt',sha256:'122d6ebc9a9451cb731643118bfff99f3a3c9ec2e5fe58d99129dc48c6f2fc2d'}));
  expect(manifest.sources).toContainEqual(expect.objectContaining({path:'npc/merchants/shops.txt',sha256:'adca4101b689a1066ed23742b6163bc394de8aa3d3c8c836c882d55cfcfcbaf5'}));
  expect(c.source.hash).not.toBe(baseline.sourceHash);
 });
 it('imports real priced NPC supplies and protects every recipe item from automatic loot sales',()=>{
  expect(Object.keys(c.items).map(Number).filter(id=>!baseline.itemIds.includes(id)).sort((a,b)=>a-b)).toEqual([904,947,7433]);
  expect(baseline.itemIds.filter(id=>!c.items[id])).toEqual([]);
  for(const [id,price] of [[7433,4000],[904,124],[947,116]])expect(c.items[id]).toMatchObject({type:'material',shop:true,buyPrice:price,weight:1});
  for(const id of [946,1013,12114,12115,12116,12117])expect(c.items[id]).toMatchObject({type:'material',shop:false});
  for(const id of [7433,904,947,946,1013,12114,12115,12116,12117])expect(c.items[id].resource).toMatch(/\.bmp$/);
 });
});
