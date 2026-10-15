import type { BattleEnemy,Catalog,GameState,MonsterStatusSkill } from '../shared/types.js';
import { event,random } from './state.js';
import { battleHeroAt, enemyPositionAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { applyPlayerDisease } from './playerStatuses.js';
import {monsterAttackTarget} from './priestSoloControl.js';
export function tryMonsterStatusSkill(s:GameState,c:Catalog,enemy:BattleEnemy,at:number):boolean {
  if(monsterAttackTarget(s,enemy)!==s.id)return false;
  const skills=c.monsters[enemy.monsterId].npcStatusSkills;if(!skills?.length) return false;
  const runtime=enemy.npcCombat??={firstAttackDone:false,readyAt:{}};
  const monster=c.monsters[enemy.monsterId], distance=playerBattleDistance(battleHeroAt(s,at),enemyPositionAt(enemy,at));
  const inBasicRange=distance<=(monster.attackRange??1)+1e-9;
  if(!runtime.firstAttackDone&&!skills.some(skill=>skill.damageType==='magic')){runtime.firstAttackDone=true;return false;}
  if(runtime.cast||(enemy.statuses?.SC_SILENCE?.expiresAt??0)>at||(enemy.statuses?.SC_DC_WINKCHARM?.expiresAt??0)>at) return false;
  const receivedSkillId=runtime.lastReceivedSkillId;
  for(const skill of skills) {
    if(skill.damageType!=='magic'&&!runtime.firstAttackDone||
       skill.state==='MSS_BERSERK'&&!inBasicRange||skill.state==='MSS_RUSH'&&inBasicRange||
       skill.damageType!=='magic'&&(runtime.readyAt[skill.skillId]??0)>at||
       (runtime.lastUsedAt?.[skill.skillId]??-Infinity)+skill.delayMs>at||
       s.hp<=0||enemy.hp<=0||enemy.hostile===false||distance>skill.range) continue;
    // Hercules mob.c rolls Rate before evaluating event-specific cast
    // conditions; even an ineligible MSC_SKILLUSED row consumes this draw.
    if(Math.floor(random(s)*10000)>skill.rate) continue;
    if(skill.condition==='MSC_SKILLUSED'&&(receivedSkillId===undefined||skill.conditionData!==0&&skill.conditionData!==receivedSkillId)) continue;
    if(skill.condition==='MSC_SKILLUSED') delete runtime.lastReceivedSkillId;
    (runtime.lastUsedAt??={})[skill.skillId]=at;
    runtime.readyAt[skill.skillId]=at+skill.delayMs;
    const actionId=`action-${enemy.id}-${at}-${s.nextEventId}`;
    const basicReadyAt=at+Math.min(4000,Math.max(20,c.monsters[enemy.monsterId].attackDelay));
    const castReadyAt=Math.max(at+skill.castTimeMs,basicReadyAt);
    runtime.cast={baseSp:skill.baseSp??0,sourceRowIndex:skill.sourceRowIndex,sourcePosition:{...enemyPositionAt(enemy,at)},clockOwnership:{attackReadyAt:castReadyAt,previousAttackReadyAt:basicReadyAt},skillId:skill.skillId,level:skill.level,targetActorId:s.id,startedAt:at,endsAt:at+skill.castTimeMs,areaId:s.areaId,actionId};
    enemy.enemyNextAttackAt=castReadyAt;
    const attackMotion = Math.min(2000, Math.max(10,
      c.monsters[enemy.monsterId].attackMotionMs ?? c.monsters[enemy.monsterId].attackDelay / 2));
    const label = Object.values(c.skills).find(candidate => candidate.sourceName === skill.sourceName && candidate.herculesId === skill.skillId)?.name ?? skill.sourceName;
    event(s,at,skill.castTimeMs?'cast':'skill',skill.damageType==='magic'?label:skill.sourceName,undefined,'player',{skillId:skill.sourceName.toLowerCase(),skillLevel:skill.level,castMs:skill.castTimeMs,enemyId:enemy.id,monsterId:enemy.monsterId,sourceActorId:enemy.id,targetActorId:s.id,actionId,actorAction:skill.damageType==='magic'?'skill':skill.castTimeMs?'none':'attack',actionStartedAt:at,actionMotionMs:skill.damageType==='magic'?(skill.castTimeMs||attackMotion):skill.castTimeMs?0:attackMotion,actionSourcePosition:{...enemyPositionAt(enemy,at)}});
    return true;
  }
  if(receivedSkillId!==undefined) delete runtime.lastReceivedSkillId;
  return false;
}
export function takeMonsterStatusCast(s:GameState,c:Catalog,enemy:BattleEnemy,at:number):MonsterStatusSkill|undefined {
  const cast=enemy.npcCombat?.cast;if(!cast||cast.endsAt>at) return;
  delete enemy.npcCombat!.cast;
  const skill=c.monsters[enemy.monsterId].npcStatusSkills?.find(skill=>skill.skillId===cast.skillId&&(cast.sourceRowIndex===undefined||skill.sourceRowIndex===cast.sourceRowIndex));
  if(!skill||cast.targetActorId!==s.id||cast.areaId!==s.areaId||s.hp<=0||enemy.hp<=0||enemy.hostile===false||enemy.fieldSlot!==undefined&&!enemy.engaged||playerBattleDistance(battleHeroAt(s,at),enemyPositionAt(enemy,at))>skill.range) return;
  return skill;
}
export function applyMonsterStatusEffect(s:GameState,c:Catalog,enemy:BattleEnemy,skill:MonsterStatusSkill,at:number,actionId?:string) {
  if(!skill.status||skill.durationMs===undefined)return false;
  return applyPlayerDisease(s,c,skill.status,skill.level,skill.durationMs,(50+10*skill.level)*100,c.monsters[enemy.monsterId].level,at,{sourceActorId:enemy.id,sourceMonsterId:enemy.monsterId,sourceSkillId:skill.skillId,sourceActionId:actionId});
}
export function interruptMonsterStatusCast(s:GameState,c:Catalog,enemy:BattleEnemy,at:number,damage:number) {
  const cast=enemy.npcCombat?.cast;
  if(!cast||damage<=0||!c.monsters[enemy.monsterId].npcStatusSkills?.find(skill=>skill.skillId===cast.skillId&&(cast.sourceRowIndex===undefined||skill.sourceRowIndex===cast.sourceRowIndex))?.cancelable) return;
  releaseNpcCastClock(enemy,cast,at);
  delete enemy.npcCombat!.cast;
  const skill=c.monsters[enemy.monsterId].npcStatusSkills?.find(skill=>skill.skillId===cast.skillId&&(cast.sourceRowIndex===undefined||skill.sourceRowIndex===cast.sourceRowIndex));
  event(s,at,'cast-interrupted','Conjuração do monstro interrompida.',undefined,'enemy',{sourceActorId:enemy.id,targetActorId:s.id,enemyId:enemy.id,monsterId:enemy.monsterId,skillId:skill?.sourceName.toLowerCase(),skillLevel:cast.level,actionId:cast.actionId,actorAction:'none'});
}
function releaseNpcCastClock(enemy:BattleEnemy,cast:NonNullable<NonNullable<BattleEnemy['npcCombat']>['cast']>,at:number) {
  const ownership=cast.clockOwnership;
  if(ownership&&enemy.enemyNextAttackAt===ownership.attackReadyAt)
    enemy.enemyNextAttackAt=Math.max(at,ownership.previousAttackReadyAt);
}
export function cancelInvalidMonsterStatusCasts(s:GameState,at:number) {
  for(const enemy of new Set([...(s.battle?.enemies??[]),...(s.fieldPopulation?.enemies??[])])) {
    const cast=enemy.npcCombat?.cast;
    if(cast&&(s.hp<=0||enemy.hp<=0||enemy.hostile===false||enemy.fieldSlot!==undefined&&!enemy.engaged||cast.areaId!==s.areaId||!['hunting','challenge'].includes(s.status))) {
      releaseNpcCastClock(enemy,cast,at);
      delete enemy.npcCombat!.cast;
    }
  }
}
