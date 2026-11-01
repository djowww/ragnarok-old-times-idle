export const jointBeatParts = ['ankle', 'wrist', 'knee', 'shoulder', 'waist', 'neck'] as const;
export type { JointBeatPart } from '../shared/types.js';
import type { JointBeatPart } from '../shared/types.js';

const skillLevel = (level: number) => Math.max(1, Math.min(10, Math.floor(Number.isFinite(level) ? level : 1)));

/** Selects the six flags in Hercules skill.c order. */
export function chooseJointBeatPart(roll: number): JointBeatPart {
  const normalized = Number.isFinite(roll) ? Math.max(0, Math.min(1 - Number.EPSILON, roll)) : 0;
  return jointBeatParts[Math.floor(normalized * jointBeatParts.length)];
}

/** Percent ratio passed to the normal pre-renewal weapon calculation. */
export function jointBeatDamagePercent(level: number, part: JointBeatPart): number {
  const bonus = 10 * skillLevel(level) - 50;
  return 100 + bonus * (part === 'neck' ? 2 : 1);
}

export function jointBeatStatusChancePercent(level: number): number {
  return 5 + 5 * skillLevel(level);
}

export function mergeJointBeatParts(existing: readonly JointBeatPart[], next: JointBeatPart): JointBeatPart[] {
  return existing.includes(next) ? [...existing] : [...existing, next];
}
