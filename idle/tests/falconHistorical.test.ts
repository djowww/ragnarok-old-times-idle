import{describe,it,expect}from'vitest';
import{createHash}from'node:crypto';
import catalog from'../content/catalog.json';import manifest from'../content/source-manifest.json';
import{beforeFalconCatalog,beforeFalconManifest}from'./falcon-historical';
const sha=(x:unknown)=>createHash('sha256').update(JSON.stringify(x,null,2)+'\n').digest('hex');
describe('strict Falcon historical compatibility',()=>{
 it('reconstructs the complete preceding files',()=>{
  expect(sha(beforeFalconCatalog(catalog))).toBe('d05a83f7358f632b692aa6ba65a2abdeffde22508ec2ab5794d45807c2d697f8');expect(sha(beforeFalconManifest(manifest))).toBe('3d0a8e831ac90efbca39a7f894691505c23c4905fcd5085aa944f143ecce5698');
 });
 it('does not mask an unrelated item or a mutated Detect implementation',()=>{
  const copy=structuredClone(catalog);copy.items['501'].sellPrice++;copy.skills.ht_detecting.spCost[0]++;
  const restored=beforeFalconCatalog(copy);expect(restored.items['501'].sellPrice).toBe(copy.items['501'].sellPrice);expect(restored.skills.ht_detecting.spCost[0]).toBe(9);
 });
});
