import { discardAloeveraUnderAutoBerserk } from './consumables.js';
import type { Catalog, GameState, Skill } from "../shared/types.js";
import { derivedStats, inventoryLoad } from "./stats.js";
import { classicBuffActive, cancelClassicBuff } from "./classicBuffs.js";
import { fieldHeroWalking, battleHeroAt, stopHeroMovement } from "../shared/battleSpatial.js";
import { soloRecoveryBlocked } from './soloStanceRuntime.js';

import { playerRecoveryBlocked } from './playerStatuses.js';
const recoverySkills = new Set([
  "SM_RECOVERY",
  "MG_SRECOVERY",
  "SM_MOVINGRECOVERY",
  "HP_MEDITATIO",
  "MC_INCCARRY",
  "ALL_INCCARRY",
  "MO_SPIRITSRECOVERY",
]);
const legacyNames: Record<string, string> = {
  hp_recovery: "SM_RECOVERY",
  sp_recovery: "MG_SRECOVERY",
};

export const isFieldSitting = (s: GameState) => s.status === 'resting' && s.restMode === 'field';

export function resetResourceRecovery(s: GameState) {
  s.recovery = { hpMs: 0, spMs: 0, skillMs: 0, skillHpMs: 0, skillSpMs: 0, sittingHpMs: 0, sittingSpMs: 0 };
}

/** pc.c:11177..11181: standing ends Relax and resets only the sitting ticks. */
export function endFieldRest(s: GameState, c: Catalog) {
  cancelClassicBuff(s, c, 'LK_TENSIONRELAX');
  if (s.recovery) { s.recovery.sittingHpMs = 0; s.recovery.sittingSpMs = 0; }
}

/** Sitting stops the current route at its interpolated position, without warping. */
export function sitInField(s: GameState, at: number) {
  if (s.fieldHero?.areaId === s.areaId) {
    const position = battleHeroAt(s, at);
    stopHeroMovement(s.fieldHero, position, at); s.fieldHero.phase = 'waiting';
    delete s.fieldHero.targetId; delete s.fieldHero.moveBlockedUntil;
  }
  s.status = 'resting'; s.restMode = 'field'; s.restUntil = 0;
  s.battle = null; s.pendingAreaId = null; s.nextEncounterAt = at;
}

export function startTensionRelax(s: GameState, skill: Skill, at: number) {
  sitInField(s, at);
  s.buffs[skill.id] = { startsAt: at, expiresAt: at + 180000, effects: {} };
  (s.combatEffects ??= {}).tensionRelax = { nextTickAt: at + 10000, remainingTicks: 18 };
  (s.combatEffects.buffLevels ??= {})[skill.id] = 1;
}

/** status.c:12494..12499: this timer never charges the unused val2=12 SP field. */
export function tickTensionRelax(s: GameState, c: Catalog, at: number) {
  const active = Object.entries(s.buffs).find(([id]) => c.skills[id]?.sourceName === 'LK_TENSIONRELAX');
  if (!active) { if (s.combatEffects) delete s.combatEffects.tensionRelax; return; }
  const [id, buff] = active;
  if (!isFieldSitting(s) || s.hp <= 0 || c.skills[id].implementation === 'unsupported') {
    endFieldRest(s, c); return;
  }
  const effects = (s.combatEffects ??= {});
  const startedAt = buff.startsAt ?? buff.expiresAt - 180000;
  const timer = (effects.tensionRelax ??= { nextTickAt: startedAt + 10000, remainingTicks: 18 });
  while (s.buffs[id] && Math.min(timer.nextTickAt, buff.expiresAt) <= at) {
    const deadline = Math.min(timer.nextTickAt, buff.expiresAt);
    if (s.hp >= derivedStats(s, c).maxHp || --timer.remainingTicks <= 0 || deadline >= buff.expiresAt) {
      cancelClassicBuff(s, c, 'LK_TENSIONRELAX'); break;
    }
    timer.nextTickAt += 10000;
  }
}

