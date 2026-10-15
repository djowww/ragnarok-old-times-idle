import { manualItemProvoke } from '../shared/consumables.js';
import type {
  Catalog,
  DerivedStats,
  Effects,
  GameState,
  JobClass,
  Item,
  Stat,
} from "../shared/types.js";
import { classicBaseAttackAmotion, classicSkillEffects } from "./classic.js";
import { capPlayerAmotion, freeCastAmotionAfterAspdRate, playerAttackDelayFromAmotion } from './freeCastRules.js';
import { isItemIdentified, rarityBonus } from "../shared/loot.js";
import { defenderStats } from "./classicDefenses.js";
import { stanceStatModifiers } from "./soloStances.js";
import { autoBerserkModifiers } from "./reactiveSolo.js";
import { isPecoMounted, mountedCavalierPenalty } from './mountedPeco.js';
import { playerDiseaseModifiers } from './playerStatusRules.js';
import { activePlayerStatus } from './playerStatuses.js';
import { currentPlayerCast } from './playerCast.js';
import { inventoryCapacity } from './itemCapacity.js';
import { sageFieldModifiers } from './sageFields.js';
import { baseWeaponAttackMotion } from './weaponCadence.js';
export const statNames: Stat[] = ["str", "agi", "vit", "int", "dex", "luk"];
export const MAX_BASE_STAT = 99;
export function learnedFreeCastLevel(s: GameState, c: Catalog): number {
  for (const [id, learnedLevel] of Object.entries(s.learnedSkills)) {
    const skill = c.skills[id];
    if (skill?.sourceName !== 'SA_FREECAST') continue;
    if (skill.implementation === 'unsupported' || !classSkills(c, s.job).includes(id) ||
        !Number.isSafeInteger(learnedLevel) || learnedLevel < 1 || learnedLevel > skill.maxLevel)
      return 0;
    return learnedLevel;
  }
  return 0;
}
export function activeFreeCastLevel(s: GameState, c: Catalog, at: number): number {
  return currentPlayerCast(s, at) ? learnedFreeCastLevel(s, c) : 0;
}
/** Hercules pc.c:7161..7185, pre-renewal point cost from the current base stat. */
export function statPointCost(value: number, amount = 1): number {
  if (!Number.isSafeInteger(value) || value < 1 || value >= MAX_BASE_STAT ||
      !Number.isSafeInteger(amount) || amount < 1) return 0;
  let cost = 0;
  for (let n = value; n < Math.min(MAX_BASE_STAT, value + amount); n++)
    cost += 1 + Math.floor((n + 9) / 10);
  return cost;
}
function merge(target: Effects, source: Effects, multiplier = 1) {
  for (const key of Object.keys(source) as (keyof Effects)[])
    target[key] = (target[key] ?? 0) + (source[key] ?? 0) * multiplier;
}
export function classSkills(c: Catalog, jobId: string): string[] {
  // Current exports already resolve Hercules inheritance and exclusions.
  if (c.source.files.includes("db/pre-re/skill_tree.conf"))
    return [...new Set(c.classes[jobId]?.skills ?? [])];
  const seen = new Set<string>();
  const result = new Set<string>();
  function visit(id?: string) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const job = c.classes[id];
    if (!job) return;
    for (const skill of job.skills) result.add(skill);
    visit(job.parent);
    visit(job.rebirthOf);
  }
  visit(jobId);
  return [...result];
}
export function inventoryLoad(s: GameState, c: Catalog) {
  return inventoryCapacity(s, c);
}
export function derivedStats(s: GameState, c: Catalog): DerivedStats {
  const effects: Effects = {};
  const field = sageFieldModifiers(s, s.id, s.lastSimulatedAt);
  let equippedWeapon: Item | undefined;
  let weaponAttack = 0;
  let weaponRefineAttack = 0;
  let armorDef = 0;
  let armorRefineDef = 0;
  let weaponType: import("../shared/types.js").WeaponType | undefined;
  for (const uid of Object.values(s.equipment)) {
    const e = s.inventory.find((i) => i.uid === uid);
    if (!e || e.broken || !isItemIdentified(e)) continue;
    const item = c.items[e.itemId];
    if (!item) continue;
    merge(effects, item.effects);
    const bonus = rarityBonus(e);
    if (bonus) merge(effects, { [bonus.stat]: bonus.value });
    for (const cardId of e.cards)
      if (c.items[cardId]) merge(effects, c.items[cardId].effects);
    if (item.slot === "weapon") {
      equippedWeapon = item;
      weaponAttack += item.attack;
      weaponRefineAttack +=
        e.refine * ([2, 3, 5, 7][(item.weaponLevel ?? 1) - 1] ?? 2);
      weaponType = item.weaponType;
    } else {
      armorDef += item.def;
      // refine_db.conf:78 and status.c:1667,1725: aggregate hundredths first.
      armorRefineDef += e.refine * 66;
    }
  }
  armorDef += Math.floor((armorRefineDef + 50) / 100);
  weaponAttack += field.weaponAttack;
  const job = c.classes[s.job];
  for (const stat of statNames)
    effects[stat] =
      (effects[stat] ?? 0) + (job.jobBonuses?.[stat]?.[s.jobLevel - 1] ?? 0);
  for (const [id, level] of Object.entries(s.learnedSkills)) {
    const skill = c.skills[id];
    if (skill?.kind === "passive" && skill.implementation !== "unsupported" &&
        (skill.sourceName !== "SA_ADVANCEDBOOK" || classSkills(c, s.job).includes(id)))
      merge(
        effects,
        skill.sourceName
          ? classicSkillEffects(skill, level, { ...s.stats, jobId: s.job, weaponType })
          : (skill.effects ?? {}),
        skill.sourceName ? 1 : level,
      );
  }
  for (const buff of Object.values(s.buffs))
    if (buff.expiresAt > s.lastSimulatedAt) merge(effects, buff.effects);
  const defender = Object.entries(s.buffs).find(([id, buff]) =>
    c.skills[id]?.sourceName === "CR_DEFENDER" && buff.expiresAt > s.lastSimulatedAt);
  if (defender) effects.aspd = (effects.aspd ?? 0) - defenderStats(
    s.combatEffects?.buffLevels?.[defender[0]] ?? s.learnedSkills[defender[0]] ?? 1, 150, 0).aspdRate / 10;
  const stance = (source: 'MO_STEELBODY' | 'LK_BERSERK') => Object.entries(s.buffs)
    .some(([id, buff]) => c.skills[id]?.sourceName === source && buff.expiresAt > s.lastSimulatedAt);
  const steel = stance('MO_STEELBODY'), berserk = stance('LK_BERSERK');
  if (steel) effects.aspd = (effects.aspd ?? 0) - stanceStatModifiers('MO_STEELBODY').aspdRateDelta / 10;
  if (berserk) effects.aspd = (effects.aspd ?? 0) - stanceStatModifiers('LK_BERSERK').aspdRateDelta / 10;
  // status.c:2148,3398..3401: mount adds to the combined rate before motion multiplication.
  const mountPenalty = mountedCavalierPenalty(s, c);
  if (mountPenalty) effects.aspd = (effects.aspd ?? 0) - mountPenalty;
  const a = Object.fromEntries(
    statNames.map((stat) => [stat, s.stats[stat] + (effects[stat] ?? 0)]),
  ) as Record<Stat, number>;
  const hpBase = job.hp[Math.min(s.baseLevel - 1, job.hp.length - 1)] ?? 40;
  const spBase = job.sp[Math.min(s.baseLevel - 1, job.sp.length - 1)] ?? 10;
  const spPercent = effects.spPct ?? 0;
  const ranged = ["bow", "instrument", "whip"].includes(weaponType ?? "");
  const main = ranged ? a.dex : a.str;
  const secondary = ranged ? a.str : a.dex;
  // status.c:3782..3839: bows, instruments and whips use DEX as primary ATK.
  const baseAttack = main + Math.floor(main / 10) ** 2 +
    Math.floor(secondary / 5) + Math.floor(a.luk / 5) + (effects.atk ?? 0);
  const baseAttackAmotion = classicBaseAttackAmotion(
    baseWeaponAttackMotion(job, equippedWeapon),
    a.agi,
    a.dex,
  );
  const sourceAspdRate = Math.max(0, Math.min(32767, Math.trunc((100 - (effects.aspd ?? 0)) * 10)));
  const freeCastLevel = activeFreeCastLevel(s, c, s.lastSimulatedAt);
  const amotionAfterFreeCast = freeCastAmotionAfterAspdRate(
    baseAttackAmotion, sourceAspdRate, freeCastLevel, freeCastLevel > 0,
  );
  // The supported runtime folds current fixed ASPD effects into effects.aspd;
  // apply the remaining source calc_fix_aspd bounds before the PC-specific cap.
  const amotionAfterFixedAspd = Math.max(0, Math.min(2000, amotionAfterFreeCast));
  const attackMotionMs = capPlayerAmotion(amotionAfterFixedAspd, job.minimumAttackMotionMs ?? 100);
  const attackIntervalMs = playerAttackDelayFromAmotion(attackMotionMs);
  const softMdef = a.int + Math.floor(a.vit / 2);
  const ordinaryMaxHp = Math.max(1, Math.floor(
    (Math.floor(hpBase * (1 + a.vit / 100)) + (effects.hp ?? 0)) * (1 + (effects.hpPct ?? 0) / 100)));
  const maxHp = (berserk ? 3 : 1) * (ordinaryMaxHp + Math.trunc(ordinaryMaxHp * field.hpPercent / 100));
  // A pure projection reconciles every HP/maxHP change, without saved stale bonuses.
  const reactive = autoBerserkModifiers({ enabled: Object.entries(s.buffs).some(([id, buff]) =>
    c.skills[id]?.sourceName === 'SM_AUTOBERSERK' && buff.expiresAt > s.lastSimulatedAt), hp: s.hp, maxHp, provoke: manualItemProvoke(s,s.lastSimulatedAt) });
  const poisoned = activePlayerStatus(s, 'SC_POISON', s.lastSimulatedAt) || activePlayerStatus(s, 'SC_DPOISON', s.lastSimulatedAt);
  const blind = activePlayerStatus(s, 'SC_BLIND', s.lastSimulatedAt);
  const disease = playerDiseaseModifiers({ poison: poisoned, blind });
  const sourceDefensePercent = Math.max(0, reactive.sourceDefensePercent + (effects.softDefPct ?? 0) - disease.defReductionPercent);
  return {
    maxHp,
    sourceAttackPercent: reactive.sourceAttackPercent,
    sourceDefensePercent,
    maxSp: Math.max(
      1,
      Math.floor(
        (Math.floor(spBase * (1 + a.int / 100)) + (effects.sp ?? 0)) *
          (1 + spPercent / 100),
      ),
    ),
    attack: Math.max(1, baseAttack + weaponAttack + weaponRefineAttack),
    magicAttack: [
      a.int + Math.floor(a.int / 7) ** 2 + (effects.matk ?? 0),
      a.int + Math.floor(a.int / 5) ** 2 + (effects.matk ?? 0),
    ],
    def: berserk ? 0 : steel ? 90 : Math.floor(
      (armorDef + (effects.def ?? 0)) * (1 + (effects.defPct ?? 0) / 100),
    ),
    mdef: berserk ? 0 : softMdef + (steel ? 90 : (effects.mdef ?? 0)),
    hit: (() => { const value = s.baseLevel + a.dex + (effects.hit ?? 0); return value - Math.trunc(value * disease.hitReductionPercent / 100); })(),
    flee: (() => { const value = s.baseLevel + a.agi + (effects.flee ?? 0) + field.flee;
      const reduced = berserk ? value - Math.trunc(value * .5) : value;
      return reduced - Math.trunc(reduced * disease.fleeReductionPercent / 100); })(),
    // status.c:3941,3946 retain tenths; clif truncates only the displayed value.
    crit: (10 + Math.floor(a.luk * 10 / 3)) / 10 + (effects.crit ?? 0),
    perfectDodge: (a.luk + 10) / 10 + (effects.perfectDodge ?? 0),
    attackMotionMs,
    attackIntervalMs,
    aspd: 200 - attackIntervalMs / 20,
    effects,
    attributes: a,
    baseAttack,
    weaponAttack,
    weaponRefineAttack,
    softDef: berserk ? 0 : Math.floor(a.vit * sourceDefensePercent / 100),
    hardMdef: berserk ? 0 : steel ? 90 : effects.mdef ?? 0,
    softMdef: berserk ? 0 : softMdef,
  };
}
export function clampResources(s: GameState, c: Catalog) {
  const d = derivedStats(s, c);
  s.hp = Math.max(0, Math.min(s.hp, d.maxHp));
  s.sp = Math.max(0, Math.min(s.sp, d.maxSp));
}
export function healFull(s: GameState, c: Catalog) {
  const d = derivedStats(s, c);
  s.hp = d.maxHp;
  s.sp = d.maxSp;
}
export function availableClasses(s: GameState, c: Catalog): string[] {
  if (s.status !== "town") return [];
  const current = c.classes[s.job];
  return Object.values(c.classes)
    .filter((next: JobClass) => {
      if (
        next.tier === 0 ||
        next.id === s.job ||
        (next.gender && next.gender !== s.gender) ||
        s.jobLevel < next.minJobLevel
      )
        return false;
      if (current.tier === 0)
        return (
          next.tier === 1 &&
          next.trans === s.reborn &&
          (!s.reborn || next.family === s.family) &&
          (next.parent === current.id ||
            (s.reborn &&
              next.rebirthOf &&
              c.classes[next.rebirthOf]?.tier === 1))
        );
      if (
        current.tier !== 1 ||
        next.tier !== 2 ||
        next.trans !== s.reborn ||
        next.family !== current.family
      )
        return false;
      if (
        next.parent !== current.id &&
        !(
          s.reborn &&
          next.rebirthOf &&
          c.classes[next.rebirthOf]?.parent === current.rebirthOf
        )
      )
        return false;
      return (
        !s.reborn ||
        next.rebirthOf === s.branch ||
        (!next.rebirthOf && next.id === s.branch)
      );
    })
    .map((j) => j.id);
}
