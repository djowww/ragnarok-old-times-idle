import type { Monster } from '../shared/types.js';
import { classicStatusResistance } from './classicStatuses.js';

export interface EnchantPoisonAttack {
  monster: Monster;
  skillLevel: number;
  buffExpiresAt: number;
  at: number;
  casterLevel: number;
  casterLuk: number;
  /** BF_SKILL also excludes normal-attack splash damage. */
  skillAttack: boolean;
  skillId?: string;
  /** Source dmg_lv >= ATK_DEF; misses/blocked attacks are false. */
  landed: boolean;
  existingPoisonExpiresAt?: number;
  rng: () => number;
}

/** Pinned Hercules 410b9738c049ab1825d67b36b072d837c1d0b33a.
 * skill.c:1641..1694 normal attacks only; status.c:7936..7937 proc rate.
 * db/pre-re/skill_db.conf:4935..4946 secondary duration is level * 10000.
 * status.c:7719..7727 refuses poison refresh; resistance uses SCFLAG_NONE.
 */
export function enchantPoisonProc(attack: EnchantPoisonAttack): {level: number; startsAt: number; expiresAt: number; nextTickAt: number} | undefined {
  const { at, skillLevel } = attack;
  if (skillLevel < 1 || skillLevel > 10 || !Number.isInteger(skillLevel) ||
      attack.buffExpiresAt <= at || !attack.landed || attack.skillAttack || attack.skillId ||
      (attack.existingPoisonExpiresAt ?? 0) > at) return undefined;
  const resisted = classicStatusResistance(attack.monster, 'SC_POISON', 2.5 + 0.5 * skillLevel,
    10000 * skillLevel, { level: attack.casterLevel, luk: attack.casterLuk });
  if (resisted.chancePct <= 0 || Math.floor(attack.rng() * 10000) >= Math.trunc(resisted.chancePct * 100))
    return undefined;
  return { level: skillLevel, startsAt: at, expiresAt: at + resisted.durationMs, nextTickAt: at + 1000 };
}

/** skill.c:18962..18974. EDP is deliberately absent from this group.
 * Call on every supported elemental-enchant activation, before adding it.
 * Source status-only dark/ghost enchants have no enabled solo skill here.
 */
export function elementalEnchantReplacements(sourceName: string): readonly string[] {
  const enchants = ['AS_ENCHANTPOISON', 'PR_ASPERSIO', 'SA_FLAMELAUNCHER', 'SA_FROSTWEAPON',
    'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON'] as const;
  return enchants.some(name => name === sourceName) ? enchants.filter(name => name !== sourceName) : [];
}

/** skill.c:7619..7631 prevents player cast over elemental properties.
 * Input contains only currently active buff source names. Current solo
 * catalog exposes the four Sage property enchantments from that list.
 */
export function enchantPoisonCastBlocked(activeSourceNames: readonly string[]): boolean {
  return activeSourceNames.some(name => name === 'SA_FROSTWEAPON' || name === 'SA_FLAMELAUNCHER' ||
    name === 'SA_LIGHTNINGLOADER' || name === 'SA_SEISMICWEAPON');
}
