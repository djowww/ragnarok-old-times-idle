import type { BattleEnemy,Catalog,GameState,MonsterStatusSkill } from '../shared/types.js';
import { event,random } from './state.js';
import { battleHeroAt, enemyPositionAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { applyPlayerDisease } from './playerStatuses.js';
import {monsterAttackTarget} from './priestSoloControl.js';
export function tryMonsterStatusSkill(s:GameState,c:Catalog,enemy:BattleEnemy,at:number):boolean {
  if(monsterAttackTarget(s,enemy)!==s.id)return false;
  const skills=c.monsters[enemy.monsterId].npcStatusSkills;if(!skills?.length) return false;
  const runtime=enemy.npcCombat??={firstAttackDone:false,readyAt:{}};
  if(!runtime.firstAttackDone){runtime.firstAttackDone=true;return false;}
  if(runtime.cast||(enemy.statuses?.SC_SILENCE?.expiresAt??0)>at||(enemy.statuses?.SC_DC_WINKCHARM?.expiresAt??0)>at) return false;
  for(const skill of skills) {
    if((runtime.readyAt[skill.skillId]??0)>at||s.hp<=0||enemy.hp<=0||enemy.hostile===false||playerBattleDistance(battleHeroAt(s,at),enemyPositionAt(enemy,at))>skill.range) continue;
    if(Math.floor(random(s)*10000)>skill.rate) continue;
    runtime.readyAt[skill.skillId]=at+skill.delayMs;
    const actionId=`action-${enemy.id}-${at}-${s.nextEventId}`;
    const basicReadyAt=at+Math.min(4000,Math.max(20,c.monsters[enemy.monsterId].attackDelay));
    const castReadyAt=Math.max(at+skill.castTimeMs,basicReadyAt);
    runtime.cast={baseSp:skill.baseSp??0,clockOwnership:{attackReadyAt:castReadyAt,previousAttackReadyAt:basicReadyAt},skillId:skill.skillId,level:skill.level,targetActorId:s.id,startedAt:at,endsAt:at+skill.castTimeMs,areaId:s.areaId,actionId};
    enemy.enemyNextAttackAt=castReadyAt;
    event(s,at,skill.castTimeMs?'cast':'skill',skill.sourceName,undefined,'player',{skillId:skill.sourceName.toLowerCase(),skillLevel:skill.level,castMs:skill.castTimeMs,enemyId:enemy.id,monsterId:enemy.monsterId,sourceActorId:enemy.id,targetActorId:s.id,actionId,actorAction:skill.castTimeMs?'none':'attack',actionStartedAt:at,actionMotionMs:skill.castTimeMs?0:c.monsters[enemy.monsterId].attackMotionMs??c.monsters[enemy.monsterId].attackDelay/2,actionSourcePosition:{...enemyPositionAt(enemy,at)}});
    return true;
  }
  return false;
}
export function takeMonsterStatusCast(s:GameState,c:Catalog,enemy:BattleEnemy,at:number):MonsterStatusSkill|undefined {
  const cast=enemy.npcCombat?.cast;if(!cast||cast.endsAt>at) return;
  delete enemy.npcCombat!.cast;
  const skill=c.monsters[enemy.monsterId].npcStatusSkills?.find(skill=>skill.skillId===cast.skillId);
  if(!skill||cast.targetActorId!==s.id||cast.areaId!==s.areaId||s.hp<=0||enemy.hp<=0||enemy.hostile===false||enemy.fieldSlot!==undefined&&!enemy.engaged||playerBattleDistance(battleHeroAt(s,at),enemyPositionAt(enemy,at))>skill.range) return;
  return skill;
}
export function applyMonsterStatusEffect(s:GameState,c:Catalog,enemy:BattleEnemy,skill:MonsterStatusSkill,at:number,actionId?:string) {
  return applyPlayerDisease(s,c,skill.status,skill.level,skill.durationMs,(50+10*skill.level)*100,c.monsters[enemy.monsterId].level,at,{sourceActorId:enemy.id,sourceMonsterId:enemy.monsterId,sourceSkillId:skill.skillId,sourceActionId:actionId});
}
export function interruptMonsterStatusCast(s:GameState,c:Catalog,enemy:BattleEnemy,at:number,damage:number) {
  const cast=enemy.npcCombat?.cast;
  if(!cast||damage<=0||!c.monsters[enemy.monsterId].npcStatusSkills?.find(skill=>skill.skillId===cast.skillId)?.cancelable) return;
  delete enemy.npcCombat!.cast;
  event(s,at,'cast-interrupted','Conjuração do monstro interrompida.',undefined,'enemy',{sourceActorId:enemy.id,targetActorId:s.id,enemyId:enemy.id,monsterId:enemy.monsterId,skillId:cast.skillId===176?'npc_poison':'npc_blindattack',skillLevel:cast.level,actionId:cast.actionId,actorAction:'none'});
}
export function cancelInvalidMonsterStatusCasts(s:GameState) {
  for(const enemy of new Set([...(s.battle?.enemies??[]),...(s.fieldPopulation?.enemies??[])])) {
    const cast=enemy.npcCombat?.cast;
    if(cast&&(s.hp<=0||enemy.hp<=0||enemy.hostile===false||enemy.fieldSlot!==undefined&&!enemy.engaged||cast.areaId!==s.areaId||!['hunting','challenge'].includes(s.status))) delete enemy.npcCombat!.cast;
  }
}
