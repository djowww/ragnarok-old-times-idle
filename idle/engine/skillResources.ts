import type { Catalog, GameState, Skill } from "../shared/types.js";
import { consume } from "./state.js";
import { derivedStats } from "./stats.js";
import { classicBuffActive, sphereCostForSkill } from "./classicBuffs.js";

const value = (values: number[] | undefined, level: number) =>
  values?.[level - 1] ?? values?.at(-1) ?? 0;
function skillResourceCosts(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  at: number,
) {
  if (
    !Number.isSafeInteger(level) ||
    level < 1 ||
    level > skill.maxLevel ||
    !Number.isFinite(at)
  )
    return undefined;
  const source = (skill.sourceName ?? skill.mechanic ?? skill.id).toUpperCase();
  // skill_get_requirement returns an empty requirement when switching these off.
  if (
    (skill.toggle ||
      ["TF_HIDING", "AS_CLOAKING", "BS_MAXIMIZE"].includes(source)) &&
    classicBuffActive(s, c, source, at)
  )
    return {
      sp: 0,
      zeny: 0,
      hp: 0,
      spheres: 0,
      quantities: new Map<number, number>(),
    };
  // Stats are evaluated at the caller's time without changing simulation state.
  const d = derivedStats(
    at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at },
    c,
  );
  const sp = Math.max(
    0,
    Math.floor(
      value(skill.spCost, level) *
        (1 - Math.min(100, d.effects.spCostReductionPct ?? 0) / 100),
    ),
  );
  const baseZeny = value(skill.zenyCost, level);
  const unfairlyTrick = source === 'MC_MAMMONITE' && Object.entries(s.learnedSkills).some(([id, learned]) =>
    learned > 0 && c.skills[id]?.sourceName === 'BS_UNFAIRLYTRICK' && c.skills[id].implementation === 'supported');
  // skill.c:17398..17400: subtract the truncated discount, not truncate 90%.
  const zeny = baseZeny - (unfairlyTrick ? Math.trunc(baseZeny * .1) : 0),
    hp =
      value(skill.hpCost, level) +
      Math.floor((s.hp * (skill.hpCostPercent ?? 0)) / 100);
  const spheres = sphereCostForSkill(s, c, skill, level, at);
  const costs =
    skill.itemCostByLevel?.[level - 1] ??
    (skill.itemCost ? [skill.itemCost] : []);
  const quantities = new Map<number, number>();
  for (const cost of costs)
    quantities.set(
      cost.itemId,
      (quantities.get(cost.itemId) ?? 0) + cost.quantity,
    );
  return { sp, zeny, hp, spheres, quantities };
}

function hasSkillResources(
  s: GameState,
  costs: ReturnType<typeof skillResourceCosts>,
): costs is NonNullable<ReturnType<typeof skillResourceCosts>> {
  if (
    !costs ||
    s.sp < costs.sp ||
    s.zeny < costs.zeny ||
    s.hp <= costs.hp ||
    (s.combatEffects?.spiritSpheres ?? 0) < costs.spheres
  )
    return false;
  for (const [id, quantity] of costs.quantities)
    if (
      s.inventory
        .filter((e) => e.itemId === id)
        .reduce((n, e) => n + e.quantity, 0) < quantity
    )
      return false;
  return true;
}

/** Read-only eligibility for the rotation chooser; includes all HP/item costs. */
export function canPaySkillResources(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  at = s.lastSimulatedAt,
): boolean {
  return hasSkillResources(s, skillResourceCosts(s, c, skill, level, at));
}

/** Revalidates and consumes at cast end; failed or interrupted casts pay nothing. */
export function paySkillResources(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  at = s.lastSimulatedAt,
): boolean {
  const costs = skillResourceCosts(s, c, skill, level, at);
  if (!hasSkillResources(s, costs)) return false;
  paySkillBaseCosts(s, costs);
  paySkillItemCosts(s, costs);
  return true;
}

/**
 * Validates every cost up front, pays non-item costs, runs one synchronous
 * handler, then consumes item requirements even when the handler reports a
 * normal source failure. Callers must keep the handler local and synchronous.
 */
export function runSkillResourcePhases<T>(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  at: number,
  handler: () => T,
): { paid: false } | { paid: true; result: T } {
  const costs = skillResourceCosts(s, c, skill, level, at);
  if (!hasSkillResources(s, costs)) return { paid: false };
  paySkillBaseCosts(s, costs);
  const result = handler();
  paySkillItemCosts(s, costs);
  return { paid: true, result };
}

function paySkillBaseCosts(s: GameState, costs: NonNullable<ReturnType<typeof skillResourceCosts>>) {
  s.sp -= costs.sp;
  s.zeny -= costs.zeny;
  s.hp -= costs.hp;
  (s.combatEffects ??= {}).consumedSpheres = costs.spheres;
  s.combatEffects.spiritSpheres = Math.max(
    0,
    (s.combatEffects.spiritSpheres ?? 0) - costs.spheres,
  );
}

function paySkillItemCosts(s: GameState, costs: NonNullable<ReturnType<typeof skillResourceCosts>>) {
  for (const [id, quantity] of costs.quantities) {
    let left = quantity;
    for (const entry of [...s.inventory])
      if (entry.itemId === id && left) {
        const used = Math.min(left, entry.quantity);
        consume(s, entry, used);
        left -= used;
      }
  }
}
