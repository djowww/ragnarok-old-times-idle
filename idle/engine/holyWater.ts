import type { Catalog, GameState, Skill } from '../shared/types.js';
import type { SimulationContext } from './fieldNavigation.js';
import { battleHeroAt } from '../shared/battleSpatial.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classSkills } from './stats.js';
import { canBeginSkillResources, paySkillResources } from './skillResources.js';
import { addItem, consume, event, requireRule } from './state.js';
import { startOwnCast } from './ownCast.js';
import { resolveOwnSkillAction } from './skillActionClock.js';
import { inventoryWeightUnits, itemWeightUnits, maxWeightUnits, overweightForCombat } from './itemCapacity.js';

const EMPTY_BOTTLE = 713;
const HOLY_WATER = 523;
const eligibleBottle = (s: GameState) => s.inventory.find(e => e.itemId === EMPTY_BOTTLE && e.quantity > 0 && !e.favorite && !Object.values(s.equipment).includes(e.uid));
function standingOnWater(s: GameState, at: number, context?: SimulationContext): boolean {
  return !!s.areaId && s.status === 'hunting' && s.fieldHero?.areaId === s.areaId &&
    !!context?.navigation?.isWaterBattlePoint(s.areaId, battleHeroAt(s, at));
}
function capacityForConversion(s: GameState, c: Catalog, bottle: { itemId: number; quantity: number }): boolean {
  const netWeight = inventoryWeightUnits(s, c) - itemWeightUnits(c, bottle.itemId) + itemWeightUnits(c, HOLY_WATER);
  return Number.isSafeInteger(netWeight) && netWeight <= maxWeightUnits(s, c);
}
function learnedOnWater(s: GameState, c: Catalog, skill: Skill | undefined, level: number,
  at: number, context?: SimulationContext): skill is Skill {
  return !!skill && skill.sourceName === 'AL_HOLYWATER' && skill.implementation === 'supported' &&
    skill.manualUse === 'holyWaterCraft' && level === 1 && s.learnedSkills[skill.id] === 1 &&
    classSkills(c, s.job).includes(skill.id) && s.hp > 0 && standingOnWater(s, at, context);
}
export function holyWaterCanStart(s: GameState, c: Catalog, skill: Skill | undefined, level: number,
  at: number, context?: SimulationContext): boolean {
  return learnedOnWater(s, c, skill, level, at, context) && !s.supportCast && !s.battle?.cast &&
    (s.playerCanActAt ?? 0) <= at && (s.skillReadyAt[skill.id] ?? 0) <= at &&
    !activePlayerStatus(s, 'SC_SILENCE', at) && !overweightForCombat(s, c) && canBeginSkillResources(s, c, skill, level, at);
}
export function startHolyWaterCast(s: GameState, c: Catalog, skill: Skill | undefined, level: number,
  at: number, context?: SimulationContext): void {
  requireRule(holyWaterCanStart(s, c, skill, level, at, context), 'HOLY_WATER_UNAVAILABLE',
    'Aprenda Aqua Benedicta, tenha SP e fique sobre uma célula de água durante a caça.');
  const bottle = eligibleBottle(s);
  requireRule(bottle, 'HOLY_WATER_BOTTLE_REQUIRED', 'Tenha um Frasco Vazio não protegido na mochila.');
  requireRule(capacityForConversion(s, c, bottle), 'INVENTORY_CAPACITY', 'Libere espaço para receber Água Benta.');
  startOwnCast(s, c, skill!, level, at);
}
export function resolveHolyWaterCast(s: GameState, c: Catalog, at: number, context?: SimulationContext): boolean {
  const cast = s.supportCast, skill = cast && c.skills[cast.skillId];
  if (!cast || skill?.sourceName !== 'AL_HOLYWATER' || cast.endsAt > at) return false;
  delete s.supportCast;
  return resolveOwnSkillAction(s, c, cast, at, () => {
    const fail = (text: string) => { event(s, at, 'cast-failed', text, undefined, 'player',
      { skillId: cast.skillId, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
        actionId: cast.actionId, actorAction: 'none' }); return false; };
    if (!learnedOnWater(s, c, skill, cast.level, at, context)) return fail('A conjuração foi interrompida.');
    const bottle = eligibleBottle(s);
    if (!bottle) return fail('Frasco Vazio indisponível.');
    if (!capacityForConversion(s, c, bottle)) return fail('A mochila está cheia.');
    if (!paySkillResources(s, c, skill, cast.level, at)) return fail('SP insuficiente ao concluir a conjuração.');
    consume(s, bottle, 1);
    addItem(s, c, HOLY_WATER, 1);
    s.skillReadyAt[skill.id] = at + Math.max(0, skill.cooldownMs);
    if (s.battle) s.battle.supportNeedsOffense = true;
    event(s, at, 'craft', `Criou 1 × ${c.items[HOLY_WATER].name}.`, undefined, 'player',
      { itemId: HOLY_WATER, quantity: 1, skillId: skill.id, skillLevel: cast.level, actorAction: 'none' });
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: cast.level,
      sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none' });
    return true;
  });
}
