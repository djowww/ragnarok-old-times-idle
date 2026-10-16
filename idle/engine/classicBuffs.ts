/**
 * Hercules pre-renewal status.c / skill.c, pinned at
 * 410b9738c049ab1825d67b36b072d837c1d0b33a. GPL-3.0-or-later.
 */
import type { Catalog, GameState, Monster, Skill } from "../shared/types.js";
import { bladeStopSkillAllowed, bladeStopTarget } from './bladeStop.js';

const lifecycleSources = new Set(["TF_HIDING", "AS_CLOAKING", "BS_MAXIMIZE"]);
const toggleSources = new Set([...lifecycleSources, "CR_DEFENDER", "SM_AUTOBERSERK", "CR_SHRINK", "NV_TRICKDEAD", "PA_GOSPEL"]);
const hiddenActions = new Set([
  "TF_HIDING",
  "AS_GRIMTOOTH",
  "RG_BACKSTAP",
  "RG_RAID",
  "NJ_SHADOWJUMP",
  "NJ_KIRIKAGE",
  "KO_YAMIKUMO",
]);
const legacySources: Record<string, string> = {
  hiding: "TF_HIDING",
  cloaking: "AS_CLOAKING",
  maximize_power: "BS_MAXIMIZE",
};
// These optional fields also let profiles saved before the lifecycle remain valid.
type LifecycleSkill = Skill & {
  spDrainIntervalMs?: number[];
  spDrainAmount?: number;
};
type BuffRuntime = NonNullable<GameState["combatEffects"]> & {
  buffLevels?: Record<string, number>;
};

const sourceName = (skill: Skill) => {
  const source = (
    skill.sourceName ??
    skill.mechanic ??
    legacySources[skill.id] ??
    skill.id
  ).toUpperCase();
  return source === "RG_CHASEWALK" ? "ST_CHASEWALK" : source;
};
const value = (
  values: number[] | undefined,
  level: number,
  fallback: number,
) => {
  const result = values?.[level - 1] ?? values?.at(-1);
  return Number.isFinite(result) ? result! : fallback;
};
const buffSource = (c: Catalog, id: string) =>
  c.skills[id]
    ? sourceName(c.skills[id])
    : (legacySources[id] ?? id).toUpperCase();
const runtime = (s: GameState): BuffRuntime => (s.combatEffects ??= {});
const activeCombo = (s: GameState, c: Catalog, at: number) => {
  const combo = s.combatEffects?.combo;
  return combo && combo.expiresAt > at
    ? buffSource(c, combo.sourceName)
    : undefined;
};

/** Read active statuses by Hercules source name, including catalog aliases. */
export function classicBuffActive(
  s: GameState,
  c: Catalog,
  source: string,
  at: number,
): boolean {
  const canonical = buffSource(c, source);
  return Object.entries(s.buffs).some(
    ([id, buff]) => buff.expiresAt > at && buffSource(c, id) === canonical,
  );
}

/** Consume the one-cast pre-renewal Suffragium status when a skill computes cast time. */
export function consumeSuffragiumForCast(
  s: GameState,
  c: Catalog,
  skill: Skill,
  at: number,
): boolean {
  if (skill.ignoresStatusEffects || sourceName(skill) === 'PR_SUFFRAGIUM' ||
      !classicBuffActive(s, c, 'PR_SUFFRAGIUM', at)) return false;
  cancelClassicBuff(s, c, 'PR_SUFFRAGIUM');
  return true;
}

