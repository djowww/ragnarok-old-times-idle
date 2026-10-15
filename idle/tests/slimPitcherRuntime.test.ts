import {beginBattle} from '../engine/encounters';
import {describe,expect,it} from 'vitest';
import {applyCommand,advanceState,createInitialState} from '../engine/index';
import {healFull,derivedStats} from '../engine/stats';
import catalogJson from '../content/catalog.json';
import type {Catalog,GameState} from '../shared/types';
function setup(level=1){
 const c=structuredClone(catalogJson) as unknown as Catalog;c.skills.cr_slimpitcher.implementation='supported';c.skills.cr_slimpitcher.manualUse='activate';c.classes.creator.jobBonuses={};
 const s=createInitialState(c,0);Object.assign(s,{job:'creator',reborn:true,baseLevel:70,jobLevel:40,rotation:[],equipment:{},stats:{str:40,agi:1,vit:1,int:1,dex:0,luk:1},learnedSkills:{cr_slimpitcher:10,potion_pitcher:5,am_learningpotion:10},skillUseLevels:{cr_slimpitcher:level},inventory:[545,546,547].map(itemId=>({uid:'slim-'+itemId,itemId,quantity:2,refine:0,cards:[],favorite:false})),combatEffects:{regenBlockedUntil:20000},autoPotion:{hpThreshold:0,spThreshold:0}});healFull(s,c);s.hp=1;return{s,c};
}
describe('Slim Potion Pitcher own-cast contract',()=>{
 it.each([[1,545,168],[5,545,168],[6,546,627],[9,546,627],[10,547,1116]])('uses level%s potion%s with learned-level healing%s', (level,itemId,healing)=>{
  const {s,c}=setup(level);const initial=structuredClone(s);const cast=applyCommand(s,c,{type:'useSkill',skillId:'cr_slimpitcher'},0);expect(cast.supportCast).toMatchObject({skillId:'cr_slimpitcher',level,startedAt:0,endsAt:1000});expect(cast.sp).toBe(s.sp);expect(cast.inventory.find(e=>e.itemId===itemId)!.quantity).toBe(2);
  const done=advanceState(cast,c,1000);expect(done.sp).toBe(s.sp-30);expect(done.inventory.find(e=>e.itemId===itemId)!.quantity).toBe(1);expect(done.events.find(e=>e.kind==='heal'&&e.skillId==='cr_slimpitcher')).toMatchObject({amount:healing,skillLevel:level,targetActorId:s.id});expect(done.playerCanActAt).toBe(2000);expect(done.supportCast).toBeUndefined();expect(s).toEqual(initial);
 });
 it('uses the skill pipeline independently from the drinking item cooldown',()=>{
  const {s,c}=setup();s.potionReadyAt=999999;expect(()=>applyCommand(s,c,{type:'useSkill',skillId:'cr_slimpitcher'},0)).not.toThrow();
 });
 it.each(['class','unlearned','sp','item','canact'])('rejects%s without a resource/RNG charge',why=>{
  const {s,c}=setup();if(why==='class')s.job='alchemist';if(why==='unlearned')delete s.learnedSkills.cr_slimpitcher;if(why==='sp')s.sp=0;if(why==='item')s.inventory=s.inventory.filter(e=>e.itemId!==545);if(why==='canact')s.playerCanActAt=1;
  const before=structuredClone(s);expect(()=>applyCommand(s,c,{type:'useSkill',skillId:'cr_slimpitcher'},0)).toThrow();expect(s).toEqual(before);
 });
 it('keeps the committed used level across preference changes and serialized reconnect',()=>{
  const {s,c}=setup(1);let cast=applyCommand(s,c,{type:'useSkill',skillId:'cr_slimpitcher'},0);
  cast=applyCommand(cast,c,{type:'setSkillUseLevel',skillId:'cr_slimpitcher',level:10},100);
  const done=advanceState(JSON.parse(JSON.stringify(cast)),c,1000);expect(done.events.find(e=>e.kind==='heal'&&e.skillId==='cr_slimpitcher')).toMatchObject({itemId:545,skillLevel:1,amount:168});expect(done.inventory.find(e=>e.itemId===547)!.quantity).toBe(2);
  const resumed=advanceState(JSON.parse(JSON.stringify(done)),c,1001);expect(resumed.inventory.find(e=>e.itemId===545)!.quantity).toBe(1);
 });
 it('revalidates the last potion at cast completion without a partial charge',()=>{
  const {s,c}=setup();const cast=applyCommand(s,c,{type:'useSkill',skillId:'cr_slimpitcher'},0);cast.inventory=cast.inventory.filter(e=>e.itemId!==545);
  const done=advanceState(cast,c,1000);expect(done.sp).toBe(s.sp);expect(done.hp).toBe(s.hp);expect(done.events.some(e=>e.kind==='heal'&&e.skillId==='cr_slimpitcher')).toBe(false);expect(done.events.some(e=>e.kind==='cast-failed'&&e.skillId==='cr_slimpitcher')).toBe(true);
 });
 it('DEX reduces only the cast while native aftercast stays one second',()=>{
  const {s,c}=setup();s.stats.dex=75;const cast=applyCommand(s,c,{type:'useSkill',skillId:'cr_slimpitcher'},0);expect(cast.supportCast!.endsAt).toBe(500);const done=advanceState(cast,c,500);expect(done.playerCanActAt).toBe(1500);expect(done.potionReadyAt).toBe(s.potionReadyAt);
 });

 it('accepts the real rotation command and completes a compact pitcher cast autonomously during battle',()=>{
  const {s,c}=setup(1);s.status='challenge';s.autoPotion.hpThreshold=70;s.potionReadyAt=999999;beginBattle(s,c,1002,0,'mastering');
  for(const enemy of s.battle!.enemies!){enemy.enemyNextAttackAt=999999;enemy.arrivedAt=0;enemy.startedAt=0;enemy.position={x:.48,y:.65};enemy.approachFrom={...enemy.position};enemy.hp=100000;}
  const rotated=applyCommand(s,c,{type:'setRotation',skillIds:['cr_slimpitcher']},0);
  expect(rotated.rotation).toEqual(['cr_slimpitcher']);const casting=advanceState(rotated,c,1000);
  expect(casting.supportCast).toMatchObject({skillId:'cr_slimpitcher',level:1});
  const done=advanceState(casting,c,casting.supportCast!.endsAt);expect(done.events.filter(e=>e.kind==='heal'&&e.skillId==='cr_slimpitcher')).toHaveLength(1);
  expect(done.inventory.find(e=>e.itemId===545)!.quantity).toBe(1);expect(done.potionReadyAt).toBe(999999);expect(done.battle!.supportNeedsOffense).toBe(true);
  const later=advanceState(done,c,10000),heals=later.events.filter(e=>e.kind==='heal'&&e.skillId==='cr_slimpitcher');expect(heals).toHaveLength(2);expect(later.events.some(e=>e.kind==='damage'&&e.sourceActorId===s.id&&e.at>heals[0].at&&e.at<heals[1].at)).toBe(true);
 });

});
