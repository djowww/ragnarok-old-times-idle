import { createHash } from 'node:crypto';
import baseline from './fixtures/pharmacyBaseline.json';
const same=(value:unknown,hash:string)=>value!==undefined&&createHash('sha256').update(JSON.stringify(value)).digest('hex')===hash;
/** Only exact approved Pharmacy records are reversed. Any other change remains visible. */
export function beforePharmacyCatalog<T>(input:T):T {
 const result=structuredClone(input) as Record<string,any>;
 for(const [id,hash] of Object.entries(baseline.addedItems))if(same(result.items[id],hash))delete result.items[id];
 for(const [id,change] of Object.entries(baseline.items))if(same(result.items[id],change.afterHash))result.items[id]=structuredClone(change.before);
 if(same(result.skills.am_pharmacy,baseline.skill.afterHash))result.skills.am_pharmacy=structuredClone(baseline.skill.before);
 if(same(result.source,baseline.source.afterHash))result.source=structuredClone(baseline.source.before);
 return result as T;
}
export function beforePharmacyManifest<T>(input:T):T {
 const result=structuredClone(input) as Record<string,any>;
 for(const [field,change] of Object.entries(baseline.manifestFields))if(same(result[field],change.afterHash))result[field]=structuredClone(change.before);
 if(same(result.skillSources.am_pharmacy,baseline.manifestSkill.afterHash))result.skillSources.am_pharmacy=structuredClone(baseline.manifestSkill.before);
 if(same(result.pharmacyCraft,baseline.pharmacyManifestHash))delete result.pharmacyCraft;
 return result as T;
}
