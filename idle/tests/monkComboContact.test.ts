import {expect,it} from 'vitest';
import * as renderer from '../web/assets/renderer';
import {actorActionImpactAt,skillVisualEffectAt} from '../web/assets/combatPresentation';
const sources=['MO_TRIPLEATTACK','MO_CHAINCOMBO','MO_COMBOFINISH','CH_PALMSTRIKE','CH_TIGERFIST','CH_CHAINCRUSH','MO_EXTREMITYFIST'];
it.each(sources)('%s keeps damage and physical flashes after the visible attack',source=>{
 for(const actorAction of ['attack','skill'] as const){
  const action=renderer.getCombatActorAction(actorAction,source);
  const visualActorAction=renderer.isWeaponAttackActorAction(action)?'attack':'skill';
  const impact=actorActionImpactAt({actorAction,visualActorAction,start:1000,effectStart:1000,actionDuration:600,motionMs:300});
  expect(impact).toBe(1600);
  expect(skillVisualEffectAt({actorAction:'skill',visualActorAction,skillKind:'physical',effectStart:1000,impact})).toBe(1600);
 }
});
it('does not classify casting, traps or fixed throwing poses as weapon contact',()=>{
 for(const action of ['idle','skill','cast','pickup','attack1','attack2','attack3',40] as const)
  expect(renderer.isWeaponAttackActorAction(action)).toBe(false);
 expect(renderer.isWeaponAttackActorAction('attack')).toBe(true);
});
