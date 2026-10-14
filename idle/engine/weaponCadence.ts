import type { Item, JobClass } from '../shared/types.js';

const twoHandedKey = {
  sword: 'twoHandSword', spear: 'twoHandSpear', axe: 'twoHandAxe',
  mace: 'twoHandMace', staff: 'twoHandStaff',
} as const;

/** Native pre-re weapon slot, including the default2000 for an absent subtype.
 * Bow/instrument/whip/katar/book keep their source slot regardless of EQP_ARMS.
 * Visual1h/2h resources may be shared; their attack delay is not interchangeable.
 */
export function baseWeaponAttackMotion(job: JobClass, weapon?: Item): number {
  if (!weapon) return job.weaponAspd?.unarmed ?? 2000;
  const type = weapon.weaponType;
  if (!type) return 2000;
  const key = weapon?.twoHanded && type in twoHandedKey
    ? twoHandedKey[type as keyof typeof twoHandedKey] : type;
  return job.weaponAspd?.[key] ?? 2000;
}
