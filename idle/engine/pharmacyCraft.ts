import type { Catalog, GameState } from '../shared/types.js';
import { pharmacyRecipes, type PharmacyRecipe } from '../shared/pharmacyRecipes.js';
import { classicBuffActive } from './classicBuffs.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classSkills, derivedStats } from './stats.js';
import { inventoryWeightUnits, maxWeightUnits, itemWeightUnits } from './itemCapacity.js';
import { skillResourceCosts, paySkillResources } from './skillResources.js';
import { addItem, consume, event, random, requireRule } from './state.js';
export { pharmacyRecipes } from '../shared/pharmacyRecipes.js';

export function pharmacyBaseChance(research: number, pharmacy: number, job: number,
  attributes: { int: number; dex: number; luk: number }): number {
  return 50 * research + 300 * pharmacy + 20 * job + 10 * Math.floor(attributes.int / 2) +
    10 * attributes.dex + 10 * attributes.luk;
}
function adjustment(item: number): { fixed: number; sign: number; modulus: number } {
  if ([501, 503, 504].includes(item)) return { fixed: 2000, sign: 1, modulus: 100 };
  if (item === 970) return { fixed: 1000, sign: 1, modulus: 100 };
  if ([7135, 7136, 7137, 7138].includes(item)) return { fixed: 0, sign: 1, modulus: 100 };
  if (item === 546) return { fixed: 0, sign: -1, modulus: 50 };
  if ([547, 7139].includes(item)) return { fixed: 0, sign: -1, modulus: 100 };
  return { fixed: 0, sign: 0, modulus: 0 };
}
/** Source skill.c20249..20482,20553. rate100; no homunculus/Baby system exists here. */
export function pharmacyRoll(base: number, itemId: number, drawMod: (modulus: number) => number) {
  const a = adjustment(itemId);
  const chance = Math.max(1, base + a.fixed + (a.modulus ? a.sign * 10 * (1 + drawMod(a.modulus)) : 0));
  const success = drawMod(10000) < chance;
  if (success) drawMod(10000); // Native qty1 still evaluates the otherwise-unused inner roll.
  return { chance, success };
}
export interface PharmacyCraftPreview {
  recipe?: PharmacyRecipe; quantity: number; skillId?: string; learned: boolean; available: boolean;
  spPerAttempt: number; spTotal: number; guide?: { itemId: number; owned: number };
  ingredients: { itemId: number; quantity: number; owned: number; missing: number }[];
  chanceMin: number; chanceMax: number; weight: number; maxWeight: number; resultWeight: number;
  reason?: { code: string; message: string };
}
export function pharmacyCraftPreview(s: GameState, c: Catalog, itemId: number, quantity: number,
  at = s.lastSimulatedAt): PharmacyCraftPreview {
  const recipe = pharmacyRecipes().find(r => r.outputItemId === itemId);
  const tree = classSkills(c, s.job), skill = tree.map(id => c.skills[id]).find(v => v?.sourceName === 'AM_PHARMACY');
  const level = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
  const learned = !!skill && skill.implementation === 'supported' && Number.isSafeInteger(level) && level > 0 && level <= skill.maxLevel;
  const validQuantity = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000;
  const count = (id: number) => s.inventory.filter(e => e.itemId === id).reduce((n, e) => n + e.quantity, 0);
  const costs = learned ? skillResourceCosts(s, c, skill!, level, at) : undefined;
  const requirements = new Map<number, number>();
  for (const i of recipe?.ingredients ?? []) requirements.set(i.itemId, (requirements.get(i.itemId) ?? 0) + i.quantity);
  for (const [id, n] of costs?.quantities ?? []) requirements.set(id, (requirements.get(id) ?? 0) + n);
  const ingredients = [...requirements].map(([id, n]) => ({ itemId: id, quantity: n * (validQuantity ? quantity : 0),
    owned: count(id), missing: Math.max(0, n * (validQuantity ? quantity : 0) - count(id)) }));
  const weight = inventoryWeightUnits(s, c), max = maxWeightUnits(s, c);
  const removed = [...requirements].reduce((n, [id, qty]) => n + itemWeightUnits(c, id, qty), 0);
  const change = itemWeightUnits(c, itemId) - removed;
  const resultWeight = weight + (validQuantity ? quantity * change : 0);
  const d = derivedStats(at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at }, c);
  const research = tree.map(id => c.skills[id]).find(v => v?.sourceName === 'AM_LEARNINGPOTION');
  const researchLevel = research ? s.learnedSkills[research.id] ?? 0 : 0;
  const base = pharmacyBaseChance(Number.isSafeInteger(researchLevel) ? Math.max(0, Math.min(research?.maxLevel ?? 0, researchLevel)) : 0,
    learned ? level : 0, s.jobLevel, d.attributes ?? s.stats);
  const a = adjustment(itemId), bounds = [base + a.fixed + a.sign * 10, base + a.fixed + a.sign * a.modulus * 10];
  const preview: PharmacyCraftPreview = { recipe, quantity, skillId: skill?.id, learned, available: false,
    spPerAttempt: costs?.sp ?? 0, spTotal: (costs?.sp ?? 0) * (validQuantity ? quantity : 0),
    ingredients, guide: recipe ? { itemId: recipe.guideItemId, owned: count(recipe.guideItemId) } : undefined,
    chanceMin: Math.max(1, a.modulus ? Math.min(...bounds) : base), chanceMax: Math.max(1, a.modulus ? Math.max(...bounds) : base),
    weight: weight / 10, maxWeight: max / 10, resultWeight: resultWeight / 10 };
  const reject = (code: string, message: string) => ({ ...preview, reason: { code, message } });
  if (!recipe) return reject('INVALID_PHARMACY_RECIPE', 'Escolha uma receita de Preparar Poção.');
  if (!validQuantity) return reject('INVALID_QUANTITY', 'Escolha de 1 a 1000 tentativas.');
  if (!Number.isFinite(at) || !c.items[itemId] || !['consumable', 'material'].includes(c.items[itemId].type) ||
    !c.items[recipe.guideItemId] || ingredients.some(i => !c.items[i.itemId]))
    return reject('PHARMACY_CONTENT_UNAVAILABLE', 'Esta receita ainda não está disponível.');
  if (!learned) return reject('PHARMACY_SKILL_REQUIRED', 'Aprenda Preparar Poção como Alquimista ou Criador.');
  if (s.status !== 'town') return reject('TOWN_REQUIRED', 'Volte à cidade para preparar poções.');
  if (s.hp <= 0) return reject('RECOVERING', 'Recupere seu HP antes de preparar poções.');
  if (s.supportCast || s.battle?.cast || (s.playerCanActAt ?? 0) > at || activePlayerStatus(s, 'SC_SILENCE', at) ||
    ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'ST_CHASEWALK', 'ST_INVISIBILITY', 'NV_TRICKDEAD']
      .some(source => classicBuffActive(s, c, source, at)))
    return reject('SKILL_STATUS_BLOCKED', 'Seu estado atual impede preparar poções.');
  if (weight * 10 >= max * 9) return reject('SKILL_WEIGHT_BLOCKED', 'Alivie o peso para ficar abaixo de 90%.');
  if (!costs || !Number.isFinite(costs.sp) || costs.sp < 0 || costs.zeny !== 0 || costs.hp !== 0 || costs.spheres !== 0 ||
    costs.quantities.size !== 1 || costs.quantities.get(7134) !== 1)
    return reject('PHARMACY_CONTENT_UNAVAILABLE', 'Os custos desta habilidade estão indisponíveis.');
  if (s.sp < preview.spTotal) return reject('SP_REQUIRED', 'SP insuficiente para todas as tentativas.');
  if (!preview.guide?.owned) return reject('PHARMACY_GUIDE_REQUIRED', recipe.guideItemId === 7434 ?
    'Esta receita exige o manual da pesquisa de Pisruik; essa aquisição por quest ainda será disponibilizada.' : 'Tenha o manual desta receita na mochila.');
  if (ingredients.some(i => i.missing > 0)) return reject('PHARMACY_MATERIALS_REQUIRED', 'Reúna os materiais de todas as tentativas.');
  // Atomic batches admit the worst case of every attempt succeeding, including intermediate activations.
  if (!Number.isFinite(resultWeight) || resultWeight > max ||
    (weight + Math.max(0, change * (quantity - 1))) * 10 >= max * 9)
    return reject('INVENTORY_CAPACITY', 'O lote pode exceder o peso permitido. Diminua o número de tentativas.');
  return { ...preview, available: true };
}

