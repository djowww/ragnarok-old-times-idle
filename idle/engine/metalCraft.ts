import recipes from '../content/metal-recipes.json' with { type: 'json' };
import type { Catalog, GameState, Skill } from '../shared/types.js';
import type { MetalRecipeSource } from '../tools/metalRecipes.mjs';
import { activePlayerStatus } from './playerStatuses.js';
import { classSkills, derivedStats, inventoryLoad } from './stats.js';
import { addItem, consume, event, random, requireRule } from './state.js';

export type MetalRecipe = MetalRecipeSource;
export interface MetalCraftPreview {
  recipe?: MetalRecipe; skillId?: string; skillLevel: number; learned: boolean; available: boolean; chance: number;
  ingredients: { itemId: number; quantity: number; owned: number; missing: number }[];
  weight: number; maxWeight: number; resultWeight: number; reason?: { code: string; message: string };
}
export const metalRecipes = recipes as MetalRecipe[];
export const metalRecipe = (itemId: number) => metalRecipes.find(recipe => recipe.outputItemId === itemId);
function craftSkill(s: GameState, c: Catalog, recipe: MetalRecipe): Skill | undefined {
  return classSkills(c, s.job).map(id => c.skills[id]).find(skill =>
    skill?.sourceName === recipe.skillName && skill.implementation === 'supported' && skill.manualUse === 'metalCraft');
}

/** Hercules src/map/skill.c: BS_IRON/STEEL/ENCHANTEDSTONE make_per; chance is basis points. */
export function metalCraftChance(s: GameState, c: Catalog, recipe: MetalRecipe, at = s.lastSimulatedAt): number {
  const skill = craftSkill(s, c, recipe), level = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
  const current = at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at };
  const stats = derivedStats(current, c).attributes ?? s.stats;
  let chance = s.jobLevel * 20 + stats.dex * 10 + stats.luk * 10;
  if (recipe.outputItemId === 998) chance += 4000 + level * 500;
  else if (recipe.outputItemId === 999) chance += 3000 + level * 500;
  else if (recipe.outputItemId === 1000) chance = 100000;
  else chance += 1000 + level * 500;
  return Math.max(1, Math.min(10000, Math.floor(chance)));
}

export function metalCraftPreview(s: GameState, c: Catalog, itemId: number, at = s.lastSimulatedAt): MetalCraftPreview {
  const recipe = metalRecipe(itemId), load = inventoryLoad(s, c);
  const skill = recipe ? craftSkill(s, c, recipe) : undefined, skillLevel = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
  const learned = !!skill && Number.isSafeInteger(skillLevel) && skillLevel >= 1 && skillLevel <= skill.maxLevel;
  const ingredients = recipe?.ingredients.map(ingredient => {
    const owned = s.inventory.filter(entry => entry.itemId === ingredient.itemId).reduce((sum, entry) => sum + entry.quantity, 0);
    return { itemId: ingredient.itemId, quantity: ingredient.quantity, owned, missing: Math.max(0, ingredient.quantity - owned) };
  }) ?? [];
  const resultWeight = load.weight - ingredients.reduce((sum, item) => sum + (c.items[item.itemId]?.weight ?? 0) * item.quantity, 0) +
    (c.items[itemId]?.weight ?? 0);
  const preview: MetalCraftPreview = { recipe, skillId: skill?.id, skillLevel, learned, available: false,
    chance: recipe ? metalCraftChance(s, c, recipe, at) : 0, ingredients, weight: load.weight, maxWeight: load.maxWeight, resultWeight };
  const reject = (code: string, message: string) => ({ ...preview, reason: { code, message } });
  if (!recipe) return reject('INVALID_METAL_RECIPE', 'Escolha uma receita de metal ou pedra encantada disponível.');
  if (!Number.isFinite(at)) return reject('INVALID_TIME', 'A tentativa de produção está indisponível.');
  if (!c.items[itemId] || ingredients.some(item => !c.items[item.itemId]))
    return reject('METAL_CONTENT_UNAVAILABLE', 'A receita ou os materiais não estão disponíveis no catálogo.');
  if (!learned) return reject('METAL_CRAFT_SKILL_REQUIRED', 'Aprenda a habilidade de produção desta receita.');
  if (skillLevel < recipe.skillLevel) return reject('METAL_CRAFT_LEVEL_REQUIRED', 'Esta receita exige nível 1 da habilidade.');
  if (!['town', 'hunting', 'challenge'].includes(s.status) || s.hp <= 0 || s.battle?.cast || s.supportCast ||
      (s.playerCanActAt ?? 0) > at || activePlayerStatus(s, 'SC_SILENCE', at))
    return reject('METAL_CRAFT_BLOCKED', 'Este estado impede uma tentativa de produção.');
  if (load.weight * 10 >= load.maxWeight * 9)
    return reject('SKILL_WEIGHT_BLOCKED', 'Alivie o peso para ficar abaixo de 90% antes de produzir.');
  if (ingredients.some(item => item.missing > 0))
    return reject('METAL_CRAFT_MATERIALS_REQUIRED', 'Reúna todos os materiais indicados para esta receita.');
  if (!Number.isFinite(resultWeight) || resultWeight > load.maxWeight)
    return reject('INVENTORY_CAPACITY', 'O resultado excede a capacidade da mochila após consumir os materiais.');
  return { ...preview, available: true };
}

/** Inputs are consumed before one source chance roll; a failed attempt grants no item. */
export function craftMetal(s: GameState, c: Catalog, itemId: number, at = s.lastSimulatedAt): void {
  const preview = metalCraftPreview(s, c, itemId, at);
  requireRule(preview.available, preview.reason?.code ?? 'METAL_CRAFT_UNAVAILABLE', preview.reason?.message ?? 'Produção indisponível.');
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
  event(s, at, 'craft', success ? `Produziu ${c.items[itemId].name}.` :
    `A tentativa de produzir ${c.items[itemId].name} falhou; os materiais foram perdidos.`, undefined, 'player', {
      itemId, quantity: success ? 1 : 0, attempts: 1, failures: success ? 0 : 1,
      skillId: skill.id, skillLevel: preview.skillLevel, actorAction: 'none',
    });
}
