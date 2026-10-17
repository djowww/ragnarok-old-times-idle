import {describe,expect,it} from 'vitest';
import {staticWeaponElement} from '../tools/itemWeaponElement.mjs';
const weapon=(Script:unknown,more:Record<string,unknown>={})=>({Type:'IT_WEAPON',Script,...more});
describe('literal original weapon property extraction',()=>{
 it.each(['Neutral','Water','Earth','Fire','Wind','Poison','Holy','Dark','Ghost','Undead'])('extracts %s',element=>{
  expect(staticWeaponElement(weapon(` bonus bAtkEle, Ele_${element}; `))).toEqual({element:element.toLowerCase(),complete:true});
 });
 it('retains unsupported secondary mechanics on a compound source script',()=>{
  expect(staticWeaponElement(weapon('bonus bAtkEle,Ele_Fire; skill MG_FIREBOLT,3; bonus3 bAutoSpell,MG_FIREBOLT,3,100;'))).toEqual({element:'fire',complete:false});
 });
 it.each(['if(1) bonus bAtkEle,Ele_Fire;','bonus bAtkEle,Ele_Fire; end;',
  'bonus bAtkEle,Ele_Fire; bonus bAtkEle,Ele_Water;','// bonus bAtkEle,Ele_Fire;',
  'bonus bAtkEle,Ele_Fire; // bonus bInt,1;','bonus bAtkEle,rand(1,5);',
  'bonus bAtkEle,Ele_Fire','bonus bAtkEle,Ele_Fire;;','bonus bAtkEle,Ele_Random;',
  'bonus bAtkEle,Ele_Fire; if(1){bonus bInt,1;}','bonus bAtkEle,Ele_Fire; callfunc "effect";'])('rejects nonstatic or ambiguous script %s',script=>{
  expect(staticWeaponElement(weapon(script))).toBeUndefined();
 });
 it('rejects nonweapons and event-bound scripts',()=>{
  expect(staticWeaponElement(weapon('bonus bAtkEle,Ele_Fire;',{Type:'IT_ARMOR'}))).toBeUndefined();
  expect(staticWeaponElement(weapon('bonus bAtkEle,Ele_Fire;',{OnEquipScript:'end;'}))).toBeUndefined();
  expect(staticWeaponElement(null)).toBeUndefined();
 });
});
