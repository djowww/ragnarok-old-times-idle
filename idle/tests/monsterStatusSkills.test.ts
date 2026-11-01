import { describe, expect, it, vi, afterEach } from 'vitest';
import { createInitialState } from '../engine';
import { fixture } from './engine-fixture';
import { tryMonsterStatusSkill } from '../engine/monsterStatusSkills';
import type { BattleEnemy } from '../shared/types';
import * as state from '../engine/state';
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
});
