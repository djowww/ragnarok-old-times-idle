import {createHash} from 'node:crypto';
import baseline from './fixtures/weaponElementsBaseline.json';
const same=(value:unknown,hash:string)=>value!==undefined&&createHash('sha256').update(JSON.stringify(value)).digest('hex')===hash;
/** Reverse only the reviewed literal weapon-property export delta. */
export function beforeWeaponElementsCatalog<T>(input:T):T {
 const result=structuredClone(input) as Record<string,any>;
 for(const [id,row] of Object.entries(baseline.catalog.items))
  if(same(result.items?.[id],row.afterSha256))result.items[id]=structuredClone(row.before);
 if(result.source?.hash===baseline.catalog.sourceHash.after)result.source.hash=baseline.catalog.sourceHash.before;
 return result as T;
}
export function beforeWeaponElementsManifest<T>(input:T):T {
 const result=structuredClone(input) as Record<string,any>;
 if(same(result.inertDropItems,baseline.manifest.inertDropItems.afterSha256))
  for(const row of baseline.manifest.inertDropItems.removed)result.inertDropItems.splice(row.index,0,structuredClone(row.item));
 if(same(result.weaponProperties,baseline.manifest.weaponPropertiesSha256))delete result.weaponProperties;
 if(result.catalogSha256===baseline.manifest.catalogSha256.after)result.catalogSha256=baseline.manifest.catalogSha256.before;
 return result as T;
}
