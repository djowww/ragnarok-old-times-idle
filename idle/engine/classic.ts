/**
 * Hercules pre-renewal combat arithmetic, pinned at
 * 410b9738c049ab1825d67b36b072d837c1d0b33a. GPL-3.0-or-later.
 * See content/source-manifest.json for independently verified source hashes.
 * Geometry, status application and resource consumption belong to combat.ts.
 */
import type { Effects, Monster, Skill, Stats, WeaponType } from '../shared/types.js';

export interface ClassicDamageStats {
  attack: number;
  magicAttack: [number, number];
  baseAttack?: number;
  weaponAttack?: number;
  weaponLevel?: number;
  weaponRefineAttack?: number;
  weaponWeight?: number;
  shieldWeight?: number;
  shieldRefine?: number;
  weaponType?: WeaponType;
  twoHanded?: boolean;
  dex?: number;
  str?: number;
  int?: number;
  luk?: number;
  baseLevel?: number;
  maxHp?: number;
  maxSp?: number;
  hp?: number;
  sp?: number;
  critical?: boolean;
  damagePercent?: number;
  magicPowerPercent?: number;
  targetCount?: number;
  targetHp?: number;
  targetIsBoss?: boolean;
  /** Source status_data.def_percent, e.g. 75 while Poison is active. */
  targetDefPercent?: number;
  sizeMultiplier?: number;
  elementMultiplier?: number;
  cartWeightRatio?: number;
  spiritSpheres?: number;
  consumedSpheres?: number;
  learnedSkills?: Record<string, number>;
  /** Source names avoid ambiguity between translated and historic save ids. */
  skillLevelsBySource?: Record<string, number>;
  activeSkillsBySource?: Record<string, number>;
}

type ClassicSkill = Skill & {
  sourceName?: string; implementation?: 'supported' | 'unsupported';
  sourceHitCount?: number[]; ignoreDefense?: boolean; splitDamage?: boolean;
  ignoreElement?: boolean; damageType?: 'weapon' | 'magic' | 'misc' | 'none';
};
const legacySource: Record<string, string> = {
  bash: 'SM_BASH', magnum_break: 'SM_MAGNUM', mammonite: 'MC_MAMMONITE',
  double_strafe: 'AC_DOUBLE', arrow_shower: 'AC_SHOWER', envenom: 'TF_POISON',
  pierce: 'KN_PIERCE', brandish_spear: 'KN_BRANDISHSPEAR', holy_cross: 'CR_HOLYCROSS',
  shield_boomerang: 'CR_SHIELDBOOMERANG', sonic_blow: 'AS_SONICBLOW', raid: 'RG_RAID',
  fire_bolt: 'MG_FIREBOLT', cold_bolt: 'MG_COLDBOLT', lightning_bolt: 'MG_LIGHTNINGBOLT',
  jupitel_thunder: 'WZ_JUPITEL', storm_gust: 'WZ_STORMGUST', holy_light: 'AL_HOLYLIGHT',
  acid_terror: 'AM_ACIDTERROR', melody_strike: 'BA_MUSICALSTRIKE', slinging_arrow: 'DC_THROWARROW',
};
const sourceOf = (skill: ClassicSkill) => skill.sourceName ?? legacySource[skill.id] ?? skill.id.toUpperCase();
const integer = (n: number) => Math.trunc(n);
const atLevel = (values: number[] | undefined, level: number, fallback = 0) => values?.[level - 1] ?? values?.at(-1) ?? fallback;
/** Hercules rnd()%range excludes the upper endpoint (status.c:13598). */
const randomExclusive = (min: number, max: number, rng: () => number) => min + (max > min ? Math.floor(rng() * (max - min)) : 0);
const sourceAliases: Record<string, string> = { SM_RECOVERY: 'hp_recovery', MG_SRECOVERY: 'sp_recovery', TF_DOUBLE: 'double_attack', TF_MISS: 'improve_dodge', AC_OWL: 'owl_eye', HT_BEASTBANE: 'beast_bane', MO_TRIPLEATTACK: 'triple_attack', HW_SOULDRAIN: 'soul_drain' };
const learned = (s: ClassicDamageStats, source: string) => s.skillLevelsBySource?.[source] ?? s.learnedSkills?.[source] ?? s.learnedSkills?.[sourceAliases[source] ?? source.toLowerCase()] ?? 0;
const undead = (monster: Monster) => monster.element.toLowerCase() === 'undead';

