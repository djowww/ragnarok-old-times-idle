const skills = new Map([[98, 'BS_DAGGER'], [99, 'BS_SWORD'], [100, 'BS_TWOHANDSWORD'], [101, 'BS_AXE'], [102, 'BS_MACE'], [103, 'BS_KNUCKLE'], [104, 'BS_SPEAR']]);

/** Parse only the seven pre-renewal weapon-forging families from pinned produce_db.txt. */
export function parseWeaponRecipes(text) {
  if (typeof text !== 'string') throw new TypeError('produce_db must be text');
  const recipes = [];
  const outputIds = new Set();
  for (const [lineIndex, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!/^\d+,/.test(line)) continue;
    const values = line.split(',').map(Number);
    const skillName = skills.get(values[2]);
    if (!skillName) continue;
    if (values.length < 6 || (values.length - 4) % 2 !== 0 || values.some(value => !Number.isSafeInteger(value)))
      throw new Error(`Malformed weapon recipe on line ${lineIndex + 1}`);
    const [itemId, weaponLevel, skillId, skillLevel, ...materials] = values;
    if (itemId <= 0 || weaponLevel < 1 || weaponLevel > 3 || skillLevel < 1 || skillLevel > 3 || outputIds.has(itemId))
      throw new Error(`Invalid or duplicate weapon recipe on line ${lineIndex + 1}`);
    const ingredients = [];
    for (let index = 0; index < materials.length; index += 2) {
      const itemId = materials[index], quantity = materials[index + 1];
      if (itemId <= 0 || quantity <= 0 || ingredients.some(ingredient => ingredient.itemId === itemId))
        throw new Error(`Invalid weapon materials on line ${lineIndex + 1}`);
      ingredients.push({ itemId, quantity });
    }
    outputIds.add(itemId);
    recipes.push({ outputItemId: itemId, weaponLevel, skillId, skillName, skillLevel, ingredients });
  }
  return recipes;
}
