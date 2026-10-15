/** Selected pre-renewal Priest monster controls, Hercules 410b9738. GPL-3.0-or-later. */
import type {BattleEnemy,Catalog,GameState,Skill,GameEvent} from '../shared/types.js';
import {battleHeroAt,battleDistance,enemyPositionAt,playerBattleDistance} from '../shared/battleSpatial.js';
import {classicStrippedMonster} from './classic.js';
import {effectiveMonsterStatus} from './classicStatuses.js';
import {castControlEligible} from './castControl.js';
import {playerHiddenFrom} from './classicBuffs.js';
import {event,random} from './state.js';
import {recoveryUndeadInput,recoveryTargetsUndead,priestControlStatusResistance} from './priestSoloControlRules.js';
export const priestControlSources=new Set(['PR_STRECOVERY','PR_LEXDIVINA']);
export function priestEffectiveMonster(c:Catalog,enemy:BattleEnemy,at:number) {
 const base=classicStrippedMonster(c.monsters[enemy.monsterId],Object.entries(enemy.statuses??{}).filter(([,v])=>v.expiresAt>at).map(([k])=>k));
 return effectiveMonsterStatus(base,enemy.statuses,at).monster;
}
export function monsterAttackTarget(s:GameState,enemy:BattleEnemy) {
 const runtime=enemy.npcCombat;
 return runtime?.attackTargetActorId??(runtime?.targetReleasedAt===undefined&&enemy.hostile!==false&&(enemy.fieldSlot===undefined||enemy.engaged)?s.id:undefined);
}
export function priestControlEligible(s:GameState,c:Catalog,skill:Skill,level:number,enemy:BattleEnemy,at:number) {
 return priestControlSources.has(skill.sourceName??'')&&castControlEligible(s,c,skill,level,at)&&
   !['SC_STUN','SC_FREEZE','SC_SLEEP','SC_STONE','SC_WHITEIMPRISON'].some(name=>(s.playerStatuses as Record<string,{expiresAt:number}>|undefined)?.[name]?.expiresAt!>at)&&
   enemy.hp>0&&s.battle?.enemies?.some(e=>e.id===enemy.id)&&enemy.startedAt<=at&&
   playerBattleDistance(battleHeroAt(s,at),enemyPositionAt(enemy,at))<=(skill.sourceName==='PR_STRECOVERY'?9:5);
}
export function priestControlTarget(s:GameState,c:Catalog,source:string,at:number) {
 const skill=Object.values(c.skills).find(skill=>skill.sourceName===source),level=skill&&s.learnedSkills[skill.id];
 if(!skill||!level)return;
 return s.battle?.enemies?.find(enemy=>{
  if(!priestControlEligible(s,c,skill,level,enemy,at))return false;
  const monster=priestEffectiveMonster(c,enemy,at);
  if(source==='PR_LEXDIVINA')return !monster.boss&&!!monster.npcStatusSkills?.length&&(enemy.statuses?.SC_SILENCE?.expiresAt??0)<=at;
  if(!recoveryTargetsUndead(monster)||monsterAttackTarget(s,enemy)!==s.id||(enemy.statuses?.SC_BLIND?.expiresAt??0)>at||monster.boss)return false;
  const raw=recoveryUndeadInput(monster.stats);
  return priestControlStatusResistance(monster,'SC_BLIND',raw.chanceBp,raw.durationMs,{level:s.baseLevel}).chanceBp>0;
 });
}
export function releaseMonsterAttackTarget(s:GameState,c:Catalog,enemy:BattleEnemy,at:number,action:Partial<GameEvent>={}) {
 const runtime=enemy.npcCombat??={firstAttackDone:false,readyAt:{}};
 // Existing solo AI has no full attacked_id loop. Only memory still awaiting
 // the source's next minimum think opportunity is retained on release.
 if(!runtime.cast&&runtime.pendingAttackerAt!==undefined&&at-runtime.pendingAttackerAt>=100) {
  delete runtime.pendingAttackerActorId;delete runtime.pendingAttackerAt;
 }
 // mob_unlocktarget's attack/chase path rolls wander only for an active target.
 const active=monsterAttackTarget(s,enemy)!==undefined;
 const point=enemyPositionAt(enemy,at);
 Object.assign(enemy,{approachFrom:{...point},position:{...point},startedAt:at,arrivedAt:at});
 delete enemy.approachPausedAt;delete runtime.attackTargetActorId;
 runtime.targetReleasedAt=at;runtime.nextTargetCheckAt=at+100;
 if(active)runtime.nextWanderAt=at+4000+Math.floor(random(s)*1000);
 runtime.firstAttackDone=false;
 event(s,at,'target-release','O monstro perdeu o alvo de ataque.',undefined,'enemy',{...action,sourceActorId:s.id,targetActorId:enemy.id,enemyId:enemy.id,monsterId:enemy.monsterId,actorAction:'none'});
}
export function rememberMonsterAttacker(s:GameState,enemy:BattleEnemy,damage:number,at:number) {
 if(damage<=0)return;
 const runtime=enemy.npcCombat??={firstAttackDone:false,readyAt:{}};
 runtime.pendingAttackerActorId=s.id;runtime.pendingAttackerAt=at;
}
export function reacquireReleasedMonster(s:GameState,c:Catalog,enemy:BattleEnemy,at:number) {
 const runtime=enemy.npcCombat;
 if(!runtime||runtime.targetReleasedAt===undefined||runtime.attackTargetActorId||at<(runtime.nextTargetCheckAt??Infinity))return;
 if(enemy.hp<=0||s.hp<=0||enemy.hostile===false||enemy.fieldSlot!==undefined&&!enemy.engaged||!['hunting','challenge'].includes(s.status)) {delete runtime.nextTargetCheckAt;return;}
 if(runtime.cast){runtime.nextTargetCheckAt=Math.max(at+100,runtime.cast.endsAt);return;}
 const confusionUntil=enemy.statuses?.SC_CONFUSION?.expiresAt??0;
 if(confusionUntil>at){runtime.nextTargetCheckAt=confusionUntil;return;}
 const monster=priestEffectiveMonster(c,enemy,at),distance=battleDistance(battleHeroAt(s,at),enemyPositionAt(enemy,at));
 const attacked=runtime.pendingAttackerActorId===s.id;delete runtime.pendingAttackerActorId;delete runtime.pendingAttackerAt;
 if(effectiveMonsterStatus(monster,enemy.statuses,at).immobilized) {runtime.nextTargetCheckAt=at+100;return;}
 const visible=!playerHiddenFrom(s,c,monster,at)&&distance<=(monster.chaseRange??12);
 const view=(enemy.statuses?.SC_BLIND?.expiresAt??0)>at?3:monster.viewRange??10;
 if(visible&&(attacked||monster.aggressive&&distance<=view)) {
  runtime.attackTargetActorId=s.id;delete runtime.nextTargetCheckAt;
  event(s,at,'target-reacquire','O monstro adquiriu o alvo de ataque.',undefined,'enemy',{sourceActorId:enemy.id,targetActorId:s.id,enemyId:enemy.id,monsterId:enemy.monsterId,actorAction:'none'});
 }else runtime.nextTargetCheckAt=at+100;
}
export function expirePriestMonsterStatus(s:GameState,c:Catalog,enemy:BattleEnemy,status:string,at:number) {
 const active=enemy.statuses?.[status];
 if(!active||active.expiresAt>at||!priestControlSources.has(c.skills[active.skillId??'']?.sourceName??''))return;
 delete enemy.statuses![status];
 event(s,at,'status-end',status==='SC_BLIND'?'Cegueira encerrada.':'Silêncio encerrado.',undefined,'enemy',{statusName:status,skillId:active.skillId,skillLevel:active.level,sourceActorId:active.sourceActorId,targetActorId:enemy.id,actionId:active.sourceActionId,enemyId:enemy.id,monsterId:enemy.monsterId,actorAction:'none'});
}
export function resolvePriestSoloControl(s:GameState,c:Catalog,skill:Skill,level:number,enemy:BattleEnemy,at:number,action:Partial<GameEvent>={}) {
 if(!priestControlEligible(s,c,skill,level,enemy,at))return false;
 const monster=priestEffectiveMonster(c,enemy,at),recovery=skill.sourceName==='PR_STRECOVERY';
 if(recovery&&(enemy.statuses?.SC_HERMODE?.expiresAt??0)>at)return false;
 const status=recovery?'SC_BLIND':'SC_SILENCE';
 if(!recovery&&(enemy.statuses?.SC_SILENCE?.expiresAt??0)>at) {
  delete enemy.statuses!.SC_SILENCE;
  event(s,at,'status-end','Silêncio removido.',undefined,'enemy',{...action,statusName:status,skillId:skill.id,skillLevel:level,sourceActorId:s.id,targetActorId:enemy.id,enemyId:enemy.id,actorAction:'none'});
  return true;
 }
 if(!recovery||recoveryTargetsUndead(monster)) {
  const raw=recovery?recoveryUndeadInput(monster.stats):{chanceBp:10000,durationMs:skill.statusDurationMs?.[level-1]??60000};
  const resisted=priestControlStatusResistance(monster,status,raw.chanceBp,raw.durationMs,{level:s.baseLevel});
  // Source rolls resistance before rejecting bosses or an existing Blind.
  const rolled=Math.floor(random(s)*10000)<resisted.chanceBp;
  if(rolled&&!monster.boss&&(!recovery||(enemy.statuses?.SC_BLIND?.expiresAt??0)<=at)) {
   (enemy.statuses??={})[status]={startsAt:at,expiresAt:at+resisted.durationMs,level,skillId:skill.id,sourceActorId:s.id,sourceActionId:action.actionId};
   event(s,at,'status-start',recovery?'Cegueira aplicada.':'Silêncio aplicado.',undefined,'enemy',{...action,statusName:status,skillId:skill.id,skillLevel:level,sourceActorId:s.id,targetActorId:enemy.id,enemyId:enemy.id,monsterId:enemy.monsterId,actorAction:'none'});
  }
 }else {
  for(const status of ['SC_FREEZE','SC_STONE','SC_SLEEP','SC_STUN','SC_WHITEIMPRISON','SC_NETHERWORLD'])
   if(enemy.statuses?.[status]) {delete enemy.statuses[status];event(s,at,'status-end','Controle removido.',undefined,'enemy',{statusName:status,sourceActorId:s.id,targetActorId:enemy.id,enemyId:enemy.id,skillId:skill.id,actorAction:'none'});}
 }
 if(recovery)releaseMonsterAttackTarget(s,c,enemy,at,{...action,skillId:skill.id,skillLevel:level});
 return true;
}
