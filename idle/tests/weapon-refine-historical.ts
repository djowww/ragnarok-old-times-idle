import {beforeMonsterSpCatalog,beforeMonsterSpManifest} from './monster-sp-historical.js';
import {createHash} from 'node:crypto';
import baseline from './fixtures/weaponRefineBaseline.json';
const same=(value:unknown,hash:string)=>value!==undefined&&createHash('sha256').update(JSON.stringify(value)).digest('hex')===hash;
/** Reverse only whole records matching the exact reviewed refino delta. */
export function beforeWeaponRefineCatalog<T>(input:T):T {
 const result=structuredClone(beforeMonsterSpCatalog(input)) as Record<string,any>;
 for(const [id,row] of Object.entries(baseline.skills))if(same(result.skills[id],row.afterHash))result.skills[id]=structuredClone(row.before);
 for(const [id,row] of Object.entries(baseline.items))if(same(result.items[id],row.afterHash))result.items[id]=structuredClone(row.before);
 if(same(result.source,baseline.source.afterHash))result.source=structuredClone(baseline.source.before);
 return result as T;
}
export function beforeWeaponRefineManifest<T>(input:T):T {
 const result=structuredClone(beforeMonsterSpManifest(input)) as Record<string,any>;
 for(const [id,row] of Object.entries(baseline.manifestSkills))if(same(result.skillSources[id],row.afterHash))result.skillSources[id]=structuredClone(row.before);
 for(const [key,row] of Object.entries(baseline.manifestFields))if(same(result[key],row.afterHash))result[key]=structuredClone(row.before);
 for(const [key,hash] of Object.entries(baseline.addedManifest))if(same(result[key],hash))delete result[key];
 return result as T;
}
