/**
 * Hercules pre-renewal status arithmetic, pinned at
 * 410b9738c049ab1825d67b36b072d837c1d0b33a. GPL-3.0-or-later.
 * src/map/status.c SHA256:
 * 74d8626486cbfcf38d5eed1a49f76d3e8d400d6ee3ed47eb5c1c9bd9f3df0b26.
 * Uses the pinned defaults mob_status_def_rate=100, mob_max_status_def=100,
 * undead_detect_type=0. Buff/item immunity and existing opt1 conflicts belong
 * to the caller; this module models the monster's natural status resistance.
 */
import type { Monster } from '../shared/types.js';

export type ClassicResistedStatus =
  | 'SC_FREEZE' | 'SC_STONE' | 'SC_STUN' | 'SC_SLEEP' | 'SC_POISON' | 'SC_BLIND'
  | 'SC_PROVOKE' | 'SC_DEC_AGI';

export function isClassicResistedStatus(status: string | undefined): status is ClassicResistedStatus {
  return status === 'SC_FREEZE' || status === 'SC_STONE' || status === 'SC_STUN' ||
    status === 'SC_SLEEP' || status === 'SC_POISON' || status === 'SC_BLIND' ||
    status === 'SC_PROVOKE' || status === 'SC_DEC_AGI';
}

/** skill.c:7686..7698. The pinned source calls the level term a TODO/dummy
 * 1% per level difference; this preserves its formula without claiming it
 * is an independently established official-client formula.
 */
export function classicProvokeBaseChance(monster: Monster, skillLevel: number, casterLevel: number): number {
  if (monster.boss || monster.element.toLowerCase() === 'undead') return 0;
  return 50 + 3 * skillLevel + casterLevel - monster.level;
}

/** skill.c:7081..7087. Feed this rate into SC_DEC_AGI resistance afterwards. */
export function classicDecreaseAgilityBaseChance(skillLevel: number, casterLevel: number, casterInt: number): number {
  return 40 + 2 * skillLevel + Math.trunc((casterLevel + casterInt) / 5);
}

export interface ClassicStatusSource {
  level: number;
  /** Actual current caster LUK is needed for Freeze's duration bonus. */
  luk: number;
  /** Caster INT for callers deriving Decrease Agility's base success chance. */
  int?: number;
  /** SCFLAG_FIXEDRATE and SCFLAG_FIXEDTICK respectively. */
  fixedRate?: boolean;
  fixedDuration?: boolean;
  /** SCFLAG_NOAVOID skips resistance, rate rolls and boss/undead checks. */
  noAvoid?: boolean;
}

export interface ClassicStatusResistance {
  chancePct: number;
  /** Zero means immune/impossible; a successful status lasts at least 1 ms. */
  durationMs: number;
}

/** status.c:6932..7020, 7115..7218; chance is percent, not the C 10000 scale.
 * A null source reproduces the NPC/no-source path in status_get_sc_def.
 * Rolls remain the caller's responsibility (rnd()%10000 < adjusted rate).
 */
export function classicStatusResistance(
  monster: Monster,
  status: ClassicResistedStatus,
  chancePct: number,
  durationMs: number,
  source: ClassicStatusSource | null,
): ClassicStatusResistance {
  const duration = Math.trunc(durationMs);
  if (!source?.noAvoid && (monster.boss ||
    ((status === 'SC_FREEZE' || status === 'SC_STONE') && monster.element.toLowerCase() === 'undead'))) {
    return { chancePct: 0, durationMs: 0 };
  }
  if (!source || source.noAvoid) return { chancePct: 100, durationMs: Math.max(1, duration) };
  // SC_PROVOKE follows status_get_sc_def's default branch: no natural stat
  // resistance, level correction or Aegis chance rounding. Its skill applies
  // the separate level formula and undead immunity before starting the status.
  if (status === 'SC_PROVOKE') {
    const chance = Math.max(0, Math.min(10000, Math.trunc(chancePct * 100))) / 100;
    return { chancePct: chance, durationMs: chance > 0 ? Math.max(1, duration) : 0 };
  }

  const { vit, int: intelligence, luk } = monster.stats;
  let resistance: number;
  switch (status) {
    case 'SC_FREEZE':
    case 'SC_STONE':
    case 'SC_DEC_AGI': resistance = monster.mdef * 100; break;
    case 'SC_SLEEP': resistance = intelligence * 100; break;
    case 'SC_BLIND': resistance = (vit + intelligence) * 50; break;
    default: resistance = vit * 100;
  }
  const percentageResistance = Math.min(resistance, 10000);
  const levelDifference = Math.min(monster.level, 99) - Math.min(source.level, 99);
  const linearResistance = Math.min(luk * 10 + (status === 'SC_DEC_AGI' ? 0 : levelDifference * 10), 10000);
  let rate = Math.trunc(chancePct * 100);
  if (!source.fixedRate) {
    rate -= Math.trunc(rate * percentageResistance / 10000);
    rate -= linearResistance;
    // Aegis rounds a positive adjusted chance UP to the next 0.1 percent.
    if (rate > 0 && rate % 10 !== 0) rate += 10 - rate % 10;
  }
  const chance = Math.max(0, Math.min(10000, rate)) / 100;
  if (chance === 0) return { chancePct: 0, durationMs: 0 };

  // Poison halves the base tick for monsters before duration reduction,
  // including when FIXEDTICK is set (status_get_sc_def's switch runs first).
  let tick = status === 'SC_POISON' ? Math.trunc(duration / 2) : duration;
  if (tick < 1) return { chancePct: chance, durationMs: 1 };
  if (!source.fixedDuration) {
    const tickResistance = status === 'SC_STONE' || status === 'SC_DEC_AGI' ? 0 : status === 'SC_POISON'
      ? Math.trunc(vit * 200 / 3) : percentageResistance;
    const linearTickResistance = status === 'SC_FREEZE' ? -source.luk * 10
      : status === 'SC_STUN' || status === 'SC_SLEEP' || status === 'SC_BLIND' ? luk * 10 : 0;
    tick -= Math.trunc(tick * tickResistance / 10000);
    tick -= linearTickResistance;
  }
  return { chancePct: chance, durationMs: Math.max(1, tick) };
}

