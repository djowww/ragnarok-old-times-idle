import {fixture} from './engine-fixture';
import {createInitialState,applyCommand} from '../engine/index';
import type {Catalog,GameState} from '../shared/types';
export function setupRefine(){
 const c=fixture();
 c.classes.whitesmith={...c.classes.knight,id:'whitesmith',parent:'novice',trans:true,jobCap:70,skills:['ws_weaponrefine']};
 c.skills.ws_weaponrefine={id:'ws_weaponrefine',sourceName:'WS_WEAPONREFINE',name:'Refino de Arma',kind:'buff',maxLevel:10,spCost:Array(10).fill(5),power:Array(10).fill(0),cooldownMs:0,description:'',manualUse:'weaponRefine',implementation:'supported'};
 c.items[1201].weaponLevel=1;c.items[1201].refinable=true;
 c.items[1010]={...c.items[984],id:1010};c.items[1011]={...c.items[984],id:1011};
 const s=createInitialState(c,0);s.job='whitesmith';s.learnedSkills={ws_weaponrefine:10};s.rotation=[];s.hp=100;s.sp=50;s.jobLevel=50;s.equipment={};s.zeny=10000;
 s.inventory=[{uid:'weapon',itemId:1201,quantity:1,refine:0,cards:[],favorite:false,identified:true,rarity:'common'},
 ...[1010,1011,984].map(itemId=>({uid:'ore-'+itemId,itemId,quantity:5,refine:0,cards:[],favorite:false}))];
 return {s,c};
}
export const openRefine=(s:GameState,c:Catalog)=>applyCommand(s,c,{type:'useSkill',skillId:'ws_weaponrefine'},0);
export const answerRefine=(s:GameState,c:Catalog,uid='weapon')=>applyCommand(s,c,{type:'weaponRefine',menuId:s.weaponRefineMenu!.id,uid},0);
