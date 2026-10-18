import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest } from './arrow-craft-historical';
import { beforeDeadlyPoisonCraftCatalog, beforeDeadlyPoisonCraftManifest } from './deadly-poison-craft-historical';
import { beforeFourMapExpansionCatalog, beforeFourMapExpansionManifest } from './four-map-expansion-historical';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import currentCatalog from '../content/catalog.json';
import currentManifest from '../content/source-manifest.json';
import baseline from './fixtures/pharmacyBaseline.json';
import {beforePharmacyCatalog,beforePharmacyManifest} from './pharmacy-historical.js';

const catalog = beforeFourMapExpansionCatalog(beforeArrowCraftingCatalog(beforeDeadlyPoisonCraftCatalog(currentCatalog)));
const manifest = beforeFourMapExpansionManifest(beforeArrowCraftingManifest(beforeDeadlyPoisonCraftManifest(currentManifest)));
const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x,null,2)+'\n').digest('hex');
describe('strict Pharmacy historical delta',()=>{
 it('reconstructs the complete prior catalog bytes',()=>expect(hash(beforePharmacyCatalog(catalog))).toBe(baseline.beforeCatalogSha256));
 it('does not conceal unrelated, changed new or changed approved records',()=>{
  for(const id of ['1002','1192']){const c=structuredClone(catalog);c.monsters[id as '1002'].hp++;expect(beforePharmacyCatalog(c).monsters[id as '1002'].hp).toBe(c.monsters[id as '1002'].hp);}
  const c=structuredClone(catalog);c.items['7127'].weight++;expect(beforePharmacyCatalog(c).items['7127']).toEqual(c.items['7127']);
  c.items['7134'].shopPrice++;expect(beforePharmacyCatalog(c).items['7134']).toEqual(c.items['7134']);
  c.skills.am_pharmacy.maxLevel++;expect(beforePharmacyCatalog(c).skills.am_pharmacy).toEqual(c.skills.am_pharmacy);
 });
 it('retains mutated Pharmacy manifest/source coverage records',()=>{
  const m=structuredClone(manifest);m.pharmacyCraft.spPerAttempt++;expect(beforePharmacyManifest(m).pharmacyCraft).toEqual(m.pharmacyCraft);
  m.skillCoverage.supported++;expect(beforePharmacyManifest(m).skillCoverage.supported).toBe(m.skillCoverage.supported);
 });
});
