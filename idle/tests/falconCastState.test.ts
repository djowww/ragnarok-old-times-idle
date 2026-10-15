import {describe,expect,it} from 'vitest';
import {advanceState,applyCommand,createInitialState} from '../engine/index';
import {beginBattle} from '../engine/encounters';
import {healFull} from '../engine/stats';
import data from '../content/catalog.json';
import type {Catalog} from '../shared/types';
function setup(sourceName:string,equipped:boolean){
 const c=structuredClone(data) as unknown as Catalog;const skill=Object.values(c.skills).find(k=>k.sourceName===sourceName)!;
 const s=createInitialState(c,0);s.job=sourceName==='HT_BLITZBEAT'?'hunter':'sniper';c.classes[s.job].jobBonuses={};s.baseLevel=70;s.jobLevel=40;s.stats={str:10,agi:1,vit:30,int:30,dex:0,luk:1};s.equipment={};s.learnedSkills={ht_falcon:1,ht_steelcrow:10,[skill.id]:5};s.rotation=[skill.id];s.falconEquipped=equipped;s.autoPotion={hpThreshold:0,spThreshold:0};s.combatEffects={regenBlockedUntil:999999};healFull(s,c);
 s.status='challenge';beginBattle(s,c,1002,0,'mastering');s.battle!.playerNextAttackAt=999999;s.battle!.playerNextSkillAt=0;s.battle!.playerActionReadyAt=0;
 for(const enemy of s.battle!.enemies!){enemy.hp=enemy.maxHp=100000;enemy.startedAt=enemy.arrivedAt=0;enemy.enemyNextAttackAt=999999;enemy.position={x:.48,y:.65};enemy.approachFrom={...enemy.position};}
 return{s,c,skill};
}
describe('native Falcon required-state cast boundary',()=>{
 it.each(['HT_BLITZBEAT','SN_FALCONASSAULT'])('%s cannot start or charge without an equipped Falcon',source=>{
  const {s,c,skill}=setup(source,false);const next=advanceState(s,c,500);expect(next.battle?.cast).toBeUndefined();expect(next.events.some(e=>e.kind==='cast'&&e.skillId===skill.id)).toBe(false);expect(next.sp).toBe(s.sp);
 });
 it.each(['HT_BLITZBEAT','SN_FALCONASSAULT'])('%s retains an already committed cast after free dismissal',source=>{
  const {s,c,skill}=setup(source,true);const casting=advanceState(s,c,250);expect(casting.battle?.cast).toMatchObject({skillId:skill.id});const end=casting.battle!.cast!.endsAt;
  const dismissed=applyCommand(casting,c,{type:'dismissFalcon'},casting.lastSimulatedAt+1);expect(dismissed.falconEquipped).toBe(false);expect(dismissed.battle!.cast).toBeDefined();
  const released=advanceState(dismissed,c,end+250);expect(released.falconStrikes).toHaveLength(1);const impact=released.falconStrikes![0].impactAt;const done=advanceState(released,c,impact+250);expect(done.events.some(e=>e.kind==='damage'&&e.skillId===skill.id)).toBe(true);expect(done.sp).toBeLessThan(s.sp);
  const later=advanceState(done,c,end+10000);expect(later.events.filter(e=>e.kind==='cast'&&e.skillId===skill.id)).toHaveLength(1);
 });
});
