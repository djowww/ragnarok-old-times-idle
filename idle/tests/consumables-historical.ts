import {createHash} from 'node:crypto';
import baseline from './fixtures/consumablesBaseline.json';
const same=(value:unknown,hash:string)=>value!==undefined&&createHash('sha256').update(JSON.stringify(value)).digest('hex')===hash;
/** Reverse only this exact reviewed potion delta; mutated records remain visible. */
export function beforeConsumablesCatalog<T>(input:T):T {
 const result=structuredClone(input) as Record<string,any>;
 for(const [id,change] of Object.entries(baseline.items))if(same(result.items[id],change.afterHash))result.items[id]=structuredClone(change.before);
 if(same(result.source,baseline.source.afterHash))result.source=structuredClone(baseline.source.before);
 return result as T;
}
export function beforeConsumablesManifest<T>(input:T):T {
 const result=structuredClone(input) as Record<string,any>;
 for(const [key,change] of Object.entries(baseline.manifestFields))if(same(result[key],change.afterHash))result[key]=structuredClone(change.before);
 if(same(result.consumableUse,baseline.newManifestHash))delete result.consumableUse;
 return result as T;
}
