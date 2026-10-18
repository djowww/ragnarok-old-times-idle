import {afterEach,expect,it,vi} from 'vitest';
import raw from '../content/catalog.json';
import type {Catalog} from '../shared/types';
import {classSkills} from '../engine/stats';
import {getActorPose,getCombatActorAction,loadActor} from '../web/assets/renderer';
import type {ActorAction} from '../web/assets/renderer';
import {specialSkillGroups} from './classicSpecialSkillExpectations';
const catalog=raw as unknown as Catalog;
afterEach(()=>vi.unstubAllGlobals());
it.skipIf(!process.env.IDLE_ASSET_ORIGIN)('composes classic special skill groups on original client bodies and equipment',async()=>{
 const origin=process.env.IDLE_ASSET_ORIGIN!.replace(/\/+$/,'').replace(/\/assets$/,'');
 const remote=globalThis.fetch.bind(globalThis);
 vi.stubGlobal('fetch',(path:string|URL|Request,init?:RequestInit)=>{
  if(!String(path).startsWith('/assets/'))throw Error('Unexpected non-asset request');
  return remote(origin+String(path),init);
 });
 const counts:Record<string,number>={};let directions=0;
 for(const job of Object.values(catalog.classes)){
  const sources=new Set(classSkills(catalog,job.id).map(id=>catalog.skills[id]?.sourceName));
  const groups=Object.entries(specialSkillGroups).filter(([,group])=>group.sources.some(source=>sources.has(source)));
  if(!groups.length)continue;
  const genders:('male'|'female')[]=job.gender?[job.gender]:['male','female'];
  for(const gender of genders)for(const weapon of [undefined,...job.weapons])for(const mounted of [false,...(job.mountedSprite?[true]:[])]){
   const asset=mounted?job.mountedSprite?.[gender]:job.sprite[gender];if(!asset)continue;
   const actor=await loadActor(asset,weapon?{type:weapon,job:job.id,gender,mounted}:undefined,undefined,{job:job.id,gender});
   expect(actor.fallback,job.id).toBe(false);expect(actor.error,job.id).toBeUndefined();expect(actor.body,job.id).toBeDefined();
   for(const [name,group] of groups){
    const source=group.sources.find(source=>sources.has(source))!;
    const action=getCombatActorAction('skill',source);expect(action).toBe(name);
    counts[name]=(counts[name]??0)+1;
    for(let direction=0;direction<8;direction++){
     const frames=actor.body!.action.actions[group.base+direction]?.frames;
     const label=`${job.id}/${gender}/${weapon??'unarmed'}/${mounted}/${name}/${direction}`;
     expect(frames?.length,label).toBeGreaterThan(0);directions++;
     for(const elapsed of [0,299,599]){
      const frame=frames![Math.min(frames!.length-1,Math.floor(elapsed/600*frames!.length))];
      const bodyImages=new Set(frame.layers.filter(layer=>layer.index>=0).map(layer=>actor.body!.sprite.frames[layer.index+(layer.type===1?actor.body!.sprite.indexedCount:0)]));
      const pose=getActorPose(actor,action as ActorAction,elapsed,direction,600);
      expect(pose.some(layer=>bodyImages.has(layer.image)),label).toBe(true);
      expect(pose.every(layer=>[layer.x,layer.y,layer.scaleX,layer.scaleY,layer.rotation].every(Number.isFinite)),label).toBe(true);
     }
    }
   }
  }
 }
 expect(Object.keys(counts).sort()).toEqual(Object.keys(specialSkillGroups).sort());
 console.log(JSON.stringify({specialSkillActorCases:counts,directions}));
},600000);
