import {describe,expect,it} from 'vitest';
import raw from '../content/catalog.json';
import {getCombatActorAction} from '../web/assets/renderer';

// Independent literals from roBrowserLegacy d88a3cd4 SkillAction.js, the two
// makeAttackSkillAction('ATTACK') chains intersected with the imported catalog.
// SHA256 af01f750284554fab5602cc62bca441ac0b70f5aa1e752cfd0b0e907ef52011d.
const expected = [
  'SM_BASH','SM_MAGNUM','KN_PIERCE','KN_BRANDISHSPEAR','KN_SPEARSTAB',
  'KN_BOWLINGBASH','BS_HAMMERFALL','AC_CHARGEARROW','RG_BACKSTAP','RG_RAID',
  'RG_INTIMIDATE','CR_SHIELDCHARGE','CR_HOLYCROSS','BA_MUSICALSTRIKE',
  'DC_THROWARROW','LK_SPIRALPIERCE','LK_HEADCRUSH','LK_JOINTBEAT','HW_MAGICPOWER',
  'PA_SACRIFICE','ASC_METEORASSAULT','CR_ACIDDEMONSTRATION','AC_DOUBLE',
  'HT_PHANTASMIC','SN_SHARPSHOOTING',
];

describe('classic equipped-weapon skill actions',()=>{
  it.each(expected)('%s uses the equipped attack animation',source=>{
    const skill=Object.values(raw.skills).find(skill=>skill.sourceName===source);
    expect(skill,source).toBeDefined();expect(skill?.implementation).toBe('supported');
    expect(getCombatActorAction('skill',source)).toBe('attack');
  });
  it.each(['MG_FIREBOLT','AL_HEAL','AS_SONICBLOW','UNKNOWN_SKILL'])('keeps %s on the invocation action',source=>{
    expect(getCombatActorAction('skill',source)).toBe('skill');
  });
  it('retains action ownership for ordinary attacks and nonoffensive events',()=>{
    for(const source of expected){
      expect(getCombatActorAction('attack',source)).toBe('attack');
      expect(getCombatActorAction('none',source)).toBe('idle');
    }
  });
});
