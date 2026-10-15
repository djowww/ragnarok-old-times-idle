/** Impact stays shared with HP and loot; this record owns only the death pose. */
export interface CorpsePresentation {
  deadAt?: number;
  until?: number;
  deathPaintAt?: number;
  deathCanvas?: boolean;
}
export function shiftCorpsePresentation(clock: CorpsePresentation, delta: number) {
  if (clock.deadAt !== undefined) clock.deadAt += delta;
  if (clock.until !== undefined) clock.until += delta;
  if (clock.deathPaintAt !== undefined) clock.deathPaintAt += delta;
}
export function startCorpsePresentation(clock: CorpsePresentation, impact: number) {
  if (clock.deadAt !== undefined) return;
  clock.deadAt = impact;
  clock.until = impact + 2000;
}
export function corpseFrameAt(clock: CorpsePresentation, now: number, duration: number, nativeReady: boolean) {
  if (clock.deadAt === undefined || now < clock.deadAt || now >= (clock.until ?? 0)) return undefined;
  if (clock.deathPaintAt === undefined) {
    clock.deathPaintAt = now;
    clock.deathCanvas = !nativeReady;
    clock.until = now + Math.max(1500, (Number.isFinite(duration) ? Math.max(0,duration) : 0) + 150);
  }
  return { elapsed: now - clock.deathPaintAt, canvasOnly: clock.deathCanvas === true };
}
