import type {Catalog,GameState,InventoryEntry,Skill,WeaponRefineMenu,WeaponRefineResult} from '../shared/types.js';
import {weaponRefineMaterial,weaponRefineThreshold} from '../shared/weaponRefineRules.js';
import {isItemIdentified} from '../shared/loot.js';
import {classSkills} from './stats.js';
import {canPaySkillResources,paySkillResources} from './skillResources.js';
import {classicBuffActive,classicGroundSceneKey} from './classicBuffs.js';
import {activePlayerStatus} from './playerStatuses.js';
import {overweightForCombat} from './itemCapacity.js';
import {consume,event,random,requireRule} from './state.js';

function skill(s:GameState,c:Catalog):Skill|undefined {
 return Object.values(c.skills).find(k=>k.sourceName==='WS_WEAPONREFINE');
}
function learned(s:GameState,c:Catalog):number {
 const k=skill(s,c),n=k?s.learnedSkills[k.id]:0;
 return k?.implementation==='supported'&&k.manualUse==='weaponRefine'&&
  Number.isSafeInteger(n)&&n>0&&n<=Math.min(10,k.maxLevel)&&classSkills(c,s.job).includes(k.id)?n:0;
}
function catalogIdentity(c:Catalog):string {return c.version+'|'+c.source.hash;}
function scene(s:GameState):string {
 return classicGroundSceneKey(s.status==='paused'?{...s,status:s.pausedStatus??'town'}:s);
}
/** Explicit persisted identity; never trusts a client-provided signature. */
export function weaponRefineSignature(e:InventoryEntry):string {
 return JSON.stringify([e.uid,e.itemId,e.quantity,e.refine,e.cards,e.favorite,
  e.identified??true,e.rarity??'common',e.rarityBonus?[e.rarityBonus.stat,e.rarityBonus.value]:null,e.broken??false]);
}
function menuShape(v:unknown):v is WeaponRefineMenu {
 if(!v||typeof v!=='object')return false;
 const m=v as WeaponRefineMenu;
 return typeof m.id==='string'&&/^[A-Za-z0-9_:\-]{1,80}$/.test(m.id)&&
  Number.isFinite(m.openedAt)&&m.openedAt>=0&&typeof m.catalogVersion==='string'&&
  Number.isSafeInteger(m.learnedLimit)&&m.learnedLimit>=1&&m.learnedLimit<=10&&
  typeof m.sceneKey==='string'&&Number.isSafeInteger(m.deaths)&&m.deaths>=0&&
  Array.isArray(m.offeredWeapons)&&m.offeredWeapons.length>0&&m.offeredWeapons.length<=1000&&
  m.offeredWeapons.every(e=>e&&typeof e.uid==='string'&&/^[A-Za-z0-9_:\-]{1,80}$/.test(e.uid)&&
   Number.isSafeInteger(e.itemId)&&e.itemId>0&&typeof e.signature==='string'&&e.signature.length<=4096)&&
  new Set(m.offeredWeapons.map(e=>e.uid)).size===m.offeredWeapons.length;
}
function finish(s:GameState,now:number,result:WeaponRefineResult):void {
 delete s.weaponRefineMenu;s.weaponRefineResult=result;
 event(s,now,'refine',result.message??'Refino encerrado.');
}
/** JSON saves, offline ticks and admin commands share the same invalidation boundary. */
export function reconcileWeaponRefine(s:GameState,c:Catalog,now=s.lastSimulatedAt):void {
 if(s.weaponRefineMenu===undefined)return;
 const m=s.weaponRefineMenu;
 if(!menuShape(m)){delete s.weaponRefineMenu;return;}
 if(s.hp<=0||s.totals.deaths!==m.deaths||scene(s)!==m.sceneKey||
  catalogIdentity(c)!==m.catalogVersion||learned(s,c)<m.learnedLimit){
  finish(s,now,{menuId:m.id,outcome:'rejected',reasonCode:'MENU_INVALIDATED',
   message:'Refino encerrado por mudança de mapa, derrota, classe ou habilidade.'});
 }
}
export function openWeaponRefine(s:GameState,c:Catalog,now:number):void {
 reconcileWeaponRefine(s,c,now);
 if(s.weaponRefineMenu)return;
 const k=skill(s,c),level=learned(s,c);
 requireRule(k&&level>0&&s.hp>0&&['town','hunting','challenge'].includes(s.status)&&
  !overweightForCombat(s,c)&&!s.supportCast&&!s.battle?.cast&&
  (s.playerCanActAt??0)<=now&&(s.skillReadyAt[k.id]??0)<=now&&
  !activePlayerStatus(s,'SC_SILENCE',now)&&
  !['MO_STEELBODY','LK_BERSERK','TF_HIDING','AS_CLOAKING','KN_AUTOCOUNTER','NV_TRICKDEAD','ST_CHASEWALK']
   .some(source=>classicBuffActive(s,c,source,now))&&canPaySkillResources(s,c,k,level,now),
  'SKILL_UNAVAILABLE','Aprenda Refino de Arma, tenha SP e esteja livre para usar a habilidade.');
 const offeredWeapons=s.inventory.filter(e=>{
  const i=c.items[e.itemId];
  return e.quantity===1&&i?.type==='equipment'&&i.slot==='weapon'&&i.refinable!==false&&
   Number.isSafeInteger(i.weaponLevel)&&i.weaponLevel!>=1&&i.weaponLevel!<=4&&
   isItemIdentified(e)&&!Object.values(s.equipment).includes(e.uid);
 }).map(e=>({uid:e.uid,itemId:e.itemId,signature:weaponRefineSignature(e)}));
 requireRule(paySkillResources(s,c,k,level,now),'SP_REQUIRED','SP insuficiente para abrir Refino de Arma.');
 const id='wr-'+s.nextEventId;
 if(!offeredWeapons.length){
  finish(s,now,{menuId:id,outcome:'empty',message:'Nenhuma arma identificada e desequipada para refinar. O SP da abertura foi consumido.'});
  return;
 }
 delete s.weaponRefineResult;
 s.weaponRefineMenu={id,openedAt:now,catalogVersion:catalogIdentity(c),learnedLimit:level,sceneKey:scene(s),deaths:s.totals.deaths,offeredWeapons};
 event(s,now,'skill','Menu de Refino de Arma aberto. SP consumido.',undefined,'player',{skillId:k.id,skillLevel:level,actorAction:'none',actionMotionMs:0});
}
function matchingMenu(s:GameState,c:Catalog,id:string,now:number):WeaponRefineMenu|undefined {
 reconcileWeaponRefine(s,c,now);
 if(!s.weaponRefineMenu&&s.weaponRefineResult?.menuId===id)return undefined;
 requireRule(s.weaponRefineMenu?.id===id,'REFINE_MENU_INVALID','Este menu de refino não está disponível.');
 return s.weaponRefineMenu;
}
export function cancelWeaponRefine(s:GameState,c:Catalog,id:string,now:number):void {
 const m=matchingMenu(s,c,id,now);if(!m)return;
 finish(s,now,{menuId:id,outcome:'cancelled',message:'Refino cancelado. O SP da abertura não é devolvido.'});
}
export function answerWeaponRefine(s:GameState,c:Catalog,id:string,uid:string,now:number):void {
 const m=matchingMenu(s,c,id,now);if(!m)return;
 const reject=(code:string,message:string)=>finish(s,now,{menuId:id,outcome:'rejected',reasonCode:code,message});
 const offer=m.offeredWeapons.find(e=>e.uid===uid),e=s.inventory.find(e=>e.uid===uid),i=e&&c.items[e.itemId];
 if(!offer||!e||!i||e.itemId!==offer.itemId||weaponRefineSignature(e)!==offer.signature){
  reject('REFINE_ITEM_CHANGED','A arma selecionada mudou ou não está mais na mochila.');return;
 }
 // Idle adaptations: repeat identification/equipment and legal learned-skill guards at answer.
 // Native favorites and ATTR_BROKEN remain accepted; refinement does not repair a weapon.
 if(learned(s,c)<m.learnedLimit||!isItemIdentified(e)||Object.values(s.equipment).includes(uid)||
  e.quantity!==1||i.type!=='equipment'||i.slot!=='weapon'||i.refinable===false||
  !Number.isSafeInteger(i.weaponLevel)||i.weaponLevel!<1||i.weaponLevel!>4||
  !Number.isSafeInteger(e.refine)||e.refine<0||e.refine>=m.learnedLimit||e.refine>=10||
  !Number.isSafeInteger(s.jobLevel)||s.jobLevel<1){
  reject('REFINE_ITEM_UNAVAILABLE','A arma precisa estar identificada, desequipada e dentro do limite aprendido.');return;
 }
 const oreId=weaponRefineMaterial(i.weaponLevel!);
 const ore=s.inventory.find(x=>x.itemId===oreId&&Number.isSafeInteger(x.quantity)&&x.quantity>=1);
 if(!ore){reject('MATERIAL_REQUIRED','Minério necessário indisponível. Abra o menu novamente após obter o material.');return;}
 const fromRefine=e.refine,threshold=weaponRefineThreshold(i.weaponLevel!,fromRefine,s.jobLevel);
 consume(s,ore,1);
 random(s);const draw=s.rngState%1000;
 const success=threshold>draw;
 if(success){e.refine++;s.highestRefine=Math.max(s.highestRefine,e.refine);}
 else s.inventory.splice(s.inventory.indexOf(e),1);
 finish(s,now,{menuId:id,outcome:success?'success':'failed',uid,itemId:e.itemId,fromRefine,
  ...(success?{toRefine:e.refine}:{}),
  message:success?i.name+' refinada para +'+e.refine+'.':i.name+' foi destruída na falha do refino, incluindo cartas e bônus.'});
}
