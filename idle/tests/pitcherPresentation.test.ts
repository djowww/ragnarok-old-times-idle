import {describe,expect,it} from 'vitest';
import {isSoloPotionPitcher,skillCueCastDuration} from '../web/assets/combatPresentation';
import type {Skill,GameEvent} from '../shared/types';
describe('solo pitcher cast presentation',()=>{
 it.each(['AM_POTIONPITCHER','CR_SLIMPITCHER'])('keeps %s centered on caster with no second cast',sourceName=>{
  const skill={sourceName} as Skill;expect(isSoloPotionPitcher(skill)).toBe(true);
  expect(skillCueCastDuration({sourceActorId:'player',castMs:0} as GameEvent,skill,'player')).toBe(0);
 });
 it('retains the existing player spell policy and NPC cast duration',()=>{
  const skill={sourceName:'MG_FIREBOLT'} as Skill;expect(isSoloPotionPitcher(skill)).toBe(false);
  expect(skillCueCastDuration({sourceActorId:'player',castMs:0} as GameEvent,skill,'player')).toBeUndefined();
  expect(skillCueCastDuration({sourceActorId:'enemy',castMs:500} as GameEvent,skill,'player')).toBe(500);
 });
});
