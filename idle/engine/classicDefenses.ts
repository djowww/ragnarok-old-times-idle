/** Hercules pre-re, 410b9738c049ab1825d67b36b072d837c1d0b33a.
 * Ground coverage and status arithmetic translated from skill.c/status.c/battle.c.
 * GPL-3.0-or-later. Runtime owners must persist these statuses and ground cells.
 */
export interface DefenseCell { x: number; y: number }
export interface DefenseAttack { long?: boolean; weapon?: boolean; magic?: boolean; skillSource?: string }
export interface PneumaGround { cells: DefenseCell[]; expiresAt: number }
export interface DefenderStatus { level: number; expiresAt: number }
export interface EndureStatus { level: number; charges: number; expiresAt: number; infinite?: boolean }
const levelOf = (level: number, max: number) => Math.min(max, Math.max(1, Math.trunc(level)));
const sameCell = (a: DefenseCell, b: DefenseCell) => a.x === b.x && a.y === b.y;

/** SOLO auto-target chooses the caster's cell once; this group never follows movement.
 * Default UF_NOREITERATION checks the entire layout before placement
 * (skill.c:12082,4153,4098), including existing Pneuma/Safety Wall cells.
 * Reachability clipping belongs to the field owner, skill.c:13800.
 */
export function createPneuma(center: DefenseCell, at: number, occupied: DefenseCell[] = []): PneumaGround | undefined {
  const cells: DefenseCell[] = [];
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) cells.push({ x: center.x + x, y: center.y + y });
  if (cells.some(cell => occupied.some(other => sameCell(cell, other)))) return undefined;
  return { cells, expiresAt: at + 10000 };
}
/** battle.c:3253 checks BF_LONG without BF_MAGIC, including ranged physical skills. */
export function pneumaBlocks(ground: PneumaGround | undefined, target: DefenseCell, at: number, attack: DefenseAttack): boolean {
  return !!ground && ground.expiresAt > at && ground.cells.some(cell => sameCell(cell, target))
    && !!attack.long && !attack.magic && attack.skillSource !== 'SP_SOULEXPLOSION';
}
/** Apply after Assumptio, before Adjustment/Fog Wall and minimum damage. */
export function defenderDamage(damage: number, level: number, attack: DefenseAttack): number {
  return level > 0 && attack.long && attack.weapon
    ? Math.trunc(damage * (100 - (5 + 15 * levelOf(level, 5))) / 100) : damage;
}
/** ASPD rate is an additive per-mille delay rate, not a flat ASPD point penalty. */
export function defenderStats(level: number, cellSpeedMs: number, aspdRate: number) {
  return level > 0 ? { cellSpeedMs: Math.max(cellSpeedMs, 200), aspdRate: aspdRate + 250 - 50 * levelOf(level, 5) }
    : { cellSpeedMs, aspdRate };
}
export function toggleDefender(current: DefenderStatus | undefined, level: number, at: number): DefenderStatus | undefined {
  if (current && current.expiresAt > at) return undefined;
  return { level: levelOf(level, 5), expiresAt: at + 180000 };
}
export function createEndure(level: number, at: number): EndureStatus {
  const lv = levelOf(level, 10);
  return { level: lv, charges: 7, expiresAt: at + 10000 + 3000 * (lv - 1) };
}
export function endureMdef(status: EndureStatus | undefined, at: number): number {
  return status && status.expiresAt > at ? status.infinite ? 1 : status.level : 0;
}
/** status.c:338 decrements once per damaging status application and ends at <0.
 * Boss attackers still consume the player's charges. Player hits/GvG/BG do not.
 */
export function endureHit(status: EndureStatus | undefined, at: number, input: {
  damage: number; sourcePlayer?: boolean; gvg?: boolean; battleground?: boolean; concentration?: boolean;
}): EndureStatus | undefined {
  if (!status || status.expiresAt <= at) return undefined;
  if (input.damage <= 0 || input.sourcePlayer || input.gvg || input.battleground || input.concentration || status.infinite) return status;
  const charges = status.charges - 1;
  return charges < 0 ? undefined : { ...status, charges };
}
/** Capture motion before consuming a hit; boss targets always have zero dmotion. */
export function defenseHitMotion(motion: number, status: EndureStatus | undefined, at: number,
  flags: { targetBoss?: boolean; gvg?: boolean; battleground?: boolean } = {}): number {
  if (flags.targetBoss) return 0;
  if (!flags.gvg && !flags.battleground && status && status.expiresAt > at) return 0;
  return Math.max(0, Math.min(65535, Math.trunc(motion)));
}
