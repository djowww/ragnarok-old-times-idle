import type { Catalog, GameState } from '../shared/types.js';
import { classicBuffActive } from './classicBuffs.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classSkills, derivedStats, inventoryLoad } from './stats.js';
import { canPaySkillResources, paySkillResources } from './skillResources.js';
import { addItem, consume, event, random, requireRule } from './state.js';

export interface ConverterRecipe {
  outputItemId: number;
  ingredients: { itemId: number; quantity: number }[];
}
export interface ConverterCraftPreview {
  recipe?: ConverterRecipe;
  quantity: number;
  skillId?: string;
  learned: boolean;
  available: boolean;
  spCost: number;
  ingredients: { itemId: number; quantity: number; owned: number; missing: number }[];
  weight: number;
  maxWeight: number;
  resultWeight: number;
  reason?: { code: string; message: string };
}

/** Hercules 410b9738, db/produce_db.txt:389..395. No general crafting dispatcher. */
export function converterRecipe(itemId: number): ConverterRecipe | undefined {
  const material = ({ 12114: 904, 12115: 946, 12116: 947, 12117: 1013 } as Record<number, number>)[itemId];
  return material ? { outputItemId: itemId, ingredients: [{ itemId: 7433, quantity: 1 }, { itemId: material, quantity: 3 }] } : undefined;
}

/** Read-only authoritative menu: preview and execution share every validation. */
export function converterCraftPreview(s: GameState, c: Catalog, itemId: number, quantity: number, at = s.lastSimulatedAt): ConverterCraftPreview {
  const recipe = converterRecipe(itemId), load = inventoryLoad(s, c);
  const skill = classSkills(c, s.job).map(id => c.skills[id]).find(skill => skill?.sourceName === 'SA_CREATECON');
  const level = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
  const learned = !!skill && skill.implementation === 'supported' && Number.isSafeInteger(level) && level > 0 && level <= skill.maxLevel;
  const validQuantity = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000;
  const ingredients = recipe?.ingredients.map(ingredient => {
    const required = ingredient.quantity * (validQuantity ? quantity : 0);
    const owned = s.inventory.filter(entry => entry.itemId === ingredient.itemId).reduce((n, entry) => n + entry.quantity, 0);
    return { itemId: ingredient.itemId, quantity: required, owned, missing: Math.max(0, required - owned) };
  }) ?? [];
  const rawSpCost = skill?.spCost[level - 1] ?? skill?.spCost.at(-1) ?? 30;
  const reduction = derivedStats(at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at }, c).effects.spCostReductionPct ?? 0;
  const spCost = Math.max(0, Math.floor(rawSpCost * (1 - Math.min(100, reduction) / 100)));
  const resultWeight = load.weight - ingredients.reduce((n, ingredient) => n + (c.items[ingredient.itemId]?.weight ?? 0) * ingredient.quantity, 0) +
    (validQuantity ? (c.items[itemId]?.weight ?? 0) * quantity : 0);
  const preview: ConverterCraftPreview = { recipe, quantity, skillId: skill?.id, learned, available: false, spCost,
    ingredients, weight: load.weight, maxWeight: load.maxWeight, resultWeight };
  const reject = (code: string, message: string) => ({ ...preview, reason: { code, message } });
  if (!recipe) return reject('INVALID_CONVERTER', 'Escolha uma das quatro receitas de conversor elemental.');
  if (!validQuantity) return reject('INVALID_QUANTITY', 'Produza de 1 a 1000 conversores por ativação.');
  if (!Number.isFinite(at) || !c.items[itemId] || !['consumable', 'material'].includes(c.items[itemId].type) || ingredients.some(i => !c.items[i.itemId]))
    return reject('CONVERTER_CONTENT_UNAVAILABLE', 'Esta receita ainda não está disponível.');
  if (!learned) return reject('CONVERTER_SKILL_REQUIRED', 'Aprenda Criar Conversor Elemental como Sábio ou Professor.');
  // Town-only menu and integral net capacity are explicit Idle adaptations.
  if (s.status !== 'town') return reject('TOWN_REQUIRED', 'Volte à cidade para produzir conversores.');
  if (s.hp <= 0) return reject('RECOVERING', 'Recupere seu HP antes de produzir conversores.');
  if (s.battle?.cast || activePlayerStatus(s, 'SC_SILENCE', at) ||
    ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'RG_CHASEWALK', 'ST_INVISIBILITY', 'NV_TRICKDEAD']
      .some(source => classicBuffActive(s, c, source, at)))
    return reject('SKILL_STATUS_BLOCKED', 'Seu estado atual impede produzir conversores.');
  if (load.weight * 10 >= load.maxWeight * 9) return reject('SKILL_WEIGHT_BLOCKED', 'Alivie o peso para ficar abaixo de 90% antes de produzir.');
  if (!Number.isFinite(rawSpCost) || rawSpCost < 0 || !Number.isFinite(spCost) || !canPaySkillResources(s, c, skill!, level, at))
    return reject('SP_REQUIRED', 'Recursos insuficientes para ativar Criar Conversor Elemental.');
  if (ingredients.some(i => i.missing > 0)) return reject('CONVERTER_MATERIALS_REQUIRED', 'Reúna os pergaminhos e materiais necessários para este lote.');
  if (!Number.isFinite(resultWeight) || resultWeight > load.maxWeight) return reject('INVENTORY_CAPACITY', 'O lote excede a capacidade da mochila após consumir os materiais.');
  return { ...preview, available: true };
}

/** Called inside the existing cloned command/receipt transaction. Invalid requests mutate nothing. */
export function craftConverter(s: GameState, c: Catalog, itemId: number, quantity: number, at = s.lastSimulatedAt): void {
  const preview = converterCraftPreview(s, c, itemId, quantity, at);
  requireRule(preview.available, preview.reason?.code ?? 'CONVERTER_UNAVAILABLE', preview.reason?.message ?? 'Produção indisponível.');
  const skill = c.skills[preview.skillId!], level = s.learnedSkills[skill.id];
  requireRule(paySkillResources(s, c, skill, level, at), 'SP_REQUIRED', 'Recursos insuficientes para produzir conversores.');
  for (const ingredient of preview.ingredients) {
    let remaining = ingredient.quantity;
    for (const entry of [...s.inventory]) if (entry.itemId === ingredient.itemId && remaining > 0) {
      const used = Math.min(remaining, entry.quantity);
      if (used > 0) consume(s, entry, used);
      remaining -= used;
    }
  }
  // skill.c:20482 and 20553 evaluate rolls even for this guaranteed recipe.
  random(s);
  for (let n = 0; n < quantity; n++) random(s);
  addItem(s, c, itemId, quantity);
  event(s, at, 'craft', `Produziu ${quantity} × ${c.items[itemId].name}.`, undefined, 'player',
    { itemId, quantity, skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
}
