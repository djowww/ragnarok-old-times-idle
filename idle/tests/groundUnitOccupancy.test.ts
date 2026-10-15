import { describe, expect, it } from 'vitest';
import { captureGroundPlacement, occupiedGroundCells, pruneGroundPlacements } from '../engine/groundUnitOccupancy';
import { sourceGroundShape } from '../engine/groundUnitGeometry';
import { castSetup } from './cast-control-fixture';
import { BATTLE_HERO } from '../shared/battleSpatial';
import type { Catalog, GameState, Skill } from '../shared/types';
import { placeSageField } from '../engine/sageFields';
import { resolveSupportCast } from '../engine/supportCasts';
import { classicGroundSceneKey } from '../engine/classicBuffs';
import { advanceState } from '../engine';
import { tick } from '../engine/encounters';
import raw from '../content/catalog.json';
import { captureSpiderWeb } from '../engine/groundSolo';
const api = { captureGroundPlacement, occupiedGroundCells };
function setup() {
  const x = castSetup(); delete x.e.npcCombat; x.s.rotation = [];
  x.s.status='hunting'; x.s.areaId=x.c.areas[0].id; delete x.s.battle!.challengeId;
  return x;
}
describe('actual ground unit placement and Sage interoperability', () => {
  it('captures the caster direction at placement and keeps the footprint fixed as the caster walks', () => {
    const {s,c} = setup(), center = {x: BATTLE_HERO.x + 2 / 12, y: BATTLE_HERO.y + 2 / 12};
    expect(api.captureGroundPlacement?.(s,c,c.skills.fire_wall,1,0,center,BATTLE_HERO)).toBeTruthy();
    const cells = api.occupiedGroundCells?.(s,c,1)?.cells;
    expect(cells).toEqual(sourceGroundShape('MG_FIREWALL',{x:7,y:9},{x:5,y:7})?.cells);
    s.fieldHero = {areaId:s.areaId!,from:{x:2,y:2},position:{x:2,y:2},startedAt:0,arrivedAt:0,routeIndex:0};
    expect(api.occupiedGroundCells?.(s,c,1)?.cells).toEqual(cells);
  });
  it('clips a new field against a captured FireWall through the real support-cast dispatcher', () => {
    const {s,c} = setup(); Object.assign(c.skills.sa_volcano,{implementation:'supported',groundDurationMs:[60000]});
    s.learnedSkills.sa_volcano = 1; s.sp=100;
    const gem = s.inventory.find(i=>i.itemId===715); if (gem) gem.quantity=1;
    else s.inventory.push({uid:'yellow',itemId:715,quantity:1,refine:0,cards:[],favorite:false});
    api.captureGroundPlacement?.(s,c,c.skills.fire_wall,1,0,BATTLE_HERO,BATTLE_HERO);
    s.supportCast={skillId:'sa_volcano',level:1,startedAt:0,endsAt:1,position:BATTLE_HERO,
      sceneKey:classicGroundSceneKey(s),actionId:'field-cast'};
    const blocked=api.occupiedGroundCells?.(s,c,1)?.cells;
    expect(blocked).toHaveLength(3);
    expect(resolveSupportCast(s,c,1)).toBe(true);
    for (const cell of blocked ?? []) expect(s.elementalField!.cells).not.toContainEqual(cell);
  });
  it('retains source ground duration after a battle is replaced and removes occupancy at expiry', () => {
    const {s,c} = setup(); api.captureGroundPlacement?.(s,c,c.skills.fire_wall,1,0,BATTLE_HERO,BATTLE_HERO);
    s.battle=null;
    expect(api.occupiedGroundCells?.(s,c,4999)?.cells).toHaveLength(3);
    expect(api.occupiedGroundCells?.(s,c,5000)?.cells).toEqual([]);
  });
  it('ignores expired and different-scene groups', () => {
    const {s,c} = setup(); api.captureGroundPlacement?.(s,c,c.skills.fire_wall,1,0,BATTLE_HERO,BATTLE_HERO);
    s.status='town'; s.battle=null;
    expect(api.occupiedGroundCells?.(s,c,1)?.cells).toEqual([]);
  });
  it('does not fabricate a legacy FireWall direction when the old save has no caster snapshot', () => {
    const {s,c} = setup(); s.battle!.groundEffects=[{skillId:'fire_wall',level:1,position:BATTLE_HERO,nextTickAt:20,expiresAt:5000}];
    expect(api.occupiedGroundCells?.(s,c,1)).toMatchObject({unresolved:true});
    expect(api.occupiedGroundCells?.(s,c,5000)).toEqual({cells:[],unresolved:false});
  });
  it('translates a legacy exact Pneuma footprint without inflating it', () => {
    const {s,c} = setup(); s.combatEffects={defensiveGrounds:[{kind:'pneumaGround',sceneKey:'',expiresAt:10000,
      cells:[{x:4,y:6},{x:5,y:6},{x:6,y:6},{x:4,y:7},{x:5,y:7},{x:6,y:7},{x:4,y:8},{x:5,y:8},{x:6,y:8}]}]};
    // Set the source scene key through the same helper used by live defense.
    s.combatEffects!.defensiveGrounds![0].sceneKey=classicGroundSceneKey(s);
    const found=api.occupiedGroundCells?.(s,c,1);
    expect(found?.unresolved).toBe(false); expect(found?.cells).toHaveLength(9);
    expect(found?.cells).toContainEqual({x:5,y:7});
  });
  it('ignores positive-range units and unknown skills instead of treating them as Range0', () => {
    const {s,c}=setup(); c.skills.as_venomdust={...c.skills.fire_wall,id:'as_venomdust',sourceName:'AS_VENOMDUST'};
    expect(api.captureGroundPlacement?.(s,c,c.skills.as_venomdust,1,0,BATTLE_HERO,BATTLE_HERO)).toBeTruthy();
    expect(api.occupiedGroundCells?.(s,c,1)).toEqual({cells:[],unresolved:false});
  });
  it('records a real completed FireWall cast once, links hit depletion, and ignores periodic ticks as new placements', () => {
    const {s,c}=setup(); c.skills.fire_wall.castTimeMs=[0]; s.learnedSkills.fire_wall=1; s.rotation=['fire_wall'];
    const next=advanceState(s,c,1000);
    expect(next.events.some(e=>e.kind==='skill'&&e.skillId==='fire_wall'), JSON.stringify(next.events)).toBe(true);
    const group=next.groundPlacements?.find(g=>g.skillId==='fire_wall');
    expect(group).toBeDefined(); expect(group?.binding).toBe('groundEffect');
    const effect=next.battle?.groundEffects?.find(g=>g.skillId==='fire_wall');
    expect(effect?.groundPlacementId).toBe(group?.id);
    next.rotation=[]; next.battle!.playerNextAttackAt=999999;
    const ticked=structuredClone(next);
    ticked.lastSimulatedAt+=effect!.intervalMs!;
    tick(ticked,c,ticked.lastSimulatedAt,effect!.intervalMs!);
    expect(ticked.lastSimulatedAt).toBeGreaterThan(next.lastSimulatedAt);
    expect(ticked.groundPlacements?.filter(g=>g.skillId==='fire_wall')).toHaveLength(1);
    ticked.battle!.groundEffects![0].remainingHits=0;
    expect(api.occupiedGroundCells?.(ticked,c,ticked.lastSimulatedAt)).toEqual({cells:[],unresolved:false});
    ticked.lastSimulatedAt+=20; tick(ticked,c,ticked.lastSimulatedAt,20);
    ticked.battle=null;
    expect(api.occupiedGroundCells?.(ticked,c,ticked.lastSimulatedAt)).toEqual({cells:[],unresolved:false});
  });
  it('rejects an unresolved legacy footprint before spending cast resources', () => {
    const {s,c}=setup(); Object.assign(c.skills.sa_volcano,{implementation:'supported',groundDurationMs:[60000]});
    s.sp=100; s.learnedSkills.sa_volcano=1;
    s.inventory.push({uid:'yellow',itemId:715,quantity:1,refine:0,cards:[],favorite:false});
    s.battle!.groundEffects=[{skillId:'fire_wall',level:1,position:BATTLE_HERO,nextTickAt:20,expiresAt:5000}];
    s.supportCast={skillId:'sa_volcano',level:1,startedAt:0,endsAt:1,position:BATTLE_HERO,
      sceneKey:classicGroundSceneKey(s),actionId:'field-cast'};
    expect(resolveSupportCast(s,c,1)).toBe(false);
    expect(s.sp).toBe(100); expect(s.inventory.find(i=>i.uid==='yellow')?.quantity).toBe(1);
    expect(s.events.at(-1)?.kind).toBe('cast-failed');
  });
  it('reserves one shared owner slot for a new field, evicting the oldest group before overlap clipping', () => {
    const {s,c}=setup();
    const first=api.captureGroundPlacement?.(s,c,c.skills.fire_wall,1,0,BATTLE_HERO,BATTLE_HERO) as {id:string};
    for(let at=1;at<=24;at++) api.captureGroundPlacement?.(s,c,c.skills.fire_wall,1,at,{x:3+at/12,y:3},BATTLE_HERO);
    expect(s.groundPlacements).toHaveLength(25);
    expect(placeSageField(s,c,c.skills.sa_volcano,1,25,BATTLE_HERO)).toBe(true);
    expect(s.groundPlacements).toHaveLength(24);
    expect(s.groundPlacements?.some(g=>g.id===first.id)).toBe(false);
    expect(s.elementalField?.cells).toContainEqual({x:5,y:7});
  });
  it('a later ground group can evict an older Deluge without losing damage or retaining excess maxHP', () => {
    const {s,c,e}=setup(); c.items[2301].defenseElement='water'; c.monsters[e.monsterId].element='water';
    e.maxHp=e.hp=100;
    placeSageField(s,c,c.skills.sa_deluge,5,0,BATTLE_HERO); s.hp=1010; e.hp=110;
    for(let at=1;at<=25;at++) api.captureGroundPlacement?.(s,c,c.skills.fire_wall,1,at,{x:3+at/12,y:3},BATTLE_HERO);
    expect(s.elementalField).toBeUndefined(); expect(s.hp).toBe(1000);
    expect(e.maxHp).toBe(100); expect(e.hp).toBe(100); expect(e.elementalFieldBaseMaxHp).toBeUndefined();
    expect(s.groundPlacements).toHaveLength(25);
  });
  it('retains partial unit removal when the current battle is replaced', () => {
    const {s,c}=setup(); c.skills.dc_dontforgetme=structuredClone((raw as unknown as Catalog).skills.dc_dontforgetme);
    const group=captureGroundPlacement(s,c,c.skills.dc_dontforgetme,1,0,BATTLE_HERO,BATTLE_HERO)!;
    group.binding='skillUnit'; group.battleStartedAt=s.battle!.startedAt;
    s.battle!.skillUnits=[{id:'song',groundPlacementId:group.id,skillId:'dc_dontforgetme',level:1,
      position:BATTLE_HERO,placedAt:0,nextTickAt:3000,expiresAt:180000,
      cells:group.cells.filter(p=>p.x!==5||p.y!==7).map(p=>({x:(p.x+.5)/12,y:(p.y+.5)/12}))}];
    expect(occupiedGroundCells(s,c,1).cells).toHaveLength(48);
    pruneGroundPlacements(s,1); s.battle=null;
    expect(occupiedGroundCells(s,c,1).cells).toHaveLength(48);
    expect(occupiedGroundCells(s,c,1).cells).not.toContainEqual({x:5,y:7});
  });
  it('evicting a captured web releases its paired monster status', () => {
    const {s,c,e}=setup(); c.skills.pf_spiderweb=structuredClone((raw as unknown as Catalog).skills.pf_spiderweb);
    const group=captureGroundPlacement(s,c,c.skills.pf_spiderweb,1,0,BATTLE_HERO,BATTLE_HERO)!;
    group.binding='skillUnit'; group.battleStartedAt=s.battle!.startedAt;
    s.battle!.skillUnits=[{id:'web',groundPlacementId:group.id,skillId:'pf_spiderweb',level:1,
      position:BATTLE_HERO,placedAt:0,nextTickAt:8000,expiresAt:8000,cells:[{x:5.5/12,y:7.5/12}],capturedEnemyId:e.id}];
    (e.statuses??={}).SC_SPIDERWEB=captureSpiderWeb(undefined,'web',0);
    for(let at=1;at<=25;at++) captureGroundPlacement(s,c,c.skills.fire_wall,1,at,{x:3+at/12,y:3},BATTLE_HERO);
    expect(e.statuses?.SC_SPIDERWEB).toBeUndefined();
  });
  it('breaks equal-time slot eviction ties by allocation order', () => {
    const {s,c}=setup(); s.nextEventId=10;
    placeSageField(s,c,c.skills.sa_volcano,1,0,BATTLE_HERO);
    s.nextEventId=11;
    captureGroundPlacement(s,c,c.skills.fire_wall,1,0,{x:3,y:3},BATTLE_HERO);
    for(let at=1;at<=23;at++) captureGroundPlacement(s,c,c.skills.fire_wall,1,at,{x:3+at/12,y:3},BATTLE_HERO);
    captureGroundPlacement(s,c,c.skills.fire_wall,1,24,{x:5,y:3},BATTLE_HERO);
    expect(s.elementalField).toBeUndefined();
    expect(s.groundPlacements).toHaveLength(25);
  });
  it('counts live legacy positive-range groups in the owner capacity without making them blockers', () => {
    const {s,c}=setup(); c.skills.lord_of_vermilion=structuredClone((raw as unknown as Catalog).skills.lord_of_vermilion);
    s.battle!.groundEffects=Array.from({length:25},(_,index)=>({skillId:'lord_of_vermilion',level:1,
      position:{x:3,y:3},nextTickAt:1000,expiresAt:6000+index}));
    const first=s.battle!.groundEffects[0];
    expect(placeSageField(s,c,c.skills.sa_volcano,1,1,BATTLE_HERO)).toBe(true);
    expect(s.battle!.groundEffects).toHaveLength(24);
    expect(s.battle!.groundEffects).not.toContain(first);
    expect(s.elementalField?.cells).toHaveLength(49);
  });
  it('counts a just-completed real cast once when filling the25th owner slot', () => {
    const {s,c}=setup(); s.rotation=['fire_wall']; s.learnedSkills.fire_wall=1; c.skills.fire_wall.castTimeMs=[0];
    for(let at=0;at<24;at++) captureGroundPlacement(s,c,c.skills.fire_wall,1,at,{x:3+at/12,y:3},BATTLE_HERO);
    const first=s.groundPlacements![0].id;
    s.battle!.playerNextSkillAt=s.battle!.playerActionReadyAt=250;
    const end=advanceState(s,c,250);
    expect(end.events.some(e=>e.kind==='skill'&&e.skillId==='fire_wall')).toBe(true);
    expect(end.groundPlacements).toHaveLength(25);
    expect(end.groundPlacements?.some(g=>g.id===first)).toBe(true);
  });
  it('shortens a captured web to one second when its last target dies and the battle closes', () => {
    const {s,c,e}=setup(); c.skills.pf_spiderweb=structuredClone((raw as unknown as Catalog).skills.pf_spiderweb);
    // Use the fixture's isolated encounter path rather than creating field spawns.
    s.status='challenge';
    const group=captureGroundPlacement(s,c,c.skills.pf_spiderweb,1,0,e.position,BATTLE_HERO)!;
    group.binding='skillUnit'; group.battleStartedAt=s.battle!.startedAt;
    s.battle!.skillUnits=[{id:'web',groundPlacementId:group.id,skillId:'pf_spiderweb',level:1,
      position:e.position,placedAt:0,nextTickAt:8000,expiresAt:8000,cells:[{x:6.5/12,y:7.5/12}],capturedEnemyId:e.id}];
    (e.statuses??={}).SC_SPIDERWEB=captureSpiderWeb(undefined,'web',0);
    s.rotation=['cold_bolt']; s.learnedSkills.cold_bolt=1; c.skills.cold_bolt.castTimeMs=[0]; e.hp=1;
    s.battle!.playerNextSkillAt=s.battle!.playerActionReadyAt=250;
    const end=advanceState(s,c,250), kill=end.events.find(entry=>entry.kind==='kill');
    expect(kill).toBeDefined(); expect(end.battle).toBeNull();
    expect(end.groundPlacements?.find(entry=>entry.id===group.id)?.expiresAt).toBe(kill!.at+1000);
    expect(occupiedGroundCells(end,c,kill!.at+1000).cells).toEqual([]);
  });
});