/** Also removes persisted upkeep metadata when combat ends a status. */
export function cancelClassicBuff(
  s: GameState,
  c: Catalog,
  source: string,
): void {
  const canonical = buffSource(c, source);
  const effects = s.combatEffects as BuffRuntime | undefined;
  for (const id of Object.keys(s.buffs)) {
    if (buffSource(c, id) !== canonical) continue;
    delete s.buffs[id];
    if (effects?.buffDrainAt) delete effects.buffDrainAt[id];
    if (effects?.buffLevels) delete effects.buffLevels[id];
  }
  if (effects) {
    if (canonical === "ST_REJECTSWORD") delete effects.rejectSword;
    if (canonical === "AS_POISONREACT") delete effects.poisonReact;
    if (canonical === "LK_TENSIONRELAX") delete effects.tensionRelax;
    if (canonical === "PA_GOSPEL") delete effects.battleChant;
    if (canonical === "SA_AUTOSPELL") delete effects.autospell;
    if (canonical === "PF_MEMORIZE") effects.memorizeCharges = 0;
    if (canonical === "SM_ENDURE") delete effects.endure;
    if (canonical === "PA_SACRIFICE") delete effects.sacrifice;
    if (canonical === "AL_PNEUMA") delete effects.pneumaGround;
    if (canonical === "MG_SAFETYWALL") { effects.safetyWallHits = 0; delete effects.safetyWallGround; }
    if (canonical === "AL_PNEUMA" || canonical === "MG_SAFETYWALL")
      effects.defensiveGrounds = effects.defensiveGrounds?.filter(ground =>
        ground.kind !== (canonical === "AL_PNEUMA" ? "pneumaGround" : "safetyWallGround"));
  }
}
/** Hercules clears a caster's ground groups on warp under the default setting. */
export function clearClassicGrounds(s: GameState, c: Catalog) {
  delete s.groundPlacements;
  cancelClassicBuff(s, c, "AL_PNEUMA");
  cancelClassicBuff(s, c, "MG_SAFETYWALL");
  cancelClassicBuff(s, c, "PF_FOGWALL");
}
export function classicGroundSceneKey(s: GameState): string {
  if (s.battle?.challengeId) return `challenge:${s.battle.attemptId ?? s.battle.challengeId}`;
  return s.status === "hunting" || s.status === "resting" && s.restMode === "field" ? s.areaId ?? "town" : "town";
}

/** status.c permits this list while hidden; an undefined skill is a basic attack. */
export function canActWhileHidden(skill?: Skill): boolean {
  return !!skill && hiddenActions.has(sourceName(skill));
}

/** MD_DETECTOR is authoritative; the race fallback supports older catalogs. */
export function playerHiddenFrom(
  s: GameState,
  c: Catalog,
  monster: Monster,
  at: number,
): boolean {
  if (
    !classicBuffActive(s, c, "TF_HIDING", at) &&
    !classicBuffActive(s, c, "AS_CLOAKING", at) &&
    !classicBuffActive(s, c, "ST_CHASEWALK", at)
  )
    return false;
  const boss =
    monster.boss ??
    c.challenges.some(
      (ch) => ch.monsterId === monster.id && ch.category === "mvp",
    );
  const detector =
    monster.detector ??
    ["demon", "insect"].includes(monster.race.toLowerCase());
  return !boss && !detector;
}

/** A successful toggle ends an active status before the caller charges resources. */
export function toggleClassicBuff(
  s: GameState,
  c: Catalog,
  skill: Skill,
  _level: number,
  at: number,
): boolean {
  const source = sourceName(skill);
  if (!toggleSources.has(source) || !classicBuffActive(s, c, source, at))
    return false;
  cancelClassicBuff(s, c, source);
  return true;
}

function drainInterval(skill: LifecycleSkill, level: number): number {
  const source = sourceName(skill);
  const fallback = source === "BS_MAXIMIZE" ? level * 1000 : (level - 1) * 1000;
  // For these two skills SkillData1 is the upkeep interval, not their lifespan.
  return Math.max(
    1,
    Math.floor(
      value(
        skill.spDrainIntervalMs,
        level,
        value(skill.statusDurationMs, level, fallback),
      ),
    ),
  );
}

