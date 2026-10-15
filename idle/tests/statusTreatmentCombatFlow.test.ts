import { afterEach,describe,it,expect,vi } from 'vitest';
import { createInitialState,advanceState,applyCommand } from '../engine';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { fixture } from './engine-fixture';
import { beginBattle } from '../engine/encounters';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { applyPlayerDisease } from '../engine/playerStatuses';
import * as tools from '../engine/state';
const real=raw as unknown as Catalog;
function setup(source:'AL_CURE'|'TF_DETOXIFY'|'PR_SLOWPOISON') {
  const c=fixture(),id=source.toLowerCase(),job=source==='TF_DETOXIFY'?'thief':'priest';
  c.source=structuredClone(real.source);c.classes[job]={...structuredClone(real.classes[job]),hp:Array(99).fill(1000),sp:Array(99).fill(100),jobBonuses:{}};
  for(const skillId of c.classes[job].skills)c.skills[skillId]=structuredClone(real.skills[skillId]);
  c.skills[id].implementation='supported';
  const s=createInitialState(c,0);s.job=job;s.stats={str:0,agi:0,vit:0,int:0,dex:0,luk:0};s.skillPoints=15;
  const prerequisites=c.skills[id].prerequisitesByClass?.[job]??[];
  for(const req of prerequisites) {c.skills[req.skillId].prerequisitesByClass={[job]:[]};for(let n=0;n<req.level;n++) Object.assign(s,applyCommand(s,c,{type:'learnSkill',skillId:req.skillId},0));}
  Object.assign(s,applyCommand(s,c,{type:'learnSkill',skillId:id},0));
  Object.assign(s,applyCommand(s,c,{type:'setRotation',skillIds:[id]},0));
  s.status='challenge';s.hp=1000;s.sp=100;s.autoPotion={hpThreshold:0,spThreshold:0};
  Object.assign(c.monsters[1002],{hp:10000,attack:[0,0],baseExp:0,jobExp:0,drops:[]});
  beginBattle(s,c,1002,0,'mastering');const e=s.battle!.enemies![0],position={x:BATTLE_HERO.x+1/12,y:BATTLE_HERO.y};
  Object.assign(e,{position,approachFrom:{...position},homePosition:{...position},startedAt:0,arrivedAt:0,enemyNextAttackAt:999999,hostile:false});
  s.battle!.playerNextAttackAt=999999;s.battle!.playerNextSkillAt=s.battle!.playerActionReadyAt=1000;s.battle!.supportNeedsOffense=true;
  return {s,c,id};
}
afterEach(()=>vi.restoreAllMocks());
describe('learned real self treatment dispatcher',()=>{
  it.each(['AL_CURE','TF_DETOXIFY','PR_SLOWPOISON'] as const)('only selects %s with a real disease, bypasses only support offense gate',source=>{
    const {s,c,id}=setup(source);const rng=vi.spyOn(tools,'random').mockReturnValue(.02);
    const healthy=advanceState(s,c,1000);expect(healthy.sp).toBe(100);expect(rng).not.toHaveBeenCalled();
    applyPlayerDisease(s,c,source==='AL_CURE'?'SC_BLIND':'SC_POISON',1,60000,10000,1,0,{});rng.mockClear();
    const end=advanceState(s,c,1000);expect(end.sp).toBe(100-(source==='AL_CURE'?15:source==='TF_DETOXIFY'?10:6));
    expect(end.events.find(e=>e.kind==='treatment')).toMatchObject({skillId:id,targetActorId:s.id,sourceActorId:s.id,actorAction:'skill'});
    if(source==='PR_SLOWPOISON') {expect(end.playerStatuses!.SC_POISON).toBeDefined();expect(end.buffs[id]).toMatchObject({startsAt:1000,expiresAt:11000,effects:{}});expect(rng).toHaveBeenCalledTimes(1);}
    else {expect(Object.keys(end.playerStatuses??{})).toHaveLength(0);expect(rng).not.toHaveBeenCalled();}
  });
  it.each(['removed-disease','unlearned','class','rotation','unsupported','sp','dead'] as const)('revalidates %s during a treatment cast before any payment/RNG',invalid=>{
    const {s,c,id}=setup('AL_CURE');c.skills[id].castTimeMs=[1000];vi.spyOn(tools,'random').mockReturnValue(.02);
    applyPlayerDisease(s,c,'SC_BLIND',1,30000,10000,1,0,{});
    const start=advanceState(s,c,1000);expect(start.battle?.cast?.skillId).toBe(id);
    if(invalid==='removed-disease')delete start.playerStatuses!.SC_BLIND;
    if(invalid==='unlearned')delete start.learnedSkills[id];if(invalid==='class'){start.job='novice';start.sp=50;}if(invalid==='rotation')start.rotation=[];
    if(invalid==='unsupported')c.skills[id].implementation='unsupported';if(invalid==='sp')start.sp=0;if(invalid==='dead')start.hp=0;
    const end=advanceState(start,c,2000);expect(end.sp).toBe(start.sp);expect(end.events.some(e=>e.kind==='treatment')).toBe(false);
  });
  it('treats its own Poison during a real empty-population wait without a monster target',()=>{
    const {s,c}=setup('TF_DETOXIFY');vi.spyOn(tools,'random').mockReturnValue(.02);applyPlayerDisease(s,c,'SC_POISON',1,30000,10000,1,0,{});s.battle!.enemies=[];
    const end=advanceState(s,c,1000);expect(end.playerStatuses?.SC_POISON).toBeUndefined();expect(end.sp).toBe(90);
  });
  it('self treatment resolves after convenience monster disappears',()=>{
    const {s,c,id}=setup('AL_CURE');c.skills[id].castTimeMs=[1000];vi.spyOn(tools,'random').mockReturnValue(.02);applyPlayerDisease(s,c,'SC_BLIND',1,30000,10000,1,0,{});
    const start=advanceState(s,c,1000);start.battle!.enemies=[];
    const end=advanceState(start,c,2000);expect(end.playerStatuses?.SC_BLIND).toBeUndefined();expect(end.sp).toBe(85);
  });
  it.each(['AL_CURE','TF_DETOXIFY','PR_SLOWPOISON'] as const)('%s learns using points, receives exported natural NPC disease and treats itself',source=>{
    const {s,c,id}=setup(source),monsterId=source==='AL_CURE'?1061:1175;
    c.monsters[monsterId]={...structuredClone(real.monsters[monsterId]),hp:10000,attack:[20,20],attackDelay:1000,drops:[],baseExp:0,jobExp:0,stats:{str:0,agi:0,vit:0,int:0,dex:100,luk:0}};
    const e=s.battle!.enemies![0];e.monsterId=monsterId;e.hp=e.maxHp=10000;e.hostile=true;e.enemyNextAttackAt=1000;s.battle!.monsterId=monsterId;
    s.battle!.playerNextSkillAt=s.battle!.playerActionReadyAt=3000;vi.spyOn(tools,'random').mockReturnValue(.02);
    const natural=advanceState(s,c,source==='AL_CURE'?2000:3000),kind=source==='AL_CURE'?'SC_BLIND':'SC_POISON';
    expect(natural.events.find(event=>event.kind==='status-start')).toMatchObject({statusName:kind,sourceActorId:e.id,monsterId});
    const treated=source==='AL_CURE'?advanceState(natural,c,3000):natural;
    expect(treated.events.filter(event=>event.kind==='treatment')).toHaveLength(1);expect(treated.learnedSkills[id]).toBe(1);expect(treated.skillPoints).toBeLessThan(15);
    if(source==='PR_SLOWPOISON') expect(treated.buffs[id]).toMatchObject({startsAt:3000,expiresAt:13000});
    else expect(treated.playerStatuses?.[kind]).toBeUndefined();
  });
  it.each(['MO_STEELBODY','LK_BERSERK','KN_AUTOCOUNTER','TF_HIDING'])('revalidates %s between treatment choice and resolution',source=>{
    const {s,c,id}=setup('AL_CURE');c.skills[id].castTimeMs=[1000];vi.spyOn(tools,'random').mockReturnValue(.02);applyPlayerDisease(s,c,'SC_BLIND',1,30000,10000,1,0,{});
    const start=advanceState(s,c,1000);c.skills.blocker={...c.skills[id],id:'blocker',sourceName:source};start.buffs.blocker={startsAt:1000,expiresAt:10000,effects:{}};
    const end=advanceState(start,c,2000);expect(end.events.some(event=>event.kind==='treatment')).toBe(false);expect(end.sp).toBe(start.sp-(source==='TF_HIDING'?1:0));
  });
  it('Slow Poison expiry resumes only the next scheduled poison tick without resetting count or delayed burst',()=>{
    const {s,c,id}=setup('PR_SLOWPOISON');vi.spyOn(tools,'random').mockReturnValue(.02);applyPlayerDisease(s,c,'SC_POISON',1,30000,10000,1,0,{});
    const treated=advanceState(s,c,1000);treated.rotation=[];
    const prior=advanceState(treated,c,10500),end=advanceState(prior,c,12000);
    expect(prior.events.filter(event=>event.statusName==='SC_POISON'&&event.kind==='damage')).toHaveLength(1);
    expect(end.events.filter(event=>event.statusName==='SC_POISON'&&event.kind==='damage').map(event=>event.at)).toEqual([1000,11000,12000]);
    expect(end.playerStatuses?.SC_POISON?.remainingTicks).toBe(18);expect(end.buffs[id]).toBeUndefined();
  });
});
