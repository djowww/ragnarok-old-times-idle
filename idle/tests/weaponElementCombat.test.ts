import {describe,expect,it} from 'vitest';
import {createInitialState,applyCommand,advanceState} from '../engine/index';
import {fixture} from './engine-fixture';
function damage(attackElement?: string, skill = false, enchant = false, usable = true) {
 const c=fixture();Object.assign(c.items[1201],attackElement?{attackElement}:{});
 c.monsters[1002].element='ghost';c.monsters[1002].elementLevel=3;c.monsters[1002].hp=100000;
 c.elementModifiers={neutral:{ghost:[25,25,0,0]},fire:{ghost:[100,100,100,100]},holy:{ghost:[0,0,0,0]}};
 if(skill){c.classes.novice.skills.push('bash');c.skills.bash={id:'bash',name:'Bash',description:'',kind:'physical',maxLevel:1,spCost:[0],power:[100],cooldownMs:1000,element:'weapon'};}
 let s=createInitialState(c,0);s.stats.dex=99;s.stats.str=50;s.rotation=skill?['bash']:[];s.learnedSkills=skill?{bash:1}:{};
 if(!usable)s.inventory.find(e=>e.uid===s.equipment.weapon)!.identified=false;
 if(enchant){s.buffs.PR_ASPERSIO={expiresAt:100000,effects:{}};}
 s=applyCommand(s,c,{type:'startHunt',areaId:'prontera'},0);s=advanceState(s,c,15000);
 return s.events.filter(e=>e.target==='enemy'&&e.amount!==undefined).reduce((n,e)=>n+Math.max(0,e.amount!),0);
}
describe('intrinsic weapon properties in resolved combat',()=>{
 it('keeps neutral attacks ineffective against Ghost 3',()=>expect(damage()).toBe(0));
 it('uses a fire weapon for basic attacks against Ghost 3',()=>expect(damage('fire')).toBeGreaterThan(0));
 it('retains temporary enchantment precedence over the intrinsic property',()=>expect(damage('fire',false,true)).toBe(0));
 it('does not activate properties from unidentified equipment in a stale save',()=>expect(damage('fire',false,false,false)).toBe(0));
 it('uses the equipped element for weapon-property skills',()=>expect(damage('fire',true)).toBeGreaterThan(0));
});