/** Activate after the caller pays the cast cost. The local map has no cloak walls. */
export function applyClassicBuff(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  at: number,
): boolean {
  const source = sourceName(skill);
  const battleChant = source === "PA_GOSPEL";
  if (
    (!lifecycleSources.has(source) && !battleChant) ||
    skill.implementation === "unsupported" ||
    !Number.isSafeInteger(level) ||
    level < 1 ||
    level > skill.maxLevel ||
    !Number.isFinite(at) ||
    (source === "AS_CLOAKING" && level < 3)
  )
    return false;
  cancelClassicBuff(s, c, source);
  if (battleChant) {
    // PA_GOSPEL's self status clears the caster's active buffs and ailments.
    for (const id of Object.keys(s.buffs))
      cancelClassicBuff(s, c, buffSource(c, id));
    s.playerStatuses = {};
  }
  const effects = runtime(s);
  (effects.buffLevels ??= {})[skill.id] = level;
  if (battleChant) {
    const duration = Math.max(
      0,
      value(skill.statusDurationMs, level, skill.durationMs ?? 60_000),
    );
    const interval = 10_000;
    s.buffs[skill.id] = {
      startsAt: at,
      expiresAt: at + duration,
      effects: { ...skill.effects },
    };
    effects.battleChant = {
      nextTickAt: at + interval,
      // status.c initializes val2 to duration/interval, decrements before heal.
      remainingTicks: Math.max(0, Math.floor(duration / interval) - 1),
      level,
    };
    return true;
  }
  (effects.buffDrainAt ??= {})[skill.id] =
    at + (source === "TF_HIDING" ? 1000 : drainInterval(skill, level));
  s.buffs[skill.id] = {
    // Infinity serializes to null in the persisted JSON state.
    expiresAt:
      source === "TF_HIDING"
        ? at +
          Math.max(1000, value(skill.statusDurationMs, level, 30_000 * level))
        : Number.MAX_SAFE_INTEGER,
    effects: { ...skill.effects },
  };
  return true;
}

/** Upkeep only; resource costs for the original skill remain with the combat caller. */
export function tickClassicBuffs(s: GameState, c: Catalog, at: number): void {
  if (!Number.isFinite(at)) return;
  const effects = runtime(s);
  const timers = (effects.buffDrainAt ??= {});
  const levels = (effects.buffLevels ??= {});
  for (const id of Object.keys(timers))
    if (!s.buffs[id] || !lifecycleSources.has(buffSource(c, id)) && buffSource(c, id) !== 'ST_CHASEWALK') {
      delete timers[id];
      delete levels[id];
    }
  for (const [id, buff] of Object.entries(s.buffs)) {
    const source = buffSource(c, id);
    if (!lifecycleSources.has(source)) continue;
    const skill = c.skills[id] as LifecycleSkill | undefined;
    const pendingHidingTicks =
      source === "TF_HIDING" &&
      Number.isFinite(timers[id]) &&
      timers[id] <= at &&
      timers[id] <= buff.expiresAt;
    if (
      !skill ||
      skill.implementation === "unsupported" ||
      s.hp <= 0 ||
      (buff.expiresAt <= at && !pendingHidingTicks)
    ) {
      cancelClassicBuff(s, c, source);
      continue;
    }
    const level = Math.max(
      1,
      Math.min(
        skill.maxLevel,
        Math.floor(levels[id] ?? s.learnedSkills[id] ?? 1),
      ),
    );
    levels[id] = level;
    if (source === "AS_CLOAKING" && level < 3) {
      cancelClassicBuff(s, c, source);
      continue;
    }
    const interval =
      source === "TF_HIDING" ? 1000 : drainInterval(skill, level);
    if (!Number.isFinite(timers[id])) {
      // Old finite Cloaking/Maximize buffs become infinite while still active.
      if (source !== "TF_HIDING") buff.expiresAt = Number.MAX_SAFE_INTEGER;
      timers[id] = at + interval;
    }
  }

  // Process simultaneous statuses in time order so a failed charge ends the
  // status whose timer actually ran out of SP, including during offline catch-up.
  while (true) {
    const due = Object.entries(timers)
      .filter(([id, tick]) => s.buffs[id] && lifecycleSources.has(buffSource(c, id)) && tick <= at)
      .sort((a, b) => a[1] - b[1])[0];
    if (!due) break;
    const [id, tick] = due;
    const skill = c.skills[id] as LifecycleSkill;
    const source = sourceName(skill);
    const level = levels[id];
    const buff = s.buffs[id];
    let charge = true;
    if (source === "TF_HIDING") {
      // status.c decrements the remaining seconds first, then tests val2 % val4.
      const remaining = Math.floor((buff.expiresAt - tick) / 1000);
      if (remaining <= 0) {
        cancelClassicBuff(s, c, source);
        continue;
      }
      charge = remaining % (level + 3) === 0;
    }
    const amount = Math.max(1, Math.floor(skill.spDrainAmount ?? 1));
    if (charge && s.sp < amount) {
      cancelClassicBuff(s, c, source);
      continue;
    }
    if (charge) s.sp -= amount;
    timers[id] =
      tick + (source === "TF_HIDING" ? 1000 : drainInterval(skill, level));
  }
}

