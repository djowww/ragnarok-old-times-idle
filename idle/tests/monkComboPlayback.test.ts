import {describe,expect,it} from 'vitest';
import * as render from '../web/assets/renderer';
import type {WeaponAppearance} from '../web/assets/weapon';
function actor(job = 'swordsman', gender: 'male' | 'female' = 'male', type?: WeaponAppearance['type'], count = 12) {
  const image = { width: 1, height: 1, type: 0 as const, rgba: new Uint8ClampedArray([255, 0, 0, 255]) };
  const layer = { x: 0, y: 0, index: 0, mirror: false, color: [255, 255, 255, 255] as [number, number, number, number],
    scaleX: 1, scaleY: 1, rotation: 0, type: 0, width: 0, height: 0 };
  const part = { sprite: { version: 2.1, indexedCount: 1, frames: [image] }, action: { version: 2.5, sounds: [],
    actions: Array.from({ length: 104 }, () => ({ delayMs: 100,
      frames: Array.from({ length: count }, (_, i) => ({ layers: [{ ...layer, x: i }], anchors: [], sound: -1 })) })) } };
  return { kind: 'character' as const, fallback: false, identity: { job, gender }, body: part, head: part,
    weapon: type ? part : undefined, weaponTrail: type ? part : undefined,
    weaponVisual: type ? { type, job, gender } : undefined };
}

// Pinned SkillAction.js d88a3cd4: makeSliceAttackAction frame/length pairs.
const slices = [
 ['MO_TRIPLEATTACK','comboTriple',5,4], ['MO_CHAINCOMBO','comboChain',9,4],
 ['MO_COMBOFINISH','comboFinish',13,2], ['CH_PALMSTRIKE','comboFinish',13,2],
 ['CH_TIGERFIST','comboChain',9,4], ['CH_CHAINCRUSH','comboCrush',5,8],
 ['MO_EXTREMITYFIST','comboFinish',13,2],
] as const;
describe('classic Monk combo playback',()=>{
 it.each(slices)('%s selects its source slice for explicit and automatic attacks',(source,action)=>{
  expect(render.getCombatActorAction('skill',source)).toBe(action);
  expect(render.getCombatActorAction('attack',source)).toBe(action);
  expect(render.getCombatActorAction('none',source)).toBe('idle');
 });
 it.each(slices)('%s synchronizes every direction and holds its final frame',(source,_action,start,length)=>{
  const action=render.getCombatActorAction('skill',source);
  for(const job of ['monk','champion'])for(const gender of ['male','female'] as const)for(let direction=0;direction<8;direction++){
   const value=actor(job,gender,undefined,15);
   expect(render.getActorPose(value,action,0,direction,600).map(l=>l.x)).toEqual([start,start]);
   expect(render.getActorPose(value,action,599,direction,600).map(l=>l.x)).toEqual([start+length-1,start+length-1]);
   expect(render.getActorPose(value,action,1200,direction,600).map(l=>l.x)).toEqual([start+length-1,start+length-1]);
   expect(render.getActorPlaybackDuration(value,action,600,direction)).toBe(600);
  }
 });
 it.each(slices)('%s preserves full equipped attack and falls back safely for short sheets',(source)=>{
  const action=render.getCombatActorAction('skill',source);
  for(const job of ['monk','champion'])for(const gender of ['male','female'] as const)for(let direction=0;direction<8;direction++){
   const value=actor(job,gender,'mace',12);
   expect(render.getActorPose(value,action,0,direction,600).map(l=>l.x)).toEqual([0,0,0,0]);
   expect(render.getActorPose(value,action,599,direction,600).map(l=>l.x)).toEqual([11,11,11,11]);
   expect(render.getActorPose(actor(job,gender,undefined,3),action,599,direction,600)).not.toHaveLength(0);
  }
 });
});
