import {describe,expect,it} from 'vitest';
import {advanceState,applyCommand,createInitialState} from '../engine/index';
import {canEquipFalcon,isFalconEquipped} from '../engine/falcon';
import {parseCommandRequest} from '../server/validation';
import {fixture} from './engine-fixture';
import type {GameCommand,GameState} from '../shared/types';
const setFalcon=(equipped:boolean)=>({type:equipped?'rentFalcon':'dismissFalcon'}) as unknown as GameCommand;
function setup(job='hunter'){
 const c=fixture();c.skills.falcon={...c.skills.firstaid,id:'falcon',sourceName:'HT_FALCON',kind:'passive',maxLevel:1,implementation:'supported'};
 for(const id of ['hunter','sniper'])c.classes[id].skills.push('falcon');
 const s=createInitialState(c,0) as GameState&{falconEquipped?:boolean};s.job=job;s.learnedSkills.falcon=1;s.zeny=10000;return{s,c};
}
describe('native Falcon equipment and rental',()=>{
 it.each(['hunter','sniper'])('keeps learned and equipped states separate for %s',job=>{
  const {s,c}=setup(job);expect(canEquipFalcon(s,c)).toBe(true);expect(isFalconEquipped(s,c)).toBe(false);
  s.falconEquipped=true;expect(isFalconEquipped(s,c)).toBe(true);s.learnedSkills.falcon=0;expect(isFalconEquipped(s,c)).toBe(false);
 });
 it.each(['novice','archer','bard','knight','missing'])('rejects %s with a stale learned skill or saved flag',job=>{
  const {s,c}=setup(job);s.falconEquipped=true;expect(canEquipFalcon(s,c)).toBe(false);expect(isFalconEquipped(s,c)).toBe(false);
 });
 it('charges exactly2500zeny once, no Merchant Discount or other resources',()=>{
  const {s,c}=setup();s.learnedSkills.discount=10;c.skills.discount={...c.skills.firstaid,id:'discount',sourceName:'MC_DISCOUNT',kind:'passive',maxLevel:10};
  const before=structuredClone(s);const next=applyCommand(s,c,setFalcon(true),0) as typeof s;
  expect(next.falconEquipped).toBe(true);expect(next.zeny).toBe(7500);expect(next.sp).toBe(s.sp);expect(next.rngState).toBe(s.rngState);expect(next.inventory).toEqual(s.inventory);expect(next.learnedSkills).toEqual(s.learnedSkills);
  expect(()=>applyCommand(next,c,setFalcon(true),0)).toThrow();expect(next.zeny).toBe(7500);expect(s).toEqual(before);
 });
 it('accepts exactly2500 and rejects2499 atomically',()=>{
  const {s,c}=setup();s.zeny=2500;expect(applyCommand(s,c,setFalcon(true),0).zeny).toBe(0);s.zeny=2499;const before=structuredClone(s);expect(()=>applyCommand(s,c,setFalcon(true),0)).toThrow();expect(s).toEqual(before);
 });
 it('rents only alive in town, but permits free field dismissal',()=>{
  const {s,c}=setup();s.status='resting';expect(()=>applyCommand(s,c,setFalcon(true),0)).toThrow();s.falconEquipped=true;s.hp=0;const dismissed=applyCommand(s,c,setFalcon(false),0) as typeof s;expect(dismissed.falconEquipped).toBe(false);expect(dismissed.zeny).toBe(s.zeny);
  s.status='town';s.falconEquipped=false;expect(()=>applyCommand(s,c,setFalcon(true),0)).toThrow();
 });
 it('persists valid equipment through serialization and death without rerenting',()=>{
  const {s,c}=setup();const equipped=applyCommand(s,c,setFalcon(true),0) as typeof s;equipped.hp=0;equipped.status='resting';const loaded=advanceState(JSON.parse(JSON.stringify(equipped)),c,0) as typeof s;expect(loaded.falconEquipped).toBe(true);expect(loaded.zeny).toBe(7500);
 });
 it('reconciles only stale equipment without granting a missing legacy flag',()=>{
  const {s,c}=setup();expect((advanceState(s,c,0) as typeof s).falconEquipped).toBe(false);s.job='novice';s.falconEquipped=true;const cleaned=advanceState(s,c,0) as typeof s;expect(cleaned.falconEquipped).toBe(false);expect(cleaned.learnedSkills).toEqual(s.learnedSkills);expect(cleaned.zeny).toBe(s.zeny);
 });
 it('accepts only exact rent/dismiss commands without client price or flag',()=>{
  for(const command of [setFalcon(true),setFalcon(false)])expect(parseCommandRequest({requestId:'falcon-ok',command}).command).toEqual(command);
  for(const extra of [{price:0},{equipped:true},{discount:100}])expect(()=>parseCommandRequest({requestId:'falcon-bad',command:{type:'rentFalcon',...extra}})).toThrow();
  expect(()=>parseCommandRequest({requestId:'falcon-extra',command:{type:'dismissFalcon',equipped:false}})).toThrow();
 });
});
