export interface BackslidingMotion {
  origin: { x: number; y: number };
  destination: { x: number; y: number };
  startedAt: number;
  nativePlaybackMs: number;
}

/** Straight visual interpolation over the skill actor's native ACT playback window. */
export function backslidingPresentationPoint(motion: BackslidingMotion, now: number) {
  const progress = Math.max(0, Math.min(1,
    (now - motion.startedAt) / Math.max(1, motion.nativePlaybackMs)));
  return {
    x: motion.origin.x + (motion.destination.x - motion.origin.x) * progress,
    y: motion.origin.y + (motion.destination.y - motion.origin.y) * progress,
  };
}

/** Capture the sprite octant from the action-time GAT facing and map projection. */
export function backslidingFacingDirection(origin: { x: number; y: number }, facing: { x: number; y: number },
  project?: (point: { x: number; y: number }) => { x: number; y: number }): number {
  const target = { x: origin.x + facing.x / 12, y: origin.y + facing.y / 12 };
  const from = project ? project(origin) : { x: 0, y: 0 };
  const to = project ? project(target) : { x: facing.x, y: -facing.y };
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return (6 + Math.round(angle / (Math.PI / 4)) + 8) % 8;
}
