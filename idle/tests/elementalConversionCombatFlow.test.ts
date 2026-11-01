import {afterEach,describe,expect,it,vi} from 'vitest';
import {advanceState,applyCommand} from '../engine';
import {effectiveMonsterStatus} from '../engine/classicStatuses';
import * as rng from '../engine/state';
import {resolveElementalConversion,elementalConversionTarget} from '../engine/elementalConversion';
import {beginBattle} from '../engine/encounters';
import {BATTLE_HERO} from '../shared/battleSpatial';
import raw from '../content/catalog.json';
import type {Catalog} from '../shared/types';
import {conversionSetup} from './elemental-conversion-fixture';
import {priestSetup} from './priest-control-fixture';
import {resolvePriestSoloControl} from '../engine/priestSoloControl';
afterEach(()=>vi.restoreAllMocks());
describe('source elemental conversion runtime',()=>{
 it('starts conversion on the eligible secondary through the real AFK pipeline',()=>{
  const {s,c,e}=conversionSetup();delete e.npcCombat!.cast;
  const second=structuredClone(e);second.id='secondary';s.battle!.enemies!.push(second);
  e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'water',elementLevel:1,expiresAt:999999}};
  vi.spyOn(rng,'random').mockReturnValue(.02);
  const out=advanceState(s,c,250);
  expect(out.battle!.cast).toMatchObject({skillId:'sa_elementwater',targetId:'secondary',endsAt:2000});
  expect(out.sp).toBe(100);expect(out.inventory.find(x=>x.uid==='converter')!.quantity).toBe(3);
 });
 it.each(['conversion','freeze','stone','expired','converted-away'] as const)('field elemental focus uses the effective body for %s',mode=>{
  const {s,c,e}=conversionSetup();s.status='hunting';delete s.battle!.challengeId;delete s.battle!.targetId;
  s.rotation=[];s.battle!.playerNextSkillAt=s.battle!.playerActionReadyAt=999999;
  delete e.npcCombat!.cast;c.monsters[1175].canMove=false;c.monsters[1002].canMove=false;
  const focus=mode==='freeze'?'water':mode==='stone'?'earth':'fire';
  c.monsters[1002].element=focus;c.monsters[1175].element=mode==='converted-away'?'fire':'neutral';
  e.fieldSlot=0;e.engaged=true;e.hostile=false;
  e.statuses={SC_ARMOR_PROPERTY:{level:1,element:mode==='converted-away'?'water':'fire',elementLevel:3,startsAt:0,expiresAt:mode==='expired'?100:10000}};
  if(mode==='freeze')e.statuses.SC_FREEZE={level:1,expiresAt:10000};
  if(mode==='stone')e.statuses.SC_STONE={level:1,startsAt:0,petrifiesAt:0,expiresAt:10000};
  const distant=[1,2,3].map(slot=>{
   const enemy=structuredClone(e);enemy.id=`distant-${slot}`;enemy.monsterId=1002;enemy.fieldSlot=slot;delete enemy.statuses;
   const position={x:BATTLE_HERO.x+(slot+3)/12,y:BATTLE_HERO.y};
   Object.assign(enemy,{position,approachFrom:{...position},homePosition:{...position},startedAt:0,arrivedAt:0});return enemy;
  });
  s.battle!.enemies=[e,...distant];s.fieldPopulation={areaId:s.areaId!,generation:1,enemies:s.battle!.enemies,respawns:[]};
  s.huntFocus={[s.areaId!]:`element:${focus}`};
  // A new encounter resolves the real persisted population through fieldTarget;
  // syncBattle otherwise retains an already engaged live target intentionally.
  s.battle=null;beginBattle(s,c,1175,250);
  expect(s.battle!.targetId).toBe(mode==='expired'||mode==='converted-away'?'distant-1':e.id);
 });
 it('projects per-instance property, restores it after Freeze, and never mutates catalog',()=>{
  const {c,e}=conversionSetup();e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'fire',elementLevel:4,expiresAt:1800000}} as any;
  expect(effectiveMonsterStatus(c.monsters[1175],e.statuses,0).monster).toMatchObject({element:'fire',elementLevel:4});
  e.statuses!.SC_FREEZE={level:1,expiresAt:100};
  expect(effectiveMonsterStatus(c.monsters[1175],e.statuses,50).monster).toMatchObject({element:'water',elementLevel:1});
  expect(effectiveMonsterStatus(c.monsters[1175],e.statuses,100).monster.element).toBe('fire');
  expect(c.monsters[1175].element).toBe('neutral');
 });
 it('casts for 2000ms, pays once at completion, retains NPC cast/cooldown and applies two source rolls',()=>{
  const {s,c,e}=conversionSetup();e.npcCombat!.cast!.endsAt=4000;const random=vi.spyOn(rng,'random').mockReturnValue(.02);
  const casting=advanceState(s,c,250);expect(casting.battle!.cast).toMatchObject({skillId:'sa_elementwater',endsAt:2000});
  expect(casting.sp).toBe(100);expect(casting.inventory.find(x=>x.uid==='converter')!.quantity).toBe(3);
  // Prepared pending actor seam: conversion must leave the original cast intact.
  const done=advanceState(casting,c,2250),actor=done.battle!.enemies![0];
  expect(actor.statuses?.SC_ARMOR_PROPERTY).toMatchObject({level:1,element:'water',elementLevel:1,startsAt:2000,expiresAt:1802000,skillId:'sa_elementwater'});
  expect(done.sp).toBe(70);expect(done.inventory.find(x=>x.uid==='converter')!.quantity).toBe(2);
  expect(actor.npcCombat!.readyAt).toEqual(e.npcCombat!.readyAt);
  expect(actor.npcCombat!.cast).toEqual(e.npcCombat!.cast);
  expect(done.events.some(x=>x.kind==='cast-interrupted'||x.kind==='target-release'||x.kind==='damage'&&x.skillId==='sa_elementwater')).toBe(false);
  expect(done.buffs.sa_elementwater).toBeUndefined();expect(random).toHaveBeenCalledTimes(2);
 });
 it('AFK skips a conversion already active and requires advantage for every random level',()=>{
  const {s,c,e}=conversionSetup();e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'water',elementLevel:1,expiresAt:999999}} as any;
  expect(advanceState(s,c,250).battle!.cast?.skillId).not.toBe('sa_elementwater');
  delete e.statuses;s.rotation=['sa_elementwater'];expect(advanceState(s,c,250).battle!.cast).toBeUndefined();
  s.rotation=['sa_elementwater','lightning_bolt'];c.elementModifiers!.wind.water=[200,200,200,100];
  expect(advanceState(s,c,250).battle!.cast?.skillId).not.toBe('sa_elementwater');
 });
 it('craft command validation recognizes only converter ids and safe quantities',async()=>{
  const {parseCommandRequest}=await import('../server/validation');
  expect(parseCommandRequest({requestId:'converter-001',command:{type:'craftConverter',itemId:12114,quantity:1}}).command).toMatchObject({type:'craftConverter'});
  for(const command of [{type:'craftConverter',itemId:501,quantity:1},{type:'craftConverter',itemId:12114,quantity:0},{type:'craftConverter',itemId:12114,quantity:1001}])expect(()=>parseCommandRequest({requestId:'converter-001',command})).toThrow();
 });
 it.each([0,1,2,3])('uses exactly two rolls and projects randomized element level %i',roll=>{
  const {s,c,e}=conversionSetup();const random=vi.spyOn(rng,'random').mockReturnValueOnce(.5).mockReturnValueOnce(roll/4);
  expect(resolveElementalConversion(s,c,c.skills.sa_elementwater,1,e,0)).toBe(true);
  expect(e.statuses?.SC_ARMOR_PROPERTY).toMatchObject({element:'water',elementLevel:roll+1,expiresAt:1800000});
  expect(random).toHaveBeenCalledTimes(2);
 });
 it.each([2,3,4])('retains stronger existing level%i element and expiry after exactly one roll',level=>{
  const {s,c,e}=conversionSetup();e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'fire',elementLevel:level,startsAt:1,expiresAt:123456,skillId:'sa_elementfire'}};
  const before=structuredClone(e.statuses),random=vi.spyOn(rng,'random').mockReturnValue(.8);
  expect(resolveElementalConversion(s,c,c.skills.sa_elementwater,1,e,10)).toBe(true);
  expect(e.statuses).toEqual(before);expect(random).toHaveBeenCalledTimes(1);expect(s.events.some(x=>x.kind==='status-start')).toBe(false);
 });
 it('replaces existing level1, excludes bosses before every status RNG and retains pending NPC',()=>{
  const {s,c,e}=conversionSetup();e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'fire',elementLevel:1,expiresAt:99}};
  const pending=structuredClone(e.npcCombat),random=vi.spyOn(rng,'random').mockReturnValue(.8);
  resolveElementalConversion(s,c,c.skills.sa_elementwater,1,e,0);expect(e.statuses.SC_ARMOR_PROPERTY.element).toBe('water');expect(random).toHaveBeenCalledTimes(2);
  random.mockClear();c.monsters[1175].boss=true;expect(resolveElementalConversion(s,c,c.skills.sa_elementfire,1,e,1)).toBe(false);
  expect(random).not.toHaveBeenCalled();expect(e.npcCombat).toEqual(pending);
 });
 it.each(['class','tree','unlearned','illegal-level','unsupported','stale-skill','dead','hero-dead','stun','silence','range','actor','town','future'] as const)('rejects invalid %s actor before RNG and status mutation',mode=>{
  const {s,c,e}=conversionSetup();const skill=structuredClone(c.skills.sa_elementwater);
  if(mode==='class')s.job='novice';if(mode==='tree')c.classes.sage.skills=c.classes.sage.skills.filter(id=>id!==skill.id);
  if(mode==='unlearned')delete s.learnedSkills[skill.id];if(mode==='illegal-level')s.learnedSkills[skill.id]=2;
  if(mode==='unsupported')c.skills[skill.id].implementation='unsupported';if(mode==='stale-skill')c.skills[skill.id].sourceName='SA_ELEMENTFIRE';
  if(mode==='dead')e.hp=0;if(mode==='hero-dead')s.hp=0;
  if(mode==='stun')(s.playerStatuses as any)={SC_STUN:{expiresAt:1000}};if(mode==='silence')(s.playerStatuses as any)={SC_SILENCE:{expiresAt:1000,startsAt:0,level:1}};
  if(mode==='range'){e.position=e.approachFrom={x:BATTLE_HERO.x+11/12,y:BATTLE_HERO.y};e.arrivedAt=0;}
  if(mode==='actor')s.battle!.enemies![0]={...e};if(mode==='town')s.status='town';if(mode==='future')e.startedAt=500;
  const random=vi.spyOn(rng,'random');expect(resolveElementalConversion(s,c,skill,1,e,0)).toBe(false);expect(random).not.toHaveBeenCalled();expect(e.statuses).toBeUndefined();
 });
 function completing(mode?:'sp'|'reagent'|'range'|'class'|'actor') {
  const x=conversionSetup();x.s.rotation=[];x.s.battle!.cast={skillId:'sa_elementwater',level:1,targetId:x.e.id,startedAt:0,endsAt:250,afterCastDelayMs:1000,actionId:'conversion-owned'};
  x.s.battle!.playerNextSkillAt=x.s.battle!.playerActionReadyAt=1250;
  if(mode==='sp')x.s.sp=29;if(mode==='reagent')x.s.inventory=x.s.inventory.filter(i=>i.itemId!==12115);
  if(mode==='range'){x.e.position=x.e.approachFrom={x:BATTLE_HERO.x+11/12,y:BATTLE_HERO.y};x.e.arrivedAt=0;x.c.monsters[1175].canMove=false;}
  if(mode==='class'){x.s.job='novice';x.s.sp=50;}if(mode==='actor')x.e.id='replaced';return x;
 }
 it.each(['sp','reagent','range','class','actor'] as const)('completion revalidates %s and does not debit either resource',mode=>{
  const {s,c}=completing(mode),sp=s.sp,inventory=structuredClone(s.inventory);vi.spyOn(rng,'random').mockReturnValue(.02);
  const out=advanceState(s,c,250);expect(out.sp).toBe(sp);expect(out.inventory).toEqual(inventory);expect(out.battle!.enemies![0].statuses?.SC_ARMOR_PROPERTY).toBeUndefined();
 });
 it('an incoming real NPC body hit interrupts conversion without spending its resources',()=>{
  const {s,c}=conversionSetup();vi.spyOn(rng,'random').mockReturnValue(.02);
  const out=advanceState(s,c,1000);expect(out.events.some(x=>x.kind==='cast-interrupted')).toBe(true);
  expect(out.battle!.enemies![0].statuses?.SC_ARMOR_PROPERTY).toBeUndefined();expect(out.sp).toBe(100);expect(out.inventory.find(i=>i.itemId===12115)!.quantity).toBe(3);
 });
 it('segmented JSON casts and pause/resume retain element deadlines and every instance copy',()=>{
  const {s,c,e}=conversionSetup();e.npcCombat!.cast!.endsAt=4000;vi.spyOn(rng,'random').mockReturnValue(.02);
  const once=advanceState(s,c,2250),split=advanceState(JSON.parse(JSON.stringify(advanceState(s,c,1250))),c,2250);expect(split).toEqual(once);
  once.fieldPopulation={areaId:'prontera',generation:1,enemies:structuredClone(once.battle!.enemies!),respawns:[]};once.status='paused';once.pausedStatus='challenge';once.pausedAt=2250;
  const resumed=applyCommand(JSON.parse(JSON.stringify(once)),c,{type:'setPotions',hpThreshold:0,spThreshold:0},12250);
  for(const enemy of [resumed.battle!.enemies![0],resumed.fieldPopulation!.enemies[0]])expect(enemy.statuses!.SC_ARMOR_PROPERTY).toMatchObject({startsAt:12000,expiresAt:1812000,element:'water',elementLevel:1});
  const same=applyCommand(resumed,c,{type:'setPotions',hpThreshold:0,spThreshold:0},12250);expect(same.battle!.enemies![0].statuses).toEqual(resumed.battle!.enemies![0].statuses);
 });
 it('expires at exact owned deadline once, restores base, and cannot transfer to respawn',()=>{
  const {s,c,e}=conversionSetup();s.rotation=[];delete e.npcCombat!.cast;e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'wind',elementLevel:3,startsAt:0,expiresAt:500,skillId:'sa_elementwind',sourceActorId:s.id,sourceActionId:'owned-property'}};
  const done=advanceState(s,c,750);expect(done.battle!.enemies![0].statuses?.SC_ARMOR_PROPERTY).toBeUndefined();
  expect(done.events.filter(x=>x.kind==='status-end'&&x.statusName==='SC_ARMOR_PROPERTY')).toEqual([expect.objectContaining({at:500,targetActorId:e.id,actionId:'owned-property'})]);
  expect(advanceState(JSON.parse(JSON.stringify(done)),c,750)).toEqual(done);
  beginBattle(done,c,1175,1000,'mastering');expect(done.battle!.enemies![0].id).not.toBe(e.id);expect(done.battle!.enemies![0].statuses?.SC_ARMOR_PROPERTY).toBeUndefined();
 });
 it('AFK chooses secondary beneficial actor without RNG and skips bosses or suppressed properties',()=>{
  const {s,c,e}=conversionSetup();const second=structuredClone(e);second.id='secondary';s.battle!.enemies!.push(second);e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'water',elementLevel:1,expiresAt:999999}};
  const random=vi.spyOn(rng,'random');expect(elementalConversionTarget(s,c,c.skills.sa_elementwater,0)?.id).toBe('secondary');expect(random).not.toHaveBeenCalled();
  second.statuses={SC_FREEZE:{level:1,expiresAt:1000}};expect(elementalConversionTarget(s,c,c.skills.sa_elementwater,0)).toBeUndefined();
  delete second.statuses;c.monsters[1175].boss=true;expect(elementalConversionTarget(s,c,c.skills.sa_elementwater,0)).toBeUndefined();
 });
 it.each([['sa_elementwater',12115,'water'],['sa_elementground',12116,'earth'],['sa_elementfire',12114,'fire'],['sa_elementwind',12117,'wind']] as const)('completes %s with exactly its correct reagent and one30SP debit', (id,itemId,element)=>{
  const {s,c,e}=completing();s.battle!.cast!.skillId=id;
  s.inventory.push({uid:'correct',itemId,quantity:2,refine:0,cards:[],favorite:false});vi.spyOn(rng,'random').mockReturnValue(.4);
  const before=s.inventory.filter(i=>i.itemId===itemId).reduce((n,i)=>n+i.quantity,0),out=advanceState(s,c,250);
  expect(out.sp).toBe(70);expect(out.inventory.filter(i=>i.itemId===itemId).reduce((n,i)=>n+i.quantity,0)).toBe(before-1);
  expect(out.battle!.enemies![0].statuses?.SC_ARMOR_PROPERTY).toMatchObject({element,elementLevel:2,skillId:id,sourceActorId:s.id});
  expect(out.events.find(x=>x.kind==='status-start'&&x.skillId===id)).toMatchObject({targetActorId:e.id,actionId:'conversion-owned'});
 });
 it('DEX and actual Professor Memorize shorten casting through the shared source clocks',()=>{
  const x=conversionSetup();x.s.stats.dex=75;x.e.npcCombat!.cast!.endsAt=4000;
  expect(advanceState(x.s,x.c,250).battle!.cast!.endsAt).toBe(1000);
  const {s,c,e}=conversionSetup(),actual=raw as unknown as Catalog;
  c.classes.professor={...structuredClone(actual.classes.professor),hp:Array(99).fill(1000),sp:Array(99).fill(100),jobBonuses:{}};
  c.skills.pf_memorize=structuredClone(actual.skills.pf_memorize);s.job='professor';s.learnedSkills.pf_memorize=1;
  s.buffs.pf_memorize={startsAt:0,expiresAt:999999,effects:{}};s.combatEffects={memorizeCharges:2};e.npcCombat!.cast!.endsAt=4000;
  const out=advanceState(s,c,250);expect(out.battle!.cast!.endsAt).toBe(1000);expect(out.combatEffects!.memorizeCharges).toBe(1);
 });
 it('converted undead body stops Resurrection selection and Recovery Blind, preserving its original race',()=>{
  const {s,c,e}=priestSetup(1015);delete e.npcCombat!.cast;
  e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'fire',elementLevel:2,expiresAt:5000}};
  s.rotation=['resurrection'];s.learnedSkills.resurrection=1;
  c.items[717]=structuredClone((raw as unknown as Catalog).items[717]);s.inventory.push({uid:'gem',itemId:717,quantity:2,refine:0,cards:[],favorite:false});
  const out=advanceState(s,c,250);expect(out.battle!.cast?.skillId).not.toBe('resurrection');expect(out.sp).toBe(100);
  const random=vi.spyOn(rng,'random').mockReturnValue(.1);
  expect(resolvePriestSoloControl(s,c,c.skills.pr_strecovery,1,e,0)).toBe(true);
  expect(e.statuses.SC_BLIND).toBeUndefined();expect(c.monsters[1015].element).toBe('undead');expect(c.monsters[1015].race).toBe('undead');
  // Only mob_unlocktarget wander rolls; the undead Blind path was skipped.
  expect(random).toHaveBeenCalledTimes(1);
 });
 it('petrified Stone overrides conversion and reveals it again on expiry',()=>{
  const {c,e}=conversionSetup();e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'wind',elementLevel:4,expiresAt:10000},SC_STONE:{level:1,startsAt:0,petrifiesAt:1000,expiresAt:2000}};
  expect(effectiveMonsterStatus(c.monsters[1175],e.statuses,999).monster).toMatchObject({element:'wind',elementLevel:4});
  expect(effectiveMonsterStatus(c.monsters[1175],e.statuses,1000).monster).toMatchObject({element:'earth',elementLevel:1});
  expect(effectiveMonsterStatus(c.monsters[1175],e.statuses,2000).monster).toMatchObject({element:'wind',elementLevel:4});
  expect(effectiveMonsterStatus(c.monsters[1175],e.statuses,10000).monster).toMatchObject({element:'neutral',elementLevel:1});
 });
});
