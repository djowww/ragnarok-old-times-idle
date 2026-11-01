import {describe,it,expect} from 'vitest';
import raw from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import type { Catalog } from '../shared/types';
const c=raw as unknown as Catalog;
describe('pinned bounded NPC production and treatment export',()=>{
  it('pins twentieth source with exact SHA and exports exactly two NPC actions without learnable inflation',()=>{
    expect(manifest.sources.find(s=>s.path==='db/pre-re/mob_skill_db.conf')).toMatchObject({sha256:'a7752d8f4bdd1ea12191e70cb53bd5fb335ba3de855adaf30a7d362c3708b21b'});
    expect(c.monsters[1175].npcStatusSkills).toEqual([{skillId:176,sourceName:'NPC_POISON',level:1,rate:500,castTimeMs:800,delayMs:5000,range:9,cancelable:false,status:'SC_POISON',durationMs:60000}]);
    expect(c.monsters[1061].npcStatusSkills?.[0]).toMatchObject({skillId:177,sourceName:'NPC_BLINDATTACK',level:3,rate:500,castTimeMs:0,delayMs:5000,cancelable:true,status:'SC_BLIND',durationMs:30000});
    expect(Object.values(c.monsters).filter(m=>m.npcStatusSkills?.length).map(m=>m.id).sort((a,b)=>a-b)).toEqual([1061,1175]);expect(Object.keys(c.skills)).toHaveLength(348);
  });
  it('promotes only the three completed consumers and preserves future foundation requirements',()=>{
    for(const id of ['al_cure','tf_detoxify','pr_slowpoison'])expect(c.skills[id].implementation).toBe('supported');
    expect(c.skills.ht_detecting.implementation).toBe('unsupported');
    expect(c.skills.al_cure.spCost).toEqual([15]);expect(c.skills.tf_detoxify.spCost).toEqual([10]);expect(c.skills.pr_slowpoison.spCost).toEqual([6,8,10,12]);
    expect(c.skills.al_cure.prerequisitesByClass?.crusader).toContainEqual({skillId:'cr_trust',level:5});expect(c.skills.al_cure.prerequisitesByClass?.priest).toContainEqual({skillId:'heal',level:2});
  });
});
