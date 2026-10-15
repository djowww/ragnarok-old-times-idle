import type { Catalog, GameState, Skill } from '../shared/types.js';
import { classicBuffActive, cancelClassicBuff } from './classicBuffs.js';
import { derivedStats } from './stats.js';
import { activateBerserk, berserkRules, berserkTimerTick, endBerserk } from './soloStances.js';

/** Normal frenzy lifecycle only; no dispel/Bloodylust actors exist in this Idle. */
export function startSoloStance(s: GameState, skill: Skill, at: number, maxHpBefore: number) {
  if (skill.sourceName !== 'LK_BERSERK') return;
  const activated = activateBerserk(maxHpBefore);
  s.hp = activated.hp;
  s.sp = 0;
  (s.combatEffects ??= {}).berserk = { nextTickAt: at + berserkRules.intervalMs,
    drainHp: activated.drainHp, remainingTicks: activated.remainingTicks };
}

export function finishBerserk(s: GameState, c: Catalog, at: number) {
  const effects = (s.combatEffects ??= {});
  const ended = endBerserk(s.hp, effects.berserk?.drainHp ?? 1);
  cancelClassicBuff(s, c, 'LK_BERSERK');
  s.hp = ended.hp;
  delete effects.berserk;
  effects.regenBlockedUntil = Math.max(effects.regenBlockedUntil ?? 0, at + ended.regenBlockMs);
}

/** Chronological timers retain their original deadlines during offline catch-up. */
export function tickSoloStances(s: GameState, c: Catalog, at: number) {
  const buff = Object.entries(s.buffs).find(([id]) => c.skills[id]?.sourceName === 'LK_BERSERK');
  if (!buff) { if (s.combatEffects) delete s.combatEffects.berserk; return; }
  const [id, active] = buff;
  const effects = (s.combatEffects ??= {});
  // Migrate a saved source status without refreshing/healing it.
  if (!effects.berserk) {
    const startedAt = active.expiresAt - berserkRules.durationMs;
    const elapsedTicks = Math.max(0, Math.floor((at - startedAt) / berserkRules.intervalMs));
    const maxHp = derivedStats({ ...s, lastSimulatedAt: Math.min(at, active.expiresAt - 1) }, c).maxHp;
    effects.berserk = { nextTickAt: Math.min(startedAt + (elapsedTicks + 1) * berserkRules.intervalMs, active.expiresAt),
      drainHp: Math.trunc(maxHp * .05), remainingTicks: Math.max(1, 20 - elapsedTicks) };
  }
  if (s.hp <= 100) { finishBerserk(s, c, Math.min(at, active.expiresAt)); return; }
  while (s.buffs[id] && effects.berserk && Math.min(effects.berserk.nextTickAt, active.expiresAt) <= at) {
    const timer = effects.berserk;
    const deadline = Math.min(timer.nextTickAt, active.expiresAt);
    if (deadline >= active.expiresAt) { finishBerserk(s, c, active.expiresAt); break; }
    const tick = berserkTimerTick({ hp: s.hp, drainHp: timer.drainHp, remainingTicks: timer.remainingTicks });
    s.hp = tick.hp;
    timer.remainingTicks = tick.remainingTicks;
    if (tick.ended) { finishBerserk(s, c, deadline); break; }
    timer.nextTickAt += berserkRules.intervalMs;
  }
}

export function soloRecoveryBlocked(s: GameState, c: Catalog, at: number) {
  return classicBuffActive(s, c, 'LK_BERSERK', at) || (s.combatEffects?.regenBlockedUntil ?? 0) > at;
}
