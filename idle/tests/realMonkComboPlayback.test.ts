import {afterEach,expect,it,vi} from 'vitest';
import raw from '../content/catalog.json';
import type {Catalog} from '../shared/types';
import {loadActor,getActorPose,getCombatActorAction} from '../web/assets/renderer';
import {weaponAttackAction} from '../web/assets/weapon';
const catalog=raw as unknown as Catalog;
afterEach(()=>vi.unstubAllGlobals());
it.skipIf(!process.env.IDLE_ASSET_ORIGIN)('uses original Monk and Champion combo frames in all directions',async()=>{
 const origin=process.env.IDLE_ASSET_ORIGIN!.replace(/\/+$/,'').replace(/\/assets$/,'');
 const remote=globalThis.fetch.bind(globalThis);
 vi.stubGlobal('fetch',(path:string|URL|Request,init?:RequestInit)=>remote(origin+String(path),init));
 const slices=[['MO_TRIPLEATTACK',5,4],['MO_CHAINCOMBO',9,4],['MO_COMBOFINISH',13,2],
 ['CH_PALMSTRIKE',13,2],['CH_TIGERFIST',9,4],['CH_CHAINCRUSH',5,8],['MO_EXTREMITYFIST',13,2]] as const;
 let cases=0,directions=0;
 for(const job of ['monk','champion'])for(const gender of ['male','female'] as const){
  const klass=catalog.classes[job];
  for(const weapon of [undefined,...klass.weapons]){
   const actor=await loadActor(klass.sprite[gender],weapon?{type:weapon,job,gender}:undefined,undefined,{job,gender});
   expect(actor.fallback).toBe(false);expect(actor.error).toBeUndefined();
   for(const [source,start,length] of slices){
    const action=getCombatActorAction('skill',source);cases++;
    for(let direction=0;direction<8;direction++){
     directions++;
     const base=weapon?weaponAttackAction({type:weapon,job,gender}):40;
     const frames=actor.body!.action.actions[base+direction].frames;
     const available=frames.length>=start+length;
     const first=weapon||!available?0:start, count=weapon||!available?frames.length:length;
     expect(frames.length).toBeGreaterThanOrEqual(first+count);
     for(const elapsed of [0,299,599,1200]){
      const frame=frames[first+Math.min(count-1,Math.floor(elapsed/600*count))];
      const images=new Set(frame.layers.filter(l=>l.index>=0).map(l=>actor.body!.sprite.frames[l.index+(l.type===1?actor.body!.sprite.indexedCount:0)]));
      const pose=getActorPose(actor,action,elapsed,direction,600);
      expect(pose.some(l=>images.has(l.image)),`${job}/${gender}/${weapon??'unarmed'}/${source}/${direction}/${elapsed}`).toBe(true);
      expect(pose.every(l=>[l.x,l.y,l.scaleX,l.scaleY,l.rotation].every(Number.isFinite))).toBe(true);
     }
    }
   }
  }
 }
 expect(cases).toBe(84);expect(directions).toBe(672);
 console.log(JSON.stringify({monkComboCases:cases,directions}));
},600000);
