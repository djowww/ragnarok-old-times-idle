/** Selected Hercules 410b9738 elemental monster properties. GPL-3.0-or-later. */
import type {BattleEnemy,Catalog,GameState,GameEvent,Skill} from '../shared/types.js';
import {battleHeroAt,enemyPositionAt,playerBattleDistance} from '../shared/battleSpatial.js';
import {castControlEligible} from './castControl.js';
import {effectiveMonsterStatus} from './classicStatuses.js';
import {classSkills} from './stats.js';
import {canPaySkillResources} from './skillResources.js';
import {event,random} from './state.js';
import {conversionSpec,conversionAttemptStages,conversionElementLevel,ELEMENTAL_CONVERSION_DURATION_MS} from './elementalConversionRules.js';
export function elementalConversionEligible(s:GameState,c:Catalog,skill:Skill,level:number,enemy:BattleEnemy,at:number) {
 const current=c.skills[skill.id];
 return !!conversionSpec(skill.sourceName??'')&&current?.sourceName===skill.sourceName&&current.implementation==='supported'&&level===1&&Number.isFinite(at)&&
  castControlEligible(s,c,current,level,at)&&
  !['SC_STUN','SC_FREEZE','SC_SLEEP','SC_STONE','SC_WHITEIMPRISON'].some(name=>(s.playerStatuses as Record<string,{expiresAt:number}>|undefined)?.[name]?.expiresAt!>at)&&
  !!c.monsters[enemy.monsterId]&&enemy.hp>0&&enemy.startedAt<=at&&!!s.battle?.enemies?.some(e=>e===enemy)&&
  playerBattleDistance(battleHeroAt(s,at),enemyPositionAt(enemy,at))<=9;
}
function coefficient(c:Catalog,attack:string,element:string,level:number) {
 return c.elementModifiers?.[attack.toLowerCase()]?.[element.toLowerCase()]?.[level-1]??100;
}
export function elementalConversionTarget(s:GameState,c:Catalog,skill:Skill,at:number) {
 const spec=conversionSpec(skill.sourceName??''),level=s.learnedSkills[skill.id];
 if(!spec||!canPaySkillResources(s,c,skill,level,at))return;
 const tree=classSkills(c,s.job);
 const planned=s.rotation.map(id=>c.skills[id]).filter(attack=>attack&&attack.implementation==='supported'&&tree.includes(attack.id)&&
  Number.isSafeInteger(s.learnedSkills[attack.id])&&s.learnedSkills[attack.id]>0&&s.learnedSkills[attack.id]<=attack.maxLevel&&
  ['physical','magical'].includes(attack.kind)&&attack.element&&attack.element.toLowerCase()!=='weapon'&&canPaySkillResources(s,c,attack,s.learnedSkills[attack.id],at));
 return s.battle?.enemies?.find(enemy=>{
  if(!elementalConversionEligible(s,c,skill,level,enemy,at)||(enemy.statuses?.SC_ARMOR_PROPERTY?.expiresAt??0)>at)return false;
  const monster=effectiveMonsterStatus(c.monsters[enemy.monsterId],enemy.statuses,at).monster;
  if(monster.boss||(enemy.statuses?.SC_FREEZE?.expiresAt??0)>at||(enemy.statuses?.SC_STONE?.expiresAt??0)>at)return false;
  return planned.some(attack=>[1,2,3,4].every(defLevel=>coefficient(c,attack.element!,spec.element,defLevel)>
    coefficient(c,attack.element!,monster.element,monster.elementLevel)));
 });
}
export function resolveElementalConversion(s:GameState,c:Catalog,skill:Skill,level:number,enemy:BattleEnemy,at:number,action:Partial<GameEvent>={}) {
 if(!elementalConversionEligible(s,c,skill,level,enemy,at))return false;
 const spec=conversionSpec(skill.sourceName!)!,existing=enemy.statuses?.SC_ARMOR_PROPERTY;
 const stages=conversionAttemptStages({boss:!!c.monsters[enemy.monsterId].boss,existingLevel:existing&&existing.expiresAt>at?existing.elementLevel:undefined,incomingSkillLevel:level});
 if(stages.action==='reject')return false;
 // status_change_start's guaranteed rate still consumes its default roll.
 random(s);
 if(stages.action==='keep')return true;
 const elementLevel=conversionElementLevel(Math.floor(random(s)*4));
 (enemy.statuses??={}).SC_ARMOR_PROPERTY={level,element:spec.element,elementLevel,startsAt:at,expiresAt:at+ELEMENTAL_CONVERSION_DURATION_MS,
  skillId:skill.id,sourceActorId:s.id,sourceActionId:action.actionId};
 event(s,at,'status-start','Propriedade elemental alterada.',undefined,'enemy',{...action,statusName:'SC_ARMOR_PROPERTY',skillId:skill.id,skillLevel:level,
  sourceActorId:s.id,targetActorId:enemy.id,enemyId:enemy.id,monsterId:enemy.monsterId,actorAction:'none'});
 return true;
}
export function expireElementalConversion(s:GameState,c:Catalog,enemy:BattleEnemy,at:number) {
 const effect=enemy.statuses?.SC_ARMOR_PROPERTY;
 if(!effect||effect.expiresAt>at||!conversionSpec(c.skills[effect.skillId??'']?.sourceName??''))return;
 delete enemy.statuses!.SC_ARMOR_PROPERTY;
 event(s,at,'status-end','Propriedade elemental encerrada.',undefined,'enemy',{statusName:'SC_ARMOR_PROPERTY',skillId:effect.skillId,skillLevel:effect.level,
  sourceActorId:effect.sourceActorId,targetActorId:enemy.id,enemyId:enemy.id,monsterId:enemy.monsterId,actionId:effect.sourceActionId,actorAction:'none'});
}
