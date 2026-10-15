import {castSetup} from './cast-control-fixture';
import raw from '../content/catalog.json';
import type {Catalog} from '../shared/types';
const real=raw as unknown as Catalog;
export function conversionSetup() {
 const {s,c,e}=castSetup();c.elementModifiers=structuredClone(real.elementModifiers);
 for(const id of ['sa_elementwater','sa_elementground','sa_elementfire','sa_elementwind']) {c.skills[id]=structuredClone(real.skills[id]);c.skills[id].implementation='supported';}
 for(const id of [12114,12115,12116,12117])c.items[id]=structuredClone(real.items[id]);
 c.monsters[1175].element='neutral';c.monsters[1175].elementLevel=1;
 s.learnedSkills={sa_elementwater:1,sa_elementground:1,sa_elementfire:1,sa_elementwind:1,lightning_bolt:1};
 s.inventory.push({uid:'converter',itemId:12115,quantity:3,refine:0,cards:[],favorite:false});
 s.rotation=['sa_elementwater','lightning_bolt'];s.battle!.playerNextAttackAt=999999;
 return {s,c,e};
}
