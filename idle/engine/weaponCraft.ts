import recipes from '../content/weapon-recipes.json' with { type: 'json' };
import type { Catalog, GameState, Skill } from '../shared/types.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classSkills, derivedStats, inventoryLoad } from './stats.js';
import { addItem, consume, event, random, requireRule } from './state.js';

export interface WeaponRecipe {
  outputItemId: number;
  weaponLevel: number;
  skillId: number;
  skillName: string;
  skillLevel: number;
  ingredients: { itemId: number; quantity: number }[];
}
export interface WeaponCraftPreview {
  recipe?: WeaponRecipe;
  skillId?: string;
  skillLevel: number;
  learned: boolean;
  available: boolean;
  chance: number;
  ingredients: { itemId: number; quantity: number; owned: number; missing: number }[];
  weight: number;
  maxWeight: number;
  resultWeight: number;
  reason?: { code: string; message: string };
}

export const weaponRecipes = recipes as WeaponRecipe[];
export const weaponRecipe = (itemId: number) => weaponRecipes.find(recipe => recipe.outputItemId === itemId);
const ANVIL_BONUS = [[989, 1000], [988, 500], [987, 300], [986, 0]] as const;

function smithSkill(s: GameState, c: Catalog, recipe: WeaponRecipe): Skill | undefined {
  return classSkills(c, s.job).map(id => c.skills[id]).find(skill =>
    skill?.sourceName === recipe.skillName && skill.implementation === 'supported' && skill.manualUse === 'weaponCraft');
}
function learnedPassiveLevel(s: GameState, c: Catalog, sourceName: string): number {
  const skill = classSkills(c, s.job).map(id => c.skills[id]).find(candidate => candidate?.sourceName === sourceName);
  const level = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
  return Number.isSafeInteger(level) && level > 0 && level <= (skill?.maxLevel ?? 0) ? level : 0;
}
function anvilBonus(s: GameState): number {
  return ANVIL_BONUS.find(([itemId]) => s.inventory.some(entry => entry.itemId === itemId && entry.quantity > 0))?.[1] ?? 0;
}

/** Hercules skill.c:20461..20480. Idle uses the pinned normal WP rate (100%). */
export function weaponCraftChance(s: GameState, c: Catalog, recipe: WeaponRecipe, at = s.lastSimulatedAt): number {
  const skill = smithSkill(s, c, recipe);
  const level = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
  const current = at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at };
  const stats = derivedStats(current, c).attributes ?? s.stats;
  let chance = 5000 + s.jobLevel * 20 + stats.dex * 10 + stats.luk * 10 + level * 500 +
    learnedPassiveLevel(s, c, 'BS_WEAPONRESEARCH') * 100 +
    (recipe.weaponLevel >= 3 ? learnedPassiveLevel(s, c, 'BS_ORIDEOCON') * 100 : 0) -
    (recipe.weaponLevel > 1 ? recipe.weaponLevel * 1000 : 0) + anvilBonus(s);
  if (c.classes[s.job]?.id.toLowerCase().includes('baby')) chance = Math.floor(chance * 50 / 100);
  return Math.max(1, Math.min(10000, Math.floor(chance)));
}

