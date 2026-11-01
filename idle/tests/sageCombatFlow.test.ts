import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog, GameState, Skill } from '../shared/types';
import catalogJson from '../content/catalog.json';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { derivedStats } from '../engine/stats';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';
function setup() {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = fixture();
  const original = catalogJson as unknown as Catalog;
  for (const source of ['SA_AUTOSPELL','PF_DOUBLECASTING','PF_MEMORIZE','MG_FIREBOLT','MG_COLDBOLT']) {
    const imported = Object.values(original.skills).find(skill => skill.sourceName === source)!;
    c.skills[imported.id] = {...structuredClone(imported), implementation:'supported'};
    c.classes.novice.skills.push(imported.id);
  }
  c.monsters[1002].hp=100000; c.monsters[1002].element='neutral';
  c.monsters[1002].baseExp=0; c.monsters[1002].jobExp=0;
  const s=createInitialState(c,0); s.status='challenge'; s.rotation=[]; s.learnedSkills={};
  s.autoPotion={hpThreshold:0,spThreshold:0}; s.stats.dex=1; s.stats.int=99; s.sp=derivedStats(s,c).maxSp;
  beginBattle(s,c,1002,0,'mastering');
  const enemy=s.battle!.enemies![0]; enemy.position={...BATTLE_HERO}; enemy.approachFrom={...BATTLE_HERO}; enemy.arrivedAt=0; enemy.enemyNextAttackAt=999999;
  const skill=(source:string)=>Object.values(c.skills).find(candidate=>candidate.sourceName===source)!;
  return {c,s,skill};
}
function effects(s: GameState) { return (s.combatEffects ??= {}) as NonNullable<GameState['combatEffects']> & {autospell?:{skillId:string;level:number};memorizeCharges?:number}; }
function active(s:GameState,skill:Skill,level:number) { s.learnedSkills[skill.id]=level; s.buffs[skill.id]={expiresAt:99999,effects:{}}; (effects(s).buffLevels??={})[skill.id]=level; }
function spellSetup() {
  const x=setup(); const bolt=x.skill('MG_FIREBOLT'); bolt.castTimeMs=[0]; bolt.afterCastDelayMs=[0];
  x.s.learnedSkills[bolt.id]=1; x.s.rotation=[bolt.id]; x.s.battle!.playerNextAttackAt=99999;
  return {...x,bolt};
}
afterEach(()=>vi.restoreAllMocks());
describe('Sage combat integration',()=>{
  it('snapshots the explicit Hindsight choice on buff cast and preserves it across configuration changes',()=>{
    const {c,s,skill}=setup(); const buff=skill('SA_AUTOSPELL'); buff.castTimeMs=[0];
    s.learnedSkills[buff.id]=10; s.learnedSkills[skill('MG_FIREBOLT').id]=3; s.learnedSkills[skill('MG_COLDBOLT').id]=3;
    s.autospellSkillId=skill('MG_FIREBOLT').id; s.rotation=[buff.id];
    const cast=advanceState(s,c,1000);
    expect(effects(cast).autospell).toEqual({skillId:skill('MG_FIREBOLT').id,level:3});
    const configured=applyCommand(cast,c,{type:'setAutospell',skillId:skill('MG_COLDBOLT').id},1000);
    expect(effects(configured).autospell).toEqual({skillId:skill('MG_FIREBOLT').id,level:3});
  });
  it('does not activate Hindsight until a spell is selected',()=>{
    const {c,s,skill}=setup(); const buff=skill('SA_AUTOSPELL'); buff.castTimeMs=[0];
    s.learnedSkills[buff.id]=10; s.rotation=[buff.id];
    const next=advanceState(s,c,1000);
    expect(next.buffs[buff.id]).toBeUndefined(); expect(next.sp).toBe(s.sp);
  });
  it('procs on a missed normal attack and charges only discounted spell SP without replacing basic animation',()=>{
    const {c,s,skill}=setup(); const bolt=skill('MG_FIREBOLT');
    active(s,skill('SA_AUTOSPELL'),10); s.learnedSkills[bolt.id]=3;
    effects(s).autospell={skillId:bolt.id,level:3};
    c.monsters[1002].stats.agi=999; c.monsters[1002].level=999;
    vi.mocked(stateTools.random).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValueOnce(0.99).mockReturnValue(0);
    const next=advanceState(s,c,1000);
    expect(next.events.some(e=>e.kind==='miss'&&e.actorAction==='attack')).toBe(true);
    expect(next.events.find(e=>e.kind==='damage'&&e.skillId===bolt.id)?.actorAction).toBe('none');
    expect(next.sp).toBe(s.sp-Math.trunc(bolt.spCost[2]*2/3));
    expect(next.skillReadyAt[bolt.id]).toBeUndefined();
  });
  it('charges successful Hindsight SP after a lethal normal attack without hitting its dead target',()=>{
    const {c,s,skill}=setup(); const bolt=skill('MG_FIREBOLT');
    active(s,skill('SA_AUTOSPELL'),10); s.learnedSkills[bolt.id]=3; effects(s).autospell={skillId:bolt.id,level:3};
    s.battle!.enemies![0].hp=1;
    const next=advanceState(s,c,1000);
    expect(next.events.some(e=>e.kind==='kill')).toBe(true); expect(next.sp).toBe(s.sp-Math.trunc(bolt.spCost[2]*2/3));
    expect(next.events.some(e=>e.skillId===bolt.id&&e.kind==='damage')).toBe(false);
  });
  it('schedules a free Double Casting repeat at amotion and does not recursively repeat',()=>{
    const {c,s,skill,bolt}=spellSetup(); active(s,skill('PF_DOUBLECASTING'),5);
    const motion=derivedStats(s,c).attackIntervalMs/2;
    const cast=advanceState(s,c,1000);
    const delayed=cast.battle!.delayedSkills?.find(d=>(d as typeof d&{effect?:string}).effect==='doublecast');
    expect(delayed).toMatchObject({skillId:bolt.id,level:1,endsAt:1000+motion});
    cast.rotation=[];
    const repeated=advanceState(cast,c,Math.ceil((1000+motion)/250)*250);
    expect(repeated.events.filter(e=>e.kind==='damage'&&e.skillId===bolt.id)).toHaveLength(2);
    expect(repeated.sp).toBe(s.sp-bolt.spCost[0]);
    expect(repeated.battle!.delayedSkills??[]).toHaveLength(0);
  });
  it('drops Double Casting when its original target dies without retargeting',()=>{
    const {c,s,skill,bolt}=spellSetup(); active(s,skill('PF_DOUBLECASTING'),5);
    const cast=advanceState(s,c,1000); cast.rotation=[];
    expect(cast.battle!.delayedSkills?.some(d=>(d as typeof d&{effect?:string}).effect==='doublecast')).toBe(true);
    const old=cast.battle!.enemies![0];
    cast.battle!.enemies!.push({...structuredClone(old),id:'other',hp:100000}); old.hp=0;
    cast.battle!.targetId='other';
    const next=advanceState(cast,c,2000);
    expect(next.events.filter(e=>e.kind==='damage'&&e.skillId===bolt.id)).toHaveLength(1);
    expect(next.battle!.enemies!.find(e=>e.id==='other')!.hp).toBe(100000);
  });
  it('rolls and queues Double Casting after a lethal Bolt until its timer discards the dead target',()=>{
    const {c,s,skill,bolt}=spellSetup(); active(s,skill('PF_DOUBLECASTING'),5);
    const old=s.battle!.enemies![0]; s.battle!.enemies!.push({...structuredClone(old),id:'other',hp:100000}); old.hp=1;
    const cast=advanceState(s,c,1000); cast.rotation=[];
    expect(cast.battle!.delayedSkills?.some(d=>d.effect==='doublecast'&&d.targetId===old.id)).toBe(true);
    const next=advanceState(cast,c,2000);
    expect(next.events.filter(e=>e.kind==='damage'&&e.skillId===bolt.id)).toHaveLength(1);
    expect(next.battle!.enemies!.find(e=>e.id==='other')!.hp).toBe(100000);
  });
  it('Double Casting hits the same living target after it leaves ordinary cast range',()=>{
    const {c,s,skill,bolt}=spellSetup(); active(s,skill('PF_DOUBLECASTING'),5);
    const cast=advanceState(s,c,1000); cast.rotation=[];
    const old=cast.battle!.enemies![0]; old.position={x:BATTLE_HERO.x+100,y:BATTLE_HERO.y}; old.approachFrom={...old.position}; old.arrivedAt=0;
    const next=advanceState(cast,c,2000);
    expect(next.events.filter(e=>e.kind==='damage'&&e.skillId===bolt.id)).toHaveLength(2);
  });
  it('orphan saved Memorize charges without a buff do not reduce cast time',()=>{
    const {c,s,bolt}=spellSetup(); effects(s).memorizeCharges=5; bolt.castTimeMs=[1000]; bolt.ignoresDex=true;
    const next=advanceState(s,c,1000);
    expect(next.battle!.cast!.endsAt-next.battle!.cast!.startedAt).toBe(1000);
  });
  it('an interrupted Memorize cast spends its charge at start but pays no spell SP',()=>{
    const {c,s,skill,bolt}=spellSetup(); active(s,skill('PF_MEMORIZE'),1); effects(s).memorizeCharges=5;
    bolt.castTimeMs=[1000]; bolt.ignoresDex=true; bolt.interruptCast=true;
    c.monsters[1002].attack=[10,10]; c.monsters[1002].stats.dex=999;
    s.battle!.enemies![0].hostile=true; s.battle!.enemies![0].enemyNextAttackAt=1100;
    const start=advanceState(s,c,1000); expect(effects(start).memorizeCharges).toBe(4);
    start.rotation=[]; vi.mocked(stateTools.random).mockReturnValue(0.5);
    const next=advanceState(start,c,1250);
    expect(next.events.some(e=>e.kind==='cast-interrupted'&&e.skillId===bolt.id)).toBe(true);
    expect(next.sp).toBe(s.sp); expect(effects(next).memorizeCharges).toBe(4);
  });
  it('Memorize creates five charges and halves only real positive cast starts',()=>{
    const {c,s,skill}=setup(); const memorize=skill('PF_MEMORIZE'); memorize.castTimeMs=[0];
    s.learnedSkills[memorize.id]=1; s.rotation=[memorize.id]; s.battle!.playerNextAttackAt=99999;
    const buff=advanceState(s,c,1000); expect(effects(buff).memorizeCharges).toBe(5);
    const bolt=skill('MG_FIREBOLT'); bolt.castTimeMs=[1000]; bolt.ignoresDex=true;
    const readyAt=buff.playerCanActAt!;
    buff.learnedSkills[bolt.id]=1; buff.rotation=[bolt.id]; buff.battle!.playerActionReadyAt=readyAt; buff.battle!.playerNextSkillAt=readyAt;
    const start=advanceState(buff,c,Math.ceil(readyAt/250)*250);
    expect(start.battle!.cast!.endsAt-start.battle!.cast!.startedAt).toBe(500);
    expect(effects(start).memorizeCharges).toBe(4);
  });
  it('Memorize keeps charges for instant or status-ignoring spells',()=>{
    for(const mode of ['instant','status-ignore']) {
      const {c,s,skill,bolt}=spellSetup(); active(s,skill('PF_MEMORIZE'),1); effects(s).memorizeCharges=5;
      bolt.castTimeMs=[mode==='instant'?0:1000]; bolt.ignoresDex=true;
      (bolt as Skill&{ignoresStatusEffects?:boolean}).ignoresStatusEffects=mode==='status-ignore';
      const next=advanceState(s,c,1001); expect(effects(next).memorizeCharges).toBe(5);
    }
  });
  it('Sage support buffs allow the due basic attack to follow',()=>{
    const {c,s,skill}=setup(); const buff=skill('PF_DOUBLECASTING'); buff.castTimeMs=[0]; buff.afterCastDelayMs=[0];
    s.learnedSkills[buff.id]=5; s.rotation=[buff.id];
    const next=advanceState(s,c,3000);
    expect(next.buffs[buff.id]).toBeDefined();
    expect(next.events.some(e=>e.kind==='damage'&&e.actorAction==='attack')).toBe(true);
  });
});
