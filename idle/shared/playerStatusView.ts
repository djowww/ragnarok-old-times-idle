import type { GameEvent, GameState, BattleEnemy } from './types.js';
const labels:Record<string,string>={SC_POISON:'Veneno',SC_DPOISON:'Veneno Mortal',SC_BLIND:'Cegueira'};
/** Persisted status and source cue are deliberately distinct from timer termination. */
export function playerStatusCues(s:GameState,at:number) {
  const time=s.status==='paused'?s.pausedAt??s.lastSimulatedAt:at;
  return Object.entries(s.playerStatuses??{}).flatMap(([kind,status])=>{
    if(!status||!labels[kind]||status.startsAt>time) return [];
    const expiresAt=status.nextTickAt===undefined?status.expiresAt:status.nextTickAt+Math.max(0,(status.remainingTicks??1)-1)*1000;
    if(expiresAt<=time||status.remainingTicks===0)return [];
    return [{kind,label:labels[kind],expiresAt,sourceExpiresAt:status.expiresAt,sourceActorId:status.sourceActorId,remainingMs:expiresAt-time}];
  });
}
export const isNpcStatusAction=(event:GameEvent,heroId:string)=> ['npc_poison','npc_blindattack'].includes(event.skillId??'')&&!!event.sourceActorId&&event.sourceActorId!==heroId&&['cast','skill','damage','dodge'].includes(event.kind);
export function npcStatusCastProgress(enemy:BattleEnemy,heroId:string,areaId:string|null,at:number) {
  const cast=enemy.npcCombat?.cast;
  if(!cast||enemy.hp<=0||cast.targetActorId!==heroId||cast.areaId!==areaId||at<cast.startedAt||at>=cast.endsAt)return;
  return (at-cast.startedAt)/Math.max(1,cast.endsAt-cast.startedAt);
}