export function weaponCraftPreview(s: GameState, c: Catalog, itemId: number, at = s.lastSimulatedAt): WeaponCraftPreview {
  const recipe = weaponRecipe(itemId), load = inventoryLoad(s, c);
  const skill = recipe ? smithSkill(s, c, recipe) : undefined;
  const skillLevel = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
  const learned = !!skill && Number.isSafeInteger(skillLevel) && skillLevel >= 1 && skillLevel <= skill.maxLevel;
  const ingredients = recipe?.ingredients.map(ingredient => {
    const owned = s.inventory.filter(entry => entry.itemId === ingredient.itemId).reduce((sum, entry) => sum + entry.quantity, 0);
    return { itemId: ingredient.itemId, quantity: ingredient.quantity, owned, missing: Math.max(0, ingredient.quantity - owned) };
  }) ?? [];
  const resultWeight = load.weight - ingredients.reduce((sum, ingredient) => sum + (c.items[ingredient.itemId]?.weight ?? 0) * ingredient.quantity, 0) +
    (c.items[itemId]?.weight ?? 0);
  const preview: WeaponCraftPreview = {
    recipe, skillId: skill?.id, skillLevel, learned, available: false,
    chance: recipe ? weaponCraftChance(s, c, recipe, at) : 0,
    ingredients, weight: load.weight, maxWeight: load.maxWeight, resultWeight,
  };
  const reject = (code: string, message: string) => ({ ...preview, reason: { code, message } });
  if (!recipe) return reject('INVALID_WEAPON_RECIPE', 'Escolha uma das receitas de forja disponíveis.');
  if (!Number.isFinite(at)) return reject('INVALID_TIME', 'A tentativa de forja está indisponível.');
  if (!c.items[itemId] || c.items[itemId].type !== 'equipment' || c.items[itemId].slot !== 'weapon' ||
    !Number.isSafeInteger(c.items[itemId].weaponLevel ?? 1) || (c.items[itemId].weaponLevel ?? 1) !== recipe.weaponLevel ||
    ingredients.some(ingredient => !c.items[ingredient.itemId]))
    return reject('WEAPON_CONTENT_UNAVAILABLE', 'A receita ou os materiais não estão disponíveis no catálogo.');
  if (!learned) return reject('WEAPON_CRAFT_SKILL_REQUIRED', 'Aprenda a habilidade de forja desta família e o nível exigido pela receita.');
  if (skillLevel < recipe.skillLevel) return reject('WEAPON_CRAFT_LEVEL_REQUIRED', `Esta receita exige nível ${recipe.skillLevel} da habilidade.`);
  if (!['town', 'hunting', 'challenge'].includes(s.status) || s.hp <= 0 || s.battle?.cast || s.supportCast || (s.playerCanActAt ?? 0) > at || activePlayerStatus(s, 'SC_SILENCE', at))
    return reject('WEAPON_CRAFT_BLOCKED', 'Este estado impede uma tentativa de forja.');
  if (load.weight * 10 >= load.maxWeight * 9) return reject('SKILL_WEIGHT_BLOCKED', 'Alivie o peso para ficar abaixo de 90% antes de forjar.');
  if (ingredients.some(ingredient => ingredient.missing > 0)) return reject('WEAPON_CRAFT_MATERIALS_REQUIRED', 'Reúna todos os materiais indicados para esta receita.');
  if (!Number.isFinite(resultWeight) || resultWeight > load.maxWeight) return reject('INVENTORY_CAPACITY', 'A arma excede a capacidade da mochila após consumir os materiais.');
  return { ...preview, available: true };
}

/** Materials are consumed before the single Hercules chance roll; failure does not refund them. */
export function craftWeapon(s: GameState, c: Catalog, itemId: number, at = s.lastSimulatedAt): void {
  const preview = weaponCraftPreview(s, c, itemId, at);
  requireRule(preview.available, preview.reason?.code ?? 'WEAPON_CRAFT_UNAVAILABLE', preview.reason?.message ?? 'Forja indisponível.');
  const recipe = preview.recipe!, skill = c.skills[preview.skillId!];
  for (const ingredient of recipe.ingredients) {
    let remaining = ingredient.quantity;
    for (const entry of [...s.inventory]) if (entry.itemId === ingredient.itemId && remaining > 0) {
      const used = Math.min(entry.quantity, remaining);
      if (used > 0) consume(s, entry, used);
      remaining -= used;
    }
  }
  const roll = Math.floor(random(s) * 0x100000000) % 10000;
  const success = roll < preview.chance;
  if (success) addItem(s, c, itemId, 1);
  event(s, at, 'craft', success ? `Forjou ${c.items[itemId].name}.` : `A forja de ${c.items[itemId].name} falhou; os materiais foram perdidos.`, undefined, 'player', {
    itemId, quantity: success ? 1 : 0, attempts: 1, failures: success ? 0 : 1,
    skillId: skill.id, skillLevel: preview.skillLevel, actorAction: 'none',
  });
}
