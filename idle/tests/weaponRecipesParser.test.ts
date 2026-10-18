import { describe, expect, it } from 'vitest';
import { parseWeaponRecipes } from '../tools/weaponRecipes.mjs';

describe('pinned weapon recipe parser', () => {
  it('reads only the seven smithing skill IDs and preserves all material pairs', () => {
    expect(parseWeaponRecipes(['// note', '1101,1,99,1,998,2', '1214,23,228,1,1,1', '1460,3,104,3,984,8,999,10,720,5'].join('\n'))).toEqual([
      { outputItemId: 1101, weaponLevel: 1, skillId: 99, skillName: 'BS_SWORD', skillLevel: 1, ingredients: [{ itemId: 998, quantity: 2 }] },
      { outputItemId: 1460, weaponLevel: 3, skillId: 104, skillName: 'BS_SPEAR', skillLevel: 3, ingredients: [{ itemId: 984, quantity: 8 }, { itemId: 999, quantity: 10 }, { itemId: 720, quantity: 5 }] },
    ]);
  });
  it('rejects malformed, duplicate, and zero-quantity source rows', () => {
    expect(() => parseWeaponRecipes('1101,1,99,1,998')).toThrow(/Malformed/);
    expect(() => parseWeaponRecipes('1101,1,99,1,998,2\n1101,1,99,1,998,2')).toThrow(/duplicate/);
    expect(() => parseWeaponRecipes('1101,1,99,1,998,0')).toThrow(/materials/);
  });
});
