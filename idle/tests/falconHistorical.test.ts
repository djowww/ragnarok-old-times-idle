import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest, canonicalArrowHistoricalManifest } from './arrow-craft-historical';
import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import{describe,it,expect}from'vitest';
import{createHash}from'node:crypto';
import currentCatalog from'../content/catalog.json';import currentManifest from'../content/source-manifest.json';
import{beforeFalconCatalog,beforeFalconManifest}from'./falcon-historical';

const catalog = beforeFourMapExpansionCatalog(beforeArrowCraftingCatalog(currentCatalog));
const manifest = beforeFourMapExpansionManifest(beforeArrowCraftingManifest(currentManifest));
const sha=(x:unknown)=>createHash('sha256').update(JSON.stringify(x,null,2)+'\n').digest('hex');
describe('strict Falcon historical compatibility',()=>{
 it('reconstructs the complete preceding files',()=>{
  expect(sha(beforeFalconCatalog(catalog))).toBe('3cc7ea6e09e44a3096688911ef6e51e78b200692d7f761e05cdcc724a6a5fedb');expect(sha(canonicalArrowHistoricalManifest(beforeFalconManifest(manifest)))).toBe('136de049ec46d01937e811a3af26ea4da866368537b288f3b399343024ceb093');
 });
 it('does not mask an unrelated item or a mutated Detect implementation',()=>{
  const copy=structuredClone(catalog);copy.items['501'].sellPrice++;copy.skills.ht_detecting.spCost[0]++;
  const restored=beforeFalconCatalog(copy);expect(restored.items['501'].sellPrice).toBe(copy.items['501'].sellPrice);expect(restored.skills.ht_detecting.spCost[0]).toBe(9);
 });
});
