import {describe,it,expect} from 'vitest';
import {createInitialState,applyCommand,advanceState} from '../engine';
import {beginBattle} from '../engine/encounters';
import {derivedStats} from '../engine/stats';
import raw from '../content/catalog.json';
import type {Catalog} from '../shared/types';
import {BATTLE_HERO} from '../shared/battleSpatial';
const c=raw as unknown as Catalog;
describe('actual catalog legal point and paid acquisition flow',()=>{
 it('learns, buys real priced materials, produces, and conversion increases the next actual elemental spell damage',()=>{
  const original=JSON.stringify(c);let s=createInitialState(c,0);
  // Explicit RAM progression fixture:9 novice+39 Mage+49 Sage points.
  s.baseLevel=99;s.jobLevel=10;s.skillPoints=97;s.zeny=20000;
  s=applyCommand(s,c,{type:'changeClass',classId:'mage'},0);s.jobLevel=40;
  s=applyCommand(s,c,{type:'changeClass',classId:'sage'},0);s.jobLevel=50;
  const learn=(id:string,level=1)=>{
   for(const prerequisite of c.skills[id].prerequisitesByClass?.[s.job]??c.skills[id].prerequisites??[])learn(prerequisite.skillId,prerequisite.level);
   while((s.learnedSkills[id]??0)<level)s=applyCommand(s,c,{type:'learnSkill',skillId:id},0);
  };
  learn('sa_createcon');learn('sa_elementfire');learn('cold_bolt');expect(s.skillPoints).toBeLessThan(97);
  s.stats={str:1,agi:1,vit:1,int:20,dex:1,luk:1};s.sp=derivedStats(s,c).maxSp;
  const initialZeny=s.zeny;s=applyCommand(s,c,{type:'buy',itemId:7433,quantity:2},0);
  s=applyCommand(s,c,{type:'buy',itemId:904,quantity:6},0);expect(initialZeny-s.zeny).toBe(8744);
  const beforeSp=s.sp;s=applyCommand(s,c,{type:'craftConverter',itemId:12114,quantity:2},0);
  expect(s.sp).toBe(beforeSp-30);expect(s.inventory.find(i=>i.itemId===12114)!.quantity).toBe(2);
  const sold=applyCommand(s,c,{type:'sellLoot'},0);expect(sold.inventory.find(i=>i.itemId===12114)!.quantity).toBe(2);
  s=applyCommand(s,c,{type:'setPotions',hpThreshold:0,spThreshold:0},0);
  s=applyCommand(s,c,{type:'setRotation',skillIds:['sa_elementfire','cold_bolt']},0);
  s.status='challenge';s.areaId='prontera';beginBattle(s,c,1175,0,c.challenges[0].id);
  const e=s.battle!.enemies![0],point={x:BATTLE_HERO.x+1/12,y:BATTLE_HERO.y};
  Object.assign(e,{position:point,approachFrom:{...point},startedAt:0,arrivedAt:0,enemyNextAttackAt:999999,hostile:true});
  s.battle!.playerNextAttackAt=999999;s.battle!.playerNextSkillAt=s.battle!.playerActionReadyAt=0;s.rngState=2;
  const startSp=s.sp,converted=advanceState(s,c,2250),property=converted.battle!.enemies![0].statuses?.SC_ARMOR_PROPERTY;
  expect(property).toMatchObject({element:'fire',level:1});expect(converted.sp).toBe(startSp-30);
  expect(converted.inventory.find(i=>i.itemId===12114)!.quantity).toBe(1);
  const base=structuredClone(converted);delete base.battle!.enemies![0].statuses!.SC_ARMOR_PROPERTY;
  for(const branch of [converted,base]) {branch.rotation=['cold_bolt'];branch.battle!.playerNextSkillAt=branch.battle!.playerActionReadyAt=2250;}
  const damage=(state:typeof s)=>advanceState(state,c,5000).events.filter(e=>e.kind==='damage'&&e.skillId==='cold_bolt').reduce((n,e)=>n+(e.amount??0),0);
  expect(damage(converted)).toBeGreaterThan(damage(base));expect(JSON.stringify(c)).toBe(original);
 });
});
