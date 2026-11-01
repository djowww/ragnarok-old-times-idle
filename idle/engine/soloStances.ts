/** Hercules 410b9738c049ab1825d67b36b072d837c1d0b33a, pre-renewal.
 * Source-derived rules; GPL-3.0-or-later. No state mutation or clock access.
 */
export type SoloStanceSource = "MO_STEELBODY" | "LK_BERSERK";

// db/pre-re/skill_db.conf:7911-7940,10883-10900.
export function steelBodyRules(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > 5)
    throw new RangeError("Steel Body level must be 1 through 5");
  return { durationMs: 30000 * level, spCost: 200, sphereCost: 5, castTimeMs: 5000 };
}
export const berserkRules = Object.freeze({
  durationMs: 300000, intervalMs: 15000, spCost: 200,
  // status.c:11569 uses SkillData1. The value 10 is status level, not seconds.
  postEndRegenBlockMs: 300000,
});

/** Delay rate uses 1000 = normal, NOT displayed ASPD percentages.
 * Apply additive haste before attack-delay calculation/caps. Walk haste joins
 * the strongest haste (max), whereas Steel Body sets walk delay to 200ms.
 * status.c:5069,5158-5168,5265,5312-5319,5378,5552-5553,5596-5597,
 * 5847-5848,5863-5864,5963-5964; battle.c:3087-3089.
 */
export function stanceStatModifiers(source: SoloStanceSource) {
  if (source === "MO_STEELBODY") return {
    hardDef: 90, hardMdef: 90, aspdRateDelta: 250, walkDelayMs: 200,
  };
  return {
    hardDef: 0, softDef: 0, hardMdef: 0, softMdef: 0,
    maxHpMultiplier: 3, weaponDamageRatioBonus: 100,
    fleeReductionPercent: 50, aspdRateDelta: -300, walkHastePercent: 25,
  };
}

/** Fresh activation only; caller supplies max HP before Berserk.
 * status.c:10093-10098. Drain is captured once at activation.
 */
export function activateBerserk(maxHpBefore: number) {
  const maxHp = maxHpBefore * 3;
  return { maxHp, hp: maxHp, sp: 0, drainHp: Math.trunc(5 * maxHp / 100),
    remainingTicks: berserkRules.durationMs / berserkRules.intervalMs };
}

/** Call exactly once per due 15s interval. Hercules decrements duration first
 * and does not charge the final tick. status.c:12630-12635,229-234,272-274.
 * Charge must leave positive HP; insufficient HP or zero charge ends status.
 * Caller must apply endBerserk when ended, and handle damage <=100 immediately
 * (status.c:367-368), without waiting for this timer.
 */
export function berserkTimerTick(input: { hp: number; drainHp: number; remainingTicks: number }) {
  const remainingTicks = Math.max(0, input.remainingTicks - 1);
  if (remainingTicks === 0 || input.drainHp <= 0 || input.hp <= input.drainHp)
    return { hp: input.hp, remainingTicks, ended: true };
  const hp = input.hp - input.drainHp;
  return { hp, remainingTicks, ended: hp <= 100 };
}

/** Normal LK_BERSERK ending, excluding Bloodylust. Removed drain means dispel
 * can suppress HP penalty. status.c:11559-11569,13723-13726.
 */
export function endBerserk(hp: number, drainHp: number) {
  return { hp: drainHp !== 0 && hp > 100 ? 100 : hp,
    regenBlockMs: berserkRules.postEndRegenBlockMs };
}

/** Supply currently active source names, not expired buff entries.
 * status.c:932-938; skill.c:12261-12263; pc.c:5371,10266,10505;
 * status.c:536-540,2661-2669. Skill guard covers manual casts only;
 * item-cast/autospell exceptions belong to their separate engine paths.
 * Forced healing bypasses HP healing block.
 * Forced equipment removal is outside this voluntary-action guard.
 */
export function stanceGuards(activeSources: readonly string[]) {
  const berserk = activeSources.includes("LK_BERSERK");
  return { skillsBlocked: berserk || activeSources.includes("MO_STEELBODY"),
    itemsBlocked: berserk, equipmentBlocked: berserk,
    hpHealingBlocked: berserk, naturalRegenBlocked: berserk };
}
