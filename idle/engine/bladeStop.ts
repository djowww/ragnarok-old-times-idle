import type { BattleEnemy, GameState } from '../shared/types.js';

const waits = [500, 700, 900, 1100, 1300] as const;
const durations = [20_000, 30_000, 40_000, 50_000, 60_000] as const;

export function bladeStopRules(level: number) {
  if (!Number.isSafeInteger(level) || level < 1 || level > waits.length)
    throw new RangeError('Blade Stop level must be 1 through 5');
  return { waitMs: waits[level - 1], durationMs: durations[level - 1], spCost: 10, sphereCost: 1 };
}

const followupLevels: Readonly<Record<string, number>> = Object.freeze({
  MO_FINGEROFFENSIVE: 2,
  MO_INVESTIGATE: 3,
  MO_CHAINCOMBO: 4,
  MO_EXTREMITYFIST: 5,
});

export function bladeStopSkillAllowed(source: string, bladeStopLevel: number) {
  return Number.isSafeInteger(bladeStopLevel) && bladeStopLevel >= (followupLevels[source] ?? Infinity);
}

export function shouldBladeStop(input: {
  wait?: BladeStopWait;
  at: number;
  distance: number;
  basicAttack: boolean;
  boss: boolean;
}) {
  return !!input.wait && bladeStopWaitActive(input.wait, input.at) && input.basicAttack &&
    !input.boss && Number.isFinite(input.distance) && input.distance <= 2;
}

export type BladeStopWait = { level: number; startsAt?: number; expiresAt: number };
export type BladeStopLink = { level: number; partnerActorId: string; areaId: string | null; expiresAt: number };

/** Old transient states can derive their start from the source wait duration. */
export function bladeStopWaitActive(wait: BladeStopWait, at: number) {
  const startsAt = wait.startsAt ?? wait.expiresAt - bladeStopRules(wait.level).waitMs;
  return startsAt <= at && at < wait.expiresAt;
}

export function startBladeStopWait(s: GameState, level: number, at: number) {
  const rules = bladeStopRules(level);
  const effects = (s.combatEffects ??= {});
  effects.bladeStopWait = { level, startsAt: at, expiresAt: at + rules.waitMs };
  if (s.fieldHero) s.fieldHero.moveBlockedUntil = Math.max(s.fieldHero.moveBlockedUntil ?? 0, at + rules.waitMs);
  return rules;
}

export function bladeStopTarget(s: GameState, at: number) {
  const link = s.combatEffects?.bladeStopLink;
  if (!link || link.expiresAt <= at || link.areaId !== s.areaId) return undefined;
  return (s.battle?.enemies ?? []).find(enemy => enemy.id === link.partnerActorId && enemy.hp > 0 &&
    enemy.statuses?.SC_BLADESTOP?.partnerActorId === s.id && enemy.statuses.SC_BLADESTOP.expiresAt > at);
}

export function createBladeStopLink(s: GameState, enemy: BattleEnemy, level: number, at: number) {
  const { durationMs } = bladeStopRules(level);
  const link: BladeStopLink = { level, partnerActorId: enemy.id, areaId: s.areaId, expiresAt: at + durationMs };
  const effects = (s.combatEffects ??= {});
  delete effects.bladeStopWait;
  effects.bladeStopLink = link;
  (enemy.statuses ??= {}).SC_BLADESTOP = {
    expiresAt: link.expiresAt, level, sourceActorId: s.id, partnerActorId: s.id, skillId: 'MO_BLADESTOP',
  };
  if (at < enemy.arrivedAt && at >= enemy.startedAt) enemy.approachPausedAt ??= at;
  if (s.fieldHero) s.fieldHero.moveBlockedUntil = Math.max(s.fieldHero.moveBlockedUntil ?? 0, link.expiresAt);
  return link;
}

export function clearBladeStop(s: GameState, at = s.lastSimulatedAt) {
  const effects = s.combatEffects;
  if (!effects) return;
  const link = effects.bladeStopLink;
  if (link) {
    for (const partner of [...(s.battle?.enemies ?? []), ...(s.fieldPopulation?.enemies ?? [])]) {
      if (partner.id === link.partnerActorId && partner.statuses?.SC_BLADESTOP?.partnerActorId === s.id) {
        if (partner.statuses) delete partner.statuses.SC_BLADESTOP;
        if (partner.approachPausedAt !== undefined) {
          const pausedMs = Math.max(0, at - partner.approachPausedAt);
          partner.startedAt += pausedMs;
          partner.arrivedAt += pausedMs;
          delete partner.approachPausedAt;
        }
      }
    }
    if (s.fieldHero?.moveBlockedUntil === link.expiresAt) {
      if (s.fieldHero.arrivedAt <= at) delete s.fieldHero.moveBlockedUntil;
      else s.fieldHero.moveBlockedUntil = at;
    }
    delete effects.bladeStopLink;
  }
  if (effects.bladeStopWait) {
    if (s.fieldHero?.moveBlockedUntil === effects.bladeStopWait.expiresAt) {
      if (s.fieldHero.arrivedAt <= at) delete s.fieldHero.moveBlockedUntil;
      else s.fieldHero.moveBlockedUntil = at;
    }
    delete effects.bladeStopWait;
  }
}

/** Expiry and actor/map changes end both halves; a saved old actor can never relock a respawn. */
export function tickBladeStop(s: GameState, at: number) {
  const effects = s.combatEffects;
  if (!effects) return;
  if (effects.bladeStopWait && effects.bladeStopWait.expiresAt <= at) clearBladeStop(s, at);
  const link = effects.bladeStopLink;
  if (!link) return;
  const partner = bladeStopTarget(s, at);
  if (!partner) clearBladeStop(s, at);
}
