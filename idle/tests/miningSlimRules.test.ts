import {describe,expect,it} from 'vitest';
import {findingOreChain,rollFindingOre} from '../shared/findingOre';
import {calculateSlimPitcherRecovery,slimPotionItem} from '../engine/slimPitcherRules';
const input={baseHP:45,learnedSlimLevel:10,learnedPitcherLevel:5,learningPotionLevel:10,targetVIT:20,targetHPRecoveryLevel:0};
describe('native mining random boundaries',()=>{
 it.each(findingOreChain.map((e,index)=>({...e,index})))('entry $itemId uses strict threshold without reroll',({itemId,chance,index})=>{
  const moduli:number[]=[];let i=0;expect(rollFindingOre(n=>{moduli.push(n);return i++===0?index:chance-1;})).toBe(itemId);expect(moduli).toEqual([20,10000]);
  i=0;expect(rollFindingOre(()=>i++===0?index:chance)).toBeUndefined();expect(i).toBe(2);
 });
});
describe('native compact pitcher integer stages',()=>{
 it('matches the native 189HP oracle',()=>expect(calculateSlimPitcherRecovery(input)).toEqual({hp:189,sp:0}));
 it('applies each stage truncation separately',()=>expect(calculateSlimPitcherRecovery({...input,baseHP:47,targetVIT:23,targetHPRecoveryLevel:3,casterSkillHealBonusPct:7,targetSkillHeal2BonusPct:11,criticalWoundPct:17,deathHurt:true,waterInsigniaLevel:2})).toEqual({hp:216,sp:0}));
 it('keeps source integer stages distinct under status modifiers',()=>expect(calculateSlimPitcherRecovery({...input,baseHP:55,learningPotionLevel:5,targetVIT:17,targetHPRecoveryLevel:3,criticalWoundPct:20,deathHurt:true,waterInsigniaLevel:2})).toEqual({hp:184,sp:0}));
 it('blocks all recovery explicitly',()=>expect(calculateSlimPitcherRecovery({...input,noRecover:true})).toEqual({hp:0,sp:0}));
 it('uses only insignia level2 and respects zero input',()=>{
  expect(calculateSlimPitcherRecovery({...input,waterInsigniaLevel:1})).toEqual({hp:189,sp:0});
  expect(calculateSlimPitcherRecovery({...input,baseHP:0})).toEqual({hp:0,sp:0});
 });
 it.each([[1,545],[5,545],[6,546],[9,546],[10,547]])('used level %s selects item %s',(level,id)=>expect(slimPotionItem(level)).toBe(id));
});
