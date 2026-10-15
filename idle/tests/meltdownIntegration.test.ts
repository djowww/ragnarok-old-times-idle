import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, GameState, Skill } from '../shared/types.js';
import { createInitialState } from '../engine/index.js';
import { effectiveMonsterStatus } from '../engine/classicStatuses.js';
import { classicStrippedMonster } from '../engine/classic.js';
import { beginBattle } from '../engine/encounters.js';
import { applyMeltdownHit, meltdownAttackKind } from '../engine/meltdown.js';
import * as stateTools from '../engine/state.js';
const source = (c:Catalog,name:string)=>Object.values(c.skills).find(skill=>skill.sourceName===name)!;
function setup() {
 const c=structuredClone(rawCatalog) as unknown as Catalog,s=createInitialState(c,1000,'meltdown-hit');
 beginBattle(s,c,1002,1000);const enemy=s.battle!.enemies![0],skill=source(c,'WS_MELTDOWN');
 s.buffs[skill.id]={startsAt:1000,expiresAt:61000,effects:{}};
 s.combatEffects={buffLevels:{[skill.id]:10}};c.monsters[1002].boss=false;
 const roll=vi.spyOn(stateTools,'random').mockReturnValue(0);
 return {c,s,enemy,skill,roll};
}
afterEach(()=>vi.restoreAllMocks());
describe('native Meltdown hit integration',()=>{
 it('Lv0 strips feed actual ATK and VIT consumers, expiring at the source deadline',()=>{
  const {c,s,enemy}=setup();c.monsters[1002].stats.vit=99;applyMeltdownHit(s,c,enemy,1000,10);
  const activeNames=Object.keys(enemy.statuses!).filter(name=>enemy.statuses![name].expiresAt>1000);
  const status=effectiveMonsterStatus(classicStrippedMonster(c.monsters[1002],activeNames),enemy.statuses,1000);
  expect(status.atkPercent).toBe(75);expect(status.monster.stats.vit).toBe(60);
  const expired=effectiveMonsterStatus(classicStrippedMonster(c.monsters[1002],[]),enemy.statuses,76000);
  expect(expired.atkPercent).toBe(100);expect(expired.monster.stats.vit).toBe(99);
 });
 it('draws break/status in weapon/armor order and uses captured buff level',()=>{
  const {c,s,enemy,skill,roll}=setup();s.learnedSkills[skill.id]=1;s.skillUseLevels={[skill.id]:1};
  roll.mockReturnValueOnce(0.09).mockReturnValueOnce(0.8).mockReturnValueOnce(0.069).mockReturnValueOnce(0.9);
  applyMeltdownHit(s,c,enemy,1000,10);
  expect(roll).toHaveBeenCalledTimes(4);expect(enemy.statuses?.SC_NOEQUIPWEAPON?.level).toBe(0);
  expect(enemy.statuses?.SC_NOEQUIPARMOR?.expiresAt).toBe(76000);
  expect(s.events.filter(e=>e.kind==='status-start').map(e=>e.statusName)).toEqual(['SC_NOEQUIPWEAPON','SC_NOEQUIPARMOR']);
 });
 it('does not replace or renew a stronger existing Rogue strip but still draws status_start',()=>{
  const {c,s,enemy,roll}=setup();const strong={startsAt:500,expiresAt:2000,level:5};enemy.statuses={SC_NOEQUIPWEAPON:{...strong},SC_NOEQUIPARMOR:{...strong}};
  applyMeltdownHit(s,c,enemy,1000,10);expect(roll).toHaveBeenCalledTimes(4);
  expect(enemy.statuses).toEqual({SC_NOEQUIPWEAPON:strong,SC_NOEQUIPARMOR:strong});
  expect(s.events.filter(e=>e.kind==='status-start')).toEqual([]);
 });
 it('Emperium rejection precedes status_start RNG while retaining break draws',()=>{
  const {c,s,enemy,roll}=setup();c.monsters[1288]={...c.monsters[1002],id:1288,boss:false};enemy.monsterId=1288;
  applyMeltdownHit(s,c,enemy,1000,10);expect(roll).toHaveBeenCalledTimes(2);expect(enemy.statuses?.SC_NOEQUIPWEAPON).toBeUndefined();
 });
 it('renews Lv0 from the exact hit deadline',()=>{
  const {c,s,enemy}=setup();enemy.statuses={SC_NOEQUIPWEAPON:{startsAt:500,expiresAt:2000,level:0}};
  applyMeltdownHit(s,c,enemy,1000,10);expect(enemy.statuses.SC_NOEQUIPWEAPON).toMatchObject({startsAt:1000,expiresAt:76000,level:0});
 });
 it('skips protected break draw, but a boss consumes both unprotected break draws and no status draws',()=>{
  const {c,s,enemy,roll}=setup();enemy.statuses={SC_PROTECTWEAPON:{expiresAt:1001,level:1}};
  applyMeltdownHit(s,c,enemy,1000,10);expect(roll).toHaveBeenCalledTimes(2);expect(enemy.statuses.SC_NOEQUIPWEAPON).toBeUndefined();
  expect(enemy.statuses.SC_NOEQUIPARMOR).toBeDefined();roll.mockClear();delete enemy.statuses.SC_PROTECTWEAPON;delete enemy.statuses.SC_NOEQUIPARMOR;c.monsters[1002].boss=true;
  applyMeltdownHit(s,c,enemy,1000,10);expect(roll).toHaveBeenCalledTimes(2);expect(enemy.statuses.SC_NOEQUIPARMOR).toBeUndefined();
 });
 it.each(['expired','future','missing-level','fatal','miss','magic','misc','termination'])('rejects %s without proc draws',reason=>{
  const {c,s,enemy,skill,roll}=setup();let hit:Skill|undefined=undefined,at=1000,damage=10;
  if(reason==='expired')at=61000;if(reason==='future')at=999;if(reason==='missing-level')delete s.combatEffects!.buffLevels;
  if(reason==='fatal')enemy.hp=0;if(reason==='miss')damage=0;
  if(reason==='magic')hit=source(c,'MG_FIREBOLT');if(reason==='misc')hit=source(c,'TF_THROWSTONE');
  if(reason==='termination')hit=source(c,'WS_CARTTERMINATION');
  applyMeltdownHit(s,c,enemy,at,damage,hit);expect(roll).not.toHaveBeenCalled();expect(enemy.statuses?.SC_NOEQUIPWEAPON).toBeUndefined();
 });
 it.each(['MO_EXTREMITYFIST','LK_SPIRALPIERCE','ASC_BREAKER','AM_DEMONSTRATION','AS_SPLASHER','HT_FREEZINGTRAP'])('keeps native BF_WEAPON for %s',name=>{
  const {c,s,enemy}=setup();const skill=source(c,name);expect(meltdownAttackKind(skill)).toBe('weapon');
  applyMeltdownHit(s,c,enemy,1000,10,skill);expect(enemy.statuses?.SC_NOEQUIPWEAPON).toBeDefined();
 });
 it.each(['PA_PRESSURE','HT_LANDMINE','HT_BLASTMINE','HT_CLAYMORETRAP','BA_DISSONANCE'])('keeps native BF_MISC for %s',name=>{
  const {c,s,enemy,roll}=setup();const skill=source(c,name);expect(meltdownAttackKind(skill)).toBe('misc');
  applyMeltdownHit(s,c,enemy,1000,10,skill);expect(roll).not.toHaveBeenCalled();
 });
});
