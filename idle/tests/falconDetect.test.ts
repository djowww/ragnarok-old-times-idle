import {describe,it,expect} from 'vitest';
import {createInitialState,applyCommand,advanceState} from '../engine/index';
import {beginBattle} from '../engine/encounters';
import {detectingCanStart,detectingAfkUseful,useDetecting} from '../engine/falconDetect';
import {healFull} from '../engine/stats';
import data from '../content/catalog.json';
import type {Catalog,BattleEnemy} from '../shared/types';
function setup(){
 const c=structuredClone(data) as unknown as Catalog,skill=c.skills.ht_detecting;
 skill.implementation='supported';delete skill.unsupportedReason;skill.manualUse='activate';
 const s=createInitialState(c,0);s.job='hunter';s.baseLevel=60;s.jobLevel=40;s.equipment={};s.learnedSkills={ht_falcon:1,ht_detecting:4,ac_concentration:1};s.rotation=[];s.falconEquipped=true;healFull(s,c);
 s.autoPotion={hpThreshold:0,spThreshold:0};s.combatEffects={regenBlockedUntil:999999};
 return{s,c,skill};
}
function enemy(id:string,x:number,y:number):BattleEnemy{return{id,monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:999999,spawnDirection:0,position:{x,y},approachFrom:{x,y},statuses:{SC_HIDING:{expiresAt:99999,level:1}}};}
describe('instant Falcon Detect around the player',()=>{
 it('manual empty ground is valid, costs eight SP, and creates no aura or random roll',()=>{
  const{s,c,skill}=setup(),sp=s.sp,rng=s.rngState;expect(useDetecting(s,c,skill,4,0)).toBe(true);
  expect(s.sp).toBe(sp-8);expect(s.rngState).toBe(rng);expect(s.buffs).toEqual({});expect(s.battle).toBeNull();
  expect(s.events.at(-1)).toMatchObject({kind:'skill',skillId:skill.id,castMs:0,targetActorId:s.id,actorAction:'none'});
 });
 it.each(['SC_HIDING','SC_CLOAKING','SC_CLOAKINGEXCEED','SC_CAMOUFLAGE','SC_NEWMOON'])('reveals %s in the seven by seven source square without damage',status=>{
  const{s,c,skill}=setup();s.status='challenge';beginBattle(s,c,1002,0,'mastering');const e=enemy('hidden',.48+3/12,.65+3/12);e.statuses={[status]:{expiresAt:99999,level:1},SC_CHASEWALK:{expiresAt:99999,level:1},SC_INVISIBILITY:{expiresAt:99999,level:1}};s.battle!.enemies=[e];
  expect(detectingAfkUseful(s,0)).toBe(true);expect(useDetecting(s,c,skill,4,0)).toBe(true);
  expect(e.statuses![status]).toBeUndefined();expect(e.statuses!.SC_CHASEWALK).toBeDefined();expect(e.statuses!.SC_INVISIBILITY).toBeDefined();expect(e.hp).toBe(100);expect(s.totals.kills).toBe(0);
 });
 it('ignores dead, future, expired and outside actors and does not reveal their statuses',()=>{
  const{s,c,skill}=setup();s.status='challenge';beginBattle(s,c,1002,0,'mastering');const outside=enemy('outside',.48+4/12,.65),dead=enemy('dead',.48,.65),future=enemy('future',.48,.65),expired=enemy('expired',.48,.65);dead.hp=0;future.startedAt=1000;expired.statuses!.SC_HIDING.expiresAt=0;s.battle!.enemies=[outside,dead,future,expired];
  expect(detectingAfkUseful(s,0)).toBe(false);expect(useDetecting(s,c,skill,4,0)).toBe(true);for(const e of [outside,dead,future])expect(e.statuses!.SC_HIDING).toBeDefined();
 });
 it.each(['falcon','learned','class','sp','silence','cast','clock','dead'])('rejects %s without mutation',reason=>{
  const{s,c,skill}=setup();if(reason==='falcon')s.falconEquipped=false;if(reason==='learned')delete s.learnedSkills.ht_detecting;if(reason==='class')s.job='archer';if(reason==='sp')s.sp=7;if(reason==='silence')s.playerStatuses={SC_SILENCE:{startsAt:0,expiresAt:1000,level:1}};if(reason==='cast')s.supportCast={skillId:'x',level:1,startedAt:0,endsAt:1000} as any;if(reason==='clock')s.playerCanActAt=1000;if(reason==='dead')s.hp=0;
  const before=structuredClone(s);expect(detectingCanStart(s,c,skill,4,0)).toBe(false);expect(useDetecting(s,c,skill,4,0)).toBe(false);expect(s).toEqual(before);
 });
 it('manual command has the same cost and does not require a selected enemy',()=>{
  const{s,c,skill}=setup();const next=applyCommand(s,c,{type:'useSkill',skillId:skill.id},0);expect(next.sp).toBe(s.sp-8);expect(next.events.at(-1)?.skillId).toBe(skill.id);
 });
 it('AFK skips a visible target, then reveals a concealed living target once',()=>{
  const{s,c,skill}=setup();s.status='challenge';beginBattle(s,c,1002,0,'mastering');const e=enemy('hidden',.48,.65);delete e.statuses!.SC_HIDING;s.battle!.enemies=[e];s.battle!.targetId=e.id;s.battle!.playerNextAttackAt=999999;s.battle!.playerNextSkillAt=0;s.battle!.playerActionReadyAt=0;s.rotation=[skill.id];
  const visible=advanceState(s,c,250);expect(visible.sp).toBe(s.sp);visible.battle!.enemies![0].statuses!.SC_CLOAKING={expiresAt:99999,level:1};const revealed=advanceState(visible,c,1500);
  expect(revealed.sp).toBe(s.sp-8);expect(revealed.events.filter(e=>e.kind==='skill'&&e.skillId===skill.id)).toHaveLength(1);expect(revealed.battle!.enemies![0].statuses!.SC_CLOAKING).toBeUndefined();
 });
});