/** skill.c:17509; battle_config.castrate_dex_scale defaults to 150. */
export function classicCastTime(baseMs: number, dex: number): number {
  return Math.max(0, integer(baseMs * Math.max(0, 150 - dex) / 150));
}

/** status.c:3763..3769 and 3426. Default pre-renewal ASPD cap is 190. */
export function classicAttackInterval(baseMotion: number, agi: number, dex: number, delayReductionPct = 0): number {
  const motion = baseMotion - integer(baseMotion * (4 * agi + dex) / 1000);
  return 2 * Math.max(100, Math.min(2000, integer(motion * (100 - delayReductionPct) / 100)));
}

/** Additional skill recovery, status.c:2733..2737 (normally every 10 s). */
export function classicSkillRecovery(maximum: number, level: number, resource: 'hp' | 'sp'): number {
  return level * (resource === 'hp' ? 5 : 3) + integer(level * maximum / 500);
}

/** skill.c:2805..2815: only the primary target of a directed magic kill. */
export function classicSoulDrain(monsterLevel: number, skillLevel: number): number {
  return integer(monsterLevel * (95 + 15 * skillLevel) / 100);
}

/** skill.c:skill_calc_heal, pre-renewal branch; First Aid always restores 5. */
export function classicHeal(baseLevel: number, intelligence: number, skillLevel: number): number {
  return integer((baseLevel + intelligence) / 8) * (4 + 8 * skillLevel);
}

/** pc.c:8722..8724 and 8761..8763; itemheal modifiers are additive. */
export function classicPotionHealing(base: number, stat: number, recoveryLevel: number, potionResearchLevel: number): number {
  return Math.max(base, integer(base * (100 + 2 * stat + 10 * recoveryLevel + 5 * potionResearchLevel) / 100));
}

/** battle.c:1493; Divine Protection is flat soft defense against undead/demons. */
export function classicDivineProtection(baseLevel: number, skillLevel: number): number {
  return skillLevel * integer(3 + (baseLevel + 1) * 0.04);
}

/** status.c:2219..2238; returns a 0..1 incoming damage multiplier.
 * Equipment element resistance shares the additive source element category;
 * dragon race resistance is a separate multiplicative category.
 */
export function classicIncomingSkillReduction(levels: Record<string, number>, race: string, element: string, equipmentElementResistancePct = 0): number {
  const skin = levels.BS_SKINTEMPER ?? 0;
  const elementResistance = equipmentElementResistancePct
    + (element.toLowerCase() === 'neutral' ? skin : element.toLowerCase() === 'fire' ? 4 * skin : element.toLowerCase() === 'holy' ? 5 * (levels.CR_TRUST ?? 0) : 0);
  const raceResistance = race.toLowerCase() === 'dragon' ? 4 * (levels.SA_DRAGONOLOGY ?? 0) : 0;
  return Math.max(0, 100 - elementResistance) / 100 * Math.max(0, 100 - raceResistance) / 100;
}

/** status.c:6128..6144; the pinned source explicitly orders enchantment precedence. */
export function classicWeaponElement(active: Record<string, number>, baseElement = 'neutral'): string {
  for (const [name, element] of [['SA_FROSTWEAPON', 'water'], ['SA_SEISMICWEAPON', 'earth'], ['SA_FLAMELAUNCHER', 'fire'], ['SA_LIGHTNINGLOADER', 'wind'], ['AS_ENCHANTPOISON', 'poison'], ['PR_ASPERSIO', 'holy']])
    if ((active[name] ?? 0) > 0) return element;
  return baseElement;
}

