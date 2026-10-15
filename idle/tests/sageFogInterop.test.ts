import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { castSetup } from './cast-control-fixture';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { placeSageField } from '../engine/sageFields';
import { captureGroundPlacement, occupiedGroundCells } from '../engine/groundUnitOccupancy';
import { advanceState } from '../engine';
import { fogWallDefending } from '../engine/fogWall';
import { clearClassicGrounds } from '../engine/classicBuffs';
const fogApi={fogWallDefending};
function setup() {
  const x=castSetup(),{s,c,e}=x,real=raw as unknown as Catalog;
  c.skills.pf_fogwall=structuredClone(real.skills.pf_fogwall);
  c.classes.professor={...structuredClone(real.classes.professor),hp:Array(99).fill(1000),sp:Array(99).fill(1000),jobBonuses:{}};
  s.job='professor'; s.sp=1000; s.rotation=[]; s.learnedSkills.pf_fogwall=1;
  delete e.npcCombat; c.monsters[e.monsterId].npcStatusSkills=[]; c.monsters[e.monsterId].attackRange=8;
  return x;
}
describe('source Sage and FogWall overlap',()=>{
  it.each(['sa_volcano','sa_violentgale'])('does not place FogWall over%s',(id)=>{
    const {s,c}=setup(); placeSageField(s,c,c.skills[id],1,0,BATTLE_HERO);
    expect(captureGroundPlacement(s,c,c.skills.pf_fogwall,1,1,BATTLE_HERO,BATTLE_HERO)).toBeUndefined();
  });
  it('doubles only FogWall cells on Deluge and preserves the group until its last cell expires',()=>{
    const {s,c}=setup(); placeSageField(s,c,c.skills.sa_deluge,1,0,BATTLE_HERO);
    s.elementalField!.cells=[{x:5,y:7}];
    const group=captureGroundPlacement(s,c,c.skills.pf_fogwall,1,1,BATTLE_HERO,BATTLE_HERO);
    expect(group?.expiresAt).toBe(40001);
    expect(occupiedGroundCells(s,c,20002).cells).toEqual([{x:5,y:7}]);
    expect(placeSageField(s,c,c.skills.sa_volcano,1,20002,BATTLE_HERO)).toBe(true);
    expect(s.elementalField?.cells).not.toContainEqual({x:5,y:7});
    expect(s.elementalField?.cells).toHaveLength(48);
    expect(occupiedGroundCells(s,c,40001).cells).toEqual([]);
  });
  it('does not waste AFK SP on a FogWall blocked by an active Volcano',()=>{
    const {s,c}=setup(); placeSageField(s,c,c.skills.sa_volcano,1,0,BATTLE_HERO); s.rotation=['pf_fogwall'];
    const end=advanceState(s,c,250);
    expect(end.sp).toBe(1000); expect(end.buffs.pf_fogwall).toBeUndefined();
  });
  it('extends a real FogWall cast on Deluge to40 seconds',()=>{
    const {s,c}=setup(); placeSageField(s,c,c.skills.sa_deluge,1,0,BATTLE_HERO); s.rotation=['pf_fogwall'];
    const end=advanceState(s,c,250);
    expect(end.buffs.pf_fogwall?.expiresAt).toBe(40000);
    expect(end.groundPlacements?.filter(g=>g.sourceName==='PF_FOGWALL')).toHaveLength(1);
  });
  it('a captured defensive field stays on the ground when the caster leaves',()=>{
    const {s,c}=setup(); s.status='hunting'; s.areaId=c.areas[0].id; delete s.battle!.challengeId;
    s.buffs.pf_fogwall={expiresAt:20000,effects:{}};
    captureGroundPlacement(s,c,c.skills.pf_fogwall,1,0,BATTLE_HERO,BATTLE_HERO);
    expect(fogApi.fogWallDefending?.(s,c,1)).toBe(true);
    s.fieldHero={areaId:s.areaId!,from:{x:2,y:2},position:{x:2,y:2},startedAt:0,arrivedAt:0,routeIndex:0};
    expect(fogApi.fogWallDefending?.(s,c,1)).toBe(false);
  });
  it('limits FogWall to the source two simultaneous groups',()=>{
    const {s,c}=setup();
    for(let at=0;at<3;at++) captureGroundPlacement(s,c,c.skills.pf_fogwall,1,at,{x:BATTLE_HERO.x+at,y:BATTLE_HERO.y},BATTLE_HERO);
    expect(s.groundPlacements).toHaveLength(2);
  });
  it('ends captured FogWall defense on a map warp',()=>{
    const {s,c}=setup(); s.buffs.pf_fogwall={expiresAt:20000,effects:{}};
    captureGroundPlacement(s,c,c.skills.pf_fogwall,1,0,BATTLE_HERO,BATTLE_HERO);
    clearClassicGrounds(s,c);
    expect(s.buffs.pf_fogwall).toBeUndefined(); expect(s.groundPlacements).toBeUndefined();
  });
});