it('keeps a reveal after JSON copies and an immediate field rest before the next tick',()=>{
 const {s,c,skill}=setup();s.status='hunting';s.areaId='prontera_south';beginBattle(s,c,1002,0);
 const e=enemy('reveal-save',.48,.65);e.fieldSlot=0;s.battle!.enemies=[e];
 s.fieldPopulation={areaId:s.areaId,enemies:[e],respawns:[],nextActorId:1} as any;
 s.fieldHero={areaId:s.areaId,phase:'waiting',from:{x:.48,y:.65},position:{x:.48,y:.65},startedAt:0,arrivedAt:0} as any;
 const decoded=JSON.parse(JSON.stringify(s));expect(decoded.battle.enemies[0]).not.toBe(decoded.fieldPopulation.enemies[0]);
 const revealed=applyCommand(decoded,c,{type:'useSkill',skillId:skill.id},1);
 expect(revealed.battle!.enemies![0].statuses!.SC_HIDING).toBeUndefined();
 const rest=applyCommand(revealed,c,{type:'rest'},2);
 expect(rest.battle).toBeNull();expect(rest.sp).toBe(s.sp-8);
 expect(rest.fieldPopulation!.enemies[0].statuses!.SC_HIDING).toBeUndefined();
});
it.each(['town','another-area','challenge'])('does not reveal an old population from %s',mode=>{
 const{s,c,skill}=setup();s.areaId=mode==='town'?null:'prontera_south';s.status=mode==='town'?'town':'hunting';
 if(mode==='challenge'){beginBattle(s,c,1002,0,'mastering');s.battle!.enemies![0].statuses={};}
 const e=enemy('old-field',.48,.65);s.fieldPopulation={areaId:mode==='challenge'?'prontera_south':'payon_cave',enemies:[e],respawns:[],nextActorId:1} as any;
 expect(detectingAfkUseful(s,0)).toBe(false);
 expect(useDetecting(s,c,skill,4,0)).toBe(true);expect(e.statuses!.SC_HIDING).toBeDefined();
});
