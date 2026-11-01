export type PlayerDisease = "SC_POISON" | "SC_DPOISON" | "SC_BLIND";
export type PlayerPoison = Exclude<PlayerDisease, "SC_BLIND">;
export type PlayerStatusResistanceInput = { kind: PlayerDisease; vit: number; int: number; luk: number; targetLevel: number; sourceLevel: number; chanceBp: number; durationMs: number };
export type PoisonTickInput = { kind: PlayerPoison; hp: number; maxHp: number; damage: number; remainingTicks: number; slowPoison: boolean };

/** Native PC rules, default pc_sc_def_rate/pc_max_sc_def=100, no equipment resistance.
 * Hercules 410b9738: status.c:6937-6950,7013-7017,7102-7218.
 * The caller owns status immunity checks, the one RNG roll and reapplication policy.
 */
export function playerStatusResistance(input: PlayerStatusResistanceInput): { chanceBp: number; durationMs: number } {
  const { kind, vit, int, luk, targetLevel, sourceLevel, chanceBp, durationMs } = input;
  const proportional = Math.min(10000, kind === "SC_BLIND" ? (vit + int) * 50 : vit * 100);
  const linear = Math.min(10000, luk * 10 + (Math.min(99, targetLevel) - Math.min(99, sourceLevel)) * 10);
  const rate = chanceBp - Math.trunc(chanceBp * proportional / 10000) - linear;
  // Native rnd()%10000 < rate: above 10000 and below zero saturate observably.
  const roundedRate = rate > 0 ? Math.ceil(rate / 10) * 10 : rate;
  const tickDef = kind === "SC_BLIND" ? proportional : vit * 75;
  const tickDef2 = kind === "SC_BLIND" ? luk * 10 : luk * 100;
  return {
    chanceBp: Math.max(0, Math.min(10000, roundedRate)),
    durationMs: durationMs < 1 ? 1 : Math.max(1, durationMs - Math.trunc(durationMs * tickDef / 10000) - tickDef2),
  };
}

/** PC val4 snapshot and val3 counter; status.c:8224-8232,10047-10080. */
export function poisonTickParameters(kind: PlayerPoison, maxHp: number, durationMs: number): { damage: number; remainingTicks: number; firstTickMs: number; sourceDurationMs: number } {
  return {
    damage: 3 + Math.trunc(kind === "SC_DPOISON" ? maxHp / 50 : maxHp * 3 / 200),
    remainingTicks: Math.max(1, Math.trunc(durationMs / 1000)),
    firstTickMs: 1000,
    sourceDurationMs: durationMs,
  };
}

/** One authoritative timer invocation, no timing/RNG side effects. status.c:12469-12494. */
export function poisonTickDecision(input: PoisonTickInput): { hp: number; remainingTicks: number; end: boolean; damageApplied: number } {
  const { kind, hp, maxHp, damage, slowPoison } = input;
  if (kind === "SC_POISON" && hp <= Math.max(Math.trunc(maxHp / 4), damage)) {
    return { hp, remainingTicks: input.remainingTicks, end: true, damageApplied: 0 };
  }
  const remainingTicks = Math.max(0, input.remainingTicks - 1);
  if (remainingTicks === 0 || slowPoison) {
    return { hp, remainingTicks, end: remainingTicks === 0, damageApplied: 0 };
  }
  const damageApplied = Math.min(hp, damage);
  const nextHp = hp - damageApplied;
  return { hp: nextHp, remainingTicks, end: nextHp === 0, damageApplied };
}

/** Future DPoison producers must also apply this initial PC damage, status.c:8210-8223. */
export function deadlyPoisonInitialDamage(hp: number, maxHp: number): { hp: number; damageApplied: number } {
  const floorHp = Math.trunc(maxHp / 4);
  const damageApplied = hp > floorHp ? Math.min(Math.trunc(maxHp * 10 / 100), hp - floorHp) : 0;
  return { hp: hp - damageApplied, damageApplied };
}

/** DEF is an additive category penalty; HIT/FLEE subtract trunc(value*25/100).
 * status.c:4527-4529,4974-4975,5071-5072. Poison includes either Poison variant.
 */
export function playerDiseaseModifiers(input: { poison: boolean; blind: boolean }): { defReductionPercent: number; hitReductionPercent: number; fleeReductionPercent: number } {
  return {
    defReductionPercent: input.poison ? 25 : 0,
    hitReductionPercent: input.blind ? 25 : 0,
    fleeReductionPercent: input.blind ? 25 : 0,
  };
}
