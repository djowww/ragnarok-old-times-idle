/** Hercules pre-renewal 410b9738c049ab1825d67b36b072d837c1d0b33a.
 * db/pre-re/skill_db.conf:4067..4405, skill.c:1789..1805,14401..14500.
 * Ground placement/scheduling, status conflicts and knockback collision remain caller-owned.
 */
import type { Monster } from '../shared/types.js';
import { classicStatusResistance, type ClassicStatusSource } from './classicStatuses.js';

export type HunterTrapSkill = 'HT_SKIDTRAP' | 'HT_ANKLESNARE' | 'HT_SANDMAN' | 'HT_FLASHER' | 'HT_SHOCKWAVE';
export function isHunterTrapSkill(id: string): id is HunterTrapSkill {
  return id === 'HT_SKIDTRAP' || id === 'HT_ANKLESNARE' || id === 'HT_SANDMAN' || id === 'HT_FLASHER' || id === 'HT_SHOCKWAVE';
}
export function hunterTrapSpec(id: HunterTrapSkill, level: number, sourceDurationMs?: number) {
  const lv = Math.max(1, Math.min(5, Math.trunc(level)));
  const shockwaveDuration = [200000, 160000, 120000, 80000, 40000][lv - 1];
  const lifetimeMs = id === 'HT_SHOCKWAVE'
    ? (sourceDurationMs && sourceDurationMs > 0 ? sourceDurationMs : shockwaveDuration)
    : (6 - lv) * (id === 'HT_SKIDTRAP' ? 60000 : id === 'HT_ANKLESNARE' ? 50000 : 30000);
  return {
    lifetimeMs, triggerRadius: 1, intervalMs: 1000, usedLifetimeMs: 1500,
    splashRadius: id === 'HT_SHOCKWAVE' ? 1 : id === 'HT_SANDMAN' ? 2 : id === 'HT_FLASHER' ? 1 : 0,
    spDrainPct: id === 'HT_SHOCKWAVE' ? 15 * lv + 5 : 0,
    knockbackTiles: id === 'HT_SKIDTRAP' ? 5 + lv : 0,
    statusDurationMs: id === 'HT_ANKLESNARE' ? 4000 * lv : id === 'HT_SANDMAN' ? 10000 + 2000 * lv : id === 'HT_FLASHER' ? 9000 + 1000 * lv : 0,
    chancePct: id === 'HT_SANDMAN' ? 40 + 10 * lv : id === 'HT_FLASHER' ? 30 + 10 * lv : 100,
  };
}
/** Geometry only: lifecycle, enemy eligibility and timer cadence are caller-owned. */
export function hunterTrapWithinRange(a: {x: number; y: number}, b: {x: number; y: number}, radius: number): boolean {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= radius;
}
/** SCFLAG_FIXEDRATE ankle: boss /5, AGI duration resistance, then minimum 5s.
 * status.c:7023..7027,7189..7200. It blocks walking, permits attacks.
 */
export function hunterTrapStatus(monster: Monster, id: HunterTrapSkill, level: number, source: ClassicStatusSource) {
  const spec = hunterTrapSpec(id, level);
  if (id === 'HT_SKIDTRAP' || id === 'HT_SHOCKWAVE') return undefined;
  if (id === 'HT_ANKLESNARE') {
    let duration = monster.boss ? Math.trunc(spec.statusDurationMs / 5) : spec.statusDurationMs;
    duration -= Math.trunc(duration * Math.min(monster.stats.agi * 50, 10000) / 10000);
    return { status: 'SC_ANKLESNARE' as const, chancePct: 100, durationMs: Math.max(5000, duration), blocksWalk: true, blocksAttack: false };
  }
  const status = id === 'HT_SANDMAN' ? 'SC_SLEEP' : 'SC_BLIND';
  return { status, ...classicStatusResistance(monster, status, spec.chancePct, spec.statusDurationMs, source), blocksWalk: id === 'HT_SANDMAN', blocksAttack: id === 'HT_SANDMAN' };
}
