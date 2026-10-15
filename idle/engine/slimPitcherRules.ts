/** Hercules410b9738 skill.c:12809..12815,9425..9455; GPL-3.0-or-later. */
export interface SlimPitcherInput {
 baseHP:number;learnedSlimLevel:number;learnedPitcherLevel:number;learningPotionLevel:number;targetVIT:number;
 targetHPRecoveryLevel:number;casterSkillHealBonusPct?:number;targetSkillHeal2BonusPct?:number;
 criticalWoundPct?:number;deathHurt?:boolean;waterInsigniaLevel?:number;noRecover?:boolean;
}
/** Slim captures raw itemheal; item-heal rate, caster INT, Soul Link and Base Level do not enter. */
export function calculateSlimPitcherRecovery(input:SlimPitcherInput):{hp:number;sp:0}{
 const t=Math.trunc;
 let hp=t(input.baseHP*(100+10*input.learnedSlimLevel+10*input.learnedPitcherLevel+5*input.learningPotionLevel+(input.casterSkillHealBonusPct??0))/100);
 hp=t(hp*(100+2*input.targetVIT)/100);
 hp=t(hp*(100+10*input.targetHPRecoveryLevel+(input.targetSkillHeal2BonusPct??0))/100);
 hp-=t(hp*(input.criticalWoundPct??0)/100);
 if(input.deathHurt)hp-=t(hp*20/100);
 if(input.waterInsigniaLevel===2)hp+=t(hp/10);
 return {hp:input.noRecover?0:Math.max(0,hp),sp:0};
}
export function slimPotionItem(level:number):number {return level<=5?545:level<=9?546:547;}
