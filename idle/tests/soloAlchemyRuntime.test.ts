import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types.js';
import { skillUseLevel } from '../shared/skillUseLevels.js';
import { createInitialState, applyCommand, advanceState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { derivedStats } from '../engine/stats.js';
import { resolveSoloAlchemyCast, soloAlchemyAfkUseful } from '../engine/soloAlchemy.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import * as stateTools from '../engine/state.js';
const quantity = (s: GameState, id: number) => s.inventory.filter(e => e.itemId === id).reduce((sum,e) => sum + e.quantity,0);
const source = (c: Catalog, name: string) => Object.values(c.skills).find(skill => skill.sourceName === name)!;
function setup(job = 'alchemist') {
 const c = structuredClone(rawCatalog) as unknown as Catalog;
 const s = createInitialState(c, 1000, 'alchemy-runtime');
 s.job = job; s.family = c.classes[job].family; s.baseLevel = 99; s.jobLevel = 50;
 s.equipment = {}; s.rotation = []; s.stats = { str: 10, agi: 1, vit: 10, int: 20, dex: 1, luk: 1 };
 s.learnedSkills[source(c,'AM_POTIONPITCHER').id] = 5;
 s.learnedSkills[source(c,'AM_LEARNINGPOTION').id] = 10;
 s.learnedSkills[source(c,'WS_MELTDOWN').id] = 10;
 s.sp = derivedStats(s,c).maxSp; s.hp = derivedStats(s,c).maxHp;
 s.autoPotion = {hpThreshold:0,spThreshold:0};
 for (const id of [501,502,503,504,505]) {
  s.inventory.push({uid:`pot-${id}`,itemId:id,quantity:3,refine:0,cards:[],favorite:false});
 }
 return {s,c,pitcher:source(c,'AM_POTIONPITCHER'),meltdown:source(c,'WS_MELTDOWN')};
}
function battle(job='whitesmith') {
 const f=setup(job); const {s,c}=f;
 s.status='challenge';beginBattle(s,c,1002,1000,'mastering');
 Object.assign(c.monsters[1002],{boss:false,hp:100000,attack:[0,0],baseExp:0,jobExp:0,
  stats:{str:0,agi:0,vit:99,int:0,dex:0,luk:99}});
 const enemy=s.battle!.enemies![0];
 Object.assign(enemy,{hp:100000,maxHp:100000,position:{...BATTLE_HERO},approachFrom:{...BATTLE_HERO},
  arrivedAt:1000,startedAt:1000,enemyNextAttackAt:Number.MAX_SAFE_INTEGER});
 s.battle!.targetId=enemy.id;s.battle!.playerNextAttackAt=1250;s.battle!.playerNextSkillAt=Number.MAX_SAFE_INTEGER;
 return {...f,enemy};
}
afterEach(()=>vi.restoreAllMocks());
describe('solo alchemy resources and captured state',()=>{
 it('Blue Potion restores SP after paying cost, emits SP gain once and leaves ordinary potion clock unchanged',()=>{
  const {s,c,pitcher}=setup();s.sp=10;s.skillUseLevels={[pitcher.id]:5};const oldPotionClock=s.potionReadyAt;
  const next=applyCommand(s,c,{type:'useSkill',skillId:pitcher.id},1000);
  const gain=next.events.find(e=>e.kind==='heal'&&e.skillId===pitcher.id)!;
  expect(gain.resource).toBe('sp');expect(gain.amount).toBeGreaterThan(50);
  expect(next.sp).toBe(9+gain.amount!);expect(gain.targetActorId).toBe(s.id);
  expect(next.potionReadyAt).toBe(oldPotionClock);expect(next.totals.potions).toBe(s.totals.potions+1);
  expect(quantity(next,505)).toBe(quantity(s,505)-1);
  expect(next.playerCanActAt).toBe(1500);expect(next.supportCast).toBeUndefined();
 });
 it.each([1,2,3,4,5])('selected level %i consumes exactly its own ingredient',level=>{
  const {s,c,pitcher}=setup();s.hp=1;s.sp=10;s.skillUseLevels={[pitcher.id]:level};
  const next=applyCommand(s,c,{type:'useSkill',skillId:pitcher.id},1000);
  for (const id of [501,502,503,504,505]) expect(quantity(next,id)).toBe(quantity(s,id)-(id===500+level?1:0));
  expect(next.learnedSkills[pitcher.id]).toBe(5);
 });
 it('manual full recovery remains a paid native attempt, with zero actual HP gain',()=>{
  const {s,c,pitcher}=setup();s.skillUseLevels={[pitcher.id]:1};const next=applyCommand(s,c,{type:'useSkill',skillId:pitcher.id},1000);
  expect(next.hp).toBe(s.hp);expect(next.sp).toBe(s.sp-1);
  expect(next.events.find(e=>e.kind==='heal')?.amount).toBe(0);
  expect(quantity(next,501)).toBe(quantity(s,501)-1);
 });
 it.each(['missing','sp','silence','weight','dead','wrongclass'])('rejects %s before payment or RNG',reason=>{
  const {s,c,pitcher}=setup();s.skillUseLevels={[pitcher.id]:1};
  if(reason==='missing')s.inventory=s.inventory.filter(e=>e.itemId!==501);
  if(reason==='sp')s.sp=0;
  if(reason==='silence')s.playerStatuses={SC_SILENCE:{startsAt:0,expiresAt:2000,level:1}};
  if(reason==='weight')s.inventory.push({uid:'too-heavy',itemId:501,quantity:100000,refine:0,cards:[],favorite:false});
  if(reason==='dead')s.hp=0;if(reason==='wrongclass')s.job='novice';
  const before=structuredClone(s);expect(()=>applyCommand(s,c,{type:'useSkill',skillId:pitcher.id},1000)).toThrow();expect(s).toEqual(before);
 });
 it('a new preference does not rewrite a committed Meltdown cast level',()=>{
  const {s,c,meltdown}=setup('whitesmith');s.skillUseLevels={[meltdown.id]:1};
  const cast=applyCommand(s,c,{type:'useSkill',skillId:meltdown.id},1000),end=cast.supportCast!.endsAt,before=cast.sp;
  const configured=applyCommand(cast,c,{type:'setSkillUseLevel',skillId:meltdown.id,level:10},1000);
  expect(configured.supportCast!.level).toBe(1);expect(skillUseLevel(configured,c,meltdown.id)).toBe(10);
  resolveSoloAlchemyCast(configured,c,end);expect(configured.sp).toBe(before-50);
  expect(configured.buffs[meltdown.id].expiresAt).toBe(end+15000);expect(configured.combatEffects?.buffLevels?.[meltdown.id]).toBe(1);
  const resolved=structuredClone(configured);expect(resolveSoloAlchemyCast(configured,c,end)).toBe(false);expect(configured).toEqual(resolved);
 });
 it('lost resources at cast-end fail without applying a buff or consuming RNG',()=>{
  const {s,c,meltdown}=setup('whitesmith');s.skillUseLevels={[meltdown.id]:10};
  const cast=applyCommand(s,c,{type:'useSkill',skillId:meltdown.id},1000),end=cast.supportCast!.endsAt;
  cast.sp=0;const rng=cast.rngState;expect(resolveSoloAlchemyCast(cast,c,end)).toBe(false);
  expect(cast.buffs[meltdown.id]).toBeUndefined();expect(cast.rngState).toBe(rng);expect(cast.sp).toBe(0);
 });
 it('validates only complete configurable handlers; persisted malformed preferences cannot increase learned caps',()=>{
  const {s,c,pitcher}=setup();s.skillUseLevels={[pitcher.id]:100};expect(skillUseLevel(s,c,pitcher.id)).toBe(5);
  s.skillUseLevels[pitcher.id]=NaN;expect(skillUseLevel(s,c,pitcher.id)).toBe(5);
  expect(()=>applyCommand(s,c,{type:'setSkillUseLevel',skillId:source(c,'MG_FIREBOLT').id,level:1},1000)).toThrow();
  const changed=applyCommand(s,c,{type:'setSkillUseLevel',skillId:pitcher.id,level:2},1000);
  const resumed=JSON.parse(JSON.stringify(changed)) as GameState;expect(skillUseLevel(resumed,c,pitcher.id)).toBe(2);
  const max=applyCommand(resumed,c,{type:'setSkillUseLevel',skillId:pitcher.id,level:null},1000);expect(skillUseLevel(max,c,pitcher.id)).toBe(5);
 });
 it('AFK distinguishes HP and SP thresholds without changing manual rules',()=>{
  const {s,c,pitcher}=setup();s.sp=10;
  expect(soloAlchemyAfkUseful(s,c,pitcher,5,1000)).toBe(false);
  s.autoPotion.spThreshold=30;expect(soloAlchemyAfkUseful(s,c,pitcher,5,1000)).toBe(true);
  expect(soloAlchemyAfkUseful(s,c,pitcher,1,1000)).toBe(false);
  s.hp=1;expect(soloAlchemyAfkUseful(s,c,pitcher,1,1000)).toBe(false);
  s.autoPotion.hpThreshold=40;expect(soloAlchemyAfkUseful(s,c,pitcher,1,1000)).toBe(true);
  s.hp=Math.ceil(derivedStats(s,c).maxHp*0.5);expect(soloAlchemyAfkUseful(s,c,pitcher,1,1000)).toBe(false);
  s.autoPotion.hpThreshold=90;s.hp=Math.ceil(derivedStats(s,c).maxHp*0.8);expect(soloAlchemyAfkUseful(s,c,pitcher,1,1000)).toBe(false);
 });
});
describe('Alchemy automatic rotation runs real server actions',()=>{
 it('casts selected Potion Pitcher in rotation, then attacks before another support action',()=>{
  const {s,c,pitcher}=battle('alchemist');s.hp=1;s.skillUseLevels={[pitcher.id]:1};s.rotation=[pitcher.id];
  s.autoPotion.hpThreshold=70;s.battle!.playerNextSkillAt=1250;vi.spyOn(stateTools,'random').mockReturnValue(0.5);
  const healed=advanceState(s,c,1250);
  expect(healed.events.some(e=>e.kind==='heal'&&e.skillId===pitcher.id)).toBe(true);
  expect(healed.battle?.supportNeedsOffense).toBe(true);
  const attack=advanceState(healed,c,1750);
  expect(attack.events.some(e=>e.kind==='damage'&&e.sourceActorId===s.id&&e.target==='enemy')).toBe(true);
  expect(attack.events.filter(e=>e.kind==='heal'&&e.skillId===pitcher.id)).toHaveLength(1);
 });
 it('self-casts selected Meltdown in rotation without being classified as a Sage enchant',()=>{
  const {s,c,meltdown}=battle();s.skillUseLevels={[meltdown.id]:1};s.rotation=[meltdown.id];s.battle!.playerNextSkillAt=1250;
  const cast=advanceState(s,c,1250);expect(cast.supportCast?.skillId).toBe(meltdown.id);expect(cast.supportCast?.level).toBe(1);
  const end=cast.supportCast!.endsAt,next=advanceState(cast,c,Math.ceil(end/250)*250);
  expect(next.buffs[meltdown.id]?.expiresAt).toBe(end+15000);
 });
});
describe('Meltdown reaches actual enemy status consumers',()=>{
 it('NoDeathReset retains an already applied Meltdown during defeat in the live session',()=>{
  const {s,c,enemy,meltdown}=battle();s.hp=1;s.battle!.playerNextAttackAt=Number.MAX_SAFE_INTEGER;
  enemy.enemyNextAttackAt=1250;c.monsters[1002].attack=[1000,1000];c.monsters[1002].stats.dex=500;
  s.buffs[meltdown.id]={startsAt:1000,expiresAt:20000,effects:{}};s.combatEffects={buffLevels:{[meltdown.id]:1}};
  vi.spyOn(stateTools,'random').mockReturnValue(0.5);
  const next=advanceState(s,c,1250);expect(next.hp).toBe(0);expect(next.totals.deaths).toBe(1);
  expect(next.buffs[meltdown.id]).toEqual(s.buffs[meltdown.id]);expect(next.combatEffects?.buffLevels?.[meltdown.id]).toBe(1);
 });
 it('a living normal hit weakens a non-boss even in a challenge and uses Lv0 /75s without VIT-LUK-DEX resistance',()=>{
  const {s,c,enemy,meltdown}=battle();s.buffs[meltdown.id]={startsAt:1000,expiresAt:100000,effects:{}};
  s.combatEffects={buffLevels:{[meltdown.id]:10}};vi.spyOn(stateTools,'random').mockReturnValue(0);
  const next=advanceState(s,c,1250),target=next.battle!.enemies!.find(e=>e.id===enemy.id)!;
  expect(target.hp).toBeGreaterThan(0);expect(target.hp).toBeLessThan(enemy.hp);
  expect(target.statuses?.SC_NOEQUIPWEAPON).toMatchObject({level:0,startsAt:1250,expiresAt:76250});
  expect(target.statuses?.SC_NOEQUIPARMOR).toMatchObject({level:0,startsAt:1250,expiresAt:76250});
 });
});
