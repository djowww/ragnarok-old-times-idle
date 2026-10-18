// Independent pre-renewal entries from roBrowserLegacy d88a3cd4 SkillAction.js.
// EntityAction.js TYPE_PC maps these groups to ACT directions 40, 80, 88, 24.
export const specialSkillGroups = {
  attack1: {base:40,sources:['KN_SPEARBOOMERANG','CR_SHIELDBOOMERANG','AM_DEMONSTRATION','AM_ACIDTERROR','AM_POTIONPITCHER','TF_SPRINKLESAND','TF_THROWSTONE','AS_VENOMKNIFE','PA_SHIELDCHAIN']},
  attack2: {base:80,sources:['TF_POISON','MC_MAMMONITE','MC_CARTREVOLUTION']},
  attack3: {base:88,sources:['ASC_BREAKER']},
  pickup: {base:24,sources:['HT_LANDMINE','HT_ANKLESNARE','HT_SHOCKWAVE','HT_SANDMAN','HT_FLASHER','HT_FREEZINGTRAP','HT_BLASTMINE','HT_CLAYMORETRAP','TF_PICKSTONE']},
} as const;
