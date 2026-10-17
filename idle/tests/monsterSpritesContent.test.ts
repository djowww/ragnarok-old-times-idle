import {describe,expect,it} from 'vitest';
import catalog from '../content/catalog.json';
import rules from '../content/rules.json';
// Literal filenames from the pinned roBrowserLegacy MonsterTable.js IDs.
describe('classic monster sprite filenames',()=>{
 it.each([[1032,'vorit'],[1042,'steel_chocho'],[1047,'peco_egg'],[1785,'atros']] as const)('resolves monster %s to the original %s resource',(id,name)=>{
  expect((catalog.monsters as Record<string,{sprite:{spr:string;act:string}}>)[id].sprite).toEqual({spr:`data/sprite/몬스터/${name}.spr`,act:`data/sprite/몬스터/${name}.act`});
  expect((rules.monsterAliases as Record<string,string>)[id]).toBe(name);
 });
});
