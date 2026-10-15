import type { Catalog, GameState } from "./types.js";

/** Hercules pc_modifybuyvalue / pc_modifysellvalue, pre-renewal. */
export function merchantPrice(
  state: GameState,
  catalog: Catalog,
  base: number,
  kind: "buy" | "sell",
): number {
  const source = kind === "buy" ? "MC_DISCOUNT" : "MC_OVERCHARGE";
  const level = Math.min(
    10,
    Object.entries(state.learnedSkills).find(
      ([id]) => catalog.skills[id]?.sourceName === source,
    )?.[1] ?? 0,
  );
  const percent = level ? 5 + 2 * level - (level === 10 ? 1 : 0) : 0;
  return Math.max(
    base > 0 ? 1 : 0,
    Math.floor((base * (100 + (kind === "buy" ? -percent : percent))) / 100),
  );
}