/** skill.c:8570..8587; chance is percent, duration includes caster/target DEX. */
export function classicStripChance(level: number, casterDex: number, targetDex: number): number {
  return Math.min(100, Math.max(5, 5 + 5 * level + integer((casterDex - targetDex) / 5)));
}
export function classicStripDuration(baseMs: number, casterDex: number, targetDex: number): number {
  return Math.max(0, baseMs + (casterDex - targetDex) * 500);
}

/** status.c:7981..7995, 4177, 4252, 4448. Never changes the catalog record. */
export function classicStrippedMonster(monster: Monster, activeStatuses: Iterable<string>): Monster {
  const active = new Set(activeStatuses);
  const clone: Monster = { ...monster, stats: { ...monster.stats }, attack: [...monster.attack] };
  if (active.has('SC_NOEQUIPWEAPON')) clone.attack = clone.attack.map(n => integer(n * 75 / 100)) as [number, number];
  if (active.has('SC_NOEQUIPARMOR')) clone.stats.vit -= integer(clone.stats.vit * 40 / 100);
  if (active.has('SC_NOEQUIPHELM')) clone.stats.int -= integer(clone.stats.int * 40 / 100);
  if (active.has('SC_NOEQUIPSHIELD')) clone.def -= integer(clone.def * 15 / 100);
  return clone;
}

/** Source ratios are percentages per damage calculation, before division fix. */
export function classicMagicDamage(stats: ClassicDamageStats, monster: Monster, skill: Skill, level: number, rng: () => number): number {
  const s = skill as ClassicSkill;
  if (s.implementation === 'unsupported' || s.damageType === 'none') return 0;
  const name = sourceOf(s);
  if (name === 'PR_MAGNUS' && !undead(monster) && monster.race.toLowerCase() !== 'demon' && monster.race.toLowerCase() !== 'undead') return 0;
  const element = s.ignoreElement ? 1 : stats.elementMultiplier ?? 1;
  if (element <= 0) return 0;
  let raw = randomExclusive(stats.magicAttack[0], stats.magicAttack[1], rng);
  if (name === 'PR_TURNUNDEAD') {
    if (!undead(monster)) return 0;
    const chance = Math.min(700, 20 * level + (stats.luk ?? 1) + (stats.int ?? 1) + (stats.baseLevel ?? 1) + 200 - integer(200 * (stats.targetHp ?? monster.hp) / monster.hp));
    raw = !stats.targetIsBoss && rng() * 1000 < chance ? stats.targetHp ?? monster.hp : (stats.baseLevel ?? 1) + (stats.int ?? 1) + 10 * level;
  }
  // NK_SPLASHSPLIT is applied to MATK before the ratio (battle.c:4166).
  if (s.splitDamage) raw = integer(raw / Math.max(1, stats.targetCount ?? 1));
  let ratio = atLevel(s.power, level, 100);
  if (name === 'MG_SOULSTRIKE' && undead(monster)) ratio += 5 * level;
  if (name !== 'PR_TURNUNDEAD') raw = integer(raw * ratio / 100);
  raw = integer(raw * (100 + (stats.magicPowerPercent ?? 0)) / 100);
  if (name === 'WZ_FIREPILLAR') raw += 100 + 50 * level;
  // IgnoreDefense removes hard MDEF only; soft MDEF remains (battle.c:1562).
  const hardMdef = s.ignoreDefense ? 0 : monster.mdef;
  const softMdef = monster.stats.int + integer(monster.stats.vit / 2);
  const mitigated = Math.max(1, integer(raw * (100 - hardMdef) / 100) - softMdef);
  const dragonBonus = monster.race.toLowerCase() === 'dragon' ? 4 * learned(stats, 'SA_DRAGONOLOGY') : 0;
  // Pre-renewal offensive card/race adjustment precedes division fix.
  const elemental = integer(integer(mitigated * element) * (100 + dragonBonus) / 100);
  // Positive NumberOfHits multiplies damage; negative counts only divide the
  // displayed damage into hits (battle.c:3994 and 4310).
  const hits = Math.max(1, atLevel(s.sourceHitCount, level, atLevel((s as Skill & { hitCount?: number[] }).hitCount, level, 1)));
  return Math.max(0, integer(elemental * hits * (100 + (stats.damagePercent ?? 0)) / 100));
}

