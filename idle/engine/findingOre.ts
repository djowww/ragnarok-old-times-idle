import type {Catalog,GameState} from '../shared/types.js';
import {rollFindingOre} from '../shared/findingOre.js';
import {classSkills} from './stats.js';
import {random} from './state.js';
/** Personal hunt worlds currently have one player as both direct killer and damage owner.
 * Keep this gate explicit for future ally/other-player damage; never credit a pet as the PC. */
export function findingOreItem(s:GameState,c:Catalog,playerOwnsDirectKill:boolean):number|undefined {
 if(!playerOwnsDirectKill||s.hp<=0)return undefined;
 const learned=classSkills(c,s.job).some(id=>c.skills[id]?.sourceName==='BS_FINDINGORE'&&c.skills[id].implementation==='supported'&&s.learnedSkills[id]===1);
 if(!learned)return undefined;
 const id=rollFindingOre(modulus=>{random(s);return s.rngState%modulus;});
 return id!==undefined&&c.items[id]?id:undefined;
}
