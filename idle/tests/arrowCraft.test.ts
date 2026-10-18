import {expect,it} from 'vitest';
import raw from '../content/catalog.json';
import type {Catalog} from '../shared/types';
import {createInitialState} from '../engine/index';
import {openArrowCraft,answerArrowCraft,cancelArrowCraft} from '../engine/arrowCraft';
function setup(){const c=structuredClone(raw) as unknown as Catalog;
 const skill=Object.values(c.skills).find(s=>s.sourceName==='AC_MAKINGARROW')!;
 Object.assign(skill,{implementation:'supported',manualUse:'arrowCraft'});
 const s=createInitialState(c,1000);s.job='archer';s.hp=50;s.sp=100;s.learnedSkills[skill.id]=1;
 s.inventory=[{uid:'bottle',itemId:713,quantity:2,refine:0,cards:[],favorite:false,identified:true}];s.equipment={};
 return {s,c,skill};}
it('charges opening SP once, consumes one material and grants exact arrows',()=>{
 const {s,c}=setup();openArrowCraft(s,c,1000);const id=s.arrowCraftMenu!.id,sp=s.sp;
 openArrowCraft(s,c,1000);expect(s.sp).toBe(sp);expect(sp).toBe(90);
 answerArrowCraft(s,c,id,'bottle',1000);
 expect(s.inventory.find(e=>e.uid==='bottle')?.quantity).toBe(1);
 expect(s.inventory.find(e=>e.itemId===1770)?.quantity).toBe(2);
 expect(s.sp).toBe(90);expect(s.arrowCraftMenu).toBeUndefined();
 expect(()=>answerArrowCraft(s,c,id,'bottle',1000)).toThrow();
});
it('cancelling retains the opening cost and consumes no material',()=>{
 const {s,c}=setup();openArrowCraft(s,c,1000);cancelArrowCraft(s,s.arrowCraftMenu!.id);
 expect(s.sp).toBe(90);expect(s.inventory[0].quantity).toBe(2);expect(s.arrowCraftMenu).toBeUndefined();
});
it('rejects unlearned skills and wrong classes without payment',()=>{
 for(const mode of ['unlearned','wrongClass']){const {s,c,skill}=setup();if(mode==='unlearned')delete s.learnedSkills[skill.id];else s.job='mage';
 const before=structuredClone(s);expect(()=>openArrowCraft(s,c,1000)).toThrow();expect(s).toEqual(before);}
});
it('rejects equipment or identification changes after opening',()=>{
 for(const mode of ['equip','identify']){const {s,c}=setup();openArrowCraft(s,c,1000);const id=s.arrowCraftMenu!.id;
 if(mode==='equip')s.equipment.weapon='bottle';else s.inventory[0].identified=false;
 expect(()=>answerArrowCraft(s,c,id,'bottle',1000)).toThrow();expect(s.inventory[0].quantity).toBe(2);}
});
it('rejects net overweight output without consuming the input',()=>{
 const {s,c}=setup();c.items[1770].weight=10000;openArrowCraft(s,c,1000);
 expect(()=>answerArrowCraft(s,c,s.arrowCraftMenu!.id,'bottle',1000)).toThrow();expect(s.inventory[0].quantity).toBe(2);
});
it('does not refund SP when no valid material is available',()=>{
 const {s,c}=setup();s.inventory=[];openArrowCraft(s,c,1000);expect(s.sp).toBe(90);expect(s.arrowCraftMenu).toBeUndefined();
});
it('invalidates the menu after a class or map change',()=>{
 for(const mode of ['class','map']){const {s,c}=setup();openArrowCraft(s,c,1000);const id=s.arrowCraftMenu!.id;
 if(mode==='class')s.job='mage';else {s.status='hunting';s.areaId='prontera_south';}
 expect(()=>answerArrowCraft(s,c,id,'bottle',1000)).toThrow();expect(s.inventory[0].quantity).toBe(2);}
});
it('retains the original output list for multi-output materials',()=>{
 const {s,c}=setup();s.inventory[0].itemId=603;openArrowCraft(s,c,1000);answerArrowCraft(s,c,s.arrowCraftMenu!.id,'bottle',1000);
 expect(s.inventory.find(e=>e.itemId===1764)?.quantity).toBe(50);expect(s.inventory.find(e=>e.itemId===1768)?.quantity).toBe(50);
});