function mastery(stats: ClassicDamageStats, monster: Monster): number {
  const type = stats.weaponType;
  let amount = 0;
  if (type === 'dagger' || type === 'sword' && !stats.twoHanded) amount += 4 * learned(stats, 'SM_SWORD');
  if (type === 'sword' && stats.twoHanded) amount += 4 * learned(stats, 'SM_TWOHAND');
  if (type === 'spear') amount += 4 * learned(stats, 'KN_SPEARMASTERY');
  if (type === 'axe') amount += 3 * learned(stats, 'AM_AXEMASTERY');
  if (type === 'mace') amount += 3 * learned(stats, 'PR_MACEMASTERY');
  if (!type) amount += 3 * learned(stats, 'MO_IRONHAND');
  if (type === 'instrument') amount += 3 * learned(stats, 'BA_MUSICALLESSON');
  if (type === 'whip') amount += 3 * learned(stats, 'DC_DANCINGLESSON');
  if (type === 'katar') amount += 3 * learned(stats, 'AS_KATAR');
  if (['brute', 'insect'].includes(monster.race.toLowerCase())) amount += 4 * learned(stats, 'HT_BEASTBANE');
  if (undead(monster) || monster.race.toLowerCase() === 'demon') amount += integer(learned(stats, 'AL_DEMONBANE') * (3 + (stats.baseLevel ?? 1) / 20));
  return amount;
}

function weaponBase(stats: ClassicDamageStats, rng: () => number): number {
  if (stats.weaponAttack === undefined || stats.baseAttack === undefined) return integer(stats.attack);
  let maximum = stats.weaponAttack;
  let minimum = Math.min(maximum, integer((stats.dex ?? 1) * (80 + (stats.weaponLevel ?? 1) * 20) / 100));
  if (stats.weaponType === 'bow') {
    minimum = integer(minimum * maximum / 100);
    maximum = Math.max(maximum, minimum);
  }
  const weapon = stats.critical || (stats.activeSkillsBySource?.BS_MAXIMIZE ?? 0) > 0 ? maximum : randomExclusive(minimum, maximum, rng);
  // Source size correction applies to weapon ATK, then adds status ATK.
  return integer(weapon * ((stats.activeSkillsBySource?.BS_WEAPONPERFECT ?? 0) > 0 ? 1 : stats.sizeMultiplier ?? 1)) + stats.baseAttack;
}

/** battle.c:calc_defense BF_WEAPON; monster VIT defense uses rnd(0,VIT/20²). */
function weaponDefense(raw: number, stats: ClassicDamageStats, monster: Monster, skill: ClassicSkill | undefined, rng: () => number): number {
  const name = skill ? sourceOf(skill) : '';
  if (stats.critical || skill?.ignoreDefense || name === 'MO_EXTREMITYFIST' || name === 'LK_SPIRALPIERCE') return Math.max(1, integer(raw));
  const vit = Math.max(1, monster.stats.vit);
  const spread = integer(vit / 20) ** 2;
  const defPercent = Math.max(0, stats.targetDefPercent ?? 100);
  // battle.c:1507..1511 scales the computed VIT defense and hard DEF once.
  const soft = integer((vit + (spread > 0 ? Math.floor(rng() * spread) : 0)) * defPercent / 100);
  const hard = name === 'AM_ACIDTERROR' ? 0 : Math.max(0, Math.min(100, integer(monster.def * defPercent / 100)));
  if (name === 'MO_INVESTIGATE') return Math.max(1, integer(raw * 2 * (hard + soft) / 100));
  return Math.max(1, integer(raw * (100 - hard) / 100) - soft);
}

