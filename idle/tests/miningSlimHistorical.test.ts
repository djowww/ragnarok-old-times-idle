import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest, canonicalArrowHistoricalManifest } from './arrow-craft-historical';
import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import baseline from './fixtures/miningSlimBaseline.json';
import {beforeMiningSlimCatalog,beforeMiningSlimManifest} from './mining-slim-historical';

const catalog = beforeFourMapExpansionCatalog(beforeArrowCraftingCatalog(currentCatalog));
const manifest = beforeFourMapExpansionManifest(beforeArrowCraftingManifest(currentManifest));
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x,null,2)+'\n').digest('hex');
describe('strict mining and compact pitcher delta',()=>{
 it('reconstructs complete prior catalog and manifest bytes',()=>{
  expect(hash(beforeMiningSlimCatalog(catalog))).toBe(baseline.beforeCatalogSha256);
  expect(hash(canonicalArrowHistoricalManifest(beforeMiningSlimManifest(manifest)))).toBe(baseline.beforeManifestSha256);
 });
 it('never normalizes a mutated new item or skill',()=>{
  const c=structuredClone(catalog);c.items['997'].weight++;c.skills.cr_slimpitcher.spCost[0]++;
  const old=beforeMiningSlimCatalog(c);expect(old.items['997']).toEqual(c.items['997']);expect(old.skills.cr_slimpitcher).toEqual(c.skills.cr_slimpitcher);
 });
 it('never erases mutated source or acquisition evidence',()=>{
  const m=structuredClone(manifest);m.findingOre.chain[0].chance++;m.sources[0].sha256='mutated';
  const old=beforeMiningSlimManifest(m);expect(old.findingOre).toEqual(m.findingOre);expect(old.sources).toContainEqual(m.sources[0]);
 });
});
