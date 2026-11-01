import type { Catalog, GameState } from '../shared/types.js';
import { classSkills } from './stats.js';

/** Hercules 410b9738c049ab1825d67b36b072d837c1d0b33a db/pre-re/autospell_db.conf.
 * Source selection skill.c:18280..18315 requires learned spells and caps at learned level.
 */
export function automaticSpellChoices(s: GameState,c: Catalog,autospellLevel?: number): {skillId:string;sourceName:string;maxLevel:number}[] {
  const tree=new Set(classSkills(c,s.job));
  const level=autospellLevel ?? Object.values(c.skills).filter(x=>x.sourceName==='SA_AUTOSPELL'&&tree.has(x.id)).reduce((n,x)=>Math.max(n,s.learnedSkills[x.id]??0),0);
  if (!Number.isInteger(level)||level<1||level>10) return [];
  const caps:Record<string,number>={MG_NAPALMBEAT:3,MG_COLDBOLT:Math.min(level-1,3),MG_FIREBOLT:Math.min(level-1,3),MG_LIGHTNINGBOLT:Math.min(level-1,3),MG_SOULSTRIKE:Math.min(level-4,3),MG_FIREBALL:Math.min(level-7,2),MG_FROSTDIVER:level===10?1:0};
  return Object.values(c.skills).flatMap(skill=>{
    const sourceName=skill.sourceName??'';
    const sourceCap=c.autospellChoices ? c.autospellChoices[sourceName]?.[level-1]??0 : caps[sourceName]??0;
    const maxLevel=Math.min(sourceCap,s.learnedSkills[skill.id]??0,skill.maxLevel);
    return tree.has(skill.id)&&skill.implementation!=='unsupported'&&maxLevel>0?[{skillId:skill.id,sourceName,maxLevel}]:[];
  });
}

/** battle.c:7049..7075. Invoked from normal weapon attack, including misses;
 * source has no landed-hit gate. No skill cost/items/cast delay beyond discounted SP.
 * RNG order is proc, level, then resource check. Caller charges returned SP once.
 */
export function hindsightProc(input:{autospellLevel:number;maxLevel:number;sp:number;at:number;buffExpiresAt:number;normalAttack:boolean;spCost:(level:number)=>number;rng:()=>number}):{level:number;spCost:number}|undefined {
  if(!input.normalAttack||input.buffExpiresAt<=input.at||input.autospellLevel<1||input.autospellLevel>10||input.maxLevel<1)return undefined;
  if(Math.floor(input.rng()*100)>=5+2*input.autospellLevel)return undefined;
  const roll=Math.floor(input.rng()*100);
  const level=Math.max(1,input.maxLevel-(roll>=50?2:roll>=15?1:0));
  const spCost=Math.trunc(input.spCost(level)*2/3);
  return input.sp>=spCost?{level,spCost}:undefined;
}

/** skill.c:3963..3971; status.c:8857..8858. Timer repeats carry flag2,
 * preserve Bolt level and pay no second skill cost. Delay is dmg.amotion, not hits*amotion.
 */
export function doubleCastingRepeat(input:{sourceName:string;skillLevel:number;doubleCastingLevel:number;at:number;buffExpiresAt:number;attackMotionMs:number;repeated:boolean;rng:()=>number}):{level:number;at:number}|undefined {
  if(input.repeated||input.buffExpiresAt<=input.at||input.doubleCastingLevel<1||input.doubleCastingLevel>5||!['MG_COLDBOLT','MG_FIREBOLT','MG_LIGHTNINGBOLT'].includes(input.sourceName))return undefined;
  return Math.floor(input.rng()*100)<30+10*input.doubleCastingLevel?{level:input.skillLevel,at:input.at+input.attackMotionMs}:undefined;
}

/** status.c:8472..8474 sets five infinite-duration charges. unit.c guards
 * cast_fix_sc with castnodex&2 (IgnoreStatusEffect), not &1 (IgnoreDex).
 * skill.c:17563..17585 returns for nonpositive time and halves before decrement.
 * Call only after validation at real cast start, with time after DEX/item reduction.
 */
export function memorizeCastStart(input:{remaining:number;castTimeMs:number;started:boolean;ignoresStatusEffects:boolean}):{remaining:number;castTimeMs:number} {
  if(!input.started||input.ignoresStatusEffects||input.castTimeMs<=0||input.remaining<=0)return {remaining:input.remaining,castTimeMs:input.castTimeMs};
  return {remaining:input.remaining-1,castTimeMs:Math.floor(input.castTimeMs/2)};
}
