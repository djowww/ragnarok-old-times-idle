import type { Catalog, GameState } from "./types.js";
import { classSkills } from "../engine/stats.js";

/** Hercules pc_modifybuyvalue / pc_modifysellvalue, pre-renewal. */
export function merchantPrice(
  state: GameState,
  catalog: Catalog,
  base: number,
  kind: "buy" | "sell",
): number {
  const tree = new Set(classSkills(catalog, state.job));
  const learnedLevel = (source: string, sourceMax: number): number => {
    let highest = 0;
    for (const [id, level] of Object.entries(state.learnedSkills)) {
      const skill = catalog.skills[id];
      if (skill?.sourceName !== source || skill.implementation !== "supported" ||
          !tree.has(id) || !Number.isSafeInteger(level) || level <= 0 ||
          !Number.isSafeInteger(skill.maxLevel) || skill.maxLevel <= 0) continue;
      highest = Math.max(highest, Math.min(level, sourceMax, skill.maxLevel));
    }
    return highest;
  };
  const level = learnedLevel(kind === "buy" ? "MC_DISCOUNT" : "MC_OVERCHARGE", 10);
  const percent = level ? 5 + 2 * level - (level === 10 ? 1 : 0) : 0;
  // pc.c:4503-4523: Rogue's 9/13/17/21/25% replaces a smaller Merchant discount.
  const haggleLevel = kind === "buy" ? learnedLevel("RG_COMPULSION", 5) : 0;
  const appliedPercent = Math.max(percent, haggleLevel ? 5 + 4 * haggleLevel : 0);
  return Math.max(
    kind === "buy" || base > 0 ? 1 : 0,
    Math.floor((base * (100 + (kind === "buy" ? -appliedPercent : appliedPercent))) / 100),
  );
}
