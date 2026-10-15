import type {BattleEnemy,Catalog,GameState,Skill} from '../shared/types.js';
import {BATTLE_CELLS_PER_UNIT,battleHeroAt,enemyPositionAt} from '../shared/battleSpatial.js';
import {isFalconEquipped} from './falcon.js';
import {classSkills,derivedStats} from './stats.js';
import {activePlayerStatus} from './playerStatuses.js';
import {classicBuffActive} from './classicBuffs.js';
import {overweightForCombat} from './itemCapacity.js';
import {canPaySkillResources,paySkillResources} from './skillResources.js';
import {activeRuwachConcealment,revealRuwachTarget} from './ruwachRules.js';
import {beginSkillAction,finishSkillAction} from './skillActionClock.js';
import {event} from './state.js';

function currentFieldActors(s:GameState):BattleEnemy[]{
 return s.areaId&&s.fieldPopulation?.areaId===s.areaId&&!s.battle?.challengeId
  ?s.fieldPopulation.enemies:[];
}
/** Solo adaptation: the native seven-by-seven square is centered on the player. */
function coveredActors(s:GameState,at:number):BattleEnemy[]{
 const center=battleHeroAt(s,at),cell=(n:number)=>Math.floor(n*BATTLE_CELLS_PER_UNIT);
 const actors=new Map<string,BattleEnemy>();
 // Combat copies are authoritative after decoding a JSON save.
 for(const enemy of [...currentFieldActors(s),...(s.battle?.enemies??[])])actors.set(enemy.id,enemy);
 return [...actors.values()].filter(enemy=>{
  if(enemy.hp<=0||enemy.startedAt>at)return false;
  const point=enemyPositionAt(enemy,at);
  return Math.abs(cell(point.x)-cell(center.x))<=3&&Math.abs(cell(point.y)-cell(center.y))<=3;
 });
}
export function detectingCanStart(s:GameState,c:Catalog,skill:Skill,level:number,at:number):boolean{
 return skill.sourceName==='HT_DETECTING'&&skill.implementation==='supported'&&
  Number.isSafeInteger(level)&&level>0&&level<=skill.maxLevel&&s.learnedSkills[skill.id]===level&&
  classSkills(c,s.job).includes(skill.id)&&isFalconEquipped(s,c)&&s.hp>0&&
  ['town','hunting','challenge','resting'].includes(s.status)&&!overweightForCombat(s,c)&&
  !s.supportCast&&!s.battle?.cast&&(s.playerCanActAt??0)<=at&&(s.skillReadyAt[skill.id]??0)<=at&&
  !activePlayerStatus(s,'SC_SILENCE',at)&&
  !['MO_STEELBODY','LK_BERSERK','TF_HIDING','AS_CLOAKING','KN_AUTOCOUNTER','NV_TRICKDEAD','ST_CHASEWALK']
   .some(source=>classicBuffActive(s,c,source,at))&&canPaySkillResources(s,c,skill,level,at);
}
export function detectingAfkUseful(s:GameState,at:number):boolean{
 return coveredActors(s,at).some(enemy=>activeRuwachConcealment(enemy.statuses,at).length>0);
}
export function useDetecting(s:GameState,c:Catalog,skill:Skill,level:number,at:number):boolean{
 if(!detectingCanStart(s,c,skill,level,at))return false;
 if(!paySkillResources(s,c,skill,level,at))return false;
 const motion=derivedStats(s,c).attackMotionMs;
 beginSkillAction(s,at,0,motion);finishSkillAction(s,at,0);
 if(s.battle){s.battle.playerNextSkillAt=s.playerCanActAt;s.battle.supportNeedsOffense=true;}
 const actionId=`falcon-detect-${s.id}-${at}-${s.nextEventId}`,point={...battleHeroAt(s,at)};
 event(s,at,'skill',skill.name,undefined,'player',{skillId:skill.id,skillLevel:level,
  sourceActorId:s.id,targetActorId:s.id,actionId,actorAction:'none',actionMotionMs:0,castMs:0,
  actionSourcePosition:point,movementDestination:point,areaId:s.areaId??undefined});
 for(const enemy of coveredActors(s,at)){
  const revealed=revealRuwachTarget(enemy.statuses,at);
  // Commands can arrive between field ticks after JSON has split actor copies.
  const population=currentFieldActors(s).find(actor=>actor.id===enemy.id);
  if(population&&population!==enemy&&population.statuses)
   for(const name of revealed)delete population.statuses[name];
  for(const statusName of revealed)event(s,at,'status-end','Ocultação revelada',undefined,'enemy',{
   skillId:skill.id,skillLevel:level,sourceActorId:s.id,targetActorId:enemy.id,enemyId:enemy.id,
   monsterId:enemy.monsterId,statusName,actionId,actorAction:'none',actionMotionMs:0});
 }
 return true;
}
