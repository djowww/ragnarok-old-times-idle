import {createHash} from 'node:crypto';
import baseline from './fixtures/miningSlimBaseline.json';
const same=(value:unknown,hash:string)=>value!==undefined&&createHash('sha256').update(JSON.stringify(value)).digest('hex')===hash;
/** Reverse only exact reviewed mining/Slim records; all unrelated mutations remain observable. */
export function beforeMiningSlimCatalog<T>(input:T):T {
 const result=structuredClone(input) as Record<string,any>;
 for(const [id,hash] of Object.entries(baseline.addedItems))if(same(result.items[id],hash))delete result.items[id];
 for(const [id,change] of Object.entries(baseline.skills))if(same(result.skills[id],change.afterHash))result.skills[id]=structuredClone(change.before);
 if(same(result.source,baseline.source.afterHash))result.source=structuredClone(baseline.source.before);
 return result as T;
}
export function beforeMiningSlimManifest<T>(input:T):T {
 const result=structuredClone(input) as Record<string,any>;
 for(const [id,change] of Object.entries(baseline.manifestSkills))if(same(result.skillSources[id],change.afterHash))result.skillSources[id]=structuredClone(change.before);
 for(const [key,change] of Object.entries(baseline.manifestFields))if(same(result[key],change.afterHash))result[key]=structuredClone(change.before);
 for(const [key,hash] of Object.entries(baseline.addedManifest))if(same(result[key],hash))delete result[key];
 return result as T;
}