/** Weapon and specific miscellaneous skill arithmetic; no generic magic fallback. */
export function classicPhysicalDamage(stats: ClassicDamageStats, monster: Monster, skill: Skill | undefined, level: number, rng: () => number): number {
  const s = skill as ClassicSkill | undefined;
  if (s?.implementation === 'unsupported' || s?.damageType === 'none') return 0;
  const name = s ? sourceOf(s) : '';
  if (name === 'PR_TURNUNDEAD') return classicMagicDamage(stats, monster, skill!, level, rng);
  const element = s?.ignoreElement ? 1 : stats.elementMultiplier ?? 1;
  if (element <= 0 && name !== 'ASC_BREAKER') return 0;
  let raw = weaponBase(stats, rng);
  let ratio = s ? atLevel(s.power, level, 100) : 100;
  let fixed = false;
  let neutralFixed = 0;
  let hits = s ? Math.max(1, atLevel(s.sourceHitCount, level, 1)) : 1;
  if (name === 'CR_GRANDCROSS') {
    const magic = randomExclusive(stats.magicAttack[0], stats.magicAttack[1], rng);
    const magical = Math.max(1, integer(magic * (100 - monster.mdef) / 100) - monster.stats.int - integer(monster.stats.vit / 2));
    const physical = weaponDefense(raw, stats, monster, undefined, rng)
      + (stats.weaponRefineAttack ?? 0) + mastery(stats, monster)
      + 2 * learned(stats, 'BS_WEAPONRESEARCH') + 3 * (stats.spiritSpheres ?? 0);
    const once = integer(magical * element) + integer(physical * element);
    return Math.max(0, integer(integer(once * element) * (100 + 40 * level) / 100));
  }
  switch (name) {
    case 'HT_LANDMINE': raw = integer(level * ((stats.dex ?? 1) + 75) * (100 + (stats.int ?? 1)) / 100); fixed = true; break;
    case 'HT_BLASTMINE': raw = integer(level * (integer((stats.dex ?? 1) / 2) + 50) * (100 + (stats.int ?? 1)) / 100); fixed = true; break;
    case 'HT_CLAYMORETRAP': raw = integer(level * (integer((stats.dex ?? 1) / 2) + 75) * (100 + (stats.int ?? 1)) / 100); fixed = true; break;
    case 'HT_BLITZBEAT':
    case 'SN_FALCONASSAULT': {
      raw = (integer((stats.dex ?? 1) / 10) + integer((stats.int ?? 1) / 2) + 3 * learned(stats, 'HT_STEELCROW') + 40) * 2;
      if (name === 'SN_FALCONASSAULT') { raw = integer(raw * 5 * (150 + 70 * level) / 100); hits = 1; }
      fixed = true; break;
    }
    case 'TF_THROWSTONE': raw = 50; fixed = true; break;
    case 'PA_PRESSURE': raw = 500 + 300 * level; fixed = true; break;
    case 'BA_DISSONANCE': raw = 30 + 10 * level + 3 * learned(stats, 'BA_MUSICALLESSON'); fixed = true; break;
    case 'HW_GRAVITATION': raw = 200 + 200 * level; fixed = true; break;
    case 'CR_ACIDDEMONSTRATION': {
      const intelligence = stats.int ?? 1;
      raw = integer(7 * monster.stats.vit * intelligence ** 2 / (10 * Math.max(1, monster.stats.vit + intelligence)));
      fixed = true; break;
    }
    case 'ASC_BREAKER': ratio = 100 * level; neutralFixed = 500 + Math.floor(rng() * 500) + 5 * level * (stats.int ?? 1); break;
    case 'MO_EXTREMITYFIST': ratio = Math.min(60000, 100 + 100 * (8 + integer((stats.sp ?? 0) / 10))); raw = integer(raw * ratio / 100) + 250 + 150 * level; ratio = 100; break;
    case 'LK_SPIRALPIERCE': raw = integer((stats.weaponWeight ?? 0) * 0.8); raw = integer(raw * (100 + 50 * level) / 100) + integer((stats.str ?? 1) / 10) ** 2; raw = integer(raw * (monster.size.toLowerCase() === 'small' ? 1.25 : monster.size.toLowerCase() === 'large' ? 0.75 : 1)); ratio = 100; break;
    case 'WS_CARTTERMINATION': ratio = 8000 * Math.max(0, Math.min(1, stats.cartWeightRatio ?? 0)) / (16 - level); break;
    case 'MC_CARTREVOLUTION': ratio = 150 + 100 * Math.max(0, Math.min(1, stats.cartWeightRatio ?? 0)); break;
    case 'CR_SHIELDBOOMERANG':
    case 'PA_SHIELDCHAIN': raw = (stats.baseAttack ?? stats.attack) + (stats.shieldWeight ?? 0); break;
    case 'HW_MAGICCRASHER': raw = raw - (stats.baseAttack ?? stats.attack) + stats.magicAttack[0]; break;
    case 'KN_PIERCE': hits = monster.size.toLowerCase() === 'small' ? 1 : monster.size.toLowerCase() === 'large' ? 3 : 2; break;
    case 'KN_BRANDISHSPEAR': if (level > 3) ratio += integer(ratio / 2); if (level > 6) ratio += integer((100 + 20 * level) / 4); if (level > 9) ratio += integer((100 + 20 * level) / 8); break;
    case 'RG_BACKSTAP': if (stats.weaponType === 'bow') ratio = integer(ratio / 2); break;
    case 'AS_SPLASHER': ratio += 20 * learned(stats, 'AS_POISONREACT'); break;
    case 'HT_POWER': ratio = 50 + 8 * (stats.str ?? 1); break;
  }
  // battle.c:4650 divides miscellaneous splash damage before element.
  if (s?.splitDamage) raw = integer(raw / Math.max(1, stats.targetCount ?? 1));
  if (fixed) return Math.max(0, integer(raw * hits * element * (100 + (stats.damagePercent ?? 0)) / 100));
  // Pre-renewal weapon division fix occurs BEFORE defense (battle.c:5822).
  raw = integer(raw * ratio / 100) * hits;
  if (name === 'AS_SONICBLOW' && learned(stats, 'AS_SONICACCEL')) raw += integer(raw * 10 / 100);
  raw = weaponDefense(raw, stats, monster, s, rng);
  if (!['MO_INVESTIGATE', 'MO_EXTREMITYFIST', 'CR_SHIELDBOOMERANG', 'PA_SHIELDCHAIN'].includes(name)) raw += (stats.weaponRefineAttack ?? 0) * (name === 'MO_FINGEROFFENSIVE' ? hits : 1);
  raw += mastery(stats, monster);
  raw += 2 * learned(stats, 'BS_WEAPONRESEARCH');
  if (stats.weaponType === 'katar' && name !== 'ASC_BREAKER' && learned(stats, 'ASC_KATAR')) raw += integer(raw * (10 + 2 * learned(stats, 'ASC_KATAR')) / 100);
  // Spirit spheres add flat attack after defense/masteries (battle.c:6124).
  if (!['MO_INVESTIGATE', 'MO_EXTREMITYFIST', 'CR_GRANDCROSS'].includes(name)) raw += 3 * hits * (name === 'MO_FINGEROFFENSIVE' ? stats.consumedSpheres ?? 0 : stats.spiritSpheres ?? 0);
  let weaponPart = Math.max(0, integer(raw * Math.max(0, element) * (100 + (stats.damagePercent ?? 0)) / 100));
  if (monster.race.toLowerCase() === 'dragon') weaponPart = integer(weaponPart * (100 + 4 * learned(stats, 'SA_DRAGONOLOGY')) / 100);
  return weaponPart + neutralFixed + (name === 'CR_SHIELDBOOMERANG' || name === 'PA_SHIELDCHAIN' ? 10 * (stats.shieldRefine ?? 0) : 0);
}

