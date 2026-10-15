import { describe, expect, it, vi, afterEach } from 'vitest';
import { createInitialState } from '../engine';
import { fixture } from './engine-fixture';
import { cancelInvalidMonsterStatusCasts, interruptMonsterStatusCast, takeMonsterStatusCast, tryMonsterStatusSkill } from '../engine/monsterStatusSkills';
import type { BattleEnemy } from '../shared/types';
import * as state from '../engine/state';
import { battleHeroAt } from '../shared/battleSpatial';
afterEach(()=>vi.restoreAllMocks());
describe('bounded source NPC skill scheduling',()=>{
  it('records normal attacks under Silence without rolling or changing a skill cooldown',()=>{
    const c=fixture(),s=createInitialState(c,0);
    c.monsters[1002].npcStatusSkills=[{skillId:176,sourceName:'NPC_POISON',level:1,rate:500,castTimeMs:800,delayMs:5000,range:9,cancelable:false,status:'SC_POISON',durationMs:60000}];
    const enemy:BattleEnemy={id:'tarou',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.62},hostile:true,statuses:{SC_SILENCE:{level:1,expiresAt:1000}}};
    const rng=vi.spyOn(state,'random').mockReturnValue(.02);
    expect(tryMonsterStatusSkill(s,c,enemy,100)).toBe(false);
    expect(enemy.npcCombat?.firstAttackDone).toBe(true);
    expect(enemy.npcCombat?.readyAt).toEqual({});expect(rng).not.toHaveBeenCalled();
    expect(tryMonsterStatusSkill(s,c,enemy,1000)).toBe(true);expect(rng).toHaveBeenCalledTimes(1);
    expect(enemy.npcCombat!.cast?.startedAt).toBe(1000);
  });
  it('first attack is normal, rate 500 inclusive starts a cast and cooldown at start',()=>{
    const c=fixture(),s=createInitialState(c,0); c.monsters[1002].npcStatusSkills=[{skillId:176,sourceName:'NPC_POISON',level:1,rate:500,castTimeMs:800,delayMs:5000,range:9,cancelable:false,status:'SC_POISON',durationMs:60000}];
    const enemy:BattleEnemy={id:'tarou',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.62},hostile:true};
    const rng=vi.spyOn(state,'random').mockReturnValue(.05);
    expect(tryMonsterStatusSkill(s,c,enemy,0)).toBe(false);expect(rng).not.toHaveBeenCalled();
    expect(tryMonsterStatusSkill(s,c,enemy,1000)).toBe(true);
    expect(enemy.npcCombat).toMatchObject({readyAt:{176:6000},cast:{startedAt:1000,endsAt:1800,targetActorId:s.id}});
    expect(tryMonsterStatusSkill(s,c,enemy,1500)).toBe(false);expect(rng).toHaveBeenCalledTimes(1);
  });
  it.each([499,500,501])('source selection rate500 includes integer roll%s exactly',roll=>{
    const c=fixture(),s=createInitialState(c,0);c.monsters[1002].npcStatusSkills=[{skillId:177,sourceName:'NPC_BLINDATTACK',level:3,rate:500,castTimeMs:0,delayMs:5000,range:9,cancelable:true,status:'SC_BLIND',durationMs:30000}];
    const enemy:BattleEnemy={id:'nightmare',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.62},approachFrom:{x:.5,y:.62},hostile:true,npcCombat:{firstAttackDone:true,readyAt:{}}};
    vi.spyOn(state,'random').mockReturnValue(roll/10000);expect(tryMonsterStatusSkill(s,c,enemy,0)).toBe(roll<=500);
  });
  it('rolls the source Rate before rejecting an ineligible MSC_SKILLUSED event',()=>{
    const c=fixture(),s=createInitialState(c,0);c.monsters[1002].npcStatusSkills=[
      {skillId:19,sourceName:'MG_COLDBOLT',damageType:'magic',level:5,rate:2000,castTimeMs:0,delayMs:5000,cancelable:false,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS',sourceRowIndex:14},
      {skillId:19,sourceName:'MG_COLDBOLT',damageType:'magic',level:5,rate:4000,castTimeMs:0,delayMs:5000,cancelable:false,range:9,state:'MSS_RUSH',condition:'MSC_SKILLUSED',conditionData:18,sourceRowIndex:15},
    ];
    const enemy:BattleEnemy={id:'moonlight',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.83},approachFrom:{x:.5,y:.83},hostile:true,npcCombat:{firstAttackDone:false,readyAt:{}}};
    const rng=vi.spyOn(state,'random').mockReturnValue(.99);
    expect(tryMonsterStatusSkill(s,c,enemy,0)).toBe(false);
    expect(rng).toHaveBeenCalledTimes(2);
    expect(enemy.npcCombat?.cast).toBeUndefined();
  });
  it('retains the selected repeated source row through cast completion',()=>{
    const c=fixture(),s=createInitialState(c,0);c.monsters[1002].npcStatusSkills=[
      {skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',element:'fire',hitCount:1,baseSp:3,level:3,rate:0,castTimeMs:100,delayMs:5000,cancelable:true,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS',sourceRowIndex:4},
      {skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',element:'fire',hitCount:1,baseSp:3,level:5,rate:4000,castTimeMs:300,delayMs:7000,cancelable:false,range:9,state:'MSS_RUSH',condition:'MSC_SKILLUSED',conditionData:18,sourceRowIndex:5},
    ];
    const enemy:BattleEnemy={id:'mage',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.83},approachFrom:{x:.5,y:.83},hostile:true,npcCombat:{firstAttackDone:false,readyAt:{},lastReceivedSkillId:18}};
    const roll=vi.spyOn(state,'random').mockReturnValue(.02);const started=tryMonsterStatusSkill(s,c,enemy,0);expect(roll).toHaveBeenCalled();expect(started).toBe(true);
    expect(enemy.npcCombat!.cast).toMatchObject({skillId:19,level:5,sourceRowIndex:5,endsAt:300});
    expect(takeMonsterStatusCast(s,c,enemy,300)).toMatchObject({sourceRowIndex:5,condition:'MSC_SKILLUSED',conditionData:18,level:5});
  });
  it('shares last-use time by spell id but applies each repeated row delay independently',()=>{
    const c=fixture(),s=createInitialState(c,0);c.monsters[1002].npcStatusSkills=[
      {skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',level:3,rate:10000,castTimeMs:0,delayMs:5000,cancelable:false,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS',sourceRowIndex:1},
      {skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',level:5,rate:10000,castTimeMs:0,delayMs:3000,cancelable:false,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS',sourceRowIndex:2},
    ];
    const enemy:BattleEnemy={id:'mage',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.83},approachFrom:{x:.5,y:.83},hostile:true,npcCombat:{firstAttackDone:false,readyAt:{}}};
    vi.spyOn(state,'random').mockReturnValue(.02);expect(tryMonsterStatusSkill(s,c,enemy,0)).toBe(true);
    expect(enemy.npcCombat!.cast?.sourceRowIndex).toBe(1);expect(enemy.npcCombat!.lastUsedAt).toEqual({19:0});
    takeMonsterStatusCast(s,c,enemy,0);expect(tryMonsterStatusSkill(s,c,enemy,4000)).toBe(true);
    expect(enemy.npcCombat!.cast?.sourceRowIndex).toBe(2);expect(enemy.npcCombat!.lastUsedAt).toEqual({19:4000});
  });
  it('lets RUSH magic start at skill range outside the basic attack range',()=>{
    const c=fixture(),s=createInitialState(c,0);c.monsters[1002].npcStatusSkills=[{skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',level:3,rate:10000,castTimeMs:500,delayMs:5000,cancelable:true,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS'}];
    const hero=battleHeroAt(s,0),position={x:hero.x+9/12,y:hero.y};
    const enemy:BattleEnemy={id:'mage',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position,approachFrom:{...position},hostile:true};
    vi.spyOn(state,'random').mockReturnValue(.02);
    expect(tryMonsterStatusSkill(s,c,enemy,1000)).toBe(true);
    expect(enemy.npcCombat!.cast).toMatchObject({skillId:19,startedAt:1000,endsAt:1500});
  });
  it('releases only its own attack deadline when an area change cancels a cast',()=>{
    const c=fixture(),s=createInitialState(c,0);c.monsters[1002].npcStatusSkills=[{skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',level:3,rate:10000,castTimeMs:3000,delayMs:5000,cancelable:true,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS'}];
    const enemy:BattleEnemy={id:'mage',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.83},approachFrom:{x:.5,y:.83},hostile:true};
    s.battle={monsterId:1002,hp:100,maxHp:100,startedAt:0,playerNextAttackAt:0,enemyNextAttackAt:0,enemies:[enemy],targetId:enemy.id,playerActionReadyAt:0,playerNextSkillAt:0};
    vi.spyOn(state,'random').mockReturnValue(.02);expect(tryMonsterStatusSkill(s,c,enemy,1000)).toBe(true);
    const owned=enemy.npcCombat!.cast!.clockOwnership!;expect(enemy.enemyNextAttackAt).toBe(owned.attackReadyAt);
    s.areaId='elsewhere';cancelInvalidMonsterStatusCasts(s,1500);
    expect(enemy.npcCombat!.cast).toBeUndefined();expect(enemy.enemyNextAttackAt).toBe(owned.previousAttackReadyAt);
  });
  it('preserves a newer attack deadline when an old cast is invalidated',()=>{
    const c=fixture(),s=createInitialState(c,0);c.monsters[1002].npcStatusSkills=[{skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',level:3,rate:10000,castTimeMs:3000,delayMs:5000,cancelable:true,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS'}];
    const enemy:BattleEnemy={id:'mage',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.83},approachFrom:{x:.5,y:.83},hostile:true};
    s.battle={monsterId:1002,hp:100,maxHp:100,startedAt:0,playerNextAttackAt:0,enemyNextAttackAt:0,enemies:[enemy],targetId:enemy.id,playerActionReadyAt:0,playerNextSkillAt:0};
    vi.spyOn(state,'random').mockReturnValue(.02);expect(tryMonsterStatusSkill(s,c,enemy,1000)).toBe(true);
    enemy.enemyNextAttackAt=9000;s.areaId='elsewhere';cancelInvalidMonsterStatusCasts(s,1500);
    expect(enemy.npcCombat!.cast).toBeUndefined();expect(enemy.enemyNextAttackAt).toBe(9000);
  });
  it('releases the cast-owned deadline when damage interrupts a cancelable spell',()=>{
    const c=fixture(),s=createInitialState(c,0);c.monsters[1002].npcStatusSkills=[{skillId:19,sourceName:'MG_FIREBOLT',damageType:'magic',level:3,rate:10000,castTimeMs:6000,delayMs:5000,cancelable:true,range:9,state:'MSS_RUSH',condition:'MSC_ALWAYS'}];
    const enemy:BattleEnemy={id:'mage',monsterId:1002,hp:100,maxHp:100,startedAt:0,arrivedAt:0,enemyNextAttackAt:0,spawnDirection:0,position:{x:.5,y:.83},approachFrom:{x:.5,y:.83},hostile:true};
    s.battle={monsterId:1002,hp:100,maxHp:100,startedAt:0,playerNextAttackAt:0,enemyNextAttackAt:0,enemies:[enemy],targetId:enemy.id,playerActionReadyAt:0,playerNextSkillAt:0};
    vi.spyOn(state,'random').mockReturnValue(.02);expect(tryMonsterStatusSkill(s,c,enemy,1000)).toBe(true);
    const owned=enemy.npcCombat!.cast!.clockOwnership!;expect(enemy.enemyNextAttackAt).toBe(owned.attackReadyAt);expect(owned.previousAttackReadyAt).toBeLessThan(owned.attackReadyAt);
    interruptMonsterStatusCast(s,c,enemy,1500,1);
    expect(enemy.npcCombat!.cast).toBeUndefined();expect(enemy.enemyNextAttackAt).toBe(owned.previousAttackReadyAt);
  });
});
