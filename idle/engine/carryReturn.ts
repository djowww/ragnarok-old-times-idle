import type { Catalog, GameState } from '../shared/types.js';
import { battleHeroAt, stopHeroMovement } from '../shared/battleSpatial.js';
import { event } from './state.js';
import { clearBladeStop } from './bladeStop.js';
import { clearCloseConfine } from './rgCloseConfine.js';
import { clearTrickDead } from './trickDead.js';
import { clearClassicGrounds } from './classicBuffs.js';
import { cancelSageEnchantCast } from './sageEnchantments.js';
import { endFieldRest, isFieldSitting } from './recovery.js';

/** Only call after every already due effect/reward at this timestamp has finished. */
export function returnForCarry(s: GameState, c: Catalog, at: number) {
  s.autoResume = false; s.pendingAreaId = null;
  delete s.carryReturnRequestedAt;
  s.carryReturnAt = at;
  // Death owns its recovery deadline; a carry notice must not revive the actor.
  if (s.status !== 'resting' || s.restMode === 'field') {
    cancelSageEnchantCast(s, c, at, 'Conjuração encerrada pelo retorno à cidade.');
    clearBladeStop(s, at); clearCloseConfine(s, at); clearTrickDead(s, c, at);
    if (isFieldSitting(s)) endFieldRest(s, c);
    if (s.fieldHero?.areaId === s.areaId) {
      stopHeroMovement(s.fieldHero, battleHeroAt(s, at), at);
      s.fieldHero.phase = 'waiting';
      delete s.fieldHero.targetId; delete s.fieldHero.moveBlockedUntil;
    }
    s.battle = null; s.status = 'town'; s.restUntil = 0; delete s.restMode;
    clearClassicGrounds(s, c);
  }
  event(s, at, 'carry-return', 'Mochila cheia: retorno a Prontera. Libere peso e recolha os itens guardados.');
}