/** Existing cloned command/receipt transaction commits ordinary crafting failures as paid attempts. */
export function craftPharmacy(s: GameState, c: Catalog, itemId: number, quantity: number, at = s.lastSimulatedAt): void {
  const preview = pharmacyCraftPreview(s, c, itemId, quantity, at);
  requireRule(preview.available, preview.reason?.code ?? 'PHARMACY_UNAVAILABLE', preview.reason?.message ?? 'Produção indisponível.');
  const skill = c.skills[preview.skillId!], level = s.learnedSkills[skill.id];
  const tree = classSkills(c, s.job), research = tree.map(id => c.skills[id]).find(v => v?.sourceName === 'AM_LEARNINGPOTION');
  const d = derivedStats(at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at }, c);
  const base = pharmacyBaseChance(research ? Math.max(0, Math.min(research.maxLevel, s.learnedSkills[research.id] ?? 0)) : 0,
    level, s.jobLevel, d.attributes ?? s.stats);
  let successes = 0;
  const draw = (modulus: number) => { random(s); return s.rngState % modulus; };
  for (let i = 0; i < quantity; i++) {
    requireRule(paySkillResources(s, c, skill, level, at), 'SP_REQUIRED', 'Recursos insuficientes.');
    for (const ingredient of preview.recipe!.ingredients) {
      let left = ingredient.quantity;
      for (const entry of [...s.inventory]) if (entry.itemId === ingredient.itemId && left > 0) {
        const used = Math.min(left, entry.quantity); consume(s, entry, used); left -= used;
      }
    }
    if (pharmacyRoll(base, itemId, draw).success) { addItem(s, c, itemId, 1); successes++; }
  }
  event(s, at, 'craft', `${c.items[itemId].name}: ${successes} produzidos, ${quantity - successes} falhas em ${quantity} tentativas.`,
    undefined, 'player', { itemId, quantity: successes, attempts: quantity, failures: quantity - successes,
      skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
}