/** PA_GOSPEL self-target branch: periodic fixed HP/SP charges for the caster. */
function tickBattleChant(s: GameState, c: Catalog, at: number): void {
  const active = Object.entries(s.buffs).find(([id, buff]) =>
    buff.expiresAt > at && c.skills[id]?.sourceName === "PA_GOSPEL",
  );
  const runtime = s.combatEffects;
  if (!active || !runtime) {
    if (runtime) delete runtime.battleChant;
    return;
  }
  const [id, buff] = active;
  const start = buff.startsAt ?? buff.expiresAt - 60_000;
  const level = runtime.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1;
  const timer = runtime.battleChant ??= {
    nextTickAt: start + 10_000,
    remainingTicks: Math.max(0, Math.floor((buff.expiresAt - start) / 10_000) - 1),
    level,
  };
  const stats = derivedStats(s, c);
  while (
    timer.remainingTicks > 0 &&
    timer.nextTickAt <= at &&
    timer.nextTickAt < buff.expiresAt
  ) {
    const hp = timer.level > 5 ? 45 : 30;
    const sp = timer.level > 5 ? 35 : 20;
    s.hp = Math.min(stats.maxHp, s.hp + hp);
    s.sp = Math.min(stats.maxSp, s.sp + sp);
    timer.nextTickAt += 10_000;
    timer.remainingTicks -= 1;
  }
  if (timer.remainingTicks <= 0) delete runtime.battleChant;
}