/** The combo precursor is checked even when SkillRequiredState is absent. */
export function comboAllowed(
  s: GameState,
  c: Catalog,
  skill: Skill,
  at: number,
): boolean {
  const previous = activeCombo(s, c, at);
  switch (sourceName(skill)) {
    case "HT_POWER":
      return previous === "AC_DOUBLE";
    case "MO_CHAINCOMBO":
      return previous === "MO_TRIPLEATTACK" || (() => {
        const link = s.combatEffects?.bladeStopLink;
        return !!link && !!bladeStopTarget(s, at) && bladeStopSkillAllowed('MO_CHAINCOMBO', link.level);
      })();
    case "MO_COMBOFINISH":
      return previous === "MO_CHAINCOMBO";
    case "CH_TIGERFIST":
      return previous === "MO_COMBOFINISH";
    case "CH_CHAINCRUSH":
      return previous === "MO_COMBOFINISH" || previous === "CH_TIGERFIST";
    case "MO_EXTREMITYFIST":
      return (
        !previous ||
        ["MO_COMBOFINISH", "CH_TIGERFIST", "CH_CHAINCRUSH"].includes(previous)
      );
    default:
      return true;
  }
}

/** Source pre-renewal Asura combo costs and Finger Offensive's available balls. */
export function sphereCostForSkill(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  at: number,
): number {
  const source = sourceName(skill);
  const count = Math.max(0, Math.floor(s.combatEffects?.spiritSpheres ?? 0));
  const cost = Math.max(
    0,
    Math.floor(
      value(
        skill.sphereCost,
        level,
        source === "MO_EXTREMITYFIST" ? 5 : source === "MO_BODYRELOCATION" ? 1 : 0,
      ),
    ),
  );
  if (source === "MO_FINGEROFFENSIVE")
    return count > 0 ? Math.min(cost || level, count) : cost || level;
  if (
    source === "MO_BODYRELOCATION" &&
    classicBuffActive(s, c, "MO_EXPLOSIONSPIRITS", at)
  )
    return 0;
  if (source !== "MO_EXTREMITYFIST") return cost;
  const bladeLink = s.combatEffects?.bladeStopLink;
  if (bladeLink && bladeStopTarget(s, at) && bladeStopSkillAllowed('MO_EXTREMITYFIST', bladeLink.level))
    return Math.max(1, cost - 1);
  switch (activeCombo(s, c, at)) {
    case "MO_COMBOFINISH":
      return 4;
    case "CH_TIGERFIST":
      return 3;
    case "CH_CHAINCRUSH":
      return Math.max(1, count);
    default:
      return cost;
  }
}
