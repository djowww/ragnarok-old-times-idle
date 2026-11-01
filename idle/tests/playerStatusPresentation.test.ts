import { describe,it,expect } from 'vitest';
import { createInitialState } from '../engine';
import { fixture } from './engine-fixture';
import { playerStatusCues, isNpcStatusAction, npcStatusCastProgress } from '../shared/playerStatusView';
import { hasSceneAction } from '../web/assets/groundTraps';
import { drawSkillEffect } from '../web/assets/sceneEffects';
describe('real disease presentation',()=>{
  it('shows only persisted active diseases with source and actual counter ending, freezes paused time',()=>{
    const s=createInitialState(fixture(),0);expect(playerStatusCues(s,0)).toEqual([]);
    s.playerStatuses={SC_POISON:{startsAt:0,expiresAt:2500,sourceDurationMs:2500,nextTickAt:1000,remainingTicks:2,tickDamage:18,level:1,sourceActorId:'tarou'}};
    expect(playerStatusCues(s,500)).toEqual([{kind:'SC_POISON',label:'Veneno',expiresAt:2000,sourceExpiresAt:2500,sourceActorId:'tarou',remainingMs:1500}]);
    s.status='paused';s.pausedAt=500;expect(playerStatusCues(s,9000)[0].remainingMs).toBe(1500);
    delete s.playerStatuses.SC_POISON;expect(playerStatusCues(s,9000)).toEqual([]);
  });
  it('NPC cast/skill remains source monster and treatment is a real self action',()=>{
    const e={id:1,at:0,kind:'cast',text:'NPC_POISON',skillId:'npc_poison',sourceActorId:'tarou',targetActorId:'hero',actorAction:'skill' as const};
    expect(isNpcStatusAction(e,'hero')).toBe(true);expect(isNpcStatusAction({...e,sourceActorId:'hero'},'hero')).toBe(false);
    expect(hasSceneAction('treatment',true)).toBe(true);expect(hasSceneAction('status-start',true)).toBe(false);
  });
  it('NPC cast bar represents800ms, expires exactly and never represents hero casting',()=>{
    const enemy={id:'tarou',monsterId:1175,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:3000,spawnDirection:0,position:{x:0,y:0},npcCombat:{firstAttackDone:true,readyAt:{176:7000},cast:{skillId:176,level:1,targetActorId:'hero',startedAt:2000,endsAt:2800,areaId:'sewers',actionId:'cast'}}};
    expect(npcStatusCastProgress(enemy,'hero','sewers',2400)).toBe(.5);expect(npcStatusCastProgress(enemy,'hero','sewers',2800)).toBeUndefined();expect(npcStatusCastProgress(enemy,'other','sewers',2400)).toBeUndefined();
  });
  it.each(['AL_CURE','TF_DETOXIFY','PR_SLOWPOISON'])('%s does not invent permanent halo or unverified client art',source=>{
    const calls:string[]=[];
    const ctx=new Proxy({globalAlpha:1},{get:(o,k)=>k in o?o[k as keyof typeof o]:(..._args:unknown[])=>calls.push(String(k)),set:(o,k,v)=>{(o as any)[k]=v;return true;}}) as unknown as CanvasRenderingContext2D;
    drawSkillEffect(ctx,null,{name:source,skillId:source.toLowerCase(),sourceName:source,x:0,y:0,elapsedMs:400,kind:'buff'});
    expect(calls).not.toContain('arc');expect(calls).not.toContain('stroke');
  });
});
