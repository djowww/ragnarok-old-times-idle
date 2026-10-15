import type {
  Catalog,
  DerivedStats,
  Effects,
  GameState,
  JobClass,
  Stat,
} from "../shared/types.js";
import { classicAttackInterval, classicSkillEffects } from "./classic.js";
import { isItemIdentified, rarityBonus } from "../shared/loot.js";
export const statNames: Stat[] = ["str", "agi", "vit", "int", "dex", "luk"];
export const MAX_BASE_STAT = 99;
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
  const weight = s.inventory.reduce(
    (total, entry) => total + (c.items[entry.itemId]?.weight ?? 0) * entry.quantity,
    0,
  );
  let carryLevel = 0;
  for (const [id, level] of Object.entries(s.learnedSkills)) {
    const skill = c.skills[id];
    if (skill?.implementation !== "unsupported" &&
        ["MC_INCCARRY", "ALL_INCCARRY"].includes(skill?.sourceName ?? ""))
      carryLevel += Math.max(0, Math.min(skill.maxLevel, Math.floor(level)));
  }
  // Exported item and job weights use Hercules Weight / 10.
  const maxWeight = (c.classes[s.job]?.baseWeight ?? 2000) + s.stats.str * 30 + 200 * carryLevel;
  return { weight, maxWeight, recoveryBlocked: weight * 2 >= maxWeight };
}
export function derivedStats(s: GameState, c: Catalog): DerivedStats {
  const effects: Effects = {};
  let weaponAttack = 0;
  let weaponRefineAttack = 0;
  let armorDef = 0;
  let armorRefineDef = 0;
  let weaponType: string | undefined;
  for (const uid of Object.values(s.equipment)) {
    const e = s.inventory.find((i) => i.uid === uid);
    if (!e || !isItemIdentified(e)) continue;
    const item = c.items[e.itemId];
    if (!item) continue;
    merge(effects, item.effects);
    const bonus = rarityBonus(e);
    if (bonus) merge(effects, { [bonus.stat]: bonus.value });
    for (const cardId of e.cards)
      if (c.items[cardId]) merge(effects, c.items[cardId].effects);
    if (item.slot === "weapon") {
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
  const job = c.classes[s.job];
  for (const stat of statNames)
    effects[stat] =
      (effects[stat] ?? 0) + (job.jobBonuses?.[stat]?.[s.jobLevel - 1] ?? 0);
  for (const [id, level] of Object.entries(s.learnedSkills)) {
    const skill = c.skills[id];
    if (skill?.kind === "passive" && skill.implementation !== "unsupported")
      merge(
        effects,
        skill.sourceName
          ? classicSkillEffects(skill, level, { ...s.stats, jobId: s.job })
          : (skill.effects ?? {}),
        skill.sourceName ? 1 : level,
      );
  }
  for (const buff of Object.values(s.buffs))
    if (buff.expiresAt > s.lastSimulatedAt) merge(effects, buff.effects);
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
  const attackIntervalMs = classicAttackInterval(
    job.weaponAspd?.[weaponType as keyof typeof job.weaponAspd] ??
      job.weaponAspd?.unarmed ?? 1000,
    a.agi,
    a.dex,
    effects.aspd ?? 0,
  );
  const softMdef = a.int + Math.floor(a.vit / 2);
  return {
    maxHp: Math.max(
      1,
      Math.floor(
        (Math.floor(hpBase * (1 + a.vit / 100)) + (effects.hp ?? 0)) *
          (1 + (effects.hpPct ?? 0) / 100),
      ),
    ),
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
    def: Math.floor(
      (armorDef + (effects.def ?? 0)) * (1 + (effects.defPct ?? 0) / 100),
    ),
    mdef: softMdef + (effects.mdef ?? 0),
    hit: s.baseLevel + a.dex + (effects.hit ?? 0),
    flee: s.baseLevel + a.agi + (effects.flee ?? 0),
    // status.c:3941,3946 retain tenths; clif truncates only the displayed value.
    crit: (10 + Math.floor(a.luk * 10 / 3)) / 10 + (effects.crit ?? 0),
    perfectDodge: (a.luk + 10) / 10 + (effects.perfectDodge ?? 0),
    attackIntervalMs,
    aspd: 200 - attackIntervalMs / 20,
    effects,
    attributes: a,
    baseAttack,
    weaponAttack,
    weaponRefineAttack,
    softDef: Math.floor(a.vit * (1 + (effects.softDefPct ?? 0) / 100)),
    hardMdef: effects.mdef ?? 0,
    softMdef,
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
