import type { SpriteAsset } from '../../shared/types';
import {mapGroundHeight,projectBattlePoint,sceneGroundPoint,type MapProjection,type FieldMapOrigin,type WorldPoint} from './mapProjection';
const HUNTER:SpriteAsset={spr:'data/sprite/이팩트/매.spr',act:'data/sprite/이팩트/매.act'};
const SNIPER:SpriteAsset={spr:'data/sprite/이팩트/매2.spr',act:'data/sprite/이팩트/매2.act'};
export function falconAsset(job:string):SpriteAsset|undefined{
  return job==='hunter'?HUNTER:job==='sniper'?SNIPER:undefined;
}
export interface FalconFlightCue { id:string; at:number; destination:WorldPoint; }
type Route={from:WorldPoint;to:WorldPoint;target:WorldPoint;start:number;end:number;speed:number;attack:boolean;};
const distance=(a:WorldPoint,b:WorldPoint)=>Math.max(Math.abs(a[0]-b[0]),Math.abs(a[2]-b[2]));
/** Cosmetic roBrowser follow/overshoot, independent of server damage and player animation. */
export class FalconPresentation {
  private position:WorldPoint|null=null;
  private route:Route|undefined;
  private returnAt:number|undefined;
  private checkedAt=-Infinity;
  private seen=new Set<string>();
  reset():void{this.position=null;this.route=undefined;this.returnAt=undefined;this.checkedAt=-Infinity;this.seen.clear();}
  private sample(at:number):WorldPoint{
    if(!this.route)return this.position!;
    const t=Math.max(0,Math.min(1,(at-this.route.start)/Math.max(1,this.route.end-this.route.start)));
    return this.route.from.map((n,i)=>n+(this.route!.to[i]-n)*t) as WorldPoint;
  }
  private move(to:WorldPoint,at:number,speed:number,attack:boolean){
    const from=[...this.position!] as WorldPoint;
    const length=distance(from,to),fraction=!attack&&length>1?(length-1)/length:1;
    const endpoint=from.map((n,i)=>n+(to[i]-n)*fraction) as WorldPoint;
    this.route={from,to:endpoint,target:[...to] as WorldPoint,start:at,end:at+distance(from,endpoint)*speed,speed,attack};
  }
  frame(owner:WorldPoint,at:number,walkingSpeed:number,cues:readonly FalconFlightCue[]=[]):{
    world:WorldPoint;destination:WorldPoint;action:0|8;speed:number;elapsed:number;
  }{
    this.position??=[...owner] as WorldPoint;
    this.position=this.sample(at);
    for(const cue of [...cues].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))){
      if(this.seen.has(cue.id)||cue.at>at)continue;
      this.seen.add(cue.id);if(this.seen.size>64)this.seen.delete(this.seen.values().next().value!);
      if(at-cue.at>2000)continue;
      this.position=this.sample(cue.at);
      const to=[...cue.destination] as WorldPoint;
      to[0]+=5*Math.sign(to[0]-this.position[0]);to[2]+=5*Math.sign(to[2]-this.position[2]);
      this.move(to,cue.at,35,true);this.returnAt=this.route!.end+432;
      this.position=this.sample(at);
    }
    if(this.returnAt!==undefined&&at>=this.returnAt){
      const returnAt=this.returnAt;this.position=this.sample(returnAt);
      this.move(owner,returnAt,Math.max(walkingSpeed-50,1),false);this.returnAt=undefined;
      this.position=this.sample(at);
    }
    if(this.returnAt===undefined&&at-this.checkedAt>=1000){
      this.checkedAt=at;
      if(distance(this.position,owner)>=2)this.move(owner,at,Math.max(walkingSpeed-50,1),false);
    }
    const route=this.route,moving=!!route&&at<route.end;
    return{world:[...this.position] as WorldPoint,destination:route?.target??owner,
      action:moving&&route?.attack?8:0,speed:route?.speed??150,elapsed:route?Math.max(0,at-route.start):at};
  }
}
interface SecondaryCue {
  id:number;actionId:string;triggerActionId?:string;actorAction?:string;actionAt:number;
  eventAt?:number;start:number;effectStart:number;impact:number;
}
/** Follow a visually delayed basic impact without ever rescheduling its body action. */
export function alignFalconCues(cues:SecondaryCue[]):Map<number,number>{
  const moved=new Map<number,number>();
  for(const cue of cues){
    if(!cue.triggerActionId||cue.triggerActionId===cue.actionId)continue;
    const parent=cues.find(candidate=>candidate.actionId===cue.triggerActionId&&candidate.actorAction!=='none');
    if(!parent)continue;
    const required=parent.impact+Math.max(0,(cue.eventAt??cue.actionAt)-parent.actionAt);
    const delta=Math.max(0,required-cue.effectStart);if(!delta)continue;
    cue.start+=delta;cue.effectStart+=delta;cue.impact+=delta;moved.set(cue.id,delta);
  }
  return moved;
}

export function falconDestinationWorld(camera:MapProjection,battlePoint:{x:number;y:number},scenePoint:{x:number;y:number},anchor:{x:number;y:number},origin:FieldMapOrigin|undefined,persistentField:boolean):WorldPoint{
 return persistentField&&origin?projectBattlePoint(camera,battlePoint,origin):sceneGroundPoint(camera,scenePoint,anchor);
}

/** Native altitude is +5 after GAT scaling; the mesh vertical axis is inverted. */
export function falconAirborneWorld(camera:MapProjection,point:WorldPoint):WorldPoint{
 return [point[0],mapGroundHeight(camera,point[0]-.5,point[2]-.5)-5,point[2]];
}
