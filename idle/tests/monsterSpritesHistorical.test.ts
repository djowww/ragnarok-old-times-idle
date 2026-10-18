import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest, beforeArrowCraftingRules, canonicalArrowHistoricalManifest } from './arrow-craft-historical';
import {createHash} from 'node:crypto';import {describe,expect,it} from 'vitest';
import catalog from '../content/catalog.json';import rules from '../content/rules.json';import manifest from '../content/source-manifest.json';
import baseline from './fixtures/monsterSpritesBaseline.json';
import {beforeMonsterSpritesCatalog,beforeMonsterSpritesRules,beforeMonsterSpritesManifest} from './monster-sprites-historical';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value,null,2)+'\n').digest('hex');
describe('monster resource correction historical boundary',()=>{
 it('reconstructs the exact prior catalog, rules and manifest',()=>{
  expect(hash(beforeMonsterSpritesCatalog(beforeArrowCraftingCatalog(catalog)))).toBe(baseline.catalog.beforeFileSha256);
  expect(hash(beforeMonsterSpritesRules(beforeArrowCraftingRules(rules)))).toBe(baseline.rules.beforeFileSha256);
  expect(hash(canonicalArrowHistoricalManifest(beforeMonsterSpritesManifest(beforeArrowCraftingManifest(manifest))))).toBe(baseline.manifest.beforeFileSha256);
 });
 it('keeps unreviewed monster, alias and provenance edits visible',()=>{
  const c=structuredClone(catalog);c.monsters['1032'].hp++;expect(beforeMonsterSpritesCatalog(c).monsters['1032']).toEqual(c.monsters['1032']);
  const r=structuredClone(rules);r.monsterAliases['1032']='unreviewed';expect(beforeMonsterSpritesRules(r).monsterAliases).toEqual(r.monsterAliases);
  const m=structuredClone(manifest);m.monsterSpriteMappingSource.verifiedAliases['1032']='unreviewed';expect(beforeMonsterSpritesManifest(m).monsterSpriteMappingSource).toEqual(m.monsterSpriteMappingSource);
 });
});
