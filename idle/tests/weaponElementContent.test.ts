import {describe,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import raw from '../content/catalog.json';
import type {Catalog} from '../shared/types';
import {ItemFacts} from '../web/panels/Inventory';
import {beforeWeaponElementsCatalog,beforeWeaponElementsManifest} from './weapon-elements-historical';
import baseline from './fixtures/weaponElementsBaseline.json';
import manifest from '../content/source-manifest.json';
const c=raw as unknown as Catalog;
// Independent literals from the pinned pre-renewal item_db.conf scripts.
const expected:Record<number,string>={1131:'water',1133:'fire',1136:'fire',1138:'dark',1141:'ghost',1167:'wind',1231:'fire',1232:'dark',1256:'water',1258:'fire',1260:'undead',1365:'dark',1366:'holy',1368:'wind',1413:'wind',1420:'holy',1468:'wind',1469:'dark',1470:'holy',1471:'fire',1528:'holy',1557:'dark',1615:'undead',1720:'holy',1815:'dark',1916:'earth',1917:'wind',1967:'earth',13002:'dark',13303:'fire'};
describe('pinned weapon property catalog and historical boundary',()=>{
 it.each(Object.entries(expected))('exports item %s as %s',(id,element)=>expect(c.items[Number(id)].attackElement).toBe(element));
 it('keeps compound secondary effects unavailable while enabling their property',()=>{
  expect(c.items[1133].unsupportedEffect).toBe(true);expect(c.items[1133].effects).toEqual({});
  for(const id of [1260,1916,1917,1967])expect(c.items[id].unsupportedEffect).toBeUndefined();
  expect(c.items[2005].attackElement).toBeUndefined();
 });
 it('shows the actual weapon property in the item facts',()=>{
  const html=renderToStaticMarkup(createElement(ItemFacts,{item:c.items[1133],catalog:c}));
  expect(html).toContain('Propriedade');expect(html).toContain('Fogo');
 });
 it('reverses only the reviewed export to the exact previous catalog bytes',()=>{
  const text=JSON.stringify(beforeWeaponElementsCatalog(raw),null,2)+'\n';
  expect(createHash('sha256').update(text).digest('hex')).toBe(baseline.manifest.catalogSha256.before);
  const old=beforeWeaponElementsManifest(manifest) as Record<string,unknown>;
  expect(old.weaponProperties).toBeUndefined();expect(old.catalogSha256).toBe(baseline.manifest.catalogSha256.before);
 });
 it('does not mask unreviewed item or provenance mutations',()=>{
  const changed=structuredClone(raw);Object.assign(changed.items['1133'],{attackElement:'water'});
  expect(beforeWeaponElementsCatalog(changed).items['1133'].attackElement).toBe('water');
  const altered=structuredClone(manifest);altered.weaponProperties.items[0].element='unknown';
  expect(beforeWeaponElementsManifest(altered).weaponProperties).toEqual(altered.weaponProperties);
 });
});
