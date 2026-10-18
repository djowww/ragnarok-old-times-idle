import {describe,expect,it} from 'vitest';
import raw from '../content/catalog.json';
import {getActorPose,getActorPlaybackDuration,getCombatActorAction,type ActorAction} from '../web/assets/renderer';
import {specialSkillGroups} from './classicSpecialSkillExpectations';
const cases=Object.entries(specialSkillGroups).flatMap(([action,group])=>group.sources.map(source=>({source,action,base:group.base})));
function actor(){
 const part=(equipment=false)=>({sprite:{version:2.1,indexedCount:1,frames:[{width:1,height:1,type:0 as const,rgba:new Uint8ClampedArray([255,0,0,255])}]},action:{version:2.5,sounds:[],actions:Array.from({length:104},(_,index)=>({delayMs:100,frames:Array.from({length:3},(_,frame)=>({anchors:[],sound:-1,layers:[{index:equipment&&[3,5].includes(Math.floor(index/8))?-1:0,x:index*10+frame,y:0,type:0,mirror:false,color:[255,255,255,255] as [number,number,number,number],scaleX:1,scaleY:1,rotation:0,width:0,height:0}]}))}))}});
 return {kind:'character' as const,fallback:false,body:part(),head:part(),weapon:part(true),weaponVisual:{type:'sword' as const,job:'swordsman',gender:'male' as const}};
}
describe('classic fixed skill ACT groups',()=>{
 it.each(cases)('$source selects $action',({source,action})=>{
  expect(Object.values(raw.skills).find(skill=>skill.sourceName===source)?.implementation).toBe('supported');
  expect(getCombatActorAction('skill',source)).toBe(action);
  expect(getCombatActorAction('none',source)).toBe('idle');
 });
 it.each(Object.entries(specialSkillGroups))('%s keeps its group, facing and one-shot frame clock',(name,group)=>{
  const value=actor(),action=name as ActorAction;
  for(let direction=0;direction<8;direction++){
   expect(getActorPlaybackDuration(value,action,600,direction)).toBe(600);
   for(const [time,frame] of [[0,0],[299,1],[599,2],[1000,2]]){
    const pose=getActorPose(value,action,time,direction,600);
    expect(pose[0]?.x).toBe((group.base+direction)*10+frame);
    expect(pose[1]?.x).toBe(pose[0]?.x);
    expect(pose.length).toBe(['attack1','pickup'].includes(name)?2:3);
   }
  }
 });
 it('does not interpret arbitrary source names as an action',()=>{
  expect(getCombatActorAction('skill','__proto__')).toBe('skill');
  expect(getCombatActorAction('skill','MG_FIREBOLT')).toBe('skill');
 });
});
