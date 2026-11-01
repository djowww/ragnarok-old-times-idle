/**
 * Hercules pre-renewal Priest control, pinned at
 * 410b9738c049ab1825d67b36b072d837c1d0b33a. GPL-3.0-or-later.
 * status.c SHA256: 74d8626486cbfcf38d5eed1a49f76d3e8d400d6ee3ed47eb5c1c9bd9f3df0b26.
 * Pinned defaults: mob_sc_def_rate=100, mob_max_sc_def=100,
 * undead_detect_type=0. Inputs are valid source integer stats/timers.
 * Callers supply effective monster stats/element and own all RNG and mutation.
 */
import type { Monster, Stats } from '../shared/types.js';

export type PriestControlStatus = 'SC_BLIND' | 'SC_SILENCE';
export interface PriestControlSource {
  level: number;
  fixedRate?: boolean;
  fixedDuration?: boolean;
  noAvoid?: boolean;
}
export interface PriestControlResistance { chanceBp: number; durationMs: number }
export interface PriestControlAttemptFlags {
  /** PR_STRECOVERY's status_isimmune handler guard, before Blind/unlock. */
  handlerImmune?: boolean;
  alreadyActive?: boolean;
  boss?: boolean;
  noAvoid?: boolean;
  sourcePresent?: boolean;
}
export interface PriestControlAttemptStages {
  action: 'reject' | 'remove' | 'start';
  rollResistance: boolean;
  rejectAfterRoll: boolean;
}

/** skill.c:8380..8384: these are initial values, before Blind resistance. */
export function recoveryUndeadInput(stats: Pick<Stats, 'int' | 'vit' | 'luk'>): PriestControlResistance {
  return {
    chanceBp: 100 * (100 - (Math.trunc(stats.int / 2) + Math.trunc(stats.vit / 3) + Math.trunc(stats.luk / 10))),
    durationMs: Math.trunc(30000 * (100 - Math.trunc((stats.int + stats.vit) / 2)) / 100),
  };
}

/** battle.c:7174..7188: the pinned default checks element, not race. */
export function recoveryTargetsUndead(monster: Pick<Monster, 'element'>): boolean {
  return monster.element.toLowerCase() === 'undead';
}

/** status.c:6951..6961,7013..7017,7110..7218. Duration is the potential
 * successful duration even when chance is zero: callers must still roll.
 * Boss and active-status rejection occurs AFTER resistance/RNG in source;
 * it deliberately does not change this numerical result. Chance saturation
 * represents rnd()%10000 < rate; the initial rate is not clamped prematurely.
 */
export function priestControlStatusResistance(
  monster: Monster, status: PriestControlStatus, chanceBp: number,
  durationMs: number, source: PriestControlSource | null,
): PriestControlResistance {
  const duration = Math.trunc(durationMs);
  if (!source || source.noAvoid) return { chanceBp: 10000, durationMs: Math.max(1, duration) };
  const { vit, int: intelligence, luk } = monster.stats;
  const proportion = Math.min(status === 'SC_BLIND' ? (vit + intelligence) * 50 : vit * 100, 10000);
  const levelDifference = Math.min(monster.level, 99) - Math.min(source.level, 99);
  const linearChance = Math.min(luk * 10 + levelDifference * 10, 10000);
  let rate = Math.trunc(chanceBp);
  if (!source.fixedRate) {
    rate -= Math.trunc(rate * proportion / 10000);
    rate -= linearChance;
    if (rate > 0 && rate % 10 !== 0) rate += 10 - rate % 10;
  }
  let tick = duration;
  if (tick >= 1 && !source.fixedDuration) {
    tick -= Math.trunc(tick * proportion / 10000);
    tick -= luk * 10;
  }
  return { chanceBp: Math.max(0, Math.min(10000, rate)), durationMs: Math.max(1, tick) };
}

/** Source dispatcher stages only; this helper neither rolls nor starts a
 * status. skill.c:8363..8366 rejects Recovery handler immunity;7113..7120
 * toggles Lex before sc_start. status.c:7348..7354 consumes the resistance
 * roll even for zero chance, then7684..7688/7721..7731 reject boss/overlap.
 * Callers must honor a failed roll before consulting rejectAfterRoll.
 */
export function priestControlAttemptStages(
  status: PriestControlStatus, flags: PriestControlAttemptFlags = {},
): PriestControlAttemptStages {
  if (status === 'SC_BLIND' && flags.handlerImmune)
    return { action: 'reject', rollResistance: false, rejectAfterRoll: false };
  if (status === 'SC_SILENCE' && flags.alreadyActive)
    return { action: 'remove', rollResistance: false, rejectAfterRoll: false };
  return {
    action: 'start',
    rollResistance: flags.sourcePresent !== false && !flags.noAvoid,
    rejectAfterRoll: Boolean((flags.boss && !flags.noAvoid) || flags.alreadyActive),
  };
}
