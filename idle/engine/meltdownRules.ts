/** Hercules pre-renewal 410b9738c049ab1825d67b36b072d837c1d0b33a.
 * skill.c:2397..2441,2955..3006; status.c:8684..8686; skill_db.conf:11838..11848.
 * This module models the Meltdown contribution under equip_skill_break_rate=100.
 * Caller owns buff lifetime, native hit classification, target status eligibility,
 * strip duration/refresh and status_start's separate RNG draw. GPL-3.0-or-later.
 */
export type MeltdownSlot = 'weapon' | 'armor';
export type MeltdownSlotResult =
  | 'ineligible' | 'protected' | 'miss' | 'boss-immune' | 'applied' | 'status-rejected';
export interface MeltdownAdditionalEffectsInput {
  /** Active buff level captured at application, never the newly configured use level. */
  capturedBuffLevel: number;
  /** BF_WEAPON/BF_MAGIC/BF_MISC classification of this resolved damage phase. */
  attackKind: 'weapon' | 'magic' | 'misc';
  /** Canonical Hercules source name; absent for an ordinary attack. */
  skillSourceName?: string;
  damage: number;
  /** Alive after this damage phase; lethal hits must not add statuses to a corpse. */
  targetAlive: boolean;
  /** Actual target MD_BOSS, independent of the Idle challenge category. */
  bossImmune: boolean;
  /** Source SC_PROTECTWEAPON/SC_PROTECTARMOR evaluated at the hit's exact time. */
  weaponProtected: boolean;
  armorProtected: boolean;
}
export interface MeltdownAdditionalEffectsResult {
  weapon: MeltdownSlotResult;
  armor: MeltdownSlotResult;
}

const excludedSources = new Set(['CR_REFLECTSHIELD', 'WS_CARTTERMINATION', 'ITM_TOMAHAWK']);
const validLevel = (level: number) => Number.isSafeInteger(level) && level >= 1 && level <= 10;

/** SkillData1 is the buff lifetime; SkillData2=5000 is not its duration. */
export function meltdownBuffDurationMs(level: number): number | undefined {
  return validLevel(level) ? 15000 + 5000 * (level - 1) : undefined;
}

/** One additional-effect phase per living target, not per displayed hitCount.
 * roll10000 must return a native integer in [0,9999]. Protections skip this draw.
 * A boss still consumes an unprotected break draw, but never calls startStrip.
 * startStrip owns all native status rejection/refresh and its guaranteed-status
 * RNG; its result says whether the status was accepted, not whether break rolled.
 * Do not defer callbacks: weapon status processing precedes the armor break draw.
 */
export function resolveMeltdownAdditionalEffects(
  input: Readonly<MeltdownAdditionalEffectsInput>,
  roll10000: () => number,
  startStrip: (slot: MeltdownSlot) => boolean,
): MeltdownAdditionalEffectsResult {
  if (!validLevel(input.capturedBuffLevel) || input.attackKind !== 'weapon' ||
      !Number.isFinite(input.damage) || input.damage <= 0 || !input.targetAlive ||
      excludedSources.has(input.skillSourceName ?? '')) {
    return { weapon: 'ineligible', armor: 'ineligible' };
  }

  function slotResult(slot: MeltdownSlot, protectedSlot: boolean, chance: number): MeltdownSlotResult {
    if (protectedSlot) return 'protected';
    const roll = roll10000();
    // Invalid injected RNG must not become a guaranteed proc through clamping/modulo.
    if (!Number.isSafeInteger(roll) || roll < 0 || roll >= 10000 || roll >= chance) return 'miss';
    if (input.bossImmune) return 'boss-immune';
    return startStrip(slot) ? 'applied' : 'status-rejected';
  }

  const weapon = slotResult('weapon', input.weaponProtected, 100 * input.capturedBuffLevel);
  const armor = slotResult('armor', input.armorProtected, 70 * input.capturedBuffLevel);
  return { weapon, armor };
}
