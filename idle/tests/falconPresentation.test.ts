import {projectBattlePoint,sceneGroundPoint} from '../web/assets/mapProjection';
import {describe,it,expect} from 'vitest';
import {falconAsset,FalconPresentation,alignFalconCues,falconDestinationWorld,falconAirborneWorld} from '../web/assets/falconPresentation';
describe('original Falcon assets and independent flight',()=>{
 it('uses the verified CP949-decoded resource folder for both classes',()=>{
  expect(falconAsset('hunter')).toEqual({spr:'data/sprite/이팩트/매.spr',act:'data/sprite/이팩트/매.act'});
  expect(falconAsset('sniper')).toEqual({spr:'data/sprite/이팩트/매2.spr',act:'data/sprite/이팩트/매2.act'});expect(falconAsset('archer')).toBeUndefined();
 });
 it('extends the attack five cells past its target and uses walk action8 at35ms per cell',()=>{
  const f=new FalconPresentation();f.frame([0,0,0],0,150);const flight=f.frame([0,0,0],100,150,[{id:'one',at:100,destination:[3,0,0]}]);expect(flight.action).toBe(8);expect(flight.speed).toBe(35);expect(flight.destination[0]).toBe(8);
  const middle=f.frame([0,0,0],240,150);expect(middle.world[0]).toBeGreaterThan(0);expect(middle.world[0]).toBeLessThan(8);
 });
 it('deduplicates multihit/multitarget cues by action identity without restarting flight',()=>{
  const f=new FalconPresentation(),cue={id:'one',at:100,destination:[3,0,0] as [number,number,number]};f.frame([0,0,0],0,150);f.frame([0,0,0],100,150,[cue]);const a=f.frame([0,0,0],200,150,[cue,cue]);const b=f.frame([0,0,0],250,150,[cue]);expect(b.world[0]).toBeGreaterThan(a.world[0]);
 });
 it('returns to the current owner after the source432ms overshoot wait',()=>{
  const f=new FalconPresentation();f.frame([0,0,0],0,150);f.frame([0,0,0],100,150,[{id:'one',at:100,destination:[3,0,0]}]);const held=f.frame([0,0,0],500,150);expect(held.world[0]).toBe(8);const returning=f.frame([0,0,0],900,150);expect(returning.destination[0]).toBe(0);expect(returning.world[0]).toBeLessThan(8);
 });
 it('follows at two-cell distance with source walking speed minus50 and reset discards old routes',()=>{
  const f=new FalconPresentation();f.frame([0,0,0],0,150);const follow=f.frame([4,0,0],1100,150);expect(follow.speed).toBe(100);expect(follow.destination[0]).toBe(4);f.reset();expect(f.frame([20,0,0],1200,150).world[0]).toBe(20);
 });
 it('never replays expired cues after reconnect',()=>{
  const f=new FalconPresentation();const pose=f.frame([0,0,0],10000,150,[{id:'old',at:0,destination:[9,0,0]}]);expect(pose.action).toBe(0);expect(pose.world).toEqual([0,0,0]);
 });
});
describe('secondary Falcon presentation follows its triggering basic impact',()=>{
 it('shifts flight, damage, corpse-associated cue times without shifting the basic action',()=>{
  const parent={id:1,actionId:'swing',actorAction:'attack',actionAt:0,impact:640,start:100,effectStart:100};
  const flight={id:2,actionId:'falcon',triggerActionId:'swing',eventAt:0,actionAt:0,start:100,effectStart:100,impact:100};
  const damage={id:3,actionId:'falcon',triggerActionId:'swing',eventAt:540,actionAt:0,start:100,effectStart:640,impact:640};
  const moved=alignFalconCues([parent,flight,damage]);expect(flight.effectStart).toBe(640);expect(damage.impact).toBe(1180);expect(parent.impact).toBe(640);expect(moved.get(2)).toBe(540);expect(moved.get(3)).toBe(540);expect(alignFalconCues([parent,flight,damage]).size).toBe(0);
 });
});

describe('Falcon following stops at the native one-cell range',()=>{
 it('keeps one cell between the idle companion and its owner after following',()=>{
  const f=new FalconPresentation();f.frame([0,0,0],0,150);f.frame([4,0,0],1100,150);expect(f.frame([4,0,0],1600,150).world[0]).toBe(3);
 });
});

describe('Falcon uses the same coordinate frame as its actual target',()=>{
 const camera:any={focus:[100,0,100]},battle={x:.64,y:.65},scene={x:.6,y:.76},anchor={x:.38,y:.76},origin={x:100,y:100};
 it('uses the legacy challenge projection even when the map has a field origin',()=>{
  expect(falconDestinationWorld(camera,battle,scene,anchor,origin,false)).toEqual(sceneGroundPoint(camera,scene,anchor));
 });
 it('uses authoritative GAT cells for a persistent field population',()=>{
  expect(falconDestinationWorld(camera,battle,scene,anchor,origin,true)).toEqual(projectBattlePoint(camera,battle,origin));
 });
});

describe('Falcon chronological presentation under a late browser poll',()=>{
 it('starts a newly received flight at its historical launch position rather than the future frame position',()=>{
  const f=new FalconPresentation();f.frame([0,0,0],0,150);f.frame([0,0,0],100,150,[{id:'one',at:100,destination:[3,0,0]}]);f.frame([0,0,0],200,150);
  const pose=f.frame([0,0,0],300,150,[{id:'two',at:210,destination:[0,0,0]}]);expect(pose.world[0]).toBeCloseTo(110/35-90/35,8);
 });
});

describe('Falcon altitude in mesh coordinates',()=>{
 it('converts native terrain plus five to mesh terrain minus five',()=>{
  const camera:any={focus:[156.5,.2,196.5]},point:[number,number,number]=[156.5,.2,196.5];
  const airborne=falconAirborneWorld(camera,point);expect(airborne).toEqual([156.5,-4.8,196.5]);
  // The native bridge maps mesh Y to negative native Z.
  expect(-airborne[1]).toBeCloseTo(-point[1]+5,10);expect(point).toEqual([156.5,.2,196.5]);
 });
 it('samples the terrain at the current flight cell instead of carrying owner height',()=>{
  const camera:any={focus:[0,99,0],ground:{x:0,y:0,size:2,heights:[1,2,3,4]}};
  expect(falconAirborneWorld(camera,[1,99,1])).toEqual([1,-2.5,1]);
 });
});
