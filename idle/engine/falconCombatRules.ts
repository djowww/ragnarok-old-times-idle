/** Hercules pre-re battle.c:4411..4434, 4649..4702 and attr_fix:472..475. */
export interface FalconDamageInput {
  dex: number;
  int: number;
  steelCrow: number;
  level: number;
  kind: 'manual' | 'auto' | 'assault';
  targetCount?: number;
  elementRatePct?: number;
  skillAttackBonusPct?: number;
}

export function falconDamage(input: FalconDamageInput): number {
  const level = Math.max(0, Math.min(5, Math.trunc(input.level)));
  const parcel = 2 * (Math.trunc(input.dex / 10) + Math.trunc(input.int / 2)
    + 3 * input.steelCrow + 40);
  let damage = input.kind === 'assault'
    ? Math.trunc(parcel * 5 * (150 + 70 * level) / 100)
    : (input.kind === 'auto'
      ? Math.trunc(parcel / Math.max(1, input.targetCount ?? 1)) : parcel) * level;
  damage += Math.trunc(damage * (input.skillAttackBonusPct ?? 0) / 100);
  // attr_fix subtracts a truncated reduction; trunc(damage * rate) differs.
  damage -= Math.trunc(damage * (100 - (input.elementRatePct ?? 100)) / 100);
  return Math.max(0, damage);
}

export function autoFalconLevel(learned: number, jobLevel: number): number {
  return Math.max(0, Math.min(5, Math.trunc(learned), Math.trunc(jobLevel / 10) + 1));
}

export function autoFalconProc(roll: number, luk: number): boolean {
  return roll <= luk * 3;
}

/** battle.c:3738..3745, skill_min_damage=6: apply the positive misc minimum last. */
export function finishFalconDamage(damage:number,hits:number,lexAeterna=false):number{
  const final=damage*(lexAeterna?2:1);
  return final>0?Math.max(final,hits):0;
}
