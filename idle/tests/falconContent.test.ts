import {describe,it,expect} from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import rules from '../content/rules.json';
describe('pinned Falcon end-to-end content',()=>{
 it('promotes only implemented Detect and keeps original resource and native requirements',()=>{
  const skill=catalog.skills.ht_detecting;expect(skill.implementation).toBe('supported');expect(skill).not.toHaveProperty('unsupportedReason');expect(skill).toMatchObject({manualUse:'activate',maxLevel:4,spCost:[8,8,8,8],castTimeMs:[0,0,0,0],afterCastDelayMs:[0,0,0,0],range:[3,5,7,9],aoeRadius:[3,3,3,3],requiredState:'Falcon',damageType:'none'});
  expect(skill.iconResource).toMatch(/ht_detecting\.bmp$/);expect(catalog.skills.ht_springtrap.implementation).toBe('unsupported');
 });
 it('pins native rental, BaseJob masking, delayed damage and final misc minimum',()=>{
  for(const path of ['npc/merchants/renters.txt','src/map/map.h','conf/map/battle/player.conf','conf/map/battle/skill.conf','conf/map/battle/battle.conf'])expect(manifest.sources.find(s=>s.path===path)?.sha256).toBe((rules.sourceHashes as Record<string,string>)[path]);
  expect((manifest as any).falconRules).toMatchObject({rentalZeny:2500,rentalDiscount:false,autoChance:'raw1000 <= effectiveLUK * 3',autoLevel:'min(learnedBlitz, 5, floor(JobLevel/10)+1)',delayBattleDamage:true,snapDodge:false,warpDelayFix:false,minimumDamageMask:6,detectSelfCentered:true});
 });
 it('reports the complete supported count without promoting traps or group skills',()=>{
  expect(Object.values(catalog.skills).filter(s=>s.implementation==='supported')).toHaveLength(274);expect(Object.values(catalog.skills)).toHaveLength(348);expect(manifest.sources).toHaveLength(51);
 });
});
