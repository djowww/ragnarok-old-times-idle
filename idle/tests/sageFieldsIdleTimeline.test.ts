import { describe, expect, it } from 'vitest';
import { advanceState, applyCommand } from '../engine';
import { castSetup } from './cast-control-fixture';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { classicGroundSceneKey } from '../engine/classicBuffs';
import { placeSageField } from '../engine/sageFields';
import { random } from '../engine/state';
import { captureGroundPlacement } from '../engine/groundUnitOccupancy';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
function setup(through = false) {
  const x = castSetup(), {s,c}=x;
  s.battle=null; s.status='hunting'; s.rotation=[]; s.areaId=c.areas[0].id;
  s.nextEncounterAt=1000000;
  s.fieldPopulation={areaId:s.areaId,generation:0,enemies:[],respawns:[0,1,2,3].map(slot=>({slot,at:1000000}))};
  const from={x:BATTLE_HERO.x-.5,y:BATTLE_HERO.y}, position={x:BATTLE_HERO.x+(through?.5:0),y:BATTLE_HERO.y};
  s.fieldHero={areaId:s.areaId,from,position,movementRoute:[from,position],startedAt:0,arrivedAt:200,routeIndex:0};
  Object.assign(c.skills.sa_volcano,{implementation:'supported',groundDurationMs:[60000]});
  return x;
}
describe('Sage exact route replay without a current battle',()=>{
  it('retains field, entry and per-cell Fog deadlines across an offline-cap pause', () => {
    const {s,c}=setup(); s.fieldHero!.from=s.fieldHero!.position=BATTLE_HERO; s.fieldHero!.arrivedAt=0;
    delete s.fieldHero!.movementRoute;
    c.skills.pf_fogwall=structuredClone((raw as unknown as Catalog).skills.pf_fogwall);
    placeSageField(s,c,c.skills.sa_volcano,1,0,BATTLE_HERO);
    const entered=s.elementalField!.occupants[s.id].enteredAt;
    // Keep Fog away from Volcano so its own per-cell clocks can be observed.
    const fog=captureGroundPlacement(s,c,c.skills.pf_fogwall,1,0,{x:4,y:4},BATTLE_HERO)!;
    fog.battleStartedAt=0;
    s.status='paused'; s.pausedStatus='hunting'; s.pausedAt=s.lastSimulatedAt=1000;
    const resumed=applyCommand(s,c,{type:'setRotation',skillIds:[]},101000);
    expect(resumed.elementalField).toMatchObject({placedAt:100000,expiresAt:160000});
    expect(resumed.elementalField!.occupants[s.id]).toMatchObject({enteredAt:entered+100000,statusExpiresAt:160000});
    expect(resumed.groundPlacements![0]).toMatchObject({placedAt:100000,expiresAt:120000,battleStartedAt:100000});
    expect(Object.values(resumed.groundPlacements![0].cellExpiresAt!)).toEqual(Array(15).fill(120000));
  });
  it('records an entry at the actual integer-ms cell crossing, not the250ms polling boundary',()=>{
    const {s,c}=setup(); placeSageField(s,c,c.skills.sa_volcano,1,0,BATTLE_HERO);
    const end=advanceState(s,c,250);
    expect(end.battle).toBeNull();
    expect(end.elementalField?.occupants[s.id]?.enteredAt).toBe(75);
    expect(end.elementalField?.occupants[s.id]?.statusExpiresAt).toBe(60075);
  });
  it('observes entering and leaving the whole field between two polls with exactly one entry RNG draw',()=>{
    const {s,c}=setup(true); placeSageField(s,c,c.skills.sa_volcano,1,0,BATTLE_HERO);
    const expected=structuredClone(s); random(expected);
    const end=advanceState(s,c,250);
    expect(end.elementalField?.occupants[s.id]).toBeUndefined();
    expect(end.rngState).toBe(expected.rngState);
  });
  it('resolves a cast at125ms and applies its entry status before window-end movement',()=>{
    const {s,c}=setup(); s.inventory.push({uid:'yellow',itemId:715,quantity:1,refine:0,cards:[],favorite:false});
    s.supportCast={skillId:'sa_volcano',level:1,startedAt:0,endsAt:125,position:BATTLE_HERO,
      sceneKey:classicGroundSceneKey(s),actionId:'idle-field'};
    const end=advanceState(s,c,250);
    expect(end.elementalField?.placedAt).toBe(125);
    expect(end.elementalField?.occupants[s.id]?.enteredAt).toBe(125);
    expect(end.elementalField?.expiresAt).toBe(60125);
  });
  it('clears expired town fields even when full resources would otherwise fast-forward offline time',()=>{
    const {s,c}=setup(); s.status='town'; delete s.fieldHero;
    s.hp=1000; s.sp=100;
    placeSageField(s,c,c.skills.sa_volcano,1,0,BATTLE_HERO); s.elementalField!.expiresAt=100;
    const end=advanceState(s,c,1000);
    expect(end.elementalField).toBeUndefined(); expect(end.lastSimulatedAt).toBe(1000);
  });
  it('keeps whole versus segmented no-battle replay identical including RNG and entry timestamps',()=>{
    const {s,c}=setup(); placeSageField(s,c,c.skills.sa_volcano,1,0,BATTLE_HERO);
    const whole=advanceState(s,c,1000);
    let pieces=s; for(let at=250;at<=1000;at+=250) pieces=advanceState(pieces,c,at);
    expect(pieces).toEqual(whole);
  });
});
