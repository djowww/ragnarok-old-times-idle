import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import { applyCommand, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { createFieldNavigationRuntime, type FieldNavigationAreaSpec } from '../engine/fieldNavigation.js';
import type { FieldNavigationGrid } from '../shared/fieldNavigation.js';

const raw = rawCatalog as unknown as Catalog;
const area: FieldNavigationAreaSpec = { areaId: 'icewall_test', map: 'icewall_test', origin: {x:15,y:15},
  homeOffsets: [{x:-1,y:-1},{x:1,y:-1},{x:-1,y:1},{x:1,y:1}] };
function runtime(map = area.map) {
  const width=40,height=40,walkable=new Uint8Array(Math.ceil(width*height/8));
  for(let i=0;i<width*height;i++) walkable[i>>3] |= 1 << (i&7);
  const spec={...area,map};
  const grid: FieldNavigationGrid={map,width,height,walkable,wall:new Uint8Array(width*height),water:new Uint8Array(width*height),sourceSha256:'a'.repeat(64)};
  return createFieldNavigationRuntime([spec],new Map([[map,grid]]));
}
function setup(map = area.map, level = 1) {
  const c=structuredClone(raw), skill=Object.values(c.skills).find(row=>row.sourceName==='WZ_ICEWALL')!;
  skill.implementation='supported'; skill.manualUse='groundTarget';
  const s=createInitialState(c,1000,'icewall-test'); s.job='wizard'; s.jobLevel=50;
  s.learnedSkills[skill.id]=level; s.status='hunting'; s.areaId=area.areaId;
  beginBattle(s,c,1002,1000);
  const enemy=s.battle!.enemies![0]; enemy.position={x:BATTLE_HERO.x-8/12,y:BATTLE_HERO.y}; enemy.approachFrom={...enemy.position};
  enemy.enemyNextAttackAt=Number.MAX_SAFE_INTEGER;
  s.fieldHero={areaId:s.areaId,from:{...BATTLE_HERO},position:{...BATTLE_HERO},startedAt:1000,arrivedAt:1000,routeIndex:0,phase:'fighting',targetId:enemy.id};
  s.battle!.playerNextAttackAt=Number.MAX_SAFE_INTEGER; s.battle!.playerNextSkillAt=Number.MAX_SAFE_INTEGER; s.battle!.playerActionReadyAt=Number.MAX_SAFE_INTEGER;
  s.playerCanActAt=0; s.autoPotion={hpThreshold:0,spThreshold:0}; s.sp=20;
  return {c,s,skill,navigation:runtime(map),enemy};
}
const target = {x:BATTLE_HERO.x+4/12,y:BATTLE_HERO.y};

describe('WZ_ICEWALL placement command',()=>{
  it('charges SP once and persists a five-cell wall until the source duration expires',()=>{
    const {c,s,skill,navigation}=setup(),before=s.sp;
    const next=applyCommand(s,c,{type:'useSkill',skillId:skill.id,groundCell:target},1000,{navigation});
    expect(next.sp).toBe(before-(skill.spCost?.[0] ?? 20));
    expect(next.battle!.skillUnits).toHaveLength(1);
    expect(next.battle!.skillUnits![0]).toMatchObject({skillId:skill.id,level:1,placedAt:1000,expiresAt:1000+(skill.groundDurationMs?.[0] ?? 5000)});
    expect(next.battle!.skillUnits![0].cells).toHaveLength(5);
  });
  it('rejects a wall that would occupy a live enemy cell without spending SP',()=>{
    const {c,s,skill,navigation,enemy}=setup();
    const before=s.sp;
    enemy.position=navigation.toBattlePoint(area.areaId,{x:19.5,y:15.5});
    enemy.approachFrom={...enemy.position};
    expect(()=>applyCommand(s,c,{type:'useSkill',skillId:skill.id,groundCell:target},1000,{navigation})).toThrow();
    expect(s.sp).toBe(before);
  });
  it('uses the requested learned level duration',()=>{
    const {c,s,skill,navigation}=setup(area.map,2);
    const next=applyCommand(s,c,{type:'useSkill',skillId:skill.id,groundCell:target},1000,{navigation});
    expect(next.battle!.skillUnits![0]).toMatchObject({level:2,expiresAt:1000+(skill.groundDurationMs?.[1] ?? 10000)});
  });
  it('rejects out-of-range and noicewall maps atomically without spending SP',()=>{
    for(const [map,point] of [[area.map,{x:BATTLE_HERO.x+10/12,y:BATTLE_HERO.y}],['poring_w01',target]] as const){
      const {c,s,skill,navigation}=setup(map),before=s.sp;
      expect(()=>applyCommand(s,c,{type:'useSkill',skillId:skill.id,groundCell:point},1000,{navigation})).toThrow();
      expect(s.sp).toBe(before);
    }
  });
});
