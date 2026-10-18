import recipes from '../content/arrow-recipes.json' with {type:'json'};
import type {Catalog,GameState,InventoryEntry} from '../shared/types.js';
import {isItemIdentified} from '../shared/loot.js';
import {classSkills,inventoryLoad} from './stats.js';
import {classicBuffActive,classicGroundSceneKey} from './classicBuffs.js';
import {activePlayerStatus} from './playerStatuses.js';
import {canPaySkillResources,paySkillResources} from './skillResources.js';
import {addItem,consume,event,requireRule} from './state.js';
export const arrowRecipe=(itemId:number)=>recipes.find(r=>r.materialItemId===itemId);
const signature=(e:InventoryEntry)=>JSON.stringify([e.itemId,e.refine,e.cards,e.identified??true,e.rarity,e.rarityBonus,e.broken]);
function learnedSkill(s:GameState,c:Catalog){
 return classSkills(c,s.job).map(id=>c.skills[id]).find(k=>k?.sourceName==='AC_MAKINGARROW'&&k.implementation==='supported'&&k.manualUse==='arrowCraft'&&
  Number.isSafeInteger(s.learnedSkills[k.id])&&s.learnedSkills[k.id]>0&&s.learnedSkills[k.id]<=k.maxLevel);
}
function eligibleInput(s:GameState,e:InventoryEntry){return e.quantity>0&&Number.isSafeInteger(e.quantity)&&isItemIdentified(e)&&!Object.values(s.equipment).includes(e.uid)&&!!arrowRecipe(e.itemId);}
export function reconcileArrowCraft(s:GameState,c:Catalog,at=s.lastSimulatedAt):void{
 const m=s.arrowCraftMenu;if(!m)return;
 if(typeof m.id!=='string'||!Number.isFinite(m.openedAt)||!Array.isArray(m.offered)||m.offered.length>1000||
  m.offered.some(e=>!e||typeof e.uid!=='string'||!Number.isSafeInteger(e.itemId)||typeof e.signature!=='string')||
  !learnedSkill(s,c)||s.hp<=0||s.totals.deaths!==m.deaths||classicGroundSceneKey(s)!==m.sceneKey||c.source.hash!==m.catalogHash||at<m.openedAt)
  delete s.arrowCraftMenu;
}
/** Hercules skill.c7872,20729 and clif.c4189,14214: one paid menu, one input. */
export function openArrowCraft(s:GameState,c:Catalog,at:number):void{
 reconcileArrowCraft(s,c,at);if(s.arrowCraftMenu)return;
 const skill=learnedSkill(s,c),load=inventoryLoad(s,c);
 requireRule(skill&&s.hp>0&&['town','hunting','challenge'].includes(s.status)&&!s.supportCast&&!s.battle?.cast&&
  (s.playerCanActAt??0)<=at&&(s.skillReadyAt[skill.id]??0)<=at&&load.weight*10<load.maxWeight*9&&
  !activePlayerStatus(s,'SC_SILENCE',at)&&!['MO_STEELBODY','LK_BERSERK','TF_HIDING','AS_CLOAKING','KN_AUTOCOUNTER','NV_TRICKDEAD','ST_CHASEWALK'].some(source=>classicBuffActive(s,c,source,at))&&
  canPaySkillResources(s,c,skill,s.learnedSkills[skill.id],at),'SKILL_UNAVAILABLE','Aprenda Criar Flechas, tenha SP e esteja livre para usar a habilidade.');
 requireRule(paySkillResources(s,c,skill!,s.learnedSkills[skill!.id],at),'SP_REQUIRED','SP insuficiente.');
 const offered=s.inventory.filter(e=>eligibleInput(s,e)).map(e=>({uid:e.uid,itemId:e.itemId,signature:signature(e)}));
 const id='ar-'+s.nextEventId;
 event(s,at,'skill',offered.length?'Escolha um material para criar flechas.':'Nenhum material identificado disponível. O SP foi consumido.',undefined,'player',{skillId:skill!.id,skillLevel:s.learnedSkills[skill!.id],actorAction:'none'});
 if(offered.length)s.arrowCraftMenu={id,openedAt:at,sceneKey:classicGroundSceneKey(s),catalogHash:c.source.hash,deaths:s.totals.deaths,offered};
}
export function cancelArrowCraft(s:GameState,id:string):void{
 requireRule(s.arrowCraftMenu?.id===id,'ARROW_MENU_INVALID','O menu de flechas não está disponível.');delete s.arrowCraftMenu;
}
export function answerArrowCraft(s:GameState,c:Catalog,id:string,uid:string,at:number):void{
 reconcileArrowCraft(s,c,at);const m=s.arrowCraftMenu;
 requireRule(m?.id===id,'ARROW_MENU_INVALID','O menu de flechas não está disponível.');
 const offer=m!.offered.find(e=>e.uid===uid),entry=s.inventory.find(e=>e.uid===uid),recipe=entry&&arrowRecipe(entry.itemId);
 requireRule(offer&&entry&&recipe&&eligibleInput(s,entry)&&entry.itemId===offer.itemId&&signature(entry)===offer.signature,'ARROW_ITEM_CHANGED','O material selecionado mudou ou não está disponível.');
 const load=inventoryLoad(s,c),resultWeight=load.weight-c.items[entry!.itemId].weight+recipe!.outputs.reduce((n,o)=>n+(c.items[o.itemId]?.weight??Infinity)*o.quantity,0);
 requireRule(Number.isFinite(resultWeight)&&resultWeight<=load.maxWeight,'INVENTORY_CAPACITY','As flechas excedem a capacidade da mochila.');
 consume(s,entry!,1);delete s.arrowCraftMenu;
 for(const output of recipe!.outputs){addItem(s,c,output.itemId,output.quantity);event(s,at,'craft',`Criou ${output.quantity} × ${c.items[output.itemId].name}.`,undefined,'player',{itemId:output.itemId,quantity:output.quantity,actorAction:'none'});}
}
