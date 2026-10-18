import { beforeWeaponCraftingCatalog, beforeWeaponCraftingManifest } from './weapon-craft-historical.js';
import {createHash} from 'node:crypto';
import baseline from './fixtures/monsterSpritesBaseline.json';
const same=(value:unknown,hash:string)=>value!==undefined&&createHash('sha256').update(JSON.stringify(value)).digest('hex')===hash;
/** Reverse only the four reviewed original-client resource corrections. */
export function beforeMonsterSpritesCatalog<T>(input:T):T{
 const result=structuredClone(beforeWeaponCraftingCatalog(input)) as Record<string,any>;
 for(const [id,row] of Object.entries(baseline.catalog.monsters))
  if(same(result.monsters?.[id],row.afterSha256))result.monsters[id].sprite=structuredClone(row.beforeSprite);
 if(result.source?.hash===baseline.catalog.sourceHash.after)result.source.hash=baseline.catalog.sourceHash.before;
 return result as T;
}
export function beforeMonsterSpritesRules<T>(input:T):T{
 const result=structuredClone(input) as Record<string,any>;
 if(same(result.monsterAliases,baseline.rules.afterAliasesSha256))result.monsterAliases=structuredClone(baseline.rules.beforeAliases);
 if(result.referenceHashes?.monsterTable===baseline.rules.addedReferenceHash)delete result.referenceHashes.monsterTable;
 return result as T;
}
export function beforeMonsterSpritesManifest<T>(input:T):T{
 const result=structuredClone(beforeWeaponCraftingManifest(input)) as Record<string,any>;
 if(same(result.monsterSpriteMappingSource,baseline.manifest.mappingSha256))delete result.monsterSpriteMappingSource;
 for(const key of ['catalogSha256','rulesSha256'] as const)
  if(result[key]===baseline.manifest[key].after)result[key]=baseline.manifest[key].before;
 return result as T;
}
