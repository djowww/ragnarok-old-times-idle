/** Hercules 410b9738c049ab1825d67b36b072d837c1d0b33a, pre-renewal.
 * status.c:7894..7901, skill_db.conf:11543..11602, item_db.conf:1961.
 * The buff has no weapon-element override: Ele_Poison describes its self cast.
 */
export function deadlyPoisonRules(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > 5) return undefined;
  return { spCost: 50 + 10 * level, durationMs: 35000 + 5000 * level,
    poisonDurationMs: 10000 + 10000 * level, poisonChancePct: level + 2,
    damageMultiplier: 1 + 0.5 * (level + 1), reagentItemId: 678, reagentAmount: 1 };
}

/** battle.c:5830..5840; apply to the weapon damage path, not MATK/misc.
 * Caller passes zero when inactive. Apply at source's damage-add-rate stage.
 */
export function deadlyPoisonDamageMultiplier(level: number, source?: string, weaponAttack = true): number {
  if (!weaponAttack || source === 'AS_SPLASHER' || source === 'ASC_BREAKER' || source === 'ASC_METEORASSAULT') return 1;
  return deadlyPoisonRules(level)?.damageMultiplier ?? 1;
}

/** skill.c:1695..1698 in normal attack branch: no skill/splash proc.
 * Base chance only; target resistance and SC_DPOISON refresh immunity follow.
 */
export function deadlyPoisonProcChance(level: number, attack: { active: boolean; landed: boolean; skillAttack: boolean; skillId?: string }): number {
  if (!attack.active || !attack.landed || attack.skillAttack || attack.skillId) return 0;
  return deadlyPoisonRules(level)?.poisonChancePct ?? 0;
}
/** status.c:8210..8217: only activation respects the quarter-HP floor. */
export function deadlyPoisonInitialDamage(hp: number, maxHp: number, player = false): number {
  return Math.max(0, Math.min(Math.trunc(maxHp * (player ? 10 : 15) / 100), hp - Math.trunc(maxHp / 4)));
}
/** status.c:8225..8232,12473..12494. Repeated damage may kill its target.
 * Duration supplied here must already include target status resistance.
 */
export function deadlyPoisonTickRules(maxHp: number, durationMs: number, player = false) {
  return { damage: 3 + Math.trunc(maxHp / (player ? 50 : 100)), intervalMs: 1000,
    damageTicks: Math.max(0, Math.trunc(durationMs / 1000) - 1) };
}