/** Exact source bonuses expressible with the shared Effects contract. */
export function classicSkillEffects(skill: Skill, level: number, attributes: Partial<Stats> & { maxHp?: number; maxSp?: number; jobId?: string; skillLevelsBySource?: Record<string, number> } = {}): Effects {
  const music = attributes.skillLevelsBySource?.BA_MUSICALLESSON ?? 0;
  const dance = attributes.skillLevelsBySource?.DC_DANCINGLESSON ?? 0;
  switch (sourceOf(skill)) {
    case 'AL_BLESSING': return { str: level, int: level, dex: level };
    case 'AL_INCAGI': return { agi: 2 + level };
    case 'MC_LOUD': return { str: 4 };
    case 'PR_IMPOSITIO': return { atk: 5 * level };
    case 'PR_GLORIA': return { luk: 30 };
    case 'AC_CONCENTRATION': return { agi: integer((attributes.agi ?? 0) * (2 + level) / 100), dex: integer((attributes.dex ?? 0) * (2 + level) / 100) };
    case 'KN_TWOHANDQUICKEN':
    case 'KN_ONEHAND':
    case 'BS_ADRENALINE':
    case 'BS_ADRENALINE2': return { aspd: 30 };
    case 'CR_SPEARQUICKEN': return { aspd: 20 + level };
    case 'BS_OVERTHRUST': return { damagePct: 5 * level };
    case 'WS_OVERTHRUSTMAX': return { damagePct: 20 * level };
    case 'LK_CONCENTRATION': return { hit: 10 * level, damagePct: 5 * level, defPct: -5 * level };
    case 'SN_SIGHT': return { str: 5, agi: 5, vit: 5, int: 5, dex: 5, luk: 5, hit: 3 * level, crit: level, damagePct: 2 * level };
    case 'SN_WINDWALK': return { flee: integer((level + 1) / 2) };
    case 'MO_EXPLOSIONSPIRITS': return { crit: (75 + 25 * level) / 10 };
    case 'BA_WHISTLE': return { flee: level + integer((attributes.agi ?? 0) / 10) + music, perfectDodge: integer((level + 1) / 2) + integer((attributes.luk ?? 0) / 10) + music };
    case 'BA_ASSASSINCROSS': return { aspd: 10 + level + integer((attributes.agi ?? 0) / 10) + integer(music / 2) };
    case 'BA_POEMBRAGI': return { castReductionPct: 3 * level + integer((attributes.dex ?? 0) / 10) + 2 * music, afterCastReductionPct: (level < 10 ? 3 * level : 50) + integer((attributes.int ?? 0) / 5) + 2 * music };
    case 'BA_APPLEIDUN': return { hpPct: 5 + 2 * level + integer((attributes.vit ?? 0) / 10) + music };
    case 'DC_HUMMING': return { hit: 2 * level + integer((attributes.dex ?? 0) / 10) + dance };
    case 'DC_FORTUNEKISS': return { crit: 10 + level + integer((attributes.luk ?? 0) / 10) + dance };
    case 'DC_SERVICEFORYOU': return { spPct: 15 + level + integer((attributes.int ?? 0) / 10) + integer(dance / 2), spCostReductionPct: 20 + 3 * level + integer((attributes.int ?? 0) / 10) + integer(dance / 2) };
    case 'AL_ANGELUS': return { softDefPct: 5 * level };
    case 'CR_AUTOGUARD': return { blockPct: Array.from({ length: level }, (_, i) => Math.max(1, 5 - integer(i / 2))).reduce((a, b) => a + b, 0) };
    case 'CR_REFLECTSHIELD': return { reflectPct: 10 + 3 * level };
    case 'LK_PARRYING': return { blockPct: 20 + 3 * level };
    case 'HP_ASSUMPTIO': return { physicalResistPct: 50 };
    case 'AC_OWL': return { dex: level };
    case 'AC_VULTURE': return { hit: level };
    case 'TF_MISS': return { flee: (['assassin', 'assassin_cross', 'rogue', 'stalker'].includes(attributes.jobId ?? '') ? 4 : 3) * level };
    case 'MO_DODGE': return { flee: integer(1.5 * level) };
    case 'BS_HILTBINDING': return { str: 1, atk: 4 };
    case 'BS_WEAPONRESEARCH': return { hit: 2 * level };
    case 'SA_DRAGONOLOGY': return { int: integer((level + 1) / 2) };
    case 'CR_TRUST': return { hp: 200 * level };
    case 'HW_SOULDRAIN': return { spPct: 2 * level };
    case 'HP_MEDITATIO': return { spPct: level };
    case 'HP_MANARECHARGE': return { spCostReductionPct: 4 * level };
    default: return {};
  }
}
