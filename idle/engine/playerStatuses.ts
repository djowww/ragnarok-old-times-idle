import type { Catalog, GameState, PlayerDisease, PlayerStatus, Skill } from '../shared/types.js';
import { playerStatusResistance, poisonTickParameters, poisonTickDecision, deadlyPoisonInitialDamage } from './playerStatusRules.js';
import { derivedStats, classSkills } from './stats.js';
import { classicBuffActive, canActWhileHidden } from './classicBuffs.js';
import { event, random } from './state.js';
export const treatmentSources = new Set(['AL_CURE','TF_DETOXIFY','PR_SLOWPOISON']);
const cureStatuses = ['SC_SILENCE','SC_BLIND','SC_CONFUSION','SC_BITESCAR'] as const;
const statusSourceSkill = (status:PlayerStatus) => status.sourceSkillId===176?'npc_poison':status.sourceSkillId===177?'npc_blindattack':undefined;
export const activePlayerStatus = (s: GameState, kind: keyof NonNullable<GameState['playerStatuses']>, at: number) => {
  const status = s.playerStatuses?.[kind];
  // Poison lifetime is timer/count based; source duration retains its separate cue.
  return !!status && status.startsAt <= at && (status.nextTickAt !== undefined ? (status.remainingTicks ?? 0) > 0 : status.expiresAt > at);
};
export const slowPoisonActive = (s:GameState,c:Catalog,at:number) => Object.entries(s.buffs).some(([id,b])=>c.skills[id]?.sourceName==='PR_SLOWPOISON'&&b.expiresAt>at);
export const playerRecoveryBlocked = (s:GameState,c:Catalog,at:number) => !slowPoisonActive(s,c,at) && (activePlayerStatus(s,'SC_POISON',at)||activePlayerStatus(s,'SC_DPOISON',at));
export function removePlayerStatus(s:GameState,kind:keyof NonNullable<GameState['playerStatuses']>,at:number) {
  const status=s.playerStatuses?.[kind]; if (!status) return;
  delete s.playerStatuses![kind];
  event(s,at,'status-end',kind==='SC_BLIND'?'Cegueira encerrada.':'Veneno encerrado.',undefined,'player',
    {statusName:kind,sourceActorId:status.sourceActorId,targetActorId:s.id,skillId:statusSourceSkill(status),skillLevel:status.level,actionId:status.sourceActionId,actorAction:'none'});
}
export function clearPlayerDiseasesOnDeath(s:GameState,c:Catalog,at:number) {
  for(const kind of Object.keys(s.playerStatuses??{}) as (keyof NonNullable<GameState['playerStatuses']>)[]) removePlayerStatus(s,kind,at);
  for(const id of Object.keys(s.buffs)) if(c.skills[id]?.sourceName==='PR_SLOWPOISON') {
    delete s.buffs[id]; if(s.combatEffects?.buffLevels)delete s.combatEffects.buffLevels[id];
  }
}
export function applyPlayerDisease(s:GameState,c:Catalog,kind:PlayerDisease,level:number,durationMs:number,chanceBp:number,sourceLevel:number,at:number,source:Pick<PlayerStatus,'sourceActorId'|'sourceMonsterId'|'sourceSkillId'|'sourceActionId'>) {
  if(s.hp<=0) return false;
  const d=derivedStats(s,c),a=d.attributes??s.stats;
  const result=playerStatusResistance({kind,vit:a.vit,int:a.int,luk:a.luk,targetLevel:s.baseLevel,sourceLevel,chanceBp,durationMs});
  // Source RNG precedes the existing-status rejection.
  if(Math.floor(random(s)*10000)>=result.chanceBp || activePlayerStatus(s,kind,at)) return false;
  const status:PlayerStatus={startsAt:at,expiresAt:at+result.durationMs,level,sourceDurationMs:result.durationMs,...source};
  if(kind!=='SC_BLIND') {
    const ticks=poisonTickParameters(kind,d.maxHp,result.durationMs);
    Object.assign(status,{nextTickAt:at+ticks.firstTickMs,remainingTicks:ticks.remainingTicks,tickDamage:ticks.damage});
    if(kind==='SC_DPOISON') { const initial=deadlyPoisonInitialDamage(s.hp,d.maxHp); s.hp=initial.hp; }
  }
  (s.playerStatuses??={})[kind]=status;
  event(s,at,'status-start',kind==='SC_BLIND'?'Cegueira':'Veneno',undefined,'player',{statusName:kind,sourceActorId:source.sourceActorId,targetActorId:s.id,enemyId:source.sourceActorId,monsterId:source.sourceMonsterId,skillId:statusSourceSkill(status),skillLevel:level,actionId:source.sourceActionId,actorAction:'none'});
  return true;
}
export function nextPlayerStatusDeadline(s:GameState):number {
  return Math.min(Infinity,...Object.values(s.playerStatuses??{}).filter(Boolean).map(status=>status!.nextTickAt??status!.expiresAt));
}
export function tickPlayerStatuses(s:GameState,c:Catalog,at:number) {
  for(const [name,status] of Object.entries(s.playerStatuses??{})) {
    const kind=name as keyof NonNullable<GameState['playerStatuses']>;
    if(!status) continue;
    if(status.nextTickAt===undefined) { if(status.expiresAt<=at) removePlayerStatus(s,kind,at);continue; }
    while(s.playerStatuses?.[kind]&&status.nextTickAt!<=at) {
      const deadline:number=status.nextTickAt!,before=s.hp;
      const result=poisonTickDecision({kind:kind as 'SC_POISON'|'SC_DPOISON',hp:s.hp,maxHp:derivedStats(s,c).maxHp,damage:status.tickDamage??0,remainingTicks:status.remainingTicks??0,slowPoison:slowPoisonActive(s,c,deadline)});
      s.hp=result.hp;status.remainingTicks=result.remainingTicks;
      if(result.damageApplied>0) event(s,deadline,'damage',kind==='SC_DPOISON'?'Veneno Mortal':'Veneno',result.damageApplied,'player',{statusName:kind,sourceActorId:status.sourceActorId,targetActorId:s.id,skillId:statusSourceSkill(status),skillLevel:status.level,actionId:`status-${s.id}-${kind}-${deadline}`,actorAction:'none',targetHpBefore:before,hitMotionMs:0});
      if(result.end) removePlayerStatus(s,kind,deadline);else status.nextTickAt=deadline+1000;
    }
  }
}
export function statusTreatmentNeeded(s:GameState,c:Catalog,skill:Skill,at:number) {
  if(skill.sourceName==='AL_CURE') return cureStatuses.some(name=>activePlayerStatus(s,name,at));
  const poison=activePlayerStatus(s,'SC_POISON',at)||activePlayerStatus(s,'SC_DPOISON',at);
  return skill.sourceName==='TF_DETOXIFY'?poison:skill.sourceName==='PR_SLOWPOISON'&&poison&&!slowPoisonActive(s,c,at);
}
export function statusTreatmentEligible(s:GameState,c:Catalog,skill:Skill,level:number,at:number) {
  if (['MO_STEELBODY','LK_BERSERK','KN_AUTOCOUNTER'].some(source=>classicBuffActive(s,c,source,at)) || classicBuffActive(s,c,'TF_HIDING',at)&&!canActWhileHidden(skill)) return false;
  return s.hp>0&&skill.implementation!=='unsupported'&&s.learnedSkills[skill.id]===level&&level>0&&level<=skill.maxLevel&&classSkills(c,s.job).includes(skill.id)&&s.rotation.includes(skill.id)&&statusTreatmentNeeded(s,c,skill,at)&&!activePlayerStatus(s,'SC_SILENCE',at);
}
export function resolveStatusTreatment(s:GameState,c:Catalog,skill:Skill,level:number,at:number) {
  if(!statusTreatmentNeeded(s,c,skill,at)) return false;
  if(skill.sourceName==='AL_CURE') for(const name of cureStatuses) removePlayerStatus(s,name,at);
  else if(skill.sourceName==='TF_DETOXIFY') for(const name of ['SC_POISON','SC_DPOISON'] as const) removePlayerStatus(s,name,at);
  else if(skill.sourceName==='PR_SLOWPOISON') {
    // sc_start100 still consumes its application roll.
    random(s);
    s.buffs[skill.id]={startsAt:at,expiresAt:at+10000*level,effects:{}};
    ((s.combatEffects??={}).buffLevels??={})[skill.id]=level;
  } else return false;
  return true;
}
