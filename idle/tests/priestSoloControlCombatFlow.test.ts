import {describe,it,expect,vi,afterEach} from 'vitest';
import {advanceState} from '../engine';
import {applyCommand} from '../engine';
import {resolvePriestSoloControl,releaseMonsterAttackTarget,priestControlTarget} from '../engine/priestSoloControl';
import {BATTLE_HERO} from '../shared/battleSpatial';
import {priestSetup} from './priest-control-fixture';
import {tryMonsterStatusSkill} from '../engine/monsterStatusSkills';
import * as rng from '../engine/state';
afterEach(()=>vi.restoreAllMocks());
describe('Priest source solo controls',()=>{
 it('Recovery blinds undead and releases only its attack target, retaining instance and cooldown',()=>{
  const {s,c,e}=priestSetup(1015);delete e.npcCombat!.cast;s.rotation=['pr_strecovery'];vi.spyOn(rng,'random').mockReturnValue(.02);
  const out=advanceState(s,c,250),enemy=out.battle!.enemies![0];
  expect(enemy.statuses?.SC_BLIND?.expiresAt).toBe(28082);expect(enemy.npcCombat).toMatchObject({targetReleasedAt:0,nextWanderAt:4020,readyAt:{176:7000}});
  expect(enemy.hp).toBe(1234);expect(out.sp).toBe(95);expect(out.buffs.pr_strecovery).toBeUndefined();
  expect(out.events.find(x=>x.kind==='target-release')).toMatchObject({sourceActorId:s.id,targetActorId:e.id});
 });
 it('Lex applies Silence while preserving pending Poison and its original target',()=>{
  const {s,c,e}=priestSetup();s.rotation=['pr_lexdivina'];vi.spyOn(rng,'random').mockReturnValue(.02);
  const out=advanceState(s,c,250),enemy=out.battle!.enemies![0];
  expect(enemy.statuses?.SC_SILENCE).toBeDefined();expect(enemy.npcCombat!.cast).toMatchObject({actionId:'tarou-poison',targetActorId:s.id});
  const end=advanceState(out,c,1000);expect(end.playerStatuses?.SC_POISON).toBeDefined();expect(end.events.some(x=>x.kind==='cast-interrupted')).toBe(false);
 });
 it('Silence gates new NPC skill before chance or cooldown and leaves normal attacks eligible',()=>{
  const {s,c,e}=priestSetup();delete e.npcCombat!.cast;e.npcCombat!.readyAt={};e.statuses={SC_SILENCE:{level:1,expiresAt:5000}};
  const random=vi.spyOn(rng,'random').mockReturnValue(.02);
  expect(tryMonsterStatusSkill(s,c,e,1000)).toBe(false);expect(random).not.toHaveBeenCalled();expect(e.npcCombat!.readyAt).toEqual({});
 });
 it('learns normal Ruwach prerequisite with points then naturally suppresses and resumes Tarou NPC skills',()=>{
  const {s,c,e}=priestSetup();delete e.npcCombat;s.learnedSkills={};s.skillPoints=2;s.rotation=[];s.battle=null;s.status='town';
  let learned=applyCommand(s,c,{type:'learnSkill',skillId:'al_ruwach'},0);
  learned=applyCommand(learned,c,{type:'learnSkill',skillId:'pr_lexdivina'},0);
  expect(learned.skillPoints).toBe(0);expect(learned.learnedSkills.al_ruwach).toBe(1);expect(c.skills.al_ruwach.implementation).toBe('supported');
  learned.status='challenge';learned.battle=structuredClone(priestSetup().s.battle);delete learned.battle!.enemies![0].npcCombat;
  const actor=learned.battle!.enemies![0];actor.enemyNextAttackAt=1000;learned.rotation=['pr_lexdivina'];
  vi.spyOn(rng,'random').mockReturnValue(.02);
  const quiet=advanceState(learned,c,4000);expect(quiet.events.some(x=>x.kind==='damage'&&x.sourceActorId===actor.id)).toBe(true);
  expect(quiet.events.some(x=>x.skillId==='npc_poison')).toBe(false);
  quiet.rotation=[];const expires=quiet.battle!.enemies![0].statuses!.SC_SILENCE.expiresAt;
  const resumed=advanceState(quiet,c,expires+4000);
  expect(resumed.events.some(x=>x.kind==='cast'&&x.skillId==='npc_poison')).toBe(true);
  expect(resumed.playerStatuses?.SC_POISON).toBeDefined();
 });
 it('AFK chooses a secondary eligible caster and neither out-of-range control spends SP',()=>{
  const {s,c,e}=priestSetup();const main=structuredClone(e);main.id='main';main.monsterId=1015;c.monsters[1015]=structuredClone(c.monsters[1175]);delete c.monsters[1015].npcStatusSkills;
  s.battle!.enemies!.unshift(main);s.battle!.targetId='main';s.rotation=['pr_lexdivina'];vi.spyOn(rng,'random').mockReturnValue(.02);
  const out=advanceState(s,c,250);expect(out.events.find(x=>x.kind==='skill'&&x.skillId==='pr_lexdivina')?.targetActorId).toBe(e.id);
  expect(out.battle!.enemies![0].statuses?.SC_SILENCE).toBeUndefined();
  for(const id of ['pr_lexdivina','pr_strecovery']) {
   const setup=priestSetup(1015);setup.s.rotation=[id];delete setup.e.npcCombat!.cast;
   setup.c.monsters[1015].canMove=false;
   setup.e.position=setup.e.approachFrom={x:BATTLE_HERO.x+11/12,y:BATTLE_HERO.y};setup.e.arrivedAt=0;
   expect(advanceState(setup.s,setup.c,250).sp).toBe(100);
  }
 });
 it.each(['class','unlearned','unsupported','dead','stun','range','replacement','not-hunting'] as const)('resolver revalidates %s without status mutation',mode=>{
  const {s,c,e}=priestSetup();
  if(mode==='class')s.job='novice';if(mode==='unlearned')delete s.learnedSkills.pr_lexdivina;
  if(mode==='unsupported')c.skills.pr_lexdivina.implementation='unsupported';if(mode==='dead')e.hp=0;
  if(mode==='stun')(s.playerStatuses as any)={SC_STUN:{expiresAt:1000}};
  if(mode==='range'){e.position=e.approachFrom={x:BATTLE_HERO.x+7/12,y:BATTLE_HERO.y};e.arrivedAt=0;}
  if(mode==='replacement')s.battle!.enemies![0]={...e,id:'new-instance'};
  if(mode==='not-hunting')s.status='town';
  expect(resolvePriestSoloControl(s,c,c.skills.pr_lexdivina,1,e,0)).toBe(false);expect(e.statuses).toBeUndefined();
 });
 it('serialized segmented release timeline retains original NPC completion once',()=>{
  const {s,c}=priestSetup();s.rotation=[];releaseMonsterAttackTarget(s,c,s.battle!.enemies![0],0);
  vi.spyOn(rng,'random').mockReturnValue(.02);
  const once=advanceState(s,c,1250),part=advanceState(JSON.parse(JSON.stringify(advanceState(s,c,250))),c,1250);
  expect(part).toEqual(once);expect(part.events.filter(x=>x.kind==='damage'&&x.skillId==='npc_poison')).toHaveLength(1);
 });
 it('pause shifts release, memory, wander and retained cast clocks once across separate JSON copies',()=>{
  const {s,c,e}=priestSetup();releaseMonsterAttackTarget(s,c,e,0);e.npcCombat!.pendingAttackerAt=10;e.npcCombat!.pendingAttackerActorId=s.id;
  s.fieldPopulation={areaId:s.areaId!,generation:1,enemies:[structuredClone(e)],respawns:[]};s.status='paused';s.pausedStatus='challenge';s.pausedAt=0;
  const resumed=applyCommand(JSON.parse(JSON.stringify(s)),c,{type:'setPotions',hpThreshold:0,spThreshold:0},10000);
  for(const actor of [resumed.battle!.enemies![0],resumed.fieldPopulation!.enemies[0]]) {
   expect(actor.npcCombat).toMatchObject({targetReleasedAt:10000,nextTargetCheckAt:10100,pendingAttackerAt:10010});
   expect(actor.npcCombat!.cast!.endsAt).toBe(10800);
  }
  const again=applyCommand(resumed,c,{type:'setPotions',hpThreshold:0,spThreshold:0},10000);
  expect(again.battle!.enemies![0].npcCombat!.targetReleasedAt).toBe(10000);
 });
 it('expiry emits one real monster status-end with ownership and cannot replay on reconnect',()=>{
  const {s,c,e}=priestSetup();s.rotation=['pr_lexdivina'];vi.spyOn(rng,'random').mockReturnValue(.02);
  let applied=advanceState(s,c,250);applied.rotation=[];
  const expires=applied.battle!.enemies![0].statuses!.SC_SILENCE.expiresAt;
  const out=advanceState(applied,c,expires+250),end=out.events.filter(x=>x.kind==='status-end'&&x.statusName==='SC_SILENCE'&&x.targetActorId===e.id);
  expect(end).toHaveLength(1);expect(end[0]).toMatchObject({at:expires,sourceActorId:s.id,skillId:'pr_lexdivina'});
  expect(advanceState(JSON.parse(JSON.stringify(out)),c,expires+250).events.filter(x=>x.kind==='status-end'&&x.statusName==='SC_SILENCE')).toHaveLength(1);
 });
 it('a released monster cannot start a new NPC action using only the retained skill target',()=>{
  const {s,c,e}=priestSetup();delete e.npcCombat!.cast;e.npcCombat!.readyAt={};releaseMonsterAttackTarget(s,c,e,0);e.npcCombat!.firstAttackDone=true;
  const random=vi.spyOn(rng,'random');expect(tryMonsterStatusSkill(s,c,e,50)).toBe(false);expect(random).not.toHaveBeenCalled();
 });
});
