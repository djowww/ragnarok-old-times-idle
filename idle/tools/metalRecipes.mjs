const skills = new Map([[94, 'BS_IRON'], [95, 'BS_STEEL'], [96, 'BS_ENCHANTEDSTONE']]);

/** Parse the three pre-renewal ore and enchanted-stone recipes from pinned produce_db.txt. */
export function parseMetalRecipes(text) {
  if (typeof text !== 'string') throw new TypeError('produce_db must be text');
  const recipes = [], outputIds = new Set();
  for (const [lineIndex, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.split('//')[0].trim();
    if (!/^\d+,/.test(line)) continue;
    const values = line.split(',').map(value => Number(value.trim()));
    const skillName = skills.get(values[2]);
    if (!skillName) continue;
    if (values.length < 6 || (values.length - 4) % 2 !== 0 || values.some(value => !Number.isSafeInteger(value)))
      throw new Error(`Malformed metal recipe on line ${lineIndex + 1}`);
    const [outputItemId, itemLevel, skillId, skillLevel, ...materials] = values;
    if (outputItemId <= 0 || itemLevel !== 21 || skillLevel !== 1 || outputIds.has(outputItemId))
      throw new Error(`Invalid or duplicate metal recipe on line ${lineIndex + 1}`);
    const ingredients = [];
    for (let index = 0; index < materials.length; index += 2) {
      const itemId = materials[index], quantity = materials[index + 1];
      if (itemId <= 0 || quantity <= 0 || ingredients.some(item => item.itemId === itemId))
        throw new Error(`Invalid metal materials on line ${lineIndex + 1}`);
      ingredients.push({ itemId, quantity });
    }
    outputIds.add(outputItemId);
    recipes.push({ outputItemId, itemLevel, skillId, skillName, skillLevel, ingredients });
  }
  return recipes;
}
