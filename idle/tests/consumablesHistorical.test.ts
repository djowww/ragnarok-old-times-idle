import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest } from './arrow-craft-historical';
import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import baseline from './fixtures/consumablesBaseline.json';
import {beforeConsumablesCatalog,beforeConsumablesManifest} from './consumables-historical';

const catalog = beforeFourMapExpansionCatalog(beforeArrowCraftingCatalog(currentCatalog));
const manifest = beforeFourMapExpansionManifest(beforeArrowCraftingManifest(currentManifest));
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x,null,2)+'\n').digest('hex');
describe('strict usable-potion content delta',()=>{
 it('reconstructs the complete preceding Pharmacy catalog bytes',()=>expect(hash(beforeConsumablesCatalog(catalog))).toBe(baseline.beforeCatalogSha256));
 it('retains mutations to approved item and source records',()=>{
  const c=structuredClone(catalog);c.items['545'].weight++;expect(beforeConsumablesCatalog(c).items['545']).toEqual(c.items['545']);c.source.hash='mutated';expect(beforeConsumablesCatalog(c).source.hash).toBe('mutated');
 });
 it('retains altered consumer contract and inert-output metadata',()=>{
  const m=structuredClone(manifest);m.consumableUse.items.push(7142);expect(beforeConsumablesManifest(m).consumableUse).toEqual(m.consumableUse);m.pharmacyCraft.inertOutputItemIds.push(545);expect(beforeConsumablesManifest(m).pharmacyCraft).toEqual(m.pharmacyCraft);
 });
 it('declares all nine and only implemented consumers; Embryo remains inert',()=>{
  expect(manifest.consumableUse.items).toEqual([545,546,547,605,606,12118,12119,12120,12121]);expect(manifest.pharmacyCraft.inertOutputItemIds).toEqual([7142]);expect(catalog.items['7142'].unsupportedEffect).toBe(true);
 });
});
