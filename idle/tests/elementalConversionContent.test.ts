import { beforeSoloAlchemySkills } from './solo-alchemy-historical';
import {describe,it,expect} from 'vitest';
import data from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import baseline from './fixtures/priestControl225Baseline.json';
import rules from '../content/rules.json';
import type {Catalog} from '../shared/types';
const c=data as unknown as Catalog;
describe('exact source-pinned converter package',()=>{
 it('preserves Priest225 and accounts for the two solo postures after Guardian',()=>{
  const names=Object.values(beforeSoloAlchemySkills(c.skills)).filter(s=>s.implementation==='supported').map(s=>s.sourceName!);
  expect(baseline.supportedSourceNames).toHaveLength(225);
  expect(baseline.supportedSourceNames.filter(name=>!names.includes(name))).toEqual([]);
  expect(names.filter(name=>!baseline.supportedSourceNames.includes(name)).sort()).toEqual(['AL_RUWACH', 'AL_TELEPORT', 'BA_PANGVOICE', 'CR_SHRINK', 'DC_DONTFORGETME', 'DC_WINKCHARM', 'LK_JOINTBEAT', 'MO_BLADESTOP', 'MO_BODYRELOCATION', 'NV_TRICKDEAD', 'PA_SACRIFICE', 'PF_FOGWALL', 'PF_MINDBREAKER', 'RG_CLOSECONFINE', 'RG_PLAGIARISM', 'SA_ADVANCEDBOOK', 'SA_CREATECON', 'SA_DELUGE', 'SA_ELEMENTFIRE', 'SA_ELEMENTGROUND', 'SA_ELEMENTWATER', 'SA_ELEMENTWIND', 'SA_FLAMELAUNCHER', 'SA_FREECAST', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_MAGICROD', 'SA_SEISMICWEAPON', 'SA_VIOLENTGALE', 'SA_VOLCANO', 'ST_CHASEWALK', 'ST_PRESERVE', 'TF_BACKSLIDING', 'WZ_ESTIMATION', 'WZ_SIGHTBLASTER']);
  expect(manifest.skillCoverage).toMatchObject({classes:40,skills:348,supported: 262, unsupported: 86});
  expect(c.skills.sa_createcon).toMatchObject({implementation:'supported',manualUse:'converterCraft',maxLevel:1,spCost:[30]});
  const reagents={sa_elementfire:12114,sa_elementwater:12115,sa_elementground:12116,sa_elementwind:12117};
  for(const [id,itemId] of Object.entries(reagents))expect(c.skills[id]).toMatchObject({implementation:'supported',maxLevel:1,spCost:[30],range:[9],castTimeMs:[2000],afterCastDelayMs:[1000],cooldownMs:0,itemCostByLevel:[[{itemId,quantity:1}]]});
  for(const source of ['SA_DISPELL','SA_ABRACADABRA','AM_PHARMACY','AC_MAKINGARROW'])expect(Object.values(c.skills).find(skill=>skill.sourceName===source)?.implementation,source).toBe('unsupported');
 });
 it('preserves all22 prior source paths and hashes and adds only exact recipes and NPC shop source',()=>{
  for(const source of baseline.sources)expect(manifest.sources).toContainEqual(source);
  for(const [path,hash] of Object.entries(baseline.sourceHashes))expect((rules.sourceHashes as Record<string,string>)[path],path).toBe(hash);
  expect(manifest.sources).toHaveLength(29);
  expect(manifest.sources.filter(source=>!baseline.sources.some(old=>old.path===source.path)).map(source=>source.path).sort()).toEqual(['db/pre-re/unit_parameters_db.conf','db/produce_db.txt','npc/mapflag/noteleport.txt','npc/merchants/refine.txt','npc/merchants/shops.txt','src/map/clif.c','src/map/pc.h']);
  expect(manifest.sources).toContainEqual(expect.objectContaining({path:'npc/merchants/refine.txt',sha256:'3b0cf6c2b711115780acfd7d8c41ad1bd2a2f6582baec44a605cf889b747eac1'}));
  expect((rules.sourceHashes as Record<string,string>)['npc/merchants/refine.txt']).toBe('3b0cf6c2b711115780acfd7d8c41ad1bd2a2f6582baec44a605cf889b747eac1');
  expect(manifest.sources).toContainEqual(expect.objectContaining({path:'db/produce_db.txt',sha256:'122d6ebc9a9451cb731643118bfff99f3a3c9ec2e5fe58d99129dc48c6f2fc2d'}));
  expect(manifest.sources).toContainEqual(expect.objectContaining({path:'npc/merchants/shops.txt',sha256:'adca4101b689a1066ed23742b6163bc394de8aa3d3c8c836c882d55cfcfcbaf5'}));
  expect(c.source.hash).not.toBe(baseline.sourceHash);
 });
 it('imports real priced NPC supplies and protects every recipe item from automatic loot sales',()=>{
  expect(Object.keys(c.items).map(Number).filter(id=>!baseline.itemIds.includes(id)).sort((a,b)=>a-b)).toEqual([904,947,1550,2347,2349,2351,4119,7433]);
  expect(baseline.itemIds.filter(id=>!c.items[id])).toEqual([]);
  for(const [id,price] of [[7433,4000],[904,124],[947,116]])expect(c.items[id]).toMatchObject({type:'material',shop:true,buyPrice:price,weight:1});
  expect(c.items[1550]).toMatchObject({id:1550,name:'Book',type:'equipment',slot:'weapon',weaponType:'book',twoHanded:false,
   attack:85,def:0,slots:3,minLevel:14,allowedClasses:['sage','professor','priest','high_priest'],buyPrice:30000,sellPrice:15000,
   weight:60,shop:true,equipSupported:true,weaponLevel:2,attackRange:1});
  for(const id of [946,1013,12114,12115,12116,12117])expect(c.items[id]).toMatchObject({type:'material',shop:false});
  for(const id of [7433,904,947,946,1013,12114,12115,12116,12117])expect(c.items[id].resource).toMatch(/\.bmp$/);
 });
});
