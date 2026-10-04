import type { Catalog, GameState } from "../shared/types.js";
import { derivedStats, inventoryLoad } from "./stats.js";
import { classicBuffActive } from "./classicBuffs.js";
import { fieldHeroWalking } from "../shared/battleSpatial.js";

const recoverySkills = new Set([
  "SM_RECOVERY",
  "MG_SRECOVERY",
  "SM_MOVINGRECOVERY",
  "HP_MEDITATIO",
  "MC_INCCARRY",
  "ALL_INCCARRY",
]);
const legacyNames: Record<string, string> = {
  hp_recovery: "SM_RECOVERY",
  sp_recovery: "MG_SRECOVERY",
};

/** Hercules pre-renewal status.c:status_calc_regen_pc / status_natural_heal. */
export function recoverResources(
  s: GameState,
  c: Catalog,
  at: number,
  elapsedMs = 1000,
): void {
  if (!Number.isFinite(at) || !Number.isFinite(elapsedMs) || elapsedMs <= 0)
    return;
  // The idle engine owns its accelerated town and death recovery separately.
  if (s.status !== "hunting" && s.status !== "challenge") return;
  if (
    classicBuffActive(s, c, "TF_HIDING", at) ||
    classicBuffActive(s, c, "AS_CLOAKING", at)
  )
    return;
  if (s.hp <= 0) {
    s.recovery = { hpMs: 0, spMs: 0, skillMs: 0 };
    return;
  }
  const levels: Record<string, number> = {};
  for (const [id, learned] of Object.entries(s.learnedSkills)) {
    const skill = c.skills[id];
    if (!skill || skill.implementation === "unsupported" || learned <= 0)
      continue;
    const source =
      skill.sourceName ?? skill.mechanic ?? legacyNames[id] ?? id.toUpperCase();
    if (recoverySkills.has(source))
      levels[source] = Math.max(
        levels[source] ?? 0,
        Math.min(skill.maxLevel, Math.floor(learned)),
      );
  }
  if (inventoryLoad(s, c).recoveryBlocked) return;

  const stats = derivedStats(s, c);
  const intelligence =
    stats.attributes?.int ?? s.stats.int + (stats.effects.int ?? 0);
  const vitality =
    stats.attributes?.vit ?? s.stats.vit + (stats.effects.vit ?? 0);
  const elapsed = Math.floor(elapsedMs);
  const timers = (s.recovery ??= { hpMs: 0, spMs: 0, skillMs: 0 });
  // Walking blocks skill recovery and HP, except Moving HP Recovery at half speed.
  // Natural SP remains active while walking and while casting in Hercules.
  const walking = fieldHeroWalking(s, at);
  if (s.hp < stats.maxHp && (!walking || levels.SM_MOVINGRECOVERY)) {
    const interval = walking ? 12_000 : 6000;
    timers.hpMs += elapsed;
    const ticks = Math.floor(timers.hpMs / interval);
    timers.hpMs %= interval;
    const amount = 1 + Math.floor(vitality / 5) + Math.floor(stats.maxHp / 200);
    s.hp = Math.min(stats.maxHp, s.hp + ticks * amount);
  }
  const blocksSp = Object.entries(s.buffs).some(
    ([id, buff]) =>
      buff.expiresAt > at &&
      ["MO_EXTREMITYFIST", "MO_EXPLOSIONSPIRITS", "BS_MAXIMIZE"].includes(
        c.skills[id]?.sourceName ?? "",
      ),
  );
  if (s.sp < stats.maxSp && !blocksSp) {
    const interval = classicBuffActive(s, c, "PR_MAGNIFICAT", at) ? 4000 : 8000;
    timers.spMs += elapsed;
    const ticks = Math.floor(timers.spMs / interval);
    timers.spMs %= interval;
    let amount =
      1 + Math.floor(intelligence / 6) + Math.floor(stats.maxSp / 100);
    if (intelligence >= 120) amount += Math.floor((intelligence - 120) / 2) + 4;
    amount = Math.floor(
      (amount * (100 + 3 * (levels.HP_MEDITATIO ?? 0))) / 100,
    );
    s.sp = Math.min(stats.maxSp, s.sp + ticks * amount);
  }
  const hpLevel = levels.SM_RECOVERY ?? 0;
  const spLevel = levels.MG_SRECOVERY ?? 0;
  // Migrate the shared timer once. A full resource must not inherit time
  // accumulated solely by the other resource in an older saved profile.
  const legacySkillMs = Number.isFinite(timers.skillMs)
    ? Math.max(0, Math.min(9999, Math.floor(timers.skillMs)))
    : 0;
  timers.skillHpMs ??= hpLevel && s.hp < stats.maxHp ? legacySkillMs : 0;
  timers.skillSpMs ??= spLevel && s.sp < stats.maxSp ? legacySkillMs : 0;
  timers.skillMs = 0;
  // Hercules keeps regen->skill->tick.hp and .sp independently.
  if (!walking && hpLevel && s.hp < stats.maxHp) {
    timers.skillHpMs += elapsed;
    const ticks = Math.floor(timers.skillHpMs / 10_000);
    timers.skillHpMs %= 10_000;
    s.hp = Math.min(
      stats.maxHp,
      s.hp + ticks * (5 * hpLevel + Math.floor((hpLevel * stats.maxHp) / 500)),
    );
  }
  if (!walking && spLevel && s.sp < stats.maxSp) {
    timers.skillSpMs += elapsed;
    const ticks = Math.floor(timers.skillSpMs / 10_000);
    timers.skillSpMs %= 10_000;
    s.sp = Math.min(
      stats.maxSp,
      s.sp + ticks * (3 * spLevel + Math.floor((spLevel * stats.maxSp) / 500)),
    );
  }
}
