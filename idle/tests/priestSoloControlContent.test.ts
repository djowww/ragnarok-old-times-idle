import {describe,it,expect} from 'vitest';
import data from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import type {Catalog} from '../shared/types';
import baseline from './fixtures/castControl222Baseline.json';
const c=data as unknown as Catalog;
describe('Executed solo Priest catalog',()=>{
 it('promotes exactly Priest Recovery, Lex and real Haggle while preserving study-only foundations',()=>{
  expect(c.skills.pr_strecovery).toMatchObject({implementation:'supported',maxLevel:1,range:[9],spCost:[5],castTimeMs:[0],afterCastDelayMs:[2000]});
  expect(c.skills.pr_lexdivina).toMatchObject({implementation:'supported',maxLevel:10,range:Array(10).fill(5),castTimeMs:Array(10).fill(0),afterCastDelayMs:Array(10).fill(3000),spCost:[20,20,20,20,20,18,16,14,12,10],statusDurationMs:[30000,35000,40000,45000,50000,60000,60000,60000,60000,60000]});
  expect(c.skills.rg_compulsion).toMatchObject({implementation:'supported',kind:'passive',maxLevel:5});
  expect(c.skills.al_ruwach).toMatchObject({ implementation:'supported', maxLevel:1, kind:'magical', targetType:'self',
   damageType:'magic', element:'holy', power:[145], aoeRadius:[2], spCost:[10], statusEffect:'SC_RUWACH', statusDurationMs:[10000] });
  for(const id of ['rg_gangster','sa_advancedbook','as_right','as_left'])expect(c.skills[id].implementation,id).toBe('unsupported');
  expect(c.skills.pr_lexdivina.prerequisitesByClass!.priest).toContainEqual({skillId:'al_ruwach',level:1});
  expect(manifest.skillCoverage).toMatchObject({classes:40,skills:348,supported: 247, unsupported: 101});
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
  expect(manifest.sources).toHaveLength(27);
  expect(c.source.files.filter(path=>!baseline.sourcePaths.includes(path)).sort()).toEqual(['db/pre-re/unit_parameters_db.conf','db/produce_db.txt','npc/merchants/shops.txt','src/map/clif.c','src/map/mob.c','src/map/mob.h','src/map/pc.h']);
 });
 it('preserves every supported skill from the exact frozen CAST222 archive and accounts for later solo packages',()=>{
  const supported=Object.values(c.skills).filter(skill=>skill.implementation==='supported').map(skill=>skill.sourceName!);
  expect(baseline.supportedSourceNames).toHaveLength(222);
  expect(baseline.supportedSourceNames.filter(name=>!supported.includes(name))).toEqual([]);
  expect(supported.filter(name=>!baseline.supportedSourceNames.includes(name)).sort()).toEqual(['AL_RUWACH','BA_PANGVOICE','CR_SHRINK','DC_DONTFORGETME','DC_WINKCHARM','LK_JOINTBEAT','MO_BLADESTOP','MO_BODYRELOCATION','NV_TRICKDEAD','PA_SACRIFICE','PF_FOGWALL','PF_MINDBREAKER','PR_LEXDIVINA','PR_STRECOVERY','RG_CLOSECONFINE','RG_COMPULSION','SA_CREATECON','SA_ELEMENTFIRE','SA_ELEMENTGROUND','SA_ELEMENTWATER','SA_ELEMENTWIND','SA_FREECAST','SA_MAGICROD','WZ_ESTIMATION','WZ_SIGHTBLASTER']);
 });
});
