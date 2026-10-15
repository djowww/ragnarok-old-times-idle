import {beforeWeaponRefineCatalog,beforeWeaponRefineManifest} from './weapon-refine-historical';
import {createHash} from 'node:crypto';
import baseline from './fixtures/falconBaseline.json';
const same=(value:unknown,hash:string)=>value!==undefined&&createHash('sha256').update(JSON.stringify(value)).digest('hex')===hash;
/** Reverse only exact reviewed Falcon records; all unrelated mutations remain observable. */
export function beforeFalconCatalog<T>(input:T):T {
 const result=structuredClone(beforeWeaponRefineCatalog(input)) as Record<string,any>;
 for(const [id,change] of Object.entries(baseline.skills))if(same(result.skills[id],change.afterHash))result.skills[id]=structuredClone(change.before);
 if(same(result.source,baseline.source.afterHash))result.source=structuredClone(baseline.source.before);
 return result as T;
}
export function beforeFalconManifest<T>(input:T):T {
 const result=structuredClone(beforeWeaponRefineManifest(input)) as Record<string,any>;
 for(const [id,change] of Object.entries(baseline.manifestSkills))if(same(result.skillSources[id],change.afterHash))result.skillSources[id]=structuredClone(change.before);
 for(const [key,change] of Object.entries(baseline.manifestFields))if(same(result[key],change.afterHash))result[key]=structuredClone(change.before);
 for(const [key,hash] of Object.entries(baseline.addedManifest))if(same(result[key],hash))delete result[key];
 return result as T;
}
