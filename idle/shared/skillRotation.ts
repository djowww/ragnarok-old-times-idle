import type { GameState } from "./types.js";

/** Return the configured map profile, inheriting the global order until a map gets its own profile. */
export function skillRotationForArea(
  state: Pick<GameState, "rotation" | "rotationByArea">,
  areaId: string | null | undefined,
): string[] {
  return areaId ? state.rotationByArea?.[areaId] ?? state.rotation : state.rotation;
}

/** Challenges and city encounters keep using the global rotation. */
export function automaticSkillRotation(
  state: Pick<GameState, "rotation" | "rotationByArea" | "status" | "areaId">,
): string[] {
  const areaId = state.status === "hunting" ? state.areaId : null;
  return skillRotationForArea(state, areaId);
}
