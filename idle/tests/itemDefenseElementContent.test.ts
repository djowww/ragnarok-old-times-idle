import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
const catalog=raw as unknown as Catalog;
describe('pinned complete body-property-only items',()=>{
  it.each([[2344,'fire'],[2345,'fire'],[2346,'water'],[2347,'water'],[2348,'wind'],[2349,'wind'],
    [2350,'earth'],[2351,'earth'],[4054,'holy'],[4119,'dark']] as const)('exports%s as%s without unsupported secondary effects',(id,element)=>{
      expect(catalog.items[id]?.defenseElement).toBe(element);
      expect(catalog.items[id]?.unsupportedEffect).toBeUndefined();
      expect(catalog.items[id]?.effects).toEqual({});
      if(catalog.items[id]?.type==='card') expect(catalog.items[id].cardSlots).toEqual(['armor']);
  });
  it.each([4047,4089,4098,4099,4101,4114,4141])('does not partially translate compound item%s',id=>{
    expect(catalog.items[id]?.defenseElement).toBeUndefined();
  });
});
