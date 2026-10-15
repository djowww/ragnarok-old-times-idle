/** Hercules410b9738: pc_setfalcon and Falcon Breeder in npc/merchants/renters.txt. */
import type {Catalog,GameState} from '../shared/types.js';
import {classSkills} from './stats.js';
export const FALCON_RENTAL_ZENY = 2500;

/** The native Hunter BaseJob also includes Sniper; copied Falconry never qualifies. */
export function canEquipFalcon(state:GameState,catalog:Catalog):boolean {
  if(!['hunter','sniper'].includes(state.job) || !catalog.classes[state.job])return false;
  return classSkills(catalog,state.job).some(id =>
    catalog.skills[id]?.sourceName === 'HT_FALCON' && state.learnedSkills[id] === 1);
}
export function isFalconEquipped(state:GameState,catalog:Catalog):boolean {
  return state.falconEquipped === true && canEquipFalcon(state,catalog);
}
/** Missing/invalid legacy flags never grant a rental; death does not dismiss a legal bird. */
export function reconcileFalcon(state:GameState,catalog:Catalog):void {
  state.falconEquipped = isFalconEquipped(state,catalog);
}
