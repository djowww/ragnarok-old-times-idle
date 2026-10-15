import type { Catalog, GameState, InventoryEntry } from '../shared/types.js';
import { itemBuffId, resistancePotions, usableConsumable } from '../shared/consumables.js';
import { consume, event, random, requireRule } from './state.js';
import { classSkills, derivedStats } from './stats.js';
import { classicPotionHealing } from './classic.js';
import { classicBuffActive } from './classicBuffs.js';
import { createEndure } from './classicDefenses.js';
import { currentPlayerCast } from './playerCast.js';
import { playerDefenseElement } from './sageFields.js';
import { battleHeroAt, stopHeroMovement } from '../shared/battleSpatial.js';
import { recordAreaActivity } from '../shared/hunt.js';
/** Idle retains its existing two-second shared potion cadence for manual and AFK use. */
export const ITEM_COOLDOWN_MS = 2000;
export function consumeItemBlockReason(s: GameState, c: Catalog, entry: InventoryEntry | undefined, at: number): string | undefined {
 const item = entry && c.items[entry.itemId];
 if (!entry || entry.quantity < 1 || !usableConsumable(item)) return 'Este item não pode ser usado.';
 if (s.hp <= 0 || s.status === 'paused') return 'Retome o personagem vivo para usar itens.';
 if (['LK_BERSERK','TF_HIDING','NV_TRICKDEAD'].some(source => classicBuffActive(s,c,source,at))) return 'A postura atual impede usar itens.';
 if (s.potionReadyAt > at) return `Aguarde ${Math.ceil((s.potionReadyAt-at)/1000)} s para usar outro item.`;
 if (item!.id === 605 || item!.id === 606) {
  if (s.status === 'resting') return 'Levante-se para usar esta poção.';
  if (currentPlayerCast(s,at)) return 'Conclua a conjuração antes de usar esta poção.';
  if (item!.id === 605 && (s.skillReadyAt.sm_endure ?? 0) > at) return 'Aguarde a recarga de Vigor.';
 }
 return undefined;
}
/** Auto Berserk replaces the one native Provoke slot, it never suspends Aloevera. */
export function discardAloeveraUnderAutoBerserk(s: GameState, c: Catalog, at: number): void {
 if (s.buffs[itemBuffId(606)] && classicBuffActive(s,c,'SM_AUTOBERSERK',at) && s.hp>0 && s.hp<Math.floor(derivedStats(s,c).maxHp/4)) delete s.buffs[itemBuffId(606)];
}
export function clearConsumableStatusesOnDeath(s: GameState): void {
 for (const id of [606,...Object.keys(resistancePotions).map(Number)]) delete s.buffs[itemBuffId(id)];
 // SC_ENDURE has NoDeathReset and retains its native expiry and charges.
}
export function consumeItem(s: GameState, c: Catalog, uid: string, at: number): void {
 const entry = s.inventory.find(item => item.uid === uid);
 const blocked = consumeItemBlockReason(s,c,entry,at);
 requireRule(!blocked,'ITEM_UNAVAILABLE',blocked ?? 'Este item não pode ser usado.');
 const item = c.items[entry!.itemId];
 discardAloeveraUnderAutoBerserk(s,c,at);
 const d = derivedStats(s,c);
 const levels: Record<string,number> = {};
 for (const id of classSkills(c,s.job)) {
  const skill=c.skills[id]; if (skill?.sourceName && skill.implementation !== 'unsupported') levels[skill.sourceName]=s.learnedSkills[id] ?? 0;
 }
 consume(s,entry!,1);
 s.hp=Math.min(d.maxHp,s.hp+classicPotionHealing(item.healHP ?? 0,d.attributes?.vit ?? s.stats.vit,levels.SM_RECOVERY ?? 0,levels.AM_LEARNINGPOTION ?? 0));
 s.sp=Math.min(d.maxSp,s.sp+classicPotionHealing(item.healSP ?? 0,d.attributes?.int ?? s.stats.int,levels.MG_SRECOVERY ?? 0,levels.AM_LEARNINGPOTION ?? 0));
 if (resistancePotions[item.id]) {
  random(s); s.buffs[itemBuffId(item.id)]={startsAt:at,expiresAt:at+1200000,effects:{}};
 } else if (item.id===606 && playerDefenseElement(s,c)!=='undead') {
  random(s); s.buffs[itemBuffId(606)]={startsAt:at,expiresAt:at+30000,effects:{}};
  discardAloeveraUnderAutoBerserk(s,c,at);
 } else if (item.id===605) {
  random(s); s.skillReadyAt.sm_endure=at+10000;
  if (!(s.combatEffects?.endure && s.combatEffects.endure.expiresAt>at && (s.combatEffects.endure.level>1 || s.combatEffects.endure.infinite))) {
   const endure=createEndure(1,at); (s.combatEffects??={}).endure=endure;
   ((s.combatEffects??={}).buffLevels??={}).sm_endure=1;
   s.buffs.sm_endure={startsAt:at,expiresAt:endure.expiresAt,effects:{mdef:1}};
  }
 }
 if (item.id===605 || item.id===606) {
  if(s.status==='hunting' && s.fieldHero && s.fieldHero.areaId===s.areaId) { const point=battleHeroAt(s,at);stopHeroMovement(s.fieldHero,point,at); }
 }
 s.potionReadyAt=at+ITEM_COOLDOWN_MS;s.totals.potions++;
 event(s,at,'potion',item.name,undefined,'player',{itemId:item.id,quantity:1,sourceActorId:s.id,targetActorId:s.id,actorAction:'none'});
 if (s.status==='hunting' && s.areaId) recordAreaActivity(s,s.areaId,at,{potions:1});
}
