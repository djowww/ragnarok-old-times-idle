import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import recipes from '../content/metal-recipes.json';
import manifest from '../content/source-manifest.json';
import { parseMetalRecipes } from '../tools/metalRecipes.mjs';

describe('classic ore and enchanted-stone crafting source', () => {
  it('parses only the pinned seven recipes and rejects malformed selected rows', () => {
    const source = [
      '998,21,94,1,1002,1', '999,21,95,1,998,5,1003,1', '1000,21,96,1,1001,10',
      '994,21,96,1,990,10', '995,21,96,1,991,10', '997,21,96,1,993,10', '996,21,96,1,992,10',
      '1101,1,99,1,998,2',
    ].join('\n');
    const parsed = parseMetalRecipes(source);
    expect(parsed.map(recipe => recipe.outputItemId)).toEqual([998,999,1000,994,995,997,996]);
    expect(parsed[1].ingredients).toEqual([{itemId:998,quantity:5},{itemId:1003,quantity:1}]);
    expect(() => parseMetalRecipes('998,21,94,1,1002')).toThrow(/Malformed/);
  });
  it('exports all four solo Blacksmith skills with pinned recipe metadata', () => {
    for (const name of ['BS_IRON','BS_STEEL','BS_ENCHANTEDSTONE']) {
      const skill = Object.values(catalog.skills).find(candidate => candidate.sourceName === name);
      expect(skill).toMatchObject({implementation:'supported',kind:'passive',manualUse:'metalCraft'});
    }
    const oridecon = Object.values(catalog.skills).find(candidate => candidate.sourceName === 'BS_ORIDEOCON');
    expect(oridecon).toMatchObject({implementation:'supported',kind:'passive'});
    expect(manifest.metalCraft).toMatchObject({source:'db/produce_db.txt',recipes:7,
      skillFamilies:['BS_IRON','BS_STEEL','BS_ENCHANTEDSTONE']});
    expect(recipes).toHaveLength(7);
  });
});
