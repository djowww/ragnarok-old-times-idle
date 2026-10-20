import { beforeDungeonExpansionCatalog, beforeDungeonExpansionManifest } from './dungeon-map-historical';
import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest } from './arrow-craft-historical';
import { beforeWarpPortalCatalog, beforeWarpPortalManifest } from './warp-portal-historical';
import { beforeSoloAlchemySkills } from './solo-alchemy-historical';
import {describe,it,expect} from 'vitest';
import dungeonCurrentData from '../content/catalog.json';
import dungeonCurrentManifest from '../content/source-manifest.json';
import type {Catalog} from '../shared/types';
import baseline from './fixtures/castControl222Baseline.json';
const data = beforeDungeonExpansionCatalog(beforeArrowCraftingCatalog(beforeWarpPortalCatalog(dungeonCurrentData)));
const manifest = beforeDungeonExpansionManifest(beforeArrowCraftingManifest(beforeWarpPortalManifest(dungeonCurrentManifest)));

const c=data as unknown as Catalog;
describe('Executed solo Priest catalog',()=>{
 it('promotes exactly Priest Recovery, Lex and real Haggle while preserving study-only foundations',()=>{
  expect(c.skills.pr_strecovery).toMatchObject({implementation:'supported',maxLevel:1,range:[9],spCost:[5],castTimeMs:[0],afterCastDelayMs:[2000]});
  expect(c.skills.pr_lexdivina).toMatchObject({implementation:'supported',maxLevel:10,range:Array(10).fill(5),castTimeMs:Array(10).fill(0),afterCastDelayMs:Array(10).fill(3000),spCost:[20,20,20,20,20,18,16,14,12,10],statusDurationMs:[30000,35000,40000,45000,50000,60000,60000,60000,60000,60000]});
  expect(c.skills.rg_compulsion).toMatchObject({implementation:'supported',kind:'passive',maxLevel:5});
  expect(c.skills.al_ruwach).toMatchObject({ implementation:'supported', maxLevel:1, kind:'magical', targetType:'self',
   damageType:'magic', element:'holy', power:[145], aoeRadius:[2], spCost:[10], statusEffect:'SC_RUWACH', statusDurationMs:[10000] });
  for(const id of ['rg_gangster'])expect(c.skills[id].implementation,id).toBe('unsupported');
  for(const id of ['as_right','as_left'])expect(c.skills[id].implementation,id).toBe('supported');
  expect(c.skills.sa_advancedbook).toMatchObject({sourceName:'SA_ADVANCEDBOOK',implementation:'supported',kind:'passive'});
  expect(c.skills.pr_lexdivina.prerequisitesByClass!.priest).toContainEqual({skillId:'al_ruwach',level:1});
  expect(manifest.skillCoverage).toMatchObject({classes:40,skills:348,supported: 298, unsupported: 50});
  expect((manifest as Record<string, unknown>).ruwach).toMatchObject({ skill:'AL_RUWACH', status:'SC_RUWACH', durationMs:10000,
   radius:2, spCost:10, pulseMs:20, damage:'145% MATK, Holy, Hercules level 1; only when concealment is removed' });
  expect(manifest.skillSources.al_ruwach).toMatchObject({ name:'AL_RUWACH', implementation:'supported',
   adaptation: expect.stringContaining('event-driven 20 ms pulses') });
 });
 it('includes actual monster AI source pins in catalog source hash and provenance',()=>{
  expect(c.source.commit).toBe('410b9738c049ab1825d67b36b072d837c1d0b33a');
  expect(manifest.sources).toContainEqual(expect.objectContaining({path:'src/map/mob.c',sha256:'a30af793eb5328ef7787638da5a22458f651b2c0cc5e8f533b3449d7acf6174d'}));
  expect(manifest.sources).toContainEqual(expect.objectContaining({path:'src/map/mob.h',sha256:'bb971d72be5a2345438360d8a9004eefd4f34839d4e51ce89a1b05bce1fb9a74'}));
  expect(c.source.files).toContain('src/map/mob.c');
  expect(manifest.sources).toHaveLength(44);
  expect(manifest.sources).toContainEqual(expect.objectContaining({path:'npc/merchants/refine.txt',sha256:'3b0cf6c2b711115780acfd7d8c41ad1bd2a2f6582baec44a605cf889b747eac1'}));
  expect(c.source.files.filter(path=>!baseline.sourcePaths.includes(path)).sort()).toEqual(['conf/map/battle/battle.conf', 'conf/map/battle/drops.conf', 'conf/map/battle/player.conf', 'conf/map/battle/skill.conf', 'db/create_arrow_db.txt', 'db/pre-re/item_chain.conf', 'db/pre-re/refine_db.conf', 'db/pre-re/unit_parameters_db.conf', 'db/produce_db.txt', 'npc/mapflag/noicewall.txt', 'npc/mapflag/nomemo.txt', 'npc/mapflag/noteleport.txt', 'npc/mapflag/nowarp.txt', 'npc/mapflag/nowarpto.txt', 'npc/merchants/alchemist.txt', 'npc/merchants/refine.txt', 'npc/merchants/renters.txt', 'npc/merchants/shops.txt', 'npc/pre-re/merchants/shops.txt', 'npc/pre-re/mobs/dungeons/anthell.txt', 'npc/pre-re/mobs/dungeons/gef_dun.txt', 'npc/pre-re/mobs/dungeons/glastheim.txt', 'npc/pre-re/mobs/dungeons/iz_dun.txt', 'npc/pre-re/mobs/dungeons/moc_pryd.txt', 'npc/pre-re/mobs/dungeons/orcsdun.txt', 'npc/pre-re/mobs/dungeons/pay_dun.txt', 'npc/pre-re/mobs/dungeons/prt_sew.txt', 'src/map/clif.c', 'src/map/clif.h', 'src/map/itemdb.c', 'src/map/map.h', 'src/map/mob.c', 'src/map/mob.h', 'src/map/pc.h', 'src/map/refine.c', 'src/map/script.c']);
 });
 it('preserves every supported skill from the exact frozen CAST222 archive and accounts for later solo packages',()=>{
  const supported=Object.values(beforeSoloAlchemySkills(c.skills)).filter(skill=>skill.implementation==='supported').map(skill=>skill.sourceName!);
  expect(baseline.supportedSourceNames).toHaveLength(222);
  expect(baseline.supportedSourceNames.filter(name=>!supported.includes(name))).toEqual([]);
  expect(supported.filter(name=>!baseline.supportedSourceNames.includes(name)).sort()).toEqual(['AL_HOLYWATER', 'AL_RUWACH', 'AL_TELEPORT', 'AM_CANNIBALIZE', 'ASC_CDP', 'AS_LEFT', 'AS_RIGHT', 'BA_PANGVOICE', 'BS_ENCHANTEDSTONE', 'BS_GREED', 'BS_IRON', 'BS_ORIDEOCON', 'BS_STEEL', 'CR_SHRINK', 'DC_DONTFORGETME', 'DC_WINKCHARM', 'HT_REMOVETRAP', 'HT_SPRINGTRAP', 'LK_JOINTBEAT', 'MO_BLADESTOP', 'MO_BODYRELOCATION', 'NV_TRICKDEAD', 'PA_SACRIFICE', 'PF_FOGWALL', 'PF_MINDBREAKER', 'PF_SOULBURN', 'PR_LEXDIVINA', 'PR_STRECOVERY', 'RG_CLOSECONFINE', 'RG_COMPULSION', 'RG_PLAGIARISM', 'SA_ADVANCEDBOOK', 'SA_CREATECON', 'SA_DELUGE', 'SA_ELEMENTFIRE', 'SA_ELEMENTGROUND', 'SA_ELEMENTWATER', 'SA_ELEMENTWIND', 'SA_FLAMELAUNCHER', 'SA_FREECAST', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_MAGICROD', 'SA_SEISMICWEAPON', 'SA_VIOLENTGALE', 'SA_VOLCANO', 'ST_CHASEWALK', 'ST_PRESERVE', 'TF_BACKSLIDING', 'WZ_ESTIMATION', 'WZ_ICEWALL', 'WZ_SIGHTBLASTER']);
 });
});
