export type MetalRecipeSource = {
  outputItemId: number; itemLevel: number; skillId: number; skillName: string; skillLevel: number;
  ingredients: { itemId: number; quantity: number }[];
};
export function parseMetalRecipes(text: string): MetalRecipeSource[];