/** Hercules pre-renewal status.c:status_calc_regen_pc / status_natural_heal. */
export function recoverResources(
  s: GameState,
  c: Catalog,
  at: number,
  elapsedMs = 1000,
): void {
  if (!Number.isFinite(at) || !Number.isFinite(elapsedMs) || elapsedMs <= 0)
    return;
  if (s.hp <= 0) {
    resetResourceRecovery(s);
    return;
  }
  discardAloeveraUnderAutoBerserk(s,c,at);
  // The idle engine owns its accelerated town and death recovery separately.
  const sitting = isFieldSitting(s);
  if (s.status !== "hunting" && s.status !== "challenge" && !sitting) return;
  tickBattleChant(s, c, at);
  if (classicBuffActive(s, c, 'LK_BERSERK', at) || playerRecoveryBlocked(s, c, at)) return;
  // The post-Frenzy status masks RGN_HP/RGN_SP, not skill RGN_SHP/RGN_SSP.
  const naturalBlocked = soloRecoveryBlocked(s, c, at);
  if (
    classicBuffActive(s, c, "TF_HIDING", at) ||
    classicBuffActive(s, c, "AS_CLOAKING", at) ||
    classicBuffActive(s, c, "ST_CHASEWALK", at) ||
    classicBuffActive(s, c, "ST_INVISIBILITY", at) ||
    classicBuffActive(s, c, "NV_TRICKDEAD", at)
  )
    return;
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
  const stats = derivedStats(s, c);
  const intelligence =
    stats.attributes?.int ?? s.stats.int + (stats.effects.int ?? 0);
  const vitality =
    stats.attributes?.vit ?? s.stats.vit + (stats.effects.vit ?? 0);
  const elapsed = Math.floor(elapsedMs);
  const timers = (s.recovery ??= { hpMs: 0, spMs: 0, skillMs: 0 });
  const overweight = inventoryLoad(s, c).recoveryBlocked;
  const tension = classicBuffActive(s, c, 'LK_TENSIONRELAX', at);
  const hpLevel = levels.SM_RECOVERY ?? 0, spLevel = levels.MG_SRECOVERY ?? 0;
  const spiritLevel = levels.MO_SPIRITSRECOVERY ?? 0;
  timers.sittingHpMs ??= 0; timers.sittingSpMs ??= 0;
  const blocksSp = Object.entries(s.buffs).some(([id, buff]) => buff.expiresAt > at &&
    ["MO_EXTREMITYFIST", "MO_EXPLOSIONSPIRITS", "BS_MAXIMIZE"].includes(c.skills[id]?.sourceName ?? ""));
  let naturalHp = !naturalBlocked, naturalSp = !naturalBlocked && !blocksSp;
  let skillHp = hpLevel > 0 || spiritLevel > 0, skillSp = spLevel > 0 || spiritLevel > 0;
  // Full resources clear skill flags only if their natural flag still exists.
  // Post-Frenzy/Fury can leave regular and sitting clocks running while full.
  if (naturalHp && s.hp >= stats.maxHp) { naturalHp = false; skillHp = false; }
  if (naturalSp && s.sp >= stats.maxSp) { naturalSp = false; skillSp = false; }
  const healTicks = (key: keyof NonNullable<GameState['recovery']>, interval: number, amount: number, resource: 'hp' | 'sp', maximum: number, stopOnFull = false) => {
    timers[key] = (timers[key] ?? 0) + elapsed;
    if (stopOnFull) {
      while (timers[key]! >= interval) {
        timers[key]! -= interval;
        const healed = Math.min(amount, Math.max(0, maximum - s[resource]));
        s[resource] += healed;
        if (healed < amount) return true;
      }
      return false;
    }
    const ticks = Math.floor(timers[key]! / interval); timers[key]! %= interval;
    const healed = Math.min(ticks * amount, Math.max(0, maximum - s[resource]));
    s[resource] += healed;
    return healed < ticks * amount;
  };
  // Sitting skill regeneration precedes the overweight cutoff in Hercules.
  if (sitting && spiritLevel > 0) {
    const interval = overweight ? 20000 : 10000;
    if (skillHp && healTicks('sittingHpMs', interval, 4 * spiritLevel + Math.floor(spiritLevel * stats.maxHp / 500), 'hp', stats.maxHp, true)) { naturalHp = false; skillHp = false; }
    if (skillSp && healTicks('sittingSpMs', interval, 2 * spiritLevel + Math.floor(spiritLevel * stats.maxSp / 500), 'sp', stats.maxSp, true)) { naturalSp = false; skillSp = false; }
  } else { timers.sittingHpMs = 0; timers.sittingSpMs = 0; }
  // Walking blocks skill recovery and HP, except Moving HP Recovery at half speed.
  // Natural SP remains active while walking and while casting in Hercules.
  const walking = !sitting && fieldHeroWalking(s, at);
  // Overweight Relax reintroduces RGN_HP/RGN_SHP if any prior flag survives.
  if (overweight && (naturalHp || naturalSp || skillHp || skillSp)) {
    naturalHp = naturalSp = skillHp = skillSp = false;
    if (tension) naturalHp = skillHp = true;
  }
  if (walking) { skillHp = skillSp = false; if (!levels.SM_MOVINGRECOVERY) naturalHp = false; }
  if (naturalHp) {
    const rate = (sitting ? 2 : 1) * (tension && !overweight ? 3 : 1);
    const interval = Math.max(1000, Math.floor((walking ? 12000 : 6000) / rate));
    const amount = 1 + Math.floor(vitality / 5) + Math.floor(stats.maxHp / 200);
    if (healTicks('hpMs', interval, amount, 'hp', stats.maxHp)) skillHp = false;
  }
  if (naturalSp) {
    const interval = Math.max(1000, 8000 / ((sitting ? 2 : 1) * (classicBuffActive(s, c, "PR_MAGNIFICAT", at) ? 2 : 1)));
    let amount =
      1 + Math.floor(intelligence / 6) + Math.floor(stats.maxSp / 100);
    if (intelligence >= 120) amount += Math.floor((intelligence - 120) / 2) + 4;
    amount = Math.floor(
      (amount * (100 + 3 * (levels.HP_MEDITATIO ?? 0))) / 100,
    );
    if (healTicks('spMs', interval, amount, 'sp', stats.maxSp)) skillSp = false;
  }
  // Migrate the shared timer once. A full resource must not inherit time
  // accumulated solely by the other resource in an older saved profile.
  const legacySkillMs = Number.isFinite(timers.skillMs)
    ? Math.max(0, Math.min(9999, Math.floor(timers.skillMs)))
    : 0;
  timers.skillHpMs ??= hpLevel && s.hp < stats.maxHp ? legacySkillMs : 0;
  timers.skillSpMs ??= spLevel && s.sp < stats.maxSp ? legacySkillMs : 0;
  timers.skillMs = 0;
  // Hercules keeps regen->skill->tick.hp and .sp independently.
  if (skillHp && hpLevel) {
    const interval = tension && !overweight ? 3333 : 10000;
    healTicks('skillHpMs', interval, 5 * hpLevel + Math.floor(hpLevel * stats.maxHp / 500), 'hp', stats.maxHp, true);
  }
  if (skillSp && spLevel) {
    healTicks('skillSpMs', 10000, 3 * spLevel + Math.floor(spLevel * stats.maxSp / 500), 'sp', stats.maxSp, true);
  }
}
