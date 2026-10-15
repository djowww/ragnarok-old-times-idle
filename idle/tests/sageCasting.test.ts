import { describe, expect, it } from 'vitest';
import { automaticSpellChoices, hindsightProc, doubleCastingRepeat, memorizeCastStart } from '../engine/sageCasting';
import { fixture } from './engine-fixture';
import type { GameState } from '../shared/types';
describe('pinned pre-re Sage casting', () => {
  it('filters learned permitted choices and caps their levels', () => {
    const c=fixture(); c.skills.firebolt.sourceName='MG_FIREBOLT'; c.skills.firebolt.implementation='supported';
    const s={job:'mage',learnedSkills:{firebolt:10}} as unknown as GameState;
    expect(automaticSpellChoices(s,c,1)).toEqual([]);
    expect(automaticSpellChoices(s,c,3)).toEqual([{skillId:'firebolt',sourceName:'MG_FIREBOLT',maxLevel:2}]);
    s.learnedSkills.firebolt=1; expect(automaticSpellChoices(s,c,10)[0].maxLevel).toBe(1);
  });
  it('matches every pinned pre-re unlock and maximum', () => {
    const c=fixture(); const names=['MG_NAPALMBEAT','MG_COLDBOLT','MG_FIREBOLT','MG_LIGHTNINGBOLT','MG_SOULSTRIKE','MG_FIREBALL','MG_FROSTDIVER'];
    c.classes.mage.skills=names;
    for(const sourceName of names)c.skills[sourceName]={...c.skills.firebolt,id:sourceName,sourceName,implementation:'supported'};
    const s={job:'mage',learnedSkills:Object.fromEntries(names.map(n=>[n,10]))} as unknown as GameState;
    const caps=(level:number)=>automaticSpellChoices(s,c,level).map(x=>[x.sourceName,x.maxLevel]);
    expect(caps(1)).toEqual([['MG_NAPALMBEAT',3]]);
    expect(caps(5)).toEqual(names.slice(0,5).map(n=>[n,n==='MG_SOULSTRIKE'?1:3]));
    expect(caps(8)).toEqual(names.slice(0,6).map(n=>[n,n==='MG_FIREBALL'?1:3]));
    expect(caps(10)).toEqual(names.map(n=>[n,n==='MG_FIREBALL'?2:n==='MG_FROSTDIVER'?1:3]));
    c.skills.MG_FIREBOLT.implementation='unsupported';
    expect(automaticSpellChoices(s,c,10).some(x=>x.sourceName==='MG_FIREBOLT')).toBe(false);
  });
  it('rolls proc then level before checking discounted SP', () => {
    const input={autospellLevel:10,maxLevel:3,sp:100,at:10,buffExpiresAt:20,normalAttack:true,spCost:(l:number)=>10+l};
    const rolls=[0.249,0.5]; const proc=hindsightProc({...input,rng:()=>rolls.shift()!});
    expect(proc).toEqual({level:1,spCost:7});
    expect(hindsightProc({...input,rng:()=>0.25})).toBeUndefined();
    let calls=0; expect(hindsightProc({...input,sp:0,rng:()=>{calls++;return 0;}})).toBeUndefined();expect(calls).toBe(2);
    expect(hindsightProc({...input,normalAttack:false,rng:()=>{throw Error('roll');}})).toBeUndefined();
  });
  it('repeats only bolts at original level after attack motion with no recursion', () => {
    const input={sourceName:'MG_FIREBOLT',skillLevel:7,doubleCastingLevel:5,at:100,buffExpiresAt:1000,attackMotionMs:120,repeated:false,rng:()=>0.79};
    expect(doubleCastingRepeat(input)).toEqual({level:7,at:220});
    expect(doubleCastingRepeat({...input,rng:()=>0.8})).toBeUndefined();
    expect(doubleCastingRepeat({...input,repeated:true,rng:()=>{throw Error('roll');}})).toBeUndefined();
  });
  it('consumes five real positive eligible starts, excluding IgnoreStatusEffect but not IgnoreDex', () => {
    expect(memorizeCastStart({remaining:5,castTimeMs:1001,started:true,ignoresStatusEffects:false})).toEqual({remaining:4,castTimeMs:500});
    for(const o of [{started:false},{castTimeMs:0},{ignoresStatusEffects:true}]) expect(memorizeCastStart({remaining:5,castTimeMs:1000,started:true,ignoresStatusEffects:false,...o}).remaining).toBe(5);
    expect(memorizeCastStart({remaining:1,castTimeMs:1000,started:true,ignoresStatusEffects:false}).remaining).toBe(0);
  });
});
