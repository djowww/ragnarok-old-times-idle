import {describe,expect,it,vi} from 'vitest';
import {falconDamage,autoFalconLevel,autoFalconProc,finishFalconDamage} from '../engine/falconCombatRules';
import {classicPhysicalDamage} from '../engine/classic';
import {fixture} from './engine-fixture';
import data from '../content/catalog.json';
const base={dex:97,int:71,steelCrow:9,elementRatePct:100};
describe('native Falcon damage arithmetic',()=>{
 it.each([[1,222],[3,666],[5,1110]])('manual Blitz level%s deals%s without splash division',(level,expected)=>expect(falconDamage({...base,kind:'manual',level,targetCount:4})).toBe(expected));
 it.each([[1,1110],[3,370],[4,275]])('auto Blitz splits per-hit among%s entities into%s',(targetCount,expected)=>expect(falconDamage({...base,kind:'auto',level:5,targetCount})).toBe(expected));
 it.each([[1,2442],[5,5550]])('Assault level%s fixes five source parcels and yields%s',(level,expected)=>expect(falconDamage({...base,kind:'assault',level})).toBe(expected));
 it.each([['auto',5,4,69],['manual',5,1,278],['assault',1,1,611]] as const)('subtracts truncated elemental reduction for%s',(kind,level,targetCount,expected)=>expect(falconDamage({...base,kind,level,targetCount,elementRatePct:25})).toBe(expected));
 it('returns zero on element immunity, not minimum1',()=>expect(falconDamage({...base,kind:'manual',level:5,elementRatePct:0})).toBe(0));
 it('applies only a source-specific skill bonus before element',()=>expect(falconDamage({...base,kind:'manual',level:5,skillAttackBonusPct:10})).toBe(1221));
});
describe('native Auto Blitz level and inclusive chance',()=>{
 it.each([[9,1],[10,2],[19,2],[20,3],[29,3],[30,4],[39,4],[40,5],[70,5]])('Job%s yields%s source hits',(job,hits)=>expect(autoFalconLevel(5,job)).toBe(hits));
 it('caps by the learned level and rejects an unlearned skill',()=>{expect(autoFalconLevel(2,50)).toBe(2);expect(autoFalconLevel(0,50)).toBe(0);});
 it.each([0,1,100,333])('uses inclusive raw1000 chance for LUK%s',luk=>{
  const edge=Math.min(999,luk*3);expect(autoFalconProc(edge,luk)).toBe(true);if(edge<999)expect(autoFalconProc(edge+1,luk)).toBe(false);
 });
});
describe('existing Falcon calculator consumers',()=>{
 it.each([['blitz_beat',5,1150],['sn_falconassault',1,2530]] as const)('keeps effective TrueSight attributes but excludes weapon damage percent for%s',(id,level,expected)=>{
  const monster=fixture().monsters[1002];monster.def=999;monster.mdef=999;monster.stats.vit=999;const rng=vi.fn(()=>.7);
  const skill=data.skills[id] as any;
  const result=classicPhysicalDamage({attack:1000,baseAttack:100,weaponAttack:900,weaponLevel:1,weaponType:'bow',magicAttack:[100,120],dex:102,int:76,critical:false,damagePercent:20,sourceAttackPercent:999,sizeMultiplier:.01,elementMultiplier:1,skillLevelsBySource:{HT_STEELCROW:9}},monster,skill,level,rng);
  expect(result).toBe(expected);expect(rng).not.toHaveBeenCalled();
 });
 it('preserves native Ghost rounding through the existing calculator',()=>{
  const result=classicPhysicalDamage({attack:1,magicAttack:[1,1],dex:97,int:71,elementMultiplier:.25,skillLevelsBySource:{HT_STEELCROW:9}},fixture().monsters[1002],data.skills.blitz_beat as any,5,()=>0);expect(result).toBe(278);
 });
});

describe('BF_MISC final minimum follows element and Lex',()=>{
 it('raises a positive result to source hits only after Lex',()=>{
  const raw=falconDamage({...base,kind:'auto',level:5,targetCount:200,elementRatePct:25});expect(raw).toBe(2);expect(finishFalconDamage(raw,5,true)).toBe(5);
 });
 it('leaves split zero immune to the minimum and Lex',()=>{
  const raw=falconDamage({...base,kind:'auto',level:5,targetCount:223,elementRatePct:25});expect(raw).toBe(0);expect(finishFalconDamage(raw,5,true)).toBe(0);
 });
});
