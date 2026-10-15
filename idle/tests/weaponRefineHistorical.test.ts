import {describe,it,expect} from 'vitest';
import catalog from '../content/catalog.json';import manifest from '../content/source-manifest.json';
import baseline from './fixtures/weaponRefineBaseline.json';
import {beforeWeaponRefineCatalog,beforeWeaponRefineManifest} from './weapon-refine-historical';
describe('strict inverse of only reviewed weapon-refine content changes',()=>{
 it('restores only the exact source, two ores and skill to their frozen previous records',()=>{
  const old=beforeWeaponRefineCatalog(catalog);expect(old.skills.ws_weaponrefine).toEqual(baseline.skills.ws_weaponrefine.before);expect(old.items[1010]).toEqual(baseline.items[1010].before);expect(old.items[1011]).toEqual(baseline.items[1011].before);expect(old.source).toEqual(baseline.source.before);
 });
 it('restores the native provenance fields and removes only the exact added manifest block',()=>{
  const old=beforeWeaponRefineManifest(manifest) as any;expect(old.weaponRefine).toBeUndefined();
  for(const [k,row] of Object.entries(baseline.manifestFields))expect(old[k]).toEqual(row.before);
  expect(old.skillSources.ws_weaponrefine).toEqual(baseline.manifestSkills.ws_weaponrefine.before);
 });
 it('keeps unrelated item/skill and provenance mutations observable',()=>{
  const c=structuredClone(catalog);c.items[1010].sellPrice++;c.skills.ws_weaponrefine.spCost[0]++;
  const old=beforeWeaponRefineCatalog(c);expect(old.items[1010].sellPrice).toBe(c.items[1010].sellPrice);expect(old.skills.ws_weaponrefine.spCost[0]).toBe(6);
  const m=structuredClone(manifest);m.weaponRefine.random='changed';expect(beforeWeaponRefineManifest(m).weaponRefine.random).toBe('changed');
 });
});
