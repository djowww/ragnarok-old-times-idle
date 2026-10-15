import { describe, expect, it } from 'vitest';
import { staticDefenseElement } from '../tools/itemDefenseElement.mjs';
const armor = (Script: unknown, more: Record<string, unknown> = {}) => ({ Type:'IT_ARMOR', Loc:'EQP_ARMOR', Script, ...more });
describe('safe full-script body property translation', () => {
  it.each(['Neutral','Water','Earth','Fire','Wind','Poison','Holy','Dark','Ghost','Undead'])('accepts only the complete%s property statement', element => {
    expect(staticDefenseElement(armor(` \n bonus bDefEle,Ele_${element}; \n`))).toBe(element.toLowerCase());
    expect(staticDefenseElement(armor(`bonus bDefEle,Ele_${element};`,{Type:'IT_CARD',Loc:{EQP_ARMOR:true}}))).toBe(element.toLowerCase());
  });
  it.each(['bonus bDefEle,Ele_Ghost; bonus bHPrecovRate,-25;', 'bonus bDefEle,Ele_Water; bonus bDef,1;',
    'bonus bDefEle,Ele_Undead; bonus bInt,1; bonus bDef,1;', 'if (1) { bonus bDefEle,Ele_Fire; }',
    'bonus bDefEle,Ele_Fire; dangerous();', '// bonus bDefEle,Ele_Fire;', 'bonus bDefEle,Ele_Random;',
    'bonus bDefEle,Ele_Fire', 'bonus bDefEle,Ele_Fire;;', 'bonus bDefEle,Ele_Fire; bonus bDefEle,Ele_Water;'])('rejects additional or unrecognized script%s', script => {
      expect(staticDefenseElement(armor(script))).toBeUndefined();
  });
  it('rejects other equipment locations, item types and extra script hooks', () => {
    const script='bonus bDefEle,Ele_Fire;';
    for (const more of [{Type:'IT_WEAPON'},{Loc:'EQP_HEAD_TOP'},{Loc:{EQP_ARMOR:true,EQP_HEAD_TOP:true}},
      {OnEquipScript:'bonus bStr,1;'},{OnUnequipScript:'heal -1,0;'},{ComboScript:'bonus bDef,1;'},{OnEquipScript:42}])
      expect(staticDefenseElement(armor(script,more))).toBeUndefined();
    expect(staticDefenseElement(null)).toBeUndefined(); expect(staticDefenseElement(armor(42))).toBeUndefined();
  });
});
