/** Hercules 410b9738 pre-renewal skill.c/status.c/battle.c. GPL-3.0-or-later. */
export const STRIP_STATUSES = ['SC_NOEQUIPWEAPON', 'SC_NOEQUIPSHIELD', 'SC_NOEQUIPARMOR', 'SC_NOEQUIPHELM'] as const;
export type StripStatus = typeof STRIP_STATUSES[number];

/** skill.c:8569..8589: one attempt, separate from Rogue's single-slot rate. */
export function fullStripRules(level: number, casterDex: number, targetDex: number) {
  const difference = casterDex - targetDex;
  return { chancePct: Math.max(5, 5 + 2 * level + Math.trunc(difference / 5)),
    durationMs: Math.max(0, 60000 + 15000 * level + 500 * difference), statuses: STRIP_STATUSES };
}
export function resolveFullStrip(input: { level: number; casterDex: number; targetDex: number; rollPct: number;
  protectedStatuses?: readonly StripStatus[] }) {
  const rules = fullStripRules(input.level, input.casterDex, input.targetDex);
  return { ...rules, appliedStatuses: input.rollPct < rules.chancePct
    ? rules.statuses.filter(status => !input.protectedStatuses?.includes(status)) : [] };
}

/** battle.c:6320..6328/5387: only primary damage is halved, after reflection. */
export function rejectSwordHit(input: { level: number; charges: number; damage: number; damage2?: number; rollPct: number }) {
  const triggered = input.charges > 0 && input.damage !== 0 && input.rollPct < 15 * input.level;
  const damage = triggered ? Math.trunc(input.damage / 2) : input.damage;
  return { damage, damage2: input.damage2 ?? 0, counterDamage: triggered ? damage : 0,
    triggered, remainingCharges: Math.max(0, input.charges - (triggered ? 1 : 0)) };
}

export interface ProvokeState { level: number; automatic: boolean }
export interface AutoBerserkSnapshot { enabled: boolean; hp: number; maxHp: number; provoke?: ProvokeState }
/** status.c:363,563,7879,11389: only the automatic child's ownership is removed. */
export function autoBerserkProvoke(input: AutoBerserkSnapshot): ProvokeState | undefined {
  if (input.enabled && input.hp > 0 && input.hp < Math.floor(input.maxHp / 4))
    return { level: 10, automatic: true };
  return input.provoke?.automatic ? undefined : input.provoke;
}
export function autoBerserkModifiers(input: AutoBerserkSnapshot) {
  const provoke = autoBerserkProvoke(input);
  return { sourceAttackPercent: provoke ? 100 + 2 + 3 * provoke.level : 100,
    sourceDefensePercent: provoke ? Math.max(0, 100 - 5 - 5 * provoke.level) : 100 };
}

/** status.c:7906..7909; battle.c:7141..7160. Charges pay for attempts, not hits. */
export function poisonReactCharges(level: number) {
  return Math.trunc((level + 1) / 2) + Math.trunc(level / 10);
}
export function poisonReactCounter(input: { level: number; charges: number; bodyElement: string; rollPct: number }) {
  if (input.charges <= 0 || (input.rollPct >= 50 && input.bodyElement.toLowerCase() !== 'poison')) return undefined;
  return input.bodyElement.toLowerCase() === 'poison'
    ? { source: 'AS_POISONREACT' as const, level: input.level, charges: 0 }
    : { source: 'TF_POISON' as const, level: 5, charges: input.charges - 1 };
}
/** skill.c:9339..9342/status.c:12651..12664: first tick1s then500ms. */
export function splasherRules(level: number) {
  const duration = 4500 + 500 * level;
  return { delayMs: duration + 500, cooldownMs: duration + 3000 };
}
export function canApplySplasher(input: { hp: number; maxHp: number; boss: boolean; activeUntil: number; at: number }) {
  return input.hp > 0 && !input.boss && input.hp <= Math.trunc(input.maxHp * 3 / 4) && input.activeUntil <= input.at;
}
