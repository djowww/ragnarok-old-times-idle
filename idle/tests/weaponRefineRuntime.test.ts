import {describe,it,expect} from 'vitest';
import {applyCommand} from '../engine/index';
import {setupRefine,openRefine,answerRefine} from './weaponRefine-fixture';
describe('native weapon refinement execution',()=>{
 const draws=[
 [2,8,50,1178276104,199,true],
 [2,8,50,1159424461,200,false],
 [3,6,50,4112717796,499,true],
 [3,6,50,4093866153,500,false],
 [1,7,49,2321811711,594,true],[1,7,49,2302960068,595,false],
 [4,9,49,3346215049,84,true],[4,9,49,3327363406,85,false],
 [4,4,70,342389196,699,true],[4,4,70,323537553,700,false],
 [1,0,70,3276830888,999,true],
 ] as const;
 it.each(draws)('strict native threshold w%i +%i Job%i seed%i roll%i success%s',(w,r,j,seed,draw,success)=>{
  const {s,c}=setupRefine();c.items[1201].weaponLevel=w;s.inventory[0].refine=r;s.jobLevel=j;s.rngState=seed;
  const before=s.inventory.find(x=>x.itemId===(w===1?1010:w===2?1011:984))!.quantity;
  const n=answerRefine(openRefine(s,c),c);
  expect(n.rngState).toBe(draw);expect(n.sp).toBe(45);expect(n.zeny).toBe(s.zeny);
  expect(n.inventory.find(x=>x.itemId===(w===1?1010:w===2?1011:984))!.quantity).toBe(before-1);
  expect(n.weaponRefineMenu).toBeUndefined();expect(n.weaponRefineResult?.outcome).toBe(success?'success':'failed');
  expect(n.inventory.find(x=>x.uid==='weapon')?.refine).toBe(success?r+1:undefined);
 });
 it('allows broken and favorite weapons while preserving every property on success',()=>{
  const {s,c}=setupRefine();Object.assign(s.inventory[0],{favorite:true,broken:true,cards:[4001],rarity:'legendary',rarityBonus:{stat:'str',value:5}});
  const item=structuredClone(s.inventory[0]);const n=answerRefine(openRefine(s,c),c);
  expect(n.inventory.find(x=>x.uid==='weapon')).toEqual({...item,refine:1});
 });
 it('destroys cards and affixes with only the selected UID on failure',()=>{
  const {s,c}=setupRefine();s.jobLevel=49;s.rngState=2302960068;s.inventory[0].refine=7;s.inventory[0].cards=[4001];
  s.inventory.push({...s.inventory[0],uid:'other'});const other=structuredClone(s.inventory.at(-1));
  const n=answerRefine(openRefine(s,c),c);
  expect(n.inventory.find(x=>x.uid==='weapon')).toBeUndefined();expect(n.inventory.find(x=>x.uid==='other')).toEqual(other);
 });
 it.each(['missing','signature','equipped','unidentified','material','refinemax','learnedcap'])('persists closure and rejection without a throw for %s',reason=>{
  const {s,c}=setupRefine();if(reason==='refinemax')s.inventory[0].refine=10;
  if(reason==='learnedcap'){s.learnedSkills.ws_weaponrefine=7;s.inventory[0].refine=7;}
  const n=openRefine(s,c),beforeRng=n.rngState,sp=n.sp,id=n.weaponRefineMenu!.id;
  if(reason==='missing')n.inventory=n.inventory.filter(x=>x.uid!=='weapon');
  if(reason==='signature')n.inventory[0].cards=[4001];
  if(reason==='equipped')n.equipment.weapon='weapon';
  if(reason==='unidentified')n.inventory[0].identified=false;
  if(reason==='material')n.inventory=n.inventory.filter(x=>x.itemId!==1010);
  const out=answerRefine(n,c);expect(out.weaponRefineMenu).toBeUndefined();expect(out.weaponRefineResult?.outcome).toBe('rejected');expect(out.sp).toBe(sp);expect(out.rngState).toBe(beforeRng);
  const replay=applyCommand(out,c,{type:'weaponRefine',menuId:id,uid:'weapon'},0);expect(replay.inventory).toEqual(out.inventory);expect(replay.rngState).toBe(out.rngState);
 });
 it.each([[7,6,7],[8,7,8],[10,9,10]])('permits learned%i current%i to target%i',(learned,r,target)=>{
  const {s,c}=setupRefine();s.learnedSkills.ws_weaponrefine=learned;s.inventory[0].refine=r;s.rngState=634785765;
  expect(answerRefine(openRefine(s,c),c).inventory.find(x=>x.uid==='weapon')?.refine).toBe(target);
 });
 it('uses response-time Job level without widening captured learned limit',()=>{
  const {s,c}=setupRefine();s.jobLevel=49;s.inventory[0].refine=7;s.rngState=2302960068;
  const n=openRefine(s,c);n.jobLevel=50;expect(answerRefine(n,c).weaponRefineResult?.outcome).toBe('success');
 });
 it('keeps the NPC refine behavior separate and unchanged',()=>{
  const {s,c}=setupRefine();s.learnedSkills={};const n=applyCommand(s,c,{type:'refine',uid:'weapon'},0);
  expect(n.inventory[0].refine).toBe(1);expect(n.zeny).toBe(9500);expect(n.inventory.find(x=>x.itemId===984)?.quantity).toBe(4);expect(n.inventory.find(x=>x.itemId===1010)?.quantity).toBe(5);expect(n.sp).toBe(50);expect(n.rngState).toBe(s.rngState);
 });
});