export interface ClassicActiveMonsterStatus {
  expiresAt: number;
  startsAt?: number;
  /** Supply this for Stone sources whose petrifying delay differs from Mage's. */
  petrifiesAt?: number;
  level?: number;
}

export type ClassicMonsterStatuses = Readonly<Record<string, ClassicActiveMonsterStatus>>;

/** status.c:8201..8209 and 12447..12468. Duration is the petrified phase,
 * separate from skill.c:8323's val4 petrifying delay (Mage Stone Curse: 5 s).
 */
export function classicStoneTiming(durationMs: number, petrifyingDelayMs: number) {
  const inputDelay = Math.max(0, Math.trunc(petrifyingDelayMs));
  const delayMs = inputDelay > 500 ? Math.max(inputDelay, 1000) : inputDelay;
  const petrifiedDurationMs = Math.max(1, Math.trunc(durationMs / 1000)) * 1000;
  return { delayMs, petrifiedDurationMs, totalDurationMs: delayMs + petrifiedDurationMs };
}

/** No phase is inferred for a historic entry that lacks both timestamps. */
export function classicStoneIsPetrified(
  status: ClassicActiveMonsterStatus | undefined,
  at: number,
  petrifyingDelayMs = 5000,
): boolean {
  if (!status || status.expiresAt <= at) return false;
  const petrifiesAt = status.petrifiesAt ?? (status.startsAt !== undefined
    ? status.startsAt + classicStoneTiming(0, petrifyingDelayMs).delayMs : undefined);
  return petrifiesAt !== undefined && at >= petrifiesAt;
}

/** status.c:300..325: only positive HP damage without flag&1 breaks these.
 * HP drains marked passive (e.g. status_zap) must not wake/freeze-break a mob.
 */
export function classicStatusBreaksOnDamage(
  status: string,
  hpDamage: number,
  options: { stonePetrified?: boolean; passiveDamage?: boolean } = {},
): boolean {
  if (hpDamage <= 0 || options.passiveDamage) return false;
  return status === 'SC_FREEZE' || status === 'SC_SLEEP' ||
    (status === 'SC_STONE' && options.stonePetrified === true);
}

/** Returns source status_data before battle.c applies def_percent.
 * Apply defPercent to BOTH hard DEF and the computed soft/VIT defense once.
 * Apply atkPercent once to rolled attacker ATK before defense (battle.c:5573).
 * HIT/FLEE are returned separately so DEX/AGI remain the real monster stats.
 */
export function effectiveMonsterStatus(
  monster: Monster,
  statuses: ClassicMonsterStatuses | undefined,
  at: number,
  petrifyingDelayMs = 5000,
) {
  const active = (name: string) => (statuses?.[name]?.expiresAt ?? 0) > at;
  const frozen = active('SC_FREEZE');
  const stonePetrified = classicStoneIsPetrified(statuses?.SC_STONE, at, petrifyingDelayMs);
  const clone: Monster = { ...monster, stats: { ...monster.stats }, attack: [...monster.attack] };
  // status.c:7846..7848, 4095..4096; AGI recalculation also changes FLEE.
  if (active('SC_DEC_AGI')) clone.stats.agi = Math.max(0, Math.min(65535,
    clone.stats.agi - 2 - (statuses!.SC_DEC_AGI.level ?? 0)));
  // status.c:5187..5190 and 5330..5333: calc_def precedes def_percent.
  if (stonePetrified) {
    clone.def = Math.floor(clone.def / 2);
    clone.mdef += Math.trunc(clone.mdef * 25 / 100);
  }
  if (frozen) {
    clone.def = Math.floor(clone.def / 2);
    clone.mdef += Math.trunc(clone.mdef * 25 / 100);
  }
  // status.c:6084..6108, precedence Freeze before petrified Stone.
  if (frozen || stonePetrified) {
    clone.element = frozen ? 'water' : 'earth';
    clone.elementLevel = 1;
  }
  let hit = clone.level + clone.stats.dex;
  let flee = clone.level + clone.stats.agi;
  if (active('SC_BLIND')) {
    hit -= Math.trunc(hit * 25 / 100);
    flee -= Math.trunc(flee * 25 / 100);
  }
  const provokeLevel = active('SC_PROVOKE') ? statuses!.SC_PROVOKE.level ?? 0 : undefined;
  const atkPercent = provokeLevel !== undefined ? 100 + 2 + 3 * provokeLevel : 100;
  // status_calc_def_percent subtracts these in the same additive category.
  // Applying two independent multipliers would give a different result.
  const defPercent = Math.max(0, 100 - (provokeLevel !== undefined ? 5 + 5 * provokeLevel : 0)
    - (active('SC_POISON') || active('SC_DPOISON') ? 25 : 0));
  return {
    monster: clone,
    hit,
    flee,
    defPercent,
    atkPercent,
    stonePetrified,
    immobilized: frozen || stonePetrified || active('SC_STUN') || active('SC_SLEEP'),
  };
}
