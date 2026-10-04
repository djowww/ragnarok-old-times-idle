import type {
  BattleEnemy,
  Battle,
  Catalog,
  GameEvent,
  GameState,
  Monster,
  Skill,
} from "../shared/types.js";
import { addItem, consume, event, random } from "./state.js";
import { derivedStats, healFull } from "./stats.js";
import {
  BATTLE_HERO,
  BATTLE_CELLS_PER_UNIT,
  battleHeroAt,
  battleDistance,
  playerBattleDistance,
  enemyPositionAt,
  enemyDistanceAt,
} from "../shared/battleSpatial.js";
import {
  offensiveSkill,
  basicAttackRange,
  skillTargetInRange,
  skillAttackRange,
} from "../shared/combatRange.js";
import { gainExp, grantReward, updateQuests } from "./progression.js";
import {
  chooseAreaMonster,
  encounterDelay,
  POST_WAVE_SEARCH_MS,
  recordAreaActivity,
} from "../shared/hunt.js";
import {
  classicCastTime,
  classicMagicDamage,
  classicPhysicalDamage,
  classicSkillEffects,
  classicHeal,
  classicPotionHealing,
  classicDivineProtection,
  classicIncomingSkillReduction,
  classicWeaponElement,
  classicStripChance,
  classicStripDuration,
  classicStrippedMonster,
} from "./classic.js";
import { recoverResources } from "./recovery.js";
import { canPaySkillResources, paySkillResources } from "./skillResources.js";
import {
  applyClassicBuff,
  cancelClassicBuff,
  canActWhileHidden,
  classicBuffActive,
  comboAllowed,
  playerHiddenFrom,
  tickClassicBuffs,
} from "./classicBuffs.js";
import { canSteal, attemptSteal } from "./steal.js";
import { fieldHome, fieldWanderPoint } from "../shared/fieldPopulation.js";
import {
  classicStatusResistance,
  classicStoneTiming,
  classicStatusBreaksOnDamage,
  classicStoneIsPetrified,
  effectiveMonsterStatus,
  isClassicResistedStatus,
  classicProvokeBaseChance,
  classicDecreaseAgilityBaseChance,
} from "./classicStatuses.js";

const val = (values: number[] | undefined, level: number, fallback = 0) =>
  values?.[level - 1] ?? values?.at(-1) ?? fallback;
type ActionMetadata = Pick<GameEvent,
  "sourceActorId" | "actionId" | "actorAction" | "actionStartedAt" | "actionMotionMs">;
const playerMotion = (s: GameState, c: Catalog) => derivedStats(s, c).attackIntervalMs / 2;
function playerAction(s: GameState, c: Catalog, at: number, actorAction: GameEvent["actorAction"], actionId?: string): ActionMetadata {
  return {
    sourceActorId: s.id,
    actionId: actionId ?? `action-${s.id}-${at}-${s.nextEventId}`,
    actorAction,
    actionStartedAt: at,
    actionMotionMs: actorAction === "none" ? 0 : playerMotion(s, c),
  };
}
function afterCastDelay(s: GameState, c: Catalog, skill: Skill, level: number) {
  const sourceDelay = val(skill.afterCastDelayMs, level);
  // Hercules skill_delay_fix: negative delay adds its magnitude to amotion.
  const delay = sourceDelay < 0 ? -sourceDelay + playerMotion(s, c) : sourceDelay;
  return Math.max(0, Math.floor(delay *
    (1 - Math.min(100, derivedStats(s, c).effects.afterCastReductionPct ?? 0) / 100)));
}
const learnedBySource = (s: GameState, c: Catalog) =>
  Object.fromEntries(
    Object.entries(s.learnedSkills).map(([id, level]) => [
      c.skills[id]?.sourceName ?? id,
      level,
    ]),
  );
const activeBySource = (s: GameState, c: Catalog, at: number) =>
  Object.fromEntries(
    Object.entries(s.buffs)
      .filter(([, buff]) => buff.expiresAt > at)
      .map(([id]) => [
        c.skills[id]?.sourceName ?? id,
        s.combatEffects?.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1,
      ]),
  );
function combatStatus(c: Catalog, enemy: BattleEnemy, at: number) {
  const monster = classicStrippedMonster(
    c.monsters[enemy.monsterId],
    Object.entries(enemy.statuses ?? {})
      .filter(([, status]) => status.expiresAt > at)
      .map(([name]) => name),
  );
  const quagmire = enemy.statuses?.quagmire;
  if (quagmire && quagmire.expiresAt > at) {
    monster.stats.dex -= Math.min(
      Math.floor(monster.stats.dex * 0.5),
      10 * quagmire.level,
    );
    monster.stats.agi -= Math.min(
      Math.floor(monster.stats.agi * 0.5),
      10 * quagmire.level,
    );
  }
  return effectiveMonsterStatus(monster, enemy.statuses, at);
}
function breakControlOnDamage(enemy: BattleEnemy, damage: number, at: number) {
  for (const name of Object.keys(enemy.statuses ?? {}))
    if (
      classicStatusBreaksOnDamage(name, damage, {
        stonePetrified: classicStoneIsPetrified(enemy.statuses?.SC_STONE, at),
      })
    )
      delete enemy.statuses![name];
}
function engageFieldEnemy(s: GameState, enemy: BattleEnemy, at: number, hostile = true) {
  if (enemy.fieldSlot === undefined) return;
  if (enemy.engaged) { if (hostile) enemy.hostile = true; return; }
  const from = enemyPositionAt(enemy, at);
  enemy.approachFrom = from;
  enemy.position = { ...from };
  enemy.homePosition ??= fieldHome(enemy.fieldSlot);
  enemy.startedAt = at;
  enemy.arrivedAt = at;
  enemy.engaged = true;
  enemy.hostile = hostile;
  enemy.enemyNextAttackAt = at;
  delete enemy.approachPausedAt;
}
function provokeEnemy(s: GameState, c: Catalog, enemy: BattleEnemy, at: number) {
  engageFieldEnemy(s, enemy, at);
  if (enemy.hostile === false) {
    enemy.hostile = true;
    // Becoming engaged makes the first attack ready. Range controls contact;
    // source AttackDelay spaces subsequent attacks instead of delaying pursuit.
    enemy.enemyNextAttackAt = at;
  }
}

function fieldTarget(s: GameState, c: Catalog, candidates: BattleEnemy[], at: number): BattleEnemy | undefined {
  const focus = s.huntFocus?.[s.areaId ?? ""] ?? "any";
  const match = (enemy: BattleEnemy) => focus === "any" ||
    (focus.startsWith("monster:") && enemy.monsterId === Number(focus.slice(8))) ||
    (focus.startsWith("element:") && c.monsters[enemy.monsterId]?.element.toLowerCase() === focus.slice(8));
  return candidates.slice().sort((a, b) => Number(match(b)) - Number(match(a)) ||
    playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(a, at)) - playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(b, at)) ||
    a.id.localeCompare(b.id))[0];
}

function freezeFieldHero(s: GameState, at: number) {
  if (!s.fieldHero || s.fieldHero.areaId !== s.areaId) return;
  const point = battleHeroAt(s, at);
  Object.assign(s.fieldHero, { from: point, position: point, startedAt: at, arrivedAt: at });
}
function updateFieldHero(s: GameState, at: number) {
  if (!s.areaId || s.status === "town" || s.status === "challenge") return;
  if (s.fieldHero?.areaId !== s.areaId) s.fieldHero = {
    areaId: s.areaId, from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: at, arrivedAt: at, routeIndex: 0, phase: "seeking",
  };
  if (s.status !== "hunting") {
    freezeFieldHero(s, at);
    delete s.fieldHero!.targetId;
    s.fieldHero!.phase = "waiting";
  }
}

function walkDuration(from: { x: number; y: number }, to: { x: number; y: number }, speedMs: number) {
  return Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * BATTLE_CELLS_PER_UNIT * speedMs));
}

function stopAtRange(from: { x: number; y: number }, target: { x: number; y: number }, range: number) {
  const distance = Math.hypot(target.x - from.x, target.y - from.y) * BATTLE_CELLS_PER_UNIT;
  const fraction = distance > 0 ? Math.max(0, distance - Math.max(0, range)) / distance : 0;
  return { x: from.x + (target.x - from.x) * fraction, y: from.y + (target.y - from.y) * fraction };
}

/** status_calc_speed: default PC cell time 150 ms; supported haste uses the source maximum. */
function playerWalkSpeed(s: GameState, c: Catalog, at: number) {
  let haste = 0;
  if (classicBuffActive(s, c, "AL_INCAGI", at)) haste = 25;
  for (const [id, buff] of Object.entries(s.buffs)) {
    if (buff.expiresAt <= at) continue;
    if (c.skills[id]?.sourceName === "SN_WINDWALK") haste = Math.max(haste, 2 * (s.combatEffects?.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1));
    if (c.skills[id]?.sourceName === "WS_CARTBOOST") haste = Math.max(haste, 20);
  }
  if (c.classes[s.job]?.family === "thief" && s.job.includes("assassin")) haste = Math.max(haste, learnedBySource(s, c).TF_MISS ?? 0);
  return Math.floor(150 * Math.max(40, 100 - haste) / 100);
}

function blockFieldHero(s: GameState, at: number, until: number) {
  if (!s.fieldHero || s.fieldHero.areaId !== s.areaId || s.battle?.challengeId) return;
  freezeFieldHero(s, at);
  s.fieldHero.phase = "fighting";
  s.fieldHero.moveBlockedUntil = Math.max(s.fieldHero.moveBlockedUntil ?? at, until);
}

/** Every segment is planned at its own deadline, never at the end of a replay window. */
function updateFieldActors(s: GameState, c: Catalog, at: number) {
  updateFieldHero(s, at);
  updateFieldPopulation(s, c, at);
  const b = s.battle;
  if (s.status !== "hunting" || !b || b.challengeId || !s.fieldHero) return;
  const hero = s.fieldHero;
  const live = enemies(s).filter(enemy => enemy.hp > 0);
  let target = live.find(enemy => enemy.id === b.targetId);
  if (!target) {
    target = fieldTarget(s, c, live, at);
    b.targetId = target?.id;
  }
  hero.targetId = target?.id;
  const heroPoint = battleHeroAt(s, at);
  for (const enemy of live) {
    const monster = c.monsters[enemy.monsterId];
    const point = enemyPositionAt(enemy, at);
    const distance = battleDistance(point, heroPoint);
    if (!enemy.engaged && monster.aggressive && distance <= (monster.viewRange ?? 10) && !playerHiddenFrom(s, c, monster, at))
      engageFieldEnemy(s, enemy, at);
    if (!enemy.engaged || !enemy.hostile) continue;
    if (distance > (monster.chaseRange ?? 12) || playerHiddenFrom(s, c, monster, at)) {
      enemy.approachFrom = point; enemy.position = point; enemy.startedAt = enemy.arrivedAt = at;
      enemy.engaged = false; enemy.hostile = false;
      delete enemy.approachPausedAt;
      continue;
    }
    const immobilized = combatStatus(c, enemy, at).immobilized;
    const range = monster.attackRange ?? 1;
    if (immobilized || monster.canMove === false || distance <= range) {
      enemy.approachFrom = point; enemy.position = point; enemy.startedAt = enemy.arrivedAt = at;
      delete enemy.approachPausedAt;
      continue;
    }
    const position = stopAtRange(point, heroPoint, range * 0.9);
    const slow = (enemy.statuses?.quagmire?.expiresAt ?? 0) > at ? 50
      : (enemy.statuses?.SC_DEC_AGI?.expiresAt ?? 0) > at ? 25 : 0;
    const speed = Math.floor((monster.moveSpeedMs ?? 400) * (100 + slow) / 100);
    Object.assign(enemy, { approachFrom: point, position, startedAt: at,
      arrivedAt: at + walkDuration(point, position, speed) });
    delete enemy.approachPausedAt;
  }
  if (!target) {
    freezeFieldHero(s, at); hero.phase = "waiting";
    syncBattle(s); return;
  }
  if (b.cast || at < (hero.moveBlockedUntil ?? 0)) {
    freezeFieldHero(s, at); hero.phase = "fighting"; syncBattle(s); return;
  }
  const offensive = at >= (b.playerNextSkillAt ?? 0) ? chooseSkill(s, c, at, target, true, true) : undefined;
  const inRange = offensive ? skillTargetInRange(s, c, offensive, s.learnedSkills[offensive.id], target, at)
    : playerBattleDistance(heroPoint, enemyPositionAt(target, at)) <= basicAttackRange(s, c);
  if (inRange) {
    freezeFieldHero(s, at); hero.phase = "fighting";
  } else if (classicBuffActive(s, c, "TF_HIDING", at)) {
    freezeFieldHero(s, at); hero.phase = "waiting";
  } else {
    const range = offensive ? skillAttackRange(s, c, offensive, s.learnedSkills[offensive.id]) : basicAttackRange(s, c);
    const position = stopAtRange(heroPoint, enemyPositionAt(target, at), range * 0.9);
    Object.assign(hero, { from: heroPoint, position, startedAt: at,
      arrivedAt: at + walkDuration(heroPoint, position, playerWalkSpeed(s, c, at)), phase: "chasing" });
  }
  syncBattle(s);
}

/** A bounded persisted map population, reused directly by grouped combat. */
function updateFieldPopulation(s: GameState, c: Catalog, at: number) {
  const area = c.areas.find((entry) => entry.id === s.areaId);
  if (!area || s.status === "town" || s.status === "challenge") return;
  if (s.fieldPopulation?.areaId !== area.id) s.fieldPopulation = {
    areaId: area.id, generation: (s.fieldPopulation?.generation ?? 0) + 1,
    enemies: [], respawns: [],
  };
  const population = s.fieldPopulation!;
  const count = ["sewer", "cave", "sea", "castle"].includes(area.scene) ? 3 : 4;
  if (s.battle && !s.battle.challengeId) enemies(s);
  // Adopt a saved encounter from before map populations existed without changing ids.
  if (s.battle && !s.battle.challengeId && !population.enemies.length && !population.respawns.length)
    for (const [slot, enemy] of (s.battle.enemies ?? []).slice(0, count).entries()) {
      enemy.fieldSlot = slot;
      enemy.engaged = true;
      population.enemies.push(enemy);
    }
  // Saved JSON contains independent object copies: combat is authoritative by id.
  if (s.battle && !s.battle.challengeId) {
    const combat = new Map(s.battle.enemies?.map(enemy => [enemy.id, enemy]));
    population.enemies = population.enemies.map(enemy => combat.get(enemy.id) ?? enemy);
  }
  for (let slot = 0; slot < count; slot++) {
    if (population.enemies.some(enemy => enemy.fieldSlot === slot)) continue;
    const respawn = population.respawns.find(entry => entry.slot === slot);
    if (respawn && respawn.at > at) continue;
    const monsterId = chooseAreaMonster(s, c, area, random(s));
    const monster = c.monsters[monsterId];
    if (!monster) continue;
    const home = fieldHome(slot);
    population.enemies.push({
      id: `field-${area.id}-${++population.generation}-${slot}`,
      fieldSlot: slot, engaged: false, monsterId, hp: monster.hp, maxHp: monster.hp,
      startedAt: at, arrivedAt: at, enemyNextAttackAt: at,
      spawnDirection: slot * 2, position: home, approachFrom: home, hostile: false,
    });
    population.respawns = population.respawns.filter(entry => entry.slot !== slot);
  }
  for (const enemy of population.enemies) {
    if (enemy.engaged && (!s.battle || s.status !== "hunting")) {
      const point = enemyPositionAt(enemy, at);
      enemy.position = point;
      enemy.approachFrom = point;
      enemy.startedAt = enemy.arrivedAt = at;
      enemy.engaged = false;
      enemy.hostile = false;
      delete enemy.approachPausedAt;
    }
    for (const [name, status] of Object.entries(enemy.statuses ?? {}))
      if (status.expiresAt <= at) delete enemy.statuses![name];
    if (!enemy.engaged && !combatStatus(c, enemy, at).immobilized &&
        c.monsters[enemy.monsterId].canMove !== false && at >= enemy.arrivedAt + 2200) {
      const from = enemyPositionAt(enemy, at);
      enemy.approachFrom = from;
      enemy.position = fieldWanderPoint(enemy.fieldSlot!, at);
      enemy.startedAt = at;
      enemy.arrivedAt = at + walkDuration(from, enemy.position, c.monsters[enemy.monsterId].moveSpeedMs ?? 400);
    }
  }
  if (s.battle && !s.battle.challengeId) s.battle.enemies = population.enemies.slice();
}
export function syncBattle(s: GameState) {
  const b = s.battle;
  if (!b) return;
  if (!b.enemies?.length) { b.hp = 0; b.targetId = undefined; return; }
  const target = b.enemies.find((e) => e.id === b.targetId) ?? b.enemies.find(e => e.engaged) ?? b.enemies[0];
  b.targetId = target.id;
  b.monsterId = target.monsterId;
  b.hp = target.hp;
  b.maxHp = target.maxHp;
  b.enemyNextAttackAt = target.enemyNextAttackAt;
}
function enemies(s: GameState): BattleEnemy[] {
  const b = s.battle!;
  b.enemies ??= [
    {
      id: `legacy-${b.startedAt}-${b.monsterId}`,
      monsterId: b.monsterId,
      hp: b.hp,
      maxHp: b.maxHp,
      startedAt: b.startedAt,
      arrivedAt: b.startedAt,
      enemyNextAttackAt: b.enemyNextAttackAt,
      spawnDirection: 2,
      position: { x: 0.64, y: 0.65 },
    },
  ];
  b.targetId ??= b.enemies[0]?.id;
  return b.enemies;
}
export function beginBattle(
  s: GameState,
  c: Catalog,
  monsterId: number,
  at: number,
  challengeId?: string,
) {
  const monster = c.monsters[monsterId];
  s.battle = {
    monsterId,
    hp: monster.hp,
    maxHp: monster.hp,
    startedAt: at,
    playerNextAttackAt: at + 1000,
    playerNextSkillAt: at + 1000,
    playerActionReadyAt: at,
    enemyNextAttackAt: at + Math.max(1000, monster.attackDelay),
    enemies: [],
  };
  if (challengeId) {
    const ch = c.challenges.find((ch) => ch.id === challengeId)!;
    Object.assign(s.battle, {
      challengeId: ch.id,
      attemptId: `${s.id}-attempt-${++s.challengeAttempts}`,
      deadlineAt: at + ch.timeoutMs,
    });
  }
  const area = c.areas.find((a) => a.id === s.areaId);
  if (!challengeId && area) {
    updateFieldPopulation(s, c, at);
    const population = s.fieldPopulation!;
    const target = fieldTarget(s, c, population.enemies, at);
    s.battle.enemies = population.enemies.slice();
    s.battle.targetId = target?.id;
    s.battle.fieldDecisionAt = at;
    updateFieldActors(s, c, at);
    syncBattle(s);
    if (target) event(s, at, "encounter", c.monsters[target.monsterId].name, undefined, "enemy", {
      enemyId: target.id, monsterId: target.monsterId,
    });
    return;
  }
  const count =
    challengeId || !area || area.monsters.length < 2
      ? 1
      : 1 + Math.floor(random(s) * 3);
  const direction = Math.floor(random(s) * 8);
  for (let i = 0; i < count; i++) {
    const id = i ? chooseAreaMonster(s, c, area!, random(s)) : monsterId;
    const mob = c.monsters[id];
    const spawnDirection = (direction + i * 3) % 8;
    const angle = ((spawnDirection * 45 - 90) * Math.PI) / 180;
    const arrivedAt = at + 3000 + i * 750;
    const enemy: BattleEnemy = {
      id: `enemy-${at}-${s.nextEventId}-${i}`,
      monsterId: id,
      hp: mob.hp,
      maxHp: mob.hp,
      startedAt: at,
      arrivedAt,
      enemyNextAttackAt: at,
      spawnDirection,
      hostile: !!challengeId || (mob.aggressive ?? false),
      approachFrom: {
        x: BATTLE_HERO.x + Math.cos(angle),
        y: BATTLE_HERO.y + Math.sin(angle),
      },
      position: {
        x: battleHeroAt(s, at).x + Math.cos(angle) * 0.9 / BATTLE_CELLS_PER_UNIT,
        y: battleHeroAt(s, at).y + Math.sin(angle) * 0.9 / BATTLE_CELLS_PER_UNIT,
      },
    };
    enemy.homePosition = { ...enemy.position };
    s.battle.enemies!.push(enemy);
    event(s, at, "encounter", mob.name, undefined, "enemy", {
      enemyId: enemy.id,
      monsterId: id,
    });
  }
  syncBattle(s);
}
function autoPotion(s: GameState, c: Catalog, at: number) {
  if (at < s.potionReadyAt || s.hp <= 0) return;
  const d = derivedStats(s, c);
  const hp =
    s.autoPotion.hpThreshold > 0 &&
    s.hp < d.maxHp &&
    s.hp * 100 <= d.maxHp * s.autoPotion.hpThreshold;
  const sp =
    s.autoPotion.spThreshold > 0 &&
    s.sp < d.maxSp &&
    s.sp * 100 <= d.maxSp * s.autoPotion.spThreshold;
  const choose = (resource: "healHP" | "healSP", missing: number) => {
    const available = s.inventory.filter(
      (e) =>
        c.items[e.itemId]?.type === "consumable" &&
        (c.items[e.itemId][resource] ?? 0) > 0,
    );
    const sufficient = available.filter(
      (e) => (c.items[e.itemId][resource] ?? 0) >= missing,
    );
    return (sufficient.length ? sufficient : available).sort(
      (a, b) =>
        ((c.items[a.itemId][resource] ?? 0) -
          (c.items[b.itemId][resource] ?? 0)) *
          (sufficient.length ? 1 : -1) || a.itemId - b.itemId,
    )[0];
  };
  const entry =
    (hp ? choose("healHP", d.maxHp - s.hp) : undefined) ??
    (sp ? choose("healSP", d.maxSp - s.sp) : undefined);
  if (!entry) return;
  const item = c.items[entry.itemId];
  const levels = learnedBySource(s, c);
  consume(s, entry, 1);
  s.hp = Math.min(
    d.maxHp,
    s.hp +
      classicPotionHealing(
        item.healHP ?? 0,
        d.attributes?.vit ?? s.stats.vit,
        levels.SM_RECOVERY ?? 0,
        levels.AM_LEARNINGPOTION ?? 0,
      ),
  );
  s.sp = Math.min(
    d.maxSp,
    s.sp +
      classicPotionHealing(
        item.healSP ?? 0,
        d.attributes?.int ?? s.stats.int,
        levels.MG_SRECOVERY ?? 0,
        levels.AM_LEARNINGPOTION ?? 0,
      ),
  );
  s.potionReadyAt = at + 2000;
  s.totals.potions++;
  event(s, at, "potion", item.name);
  if (s.status === "hunting" && s.areaId)
    recordAreaActivity(s, s.areaId, at, { potions: 1 });
}
function elementMultiplier(c: Catalog, element: string, monster: Monster) {
  const row =
    c.elementModifiers?.[element.toLowerCase()] ??
    c.elementModifiers?.[element];
  const levels = row?.[monster.element.toLowerCase()] ?? row?.[monster.element];
  return (levels?.[monster.elementLevel - 1] ?? 100) / 100;
}
function chooseSkill(
  s: GameState,
  c: Catalog,
  at: number,
  target: BattleEnemy,
  ignoreRange = false,
  offenseOnly = false,
): Skill | undefined {
  const d = derivedStats(s, c);
  const entry = s.inventory.find((e) => e.uid === s.equipment.weapon);
  const type = entry ? c.items[entry.itemId]?.weaponType : undefined;
  for (const id of s.rotation) {
    const skill = c.skills[id],
      level = s.learnedSkills[id];
    if (
      !skill ||
      !level ||
      skill.kind === "passive" ||
      skill.implementation === "unsupported" ||
      (s.skillReadyAt[id] ?? 0) > at
    )
      continue;
    if ((offenseOnly || s.battle?.supportNeedsOffense) && !offensiveSkill(skill)) continue;
    if (!ignoreRange && !skillTargetInRange(s, c, skill, level, target, at)) continue;
    if (
      !canPaySkillResources(s, c, skill, level, at) ||
      !comboAllowed(s, c, skill, at)
    )
      continue;
    if (classicBuffActive(s, c, "TF_HIDING", at) && !canActWhileHidden(skill))
      continue;
    // Level 1–2 Cloaking requires real wall cells, unavailable in this formation.
    if (skill.sourceName === "AS_CLOAKING" && level < 3) continue;
    if (
      skill.sourceName === "PF_HPCONVERSION" &&
      (s.sp >= d.maxSp || s.hp <= Math.floor(d.maxHp * 0.1))
    )
      continue;
    if (
      (skill.requiredWeapon?.length &&
        (!type || !skill.requiredWeapon.includes(type))) ||
      (skill.requiredSlot && !s.equipment[skill.requiredSlot])
    )
      continue;
    if (
      skill.requiredTwoHanded &&
      (!entry || !c.items[entry.itemId]?.twoHanded)
    )
      continue;
    if (skill.requiredState) {
      const state = skill.requiredState.toLowerCase();
      const hasBuff = (source: string) =>
        Object.entries(s.buffs).some(
          ([id, b]) => b.expiresAt > at && c.skills[id]?.sourceName === source,
        );
      if (state === "sight" && !hasBuff("MG_SIGHT")) continue;
      if (state === "shield" && !s.equipment.shield) continue;
      if (state === "explosionspirits" && !hasBuff("MO_EXPLOSIONSPIRITS"))
        continue;
      if (state === "hiding" && !hasBuff("TF_HIDING")) continue;
      if (
        state === "inwater" &&
        !["sea"].includes(
          c.areas.find((a) => a.id === s.areaId)?.scene ?? "",
        ) &&
        !hasBuff("SA_DELUGE")
      )
        continue;
      if (state === "cartboost" && !hasBuff("WS_CARTBOOST")) continue;
      if (
        state === "cart" &&
        !Object.entries(s.learnedSkills).some(
          ([id, l]) => l > 0 && c.skills[id]?.sourceName === "MC_PUSHCART",
        )
      )
        continue;
      if (
        state === "combo" &&
        !(s.combatEffects?.combo && s.combatEffects.combo.expiresAt > at)
      )
        continue;
    }
    if (skill.kind === "heal" && s.hp > d.maxHp * 0.7) continue;
    if (
      skill.statusEffect &&
      skill.targetType === "enemy" &&
      (target.statuses?.[skill.statusEffect]?.expiresAt ?? 0) > at
    )
      continue;
    if (skill.kind === "steal" && !canSteal(s, c, skill, target)) continue;
    if (
      skill.kind === "buff" &&
      s.buffs[id]?.expiresAt > at &&
      !["MO_CALLSPIRITS", "CH_SOULCOLLECT"].includes(skill.sourceName ?? "")
    )
      continue;
    if (
      ["MO_CALLSPIRITS", "CH_SOULCOLLECT"].includes(skill.sourceName ?? "") &&
      (s.combatEffects?.spiritSpheres ?? 0) >=
        (skill.sourceName === "MO_CALLSPIRITS" ? level : 5)
    )
      continue;
    if (
      skill.sourceName === "MO_ABSORBSPIRITS" &&
      !(s.combatEffects?.spiritSpheres ?? 0)
    )
      continue;
    if (skill.mechanic === "HW_MAGICPOWER" && s.combatEffects?.magicPower)
      continue;
    return skill;
  }
}
function awardKill(
  s: GameState,
  c: Catalog,
  enemy: BattleEnemy,
  at: number,
  skill?: Skill,
) {
  const b = s.battle!,
    monster = c.monsters[enemy.monsterId];
  const enemyPosition = { ...enemyPositionAt(enemy, at) };
  const areaId = b.challengeId ? undefined : s.areaId ?? undefined;
  if (b.attemptId && s.rewardedAttempts.includes(b.attemptId)) {
    s.battle = null;
    s.status = "town";
    s.pendingAreaId = null;
    return;
  }
  s.bestiary[monster.id] = (s.bestiary[monster.id] ?? 0) + 1;
  s.totals.kills++;
  const base = s.totals.baseExp,
    job = s.totals.jobExp;
  gainExp(
    s,
    c,
    monster.baseExp * c.rates.baseExp,
    monster.jobExp * c.rates.jobExp,
    at,
  );
  if (!b.challengeId && s.areaId)
    recordAreaActivity(s, s.areaId, at, {
      kills: 1,
      baseExp: s.totals.baseExp - base,
      jobExp: s.totals.jobExp - job,
    });
  event(s, at, "kill", `${monster.name} derrotado.`, undefined, "enemy", {
    enemyId: enemy.id,
    enemyPosition: { ...enemyPosition },
    areaId,
    monsterId: monster.id,
  });
  for (const drop of [...monster.drops, ...(monster.mvpDrops ?? [])])
    if (
      c.items[drop.itemId] &&
      random(s) * 10000 < Math.min(10000, drop.chance * c.rates.drop)
    ) {
      addItem(s, c, drop.itemId, 1, true);
      if (!b.challengeId && s.areaId)
        recordAreaActivity(s, s.areaId, at, {
          lootZeny: c.items[drop.itemId].sellPrice,
        });
      event(s, at, "loot", c.items[drop.itemId].type === "equipment" ? "Equipamento não identificado" : c.items[drop.itemId].name, undefined, undefined, {
        itemId: drop.itemId,
        quantity: 1,
        enemyId: enemy.id,
        enemyPosition: { ...enemyPosition },
        areaId,
        monsterId: monster.id,
      });
    }
  const drain =
    Object.entries(s.learnedSkills).find(
      ([id]) => c.skills[id]?.sourceName === "HW_SOULDRAIN",
    )?.[1] ?? 0;
  if (
    drain &&
    skill?.kind === "magical" &&
    !val(skill.aoeRadius, s.learnedSkills[skill.id])
  )
    s.sp = Math.min(
      derivedStats(s, c).maxSp,
      s.sp + Math.floor((monster.level * (95 + 15 * drain)) / 100),
    );
  b.enemies = b.enemies!.filter((e) => e.id !== enemy.id);
  if (!b.challengeId && enemy.fieldSlot !== undefined && s.fieldPopulation?.areaId === s.areaId) {
    s.fieldPopulation.enemies = s.fieldPopulation.enemies.filter(entry => entry.id !== enemy.id);
    s.fieldPopulation.respawns = s.fieldPopulation.respawns.filter(entry => entry.slot !== enemy.fieldSlot);
    s.fieldPopulation.respawns.push({ slot: enemy.fieldSlot, at: at + POST_WAVE_SEARCH_MS });
    if (s.pendingAreaId && b.targetId === enemy.id) b.fieldTransferReady = true;
    if (!b.enemies.some(entry => entry.id === b.targetId))
      b.targetId = fieldTarget(s, c, b.enemies, at)?.id;
    b.fieldDecisionAt = at;
    if (s.fieldHero) {
      s.fieldHero.targetId = b.targetId;
      s.fieldHero.phase = b.targetId ? "seeking" : "waiting";
    }
    syncBattle(s);
    updateQuests(s, c);
    return;
  }
  if (b.enemies.some(entry => entry.fieldSlot === undefined || entry.engaged)) {
    const target = fieldTarget(s, c, b.enemies.filter(entry => entry.fieldSlot === undefined || entry.engaged), at);
    b.targetId = target?.id;
    syncBattle(s);
    return;
  }
  if (b.challengeId) {
    if (b.attemptId && s.rewardedAttempts.includes(b.attemptId)) {
      s.battle = null;
      s.status = "town";
      return;
    }
    if (b.attemptId) s.rewardedAttempts.push(b.attemptId);
    const ch = c.challenges.find((ch) => ch.id === b.challengeId)!;
    const previous = s.challengeWins[ch.id] ?? 0;
    s.challengeWins[ch.id] = previous + 1;
    s.challengeCooldowns[ch.id] = at + ch.cooldownMs;
    if (!previous) grantReward(s, c, ch.firstReward, at);
    s.status = "town";
    s.autoResume = false;
  }
  s.battle = null;
  if (!b.challengeId && s.pendingAreaId) {
    const next = c.areas.find((a) => a.id === s.pendingAreaId);
    if (next) {
      s.areaId = next.id;
      if (!s.visitedAreas.includes(next.id)) s.visitedAreas.push(next.id);
      event(s, at, "hunt", `Caçando em ${next.name}.`);
    }
  }
  s.pendingAreaId = null;
  if (s.status === "hunting" && s.areaId)
    s.nextEncounterAt = at + encounterDelay(s, s.areaId, POST_WAVE_SEARCH_MS);
  updateQuests(s, c);
}
function targets(
  s: GameState,
  skill: Skill | undefined,
  level: number,
  target: BattleEnemy,
  at: number,
  center?: { x: number; y: number },
) {
  const radius = val(skill?.aoeRadius, level) || (center ? 0.5 : 0);
  const selfCentered = skill?.targetType === "self" && val(skill.range, level) === 0;
  const point = center ?? (selfCentered ? battleHeroAt(s, at) : enemyPositionAt(target, at));
  return enemies(s).filter(
    (e) =>
      e.startedAt <= at &&
      ((!center && !selfCentered && e.id === target.id) ||
        (radius > 0 &&
          battleDistance(enemyPositionAt(e, at), point) <= radius)),
  );
}
function applyEnemyStatus(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  target: BattleEnemy,
  at: number,
  center?: { x: number; y: number },
) {
  if (!skill.statusEffect) return;
  const attrs = derivedStats(s, c).attributes ?? s.stats;
  const casterDex = attrs.dex;
  for (const enemy of targets(s, skill, level, target, at, center)) {
    const monster = c.monsters[enemy.monsterId];
    const strip = (skill.sourceName ?? "").startsWith("RG_STRIP");
    let chance = strip
      ? classicStripChance(level, casterDex, monster.stats.dex)
      : val(skill.statusChance, level, 100);
    if (skill.sourceName === "SM_PROVOKE")
      chance = classicProvokeBaseChance(monster, level, s.baseLevel);
    if (skill.sourceName === "AL_DECAGI")
      chance = classicDecreaseAgilityBaseChance(level, s.baseLevel, attrs.int);
    let duration = strip
      ? classicStripDuration(
          val(skill.statusDurationMs, level, 5000),
          casterDex,
          monster.stats.dex,
        )
      : val(skill.statusDurationMs, level, 5000);
    if (isClassicResistedStatus(skill.statusEffect)) {
      const resistance = classicStatusResistance(
        monster,
        skill.statusEffect,
        chance,
        duration,
        { level: s.baseLevel, luk: attrs.luk },
      );
      chance = resistance.chancePct;
      duration = resistance.durationMs;
    }
    if (
      !(monster.boss ?? !!s.battle?.challengeId) &&
      random(s) * 100 < chance
    ) {
      provokeEnemy(s, c, enemy, at);
      if (skill.sourceName === "SM_PROVOKE") breakControlOnDamage(enemy, 1, at);
      (enemy.statuses ??= {})[skill.statusEffect] = {
        expiresAt:
          at +
          (skill.statusEffect === "SC_STONE"
            ? classicStoneTiming(duration, skill.durationMs ?? 5000)
                .totalDurationMs
            : duration),
        startsAt: at,
        ...(skill.statusEffect === "SC_STONE" && {
          petrifiesAt:
            at + classicStoneTiming(duration, skill.durationMs ?? 5000).delayMs,
        }),
        ...(skill.statusEffect === "SC_POISON" && { nextTickAt: at + 1000 }),
        level,
      };
      if (at < enemy.arrivedAt && combatStatus(c, enemy, at).immobilized)
        enemy.approachPausedAt ??= at;
    }
  }
}
function damageEnemies(
  s: GameState,
  c: Catalog,
  target: BattleEnemy,
  at: number,
  skill?: Skill,
  level = 1,
  center?: { x: number; y: number },
  action = playerAction(s, c, at, "attack"),
) {
  if (skill?.sourceName === "MO_FINGEROFFENSIVE") {
    const count = Math.max(1, s.combatEffects?.consumedSpheres ?? 1);
    skill = { ...skill, sourceHitCount: [count], hitCount: [count] };
  }
  const d = derivedStats(s, c),
    equipped = s.inventory.find((e) => e.uid === s.equipment.weapon),
    weapon = equipped ? c.items[equipped.itemId] : undefined;
  const hitTargets = targets(s, skill, level, target, at, center),
    magical = skill?.kind === "magical",
    boost = s.combatEffects?.magicPower ?? 0;
  // Engage the whole splash before any kill can finish the current wave.
  for (const enemy of hitTargets) provokeEnemy(s, c, enemy, at);
  const bySource = Object.fromEntries(
    Object.entries(s.learnedSkills).map(([id, l]) => [
      c.skills[id]?.sourceName ?? id,
      l,
    ]),
  );
  for (const enemy of hitTargets) {
    if (
      ["WZ_STORMGUST", "WZ_FROSTNOVA"].includes(skill?.sourceName ?? "") &&
      (enemy.statuses?.SC_FREEZE?.expiresAt ?? 0) > at
    )
      continue;
    provokeEnemy(s, c, enemy, at);
    const enemyStatus = combatStatus(c, enemy, at);
    const monster = enemyStatus.monster,
      crit =
        !skill &&
        random(s) * 100 < Math.min(100, d.crit - monster.stats.luk * 0.2);
    const hitBonus =
      skill?.sourceName === "SM_BASH" || skill?.sourceName === "KN_PIERCE"
        ? 5 * level
        : skill?.sourceName === "SM_MAGNUM"
          ? 10 * level
          : skill?.sourceName === "PA_SHIELDCHAIN"
            ? 20
            : skill?.sourceName === "AS_SONICBLOW" &&
                (bySource.AS_SONICACCEL ?? 0) > 0
              ? 50
              : 0;
    const accuracy = Math.min(
      0.95,
      Math.max(
        0.05,
        ((80 + d.hit - enemyStatus.flee) * (1 + hitBonus / 100)) / 100,
      ),
    );
    if (!magical && !crit && !skill?.ignoreFlee && random(s) >= accuracy) {
      event(s, at, "miss", "Ataque errou.", undefined, "enemy", {
        enemyId: enemy.id,
        monsterId: monster.id,
        skillId: skill?.id,
        ...action,
        targetActorId: enemy.id,
        hitMotionMs: monster.damageMotionMs ?? 400,
      });
      continue;
    }
    const active = activeBySource(s, c, at);
    const attackElement =
      skill?.element && skill.element.toLowerCase() !== "weapon"
        ? skill.element
        : classicWeaponElement(active);
    const element = elementMultiplier(c, attackElement, monster);
    const size = weapon?.weaponType
      ? (c.sizeModifiers?.[weapon.weaponType]?.[monster.size.toLowerCase()] ??
          c.sizeModifiers?.[weapon.weaponType]?.[monster.size] ??
          100) / 100
      : 1;
    const shieldEntry = s.inventory.find((e) => e.uid === s.equipment.shield),
      shield = shieldEntry ? c.items[shieldEntry.itemId] : undefined;
    const stats = {
      ...d,
      ...d.attributes,
      baseLevel: s.baseLevel,
      baseAttack:
        d.baseAttack ?? d.attack -
        (d.weaponAttack ?? weapon?.attack ?? 0) -
        (d.weaponRefineAttack ?? 0),
      weaponType: weapon?.weaponType,
      weaponAttack: d.weaponAttack ?? weapon?.attack ?? 0,
      weaponLevel: weapon?.weaponLevel ?? 1,
      weaponWeight: weapon?.weight,
      weaponRefineAttack: d.weaponRefineAttack ?? 0,
      shieldWeight: shield?.weight,
      shieldRefine: shieldEntry?.refine,
      twoHanded: weapon?.twoHanded,
      critical: crit,
      damagePercent: d.effects.damagePct ?? 0,
      magicPowerPercent: boost * 5,
      targetCount: hitTargets.length,
      sizeMultiplier: size,
      elementMultiplier: element,
      learnedSkills: s.learnedSkills,
      skillLevelsBySource: bySource,
      activeSkillsBySource: active,
      targetDefPercent: enemyStatus.defPercent,
      maxHp: d.maxHp,
      maxSp: d.maxSp,
      hp: s.hp,
      sp: s.sp,
      cartWeightRatio: Math.min(
        1,
        s.inventory.reduce(
          (n, e) => n + (c.items[e.itemId]?.weight ?? 0) * e.quantity,
          0,
        ) / 8000,
      ),
      spiritSpheres:
        skill?.sourceName === "MO_FINGEROFFENSIVE"
          ? (s.combatEffects?.consumedSpheres ?? 0)
          : (s.combatEffects?.spiritSpheres ?? 0),
      consumedSpheres: s.combatEffects?.consumedSpheres ?? 0,
      targetHp: enemy.hp,
      targetIsBoss: monster.boss ?? !!s.battle?.challengeId,
    };
    let damage = magical
      ? classicMagicDamage(stats, monster, skill!, level, () => random(s))
      : classicPhysicalDamage(stats, monster, skill, level, () => random(s));
    const lex = Object.entries(enemy.statuses ?? {}).find(
      ([name, effect]) => /LEXAETERNA/i.test(name) && effect.expiresAt > at,
    );
    if (damage > 0 && lex) {
      damage *= 2;
      delete enemy.statuses![lex[0]];
    }
    enemy.hp = Math.max(0, enemy.hp - damage);
    breakControlOnDamage(enemy, damage, at);
    event(
      s,
      at,
      "damage",
      magical ? "Dano mágico" : "Ataque",
      damage,
      "enemy",
      {
        skillId: skill?.id,
        skillLevel: skill ? level : undefined,
        critical: crit,
        enemyId: enemy.id,
        monsterId: monster.id,
        hitCount: val(skill?.hitCount, level, 1),
        castMs: 0,
        ...action,
        targetActorId: enemy.id,
        hitMotionMs: monster.damageMotionMs ?? 400,
      },
    );
    if (skill?.sourceName === "WZ_STORMGUST") {
      enemy.stormGustHits = damage > 0 ? (enemy.stormGustHits ?? 0) + 1 : 0;
      if (enemy.stormGustHits >= 3) {
        applyEnemyStatus(
          s,
          c,
          { ...skill, aoeRadius: [0], statusChance: [150] },
          level,
          enemy,
          at,
        );
        if (
          (enemy.statuses?.SC_FREEZE?.expiresAt ?? 0) > at ||
          enemy.stormGustHits > 250
        )
          enemy.stormGustHits = 0;
      }
    } else if (skill?.statusEffect && skill.sourceName !== "MO_EXTREMITYFIST")
      applyEnemyStatus(s, c, { ...skill, aoeRadius: [0] }, level, enemy, at);
    if (enemy.hp <= 0 && s.battle) awardKill(s, c, enemy, at, skill);
    else if (
      skill?.sourceName === "MG_FIREWALL" &&
      !monster.boss &&
      monster.element.toLowerCase() !== "undead"
    ) {
      const point = enemyPositionAt(enemy, at);
      const dx = point.x - battleHeroAt(s, at).x,
        dy = point.y - battleHeroAt(s, at).y,
        length = Math.hypot(dx, dy) || 1;
      const pushed = {
        x: point.x + dx / length / BATTLE_CELLS_PER_UNIT,
        y: point.y + dy / length / BATTLE_CELLS_PER_UNIT,
      };
      if (at < enemy.arrivedAt) {
        const remaining = Math.max(1, enemy.arrivedAt - at);
        enemy.approachFrom = pushed;
        enemy.startedAt = at;
        enemy.arrivedAt = at + remaining * battleDistance(pushed, enemy.position) / Math.max(1, battleDistance(point, enemy.position));
      } else enemy.position = pushed;
    }
  }
  if (magical && s.combatEffects) s.combatEffects.magicPower = 0;
  if (s.battle) syncBattle(s);
}
function resolveSkill(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  target: BattleEnemy,
  at: number,
  groundTick = false,
  center?: { x: number; y: number },
  action = playerAction(s, c, at, groundTick ? "none" : "skill"),
) {
  const d = derivedStats(s, c),
    mechanic = skill.sourceName ?? skill.mechanic;
  const delayedControl = ["BA_FROSTJOKE", "DC_SCREAM"].includes(mechanic ?? "");
  const enemyControl =
    !!skill.statusEffect &&
    (delayedControl || ["enemy", "ground"].includes(skill.targetType ?? ""));
  const selfCentered = skill.targetType === "self" && val(skill.range, level) === 0;
  const groundPosition = { ...(center ?? (selfCentered ? battleHeroAt(s, at) : enemyPositionAt(target, at))) };
  if (!groundTick && !paySkillResources(s, c, skill, level, at)) {
    event(
      s,
      at,
      "cast-failed",
      "Recursos insuficientes ao concluir a habilidade.",
      undefined,
      "player",
      { skillId: skill.id },
    );
    return false;
  }
  if (
    !groundTick &&
    skill.targetType !== "ground" &&
    ["physical", "magical"].includes(skill.kind) &&
    s.combatEffects
  )
    s.combatEffects.combo = undefined;
  let amount: number | undefined;
  if (skill.kind === "heal") {
    let healing = val(skill.power, level);
    if (mechanic === "AL_HEAL")
      healing = classicHeal(
        s.baseLevel,
        d.attributes?.int ?? s.stats.int,
        level,
      );
    const meditation =
      Object.entries(s.learnedSkills).find(
        ([id]) => c.skills[id]?.sourceName === "HP_MEDITATIO",
      )?.[1] ?? 0;
    if (mechanic === "AL_HEAL")
      healing = Math.floor(healing * (1 + 0.02 * meditation));
    const before = s.hp;
    s.hp = Math.min(d.maxHp, s.hp + healing);
    amount = s.hp - before;
  }
  if (
    skill.kind === "buff" &&
    !enemyControl &&
    !["PF_HPCONVERSION", "MO_ABSORBSPIRITS"].includes(mechanic ?? "")
  ) {
    const effects = skill.sourceName
      ? classicSkillEffects(skill, level, {
          ...d.attributes,
          maxHp: d.maxHp,
          maxSp: d.maxSp,
          skillLevelsBySource: Object.fromEntries(
            Object.entries(s.learnedSkills).map(([id, l]) => [
              c.skills[id]?.sourceName ?? id,
              l,
            ]),
          ),
        })
      : Object.fromEntries(
          Object.entries(skill.effects ?? {}).map(([k, v]) => [k, v * level]),
        );
    s.buffs[skill.id] = {
      expiresAt:
        at +
        val(
          skill.statusDurationMs,
          level,
          val(skill.groundDurationMs, level, skill.durationMs ?? 30000),
        ),
      effects,
    };
    if (applyClassicBuff(s, c, skill, level, at))
      s.buffs[skill.id].effects = effects;
    const combat = (s.combatEffects ??= {});
    if (mechanic === "MG_SAFETYWALL") combat.safetyWallHits = level + 1;
    if (mechanic === "MG_ENERGYCOAT") combat.energyCoat = true;
    if (mechanic === "HW_MAGICPOWER") combat.magicPower = level;
    if (mechanic === "PR_KYRIE") {
      combat.kyrieHp = Math.floor((d.maxHp * (10 + 2 * level)) / 100);
      combat.kyrieHits = Math.floor(level / 2) + 5;
    }
    if (mechanic === "MO_CALLSPIRITS")
      combat.spiritSpheres = Math.min(level, (combat.spiritSpheres ?? 0) + 1);
    if (mechanic === "CH_SOULCOLLECT") combat.spiritSpheres = 5;
    if (mechanic === "MO_ABSORBSPIRITS") {
      s.sp = Math.min(d.maxSp, s.sp + 7 * (combat.spiritSpheres ?? 0));
      combat.spiritSpheres = 0;
    }
    if (mechanic === "WZ_QUAGMIRE")
      for (const e of targets(s, skill, level, target, at))
        (e.statuses ??= {}).quagmire = {
          expiresAt: at + val(skill.groundDurationMs, level, 5000 * level),
          level,
        };
  }
  if (skill.kind === "steal") attemptSteal(s, c, skill, level, target, at);
  if (mechanic === "MO_ABSORBSPIRITS") {
    s.sp = Math.min(d.maxSp, s.sp + 7 * (s.combatEffects?.spiritSpheres ?? 0));
    (s.combatEffects ??= {}).spiritSpheres = 0;
  }
  if (mechanic === "PF_HPCONVERSION") {
    const hp = Math.floor(d.maxHp * 0.1);
    if (s.hp > hp) {
      s.hp -= hp;
      const before = s.sp;
      s.sp = Math.min(d.maxSp, s.sp + Math.floor((hp * level) / 10));
      amount = s.sp - before;
    }
  }
  if (!groundTick)
    event(
      s,
      at,
      "skill",
      skill.name,
      amount,
      skill.kind === "heal" || skill.kind === "buff" ? "player" : "enemy",
      {
        skillId: skill.id,
        skillLevel: level,
        enemyId: target.id,
        monsterId: target.monsterId,
        castMs: 0,
        hitCount: val(skill.hitCount, level, 1),
        ...action,
        targetActorId: skill.kind === "heal" || skill.kind === "buff" && !enemyControl ? s.id : target.id,
      },
    );
  if (skill.kind === "physical" || skill.kind === "magical")
    damageEnemies(s, c, target, at, skill, level, center, action);
  if (mechanic === "RG_RAID") cancelClassicBuff(s, c, "TF_HIDING");
  if (skill.kind === "buff" && enemyControl && s.battle) {
    if (delayedControl)
      (s.battle.delayedSkills ??= []).push({
        skillId: skill.id,
        level,
        targetId: target.id,
        position: { ...battleHeroAt(s, at) },
        endsAt: at + (skill.effectDelayMs ?? 2000),
      });
    else applyEnemyStatus(s, c, skill, level, target, at, center);
  }
  if (mechanic === "MO_EXTREMITYFIST") {
    s.sp = 0;
    (s.combatEffects ??= {}).spiritSpheres = 0;
    for (const id of Object.keys(s.buffs))
      if (c.skills[id]?.sourceName === "MO_EXPLOSIONSPIRITS")
        delete s.buffs[id];
    s.buffs[skill.id] = {
      expiresAt: at + val(skill.statusDurationMs, level, 300000),
      effects: {},
    };
  }
  if (
    [
      "MO_CHAINCOMBO",
      "MO_COMBOFINISH",
      "CH_TIGERFIST",
      "CH_CHAINCRUSH",
    ].includes(mechanic ?? "")
  )
    (s.combatEffects ??= {}).combo = {
      sourceName: mechanic!,
      expiresAt: at + 2000,
    };
  const pulseCount =
    mechanic === "WZ_WATERBALL"
      ? (2 * Math.floor(level / 2) + 1) ** 2
      : mechanic === "WZ_METEOR"
        ? 2 + Math.floor(level / 2)
        : undefined;
  const interval =
    mechanic === "WZ_WATERBALL" ? 125 : (skill.groundIntervalMs ?? 0);
  const duration = pulseCount
    ? pulseCount * interval
    : val(skill.groundDurationMs, level);
  if (
    !groundTick &&
    mechanic !== "WZ_FIREPILLAR" &&
    skill.groundHitLimit !== 1 &&
    s.battle &&
    interval > 0 &&
    duration > interval
  )
    (s.battle.groundEffects ??= []).push({
      skillId: skill.id,
      level,
      position: groundPosition,
      remainingHits:
        mechanic === "MG_FIREWALL"
          ? 3 + level
          : pulseCount
            ? pulseCount - 1
            : undefined,
      targetId: mechanic === "WZ_WATERBALL" ? target.id : undefined,
      intervalMs: interval,
      nextTickAt: at + interval,
      expiresAt: at + duration,
    });
  return true;
}
function enemyAttack(s: GameState, c: Catalog, enemy: BattleEnemy, at: number) {
  const enemyStatus = combatStatus(c, enemy, at);
  const b = s.battle!,
    monster = enemyStatus.monster,
    d = derivedStats(s, c);
  const activeCast = b.cast && b.cast.startedAt <= at && at < b.cast.endsAt ? b.cast : undefined;
  if (enemyDistanceAt(enemy, at, battleHeroAt(s, at)) > (monster.attackRange ?? 1) + 1e-9) return;
  if (enemy.hostile === false) {
    enemy.enemyNextAttackAt = at + 500;
    return;
  }
  if (playerHiddenFrom(s, c, monster, at)) {
    enemy.enemyNextAttackAt = at + 500;
    return;
  }
  if (enemyStatus.immobilized) {
    enemy.enemyNextAttackAt = at + 500;
    return;
  }
  const action: ActionMetadata = {
    sourceActorId: enemy.id,
    actionId: `action-${enemy.id}-${at}-${s.nextEventId}`,
    actorAction: "attack",
    actionStartedAt: at,
    actionMotionMs: Math.min(2000, Math.max(10, monster.attackMotionMs ?? monster.attackDelay / 2)),
  };
  // status.c:3359: pre-renewal player damage motion, default delay rate 100.
  const hitMotionMs = Math.min(800, Math.max(400, 800 - (d.attributes?.agi ?? s.stats.agi) * 4));
  const crowd = enemies(s).filter((e) => e.hostile !== false && enemyDistanceAt(e, at, battleHeroAt(s, at)) <= (c.monsters[e.monsterId].attackRange ?? 1) + 1e-9).length,
    flee = d.flee * Math.max(0.2, 1 - Math.max(0, crowd - 2) * 0.1);
  const rangedAttack = (monster.attackRange ?? 1) > 3;
  const accuracy = Math.min(
    0.95,
    Math.max(0.05, (80 + enemyStatus.hit - flee) / 100),
  );
  if (random(s) * 100 < (d.perfectDodge ?? d.effects.perfectDodge ?? 0) || random(s) >= accuracy)
    event(s, at, "dodge", "Esquiva!", undefined, "player", {
      enemyId: enemy.id,
      monsterId: monster.id,
      ...action,
      targetActorId: s.id,
      hitMotionMs,
    });
  else if (!rangedAttack && (s.combatEffects?.safetyWallHits ?? 0) > 0) {
    s.combatEffects!.safetyWallHits =
      (s.combatEffects!.safetyWallHits ?? 0) - 1;
    event(s, at, "dodge", "Escudo Mágico", undefined, "player", {
      enemyId: enemy.id,
      ...action,
      targetActorId: s.id,
      hitMotionMs,
    });
  } else {
    const raw = Math.floor(
        ((monster.attack[0] +
          Math.floor(random(s) * (monster.attack[1] - monster.attack[0] + 1))) *
          enemyStatus.atkPercent) /
          100,
      ),
      vit = d.attributes?.vit ?? s.stats.vit;
    const levels = learnedBySource(s, c);
    const protection =
      monster.race.toLowerCase() === "demon" ||
      monster.element.toLowerCase() === "undead"
        ? classicDivineProtection(s.baseLevel, levels.AL_DP ?? 0)
        : 0;
    const soft =
      (vit + Math.floor(random(s) * (Math.floor(vit * 0.3) + 1))) *
      (1 + (d.effects.softDefPct ?? 0) / 100);
    const castDefenseReduction = activeCast
      ? (c.skills[activeCast.skillId]?.castDefenseReductionPct ?? 0)
      : 0;
    const hardDef = d.def - Math.floor((d.def * castDefenseReduction) / 100);
    let damage = Math.max(
      1,
      Math.floor(
        (raw * (1 - Math.min(100, hardDef) / 100) - soft - protection) *
          classicIncomingSkillReduction(
            levels,
            monster.race,
            "neutral",
            d.effects.neutralResist ?? 0,
          ),
      ),
    );
    damage = Math.max(
      1,
      Math.floor(
        damage * (1 - Math.min(100, d.effects.physicalResistPct ?? 0) / 100),
      ),
    );
    if (random(s) * 100 < (d.effects.blockPct ?? 0)) damage = 0;
    if (s.combatEffects?.energyCoat && s.sp > 0 && damage > 0) {
      const band = Math.min(4, Math.floor((s.sp / d.maxSp) * 5));
      damage = Math.max(1, Math.floor(damage * (1 - 0.06 * (band + 1))));
      s.sp = Math.max(
        0,
        s.sp - Math.max(1, Math.floor((d.maxSp * (1 + 0.5 * band)) / 100)),
      );
    }
    if (
      damage > 0 &&
      (s.combatEffects?.kyrieHp ?? 0) > 0 &&
      (s.combatEffects?.kyrieHits ?? 0) > 0
    ) {
      const blocked = Math.min(damage, s.combatEffects!.kyrieHp!);
      s.combatEffects!.kyrieHp! -= blocked;
      s.combatEffects!.kyrieHits!--;
      damage -= blocked;
      if (!s.combatEffects!.kyrieHp || !s.combatEffects!.kyrieHits)
        for (const id of Object.keys(s.buffs))
          if (c.skills[id]?.sourceName === "PR_KYRIE") delete s.buffs[id];
    }
    s.hp = Math.max(0, s.hp - damage);
    if (damage > 0) {
      cancelClassicBuff(s, c, "TF_HIDING");
      cancelClassicBuff(s, c, "AS_CLOAKING");
    }
    const reflected = rangedAttack ? 0 : Math.floor((damage * (d.effects.reflectPct ?? 0)) / 100);
    if (reflected > 0) {
      enemy.hp = Math.max(0, enemy.hp - reflected);
      breakControlOnDamage(enemy, reflected, at);
      event(s, at, "damage", "Reflexão", reflected, "enemy", {
        enemyId: enemy.id,
        monsterId: monster.id,
        ...playerAction(s, c, at, "none"),
        targetActorId: enemy.id,
        hitMotionMs: monster.damageMotionMs ?? 400,
      });
    }
    event(s, at, "damage", monster.name, damage, "player", {
      enemyId: enemy.id,
      monsterId: monster.id,
      ...action,
      targetActorId: s.id,
      hitMotionMs,
    });
    if (!b.challengeId && s.areaId)
      recordAreaActivity(s, s.areaId, at, { damageTaken: damage });
    if (activeCast && b.cast === activeCast && damage > 0 && c.skills[activeCast.skillId]?.interruptCast) {
      event(
        s,
        at,
        "cast-interrupted",
        "Conjuração interrompida.",
        undefined,
        "player",
        { skillId: activeCast.skillId, sourceActorId: s.id, actorAction: "none", actionId: activeCast.actionId },
      );
      b.cast = undefined;
      b.playerActionReadyAt = at + 1000;
      b.playerNextSkillAt = at + 1000;
      if (!b.challengeId && s.fieldHero?.areaId === s.areaId)
        s.fieldHero.moveBlockedUntil = at + 1000;
    }
  }
  // status.c:3438: source monster_max_aspd=199 means 20 ms minimum
  // attack delay; attacks are capped at 4000 ms. Quagmire changes AGI/DEX,
  // without a separate invented 25% multiplier on a monster's base delay.
  enemy.enemyNextAttackAt = at + Math.min(4000, Math.max(20, monster.attackDelay));
  if (s.hp <= 0) {
    freezeFieldHero(s, at);
    if (s.fieldHero) {
      s.fieldHero.phase = "waiting";
      delete s.fieldHero.targetId;
      delete s.fieldHero.moveBlockedUntil;
    }
    s.totals.deaths++;
    if (!b.challengeId && s.areaId)
      recordAreaActivity(s, s.areaId, at, { deaths: 1 });
    s.battle = null;
    s.pendingAreaId = null;
    s.status = "resting";
    s.restMode = "recovery";
    s.restUntil = at + 30000;
    if (b.challengeId) s.autoResume = false;
    event(s, at, "death", "Derrota. Recuperando na cidade.");
  } else if (enemy.hp <= 0 && s.battle) awardKill(s, c, enemy, at);
}

function nextEnemyAttackAt(s: GameState, c: Catalog, enemy: BattleEnemy, from: number, until: number) {
  if (enemy.fieldSlot !== undefined && (!enemy.engaged || enemy.hostile === false)) return;
  const range = c.monsters[enemy.monsterId].attackRange ?? 1;
  const attackAt = Math.max(from, enemy.startedAt, enemy.enemyNextAttackAt);
  if (attackAt > until) return;
  if (enemyDistanceAt(enemy, attackAt, battleHeroAt(s, attackAt)) <= range + 1e-9) return attackAt;
  // Both actors may walk. Intersect their relative linear path with the source
  // square range, including contact crossed between two outside endpoints.
  const times = [...new Set([attackAt, until, enemy.arrivedAt, s.fieldHero?.arrivedAt]
    .filter((time): time is number => time !== undefined && time >= attackAt && time <= until))].sort((a, b) => a - b);
  for (let index = 0; index < times.length - 1; index++) {
    const start = times[index], end = times[index + 1];
    const enemyFrom = enemyPositionAt(enemy, start), enemyTo = enemyPositionAt(enemy, end);
    const heroFrom = battleHeroAt(s, start), heroTo = battleHeroAt(s, end);
    let enter = 0, leave = 1;
    for (const axis of ["x", "y"] as const) {
      const origin = (enemyFrom[axis] - heroFrom[axis]) * BATTLE_CELLS_PER_UNIT;
      const delta = (enemyTo[axis] - heroTo[axis]) * BATTLE_CELLS_PER_UNIT - origin;
      if (Math.abs(delta) < 1e-10) {
        if (Math.abs(origin) > range) { enter = 2; break; }
      } else {
        const a = (-range - origin) / delta, z = (range - origin) / delta;
        enter = Math.max(enter, Math.min(a, z)); leave = Math.min(leave, Math.max(a, z));
      }
    }
    if (enter > leave) continue;
    const contact = Math.ceil(start + (end - start) * enter);
    if (contact <= end && enemyDistanceAt(enemy, contact, battleHeroAt(s, contact)) <= range + 1e-9) return contact;
  }
}

function completePlayerSkill(s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy,
  at: number, actionId?: string, center?: { x: number; y: number }) {
  const b = s.battle!;
  const succeeded = resolveSkill(s, c, skill, level, target, at, false, center,
    playerAction(s, c, at, "skill", actionId));
  if (succeeded) {
    // skill.c:6611..6616: individual cooldown is distinct from global delay.
    s.skillReadyAt[skill.id] = at + Math.max(0, skill.cooldownMs);
    b.supportNeedsOffense = !offensiveSkill(skill);
  }
}

function playerCombatAction(s: GameState, c: Catalog, at: number) {
  const b = s.battle!;
  let target = enemies(s).find(e => e.id === b.targetId) ?? enemies(s)[0];
  if (!target) return;
  const stats = derivedStats(s, c);
  const motion = stats.attackIntervalMs / 2;
  const skillDecisionDue = at >= (b.playerNextSkillAt ?? 0);
  const skill = skillDecisionDue ? chooseSkill(s, c, at, target) : undefined;
  if (skill) {
    if (offensiveSkill(skill)) provokeEnemy(s, c, target, at);
    if (skill.sourceName !== "AS_CLOAKING") cancelClassicBuff(s, c, "AS_CLOAKING");
    const level = s.learnedSkills[skill.id];
    const base = val(skill.castTimeMs, level) *
      (skill.sourceName === "MO_FINGEROFFENSIVE" ? 1 + Math.min(level, s.combatEffects?.spiritSpheres ?? 0) : 1);
    const castMs = skill.sourceName === "MO_EXTREMITYFIST" && s.combatEffects?.combo &&
      s.combatEffects.combo.expiresAt > at &&
      ["MO_COMBOFINISH", "CH_TIGERFIST", "CH_CHAINCRUSH"].includes(s.combatEffects.combo.sourceName)
      ? 0 : Math.floor((skill.ignoresDex ? base : classicCastTime(base, stats.attributes?.dex ?? s.stats.dex)) *
        (1 - Math.min(100, stats.effects.castReductionPct ?? 0) / 100));
    const delay = afterCastDelay(s, c, skill, level);
    b.playerActionReadyAt = at + castMs + Math.max(motion, delay);
    blockFieldHero(s, at, at + castMs + motion);
    b.playerNextSkillAt = b.playerActionReadyAt;
    const actionId = `action-${s.id}-${at}-${s.nextEventId}`;
    // Support preserves the due basic attack; its short motion is the only
    // obstruction when the source skill has no cast or after-cast delay.
    if (castMs > 0) {
      b.cast = {
        skillId: skill.id, level, targetId: target.id, startedAt: at, endsAt: at + castMs,
        position: { ...enemyPositionAt(target, at) }, actionId, afterCastDelayMs: delay,
      };
      event(s, at, "cast", skill.name, undefined, "player", {
        skillId: skill.id, skillLevel: level, castMs, enemyId: target.id, monsterId: target.monsterId,
        ...playerAction(s, c, at, "none", actionId), targetActorId: skill.targetType === "self" ? s.id : target.id,
      });
    } else completePlayerSkill(s, c, skill, level, target, at, actionId);
    return;
  }
  // This is the automation's next decision, not a skill cooldown.
  if (skillDecisionDue) b.playerNextSkillAt = at + 250;
  if (at < b.playerNextAttackAt) return;
  const range = basicAttackRange(s, c);
  const inRange = (e: BattleEnemy) => playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(e, at)) <= range;
  const meleeTarget = enemies(s).find(e => e.id === target.id && inRange(e)) ??
    (b.challengeId ? enemies(s).find(inRange) : undefined);
  if (classicBuffActive(s, c, "TF_HIDING", at) || !meleeTarget) {
    b.playerNextAttackAt = at + 250;
    return;
  }
  target = meleeTarget;
  b.targetId = target.id;
  cancelClassicBuff(s, c, "AS_CLOAKING");
  const levels = learnedBySource(s, c);
  const weaponEntry = s.inventory.find(e => e.uid === s.equipment.weapon);
  const weaponType = weaponEntry ? c.items[weaponEntry.itemId]?.weaponType : undefined;
  const proc = weaponType === "dagger" && random(s) * 100 < 5 * (levels.TF_DOUBLE ?? 0)
    ? "TF_DOUBLE" : random(s) * 100 < 30 - (levels.MO_TRIPLEATTACK ? levels.MO_TRIPLEATTACK : 30)
      ? "MO_TRIPLEATTACK" : undefined;
  const passive = proc ? Object.values(c.skills).find(candidate => candidate.sourceName === proc) : undefined;
  const action = playerAction(s, c, at, "attack");
  blockFieldHero(s, at, at + motion);
  if (passive) {
    damageEnemies(s, c, target, at, {
      ...passive, kind: "physical", damageType: "weapon",
      ...(proc === "TF_DOUBLE" && { power: [100], sourceHitCount: [2] }),
      hitCount: [proc === "TF_DOUBLE" ? 2 : 3],
    }, levels[proc!], undefined, action);
    if (proc === "MO_TRIPLEATTACK") (s.combatEffects ??= {}).combo = { sourceName: proc, expiresAt: at + 2000 };
  } else damageEnemies(s, c, target, at, undefined, 1, undefined, action);
  b.playerNextAttackAt = at + stats.attackIntervalMs;
  b.playerActionReadyAt = at + motion;
  b.playerNextSkillAt = Math.max(b.playerNextSkillAt ?? at, b.playerActionReadyAt);
  b.supportNeedsOffense = false;
}

type CombatDeadline = { at: number; priority: number; key: string } & (
  { kind: "cast" | "player" | "timeout" | "buffs" | "field" } |
  { kind: "enemy" | "poison"; enemy: BattleEnemy } |
  { kind: "ground"; ground: NonNullable<Battle["groundEffects"]>[number] } |
  { kind: "delayed"; delayed: NonNullable<Battle["delayedSkills"]>[number] }
);

function maintainPlayerBuffs(s: GameState, c: Catalog, at: number) {
  tickClassicBuffs(s, c, at);
  for (const [id, buff] of Object.entries(s.buffs))
    if (buff.expiresAt <= at) {
      delete s.buffs[id];
      const name = c.skills[id]?.sourceName;
      if (name === "MG_SAFETYWALL" && s.combatEffects)
        s.combatEffects.safetyWallHits = 0;
      if (name === "MG_ENERGYCOAT" && s.combatEffects)
        s.combatEffects.energyCoat = false;
      if (name === "PR_KYRIE" && s.combatEffects) {
        s.combatEffects.kyrieHp = 0;
        s.combatEffects.kyrieHits = 0;
      }
    }
  const stats = derivedStats(s, c);
  s.hp = Math.min(s.hp, stats.maxHp);
  s.sp = Math.min(s.sp, stats.maxSp);
}

/** One persisted, synchronous timeline; no actor waits for another actor's animation. */
function runCombatTimeline(s: GameState, c: Catalog, until: number, windowStart: number) {
  const persistedAt = s.lastSimulatedAt;
  try {
  let cursor = windowStart;
  // derivedStats and legacy eligibility helpers read this clock. Resolve each
  // deadline against its own time; restore the persisted window end in finally.
  s.lastSimulatedAt = cursor;
  maintainPlayerBuffs(s, c, cursor);
  const initial = s.battle!;
  initial.playerNextSkillAt ??= initial.playerNextAttackAt;
  initial.playerActionReadyAt ??= initial.cast?.endsAt ?? initial.playerNextAttackAt;
  if (!initial.challengeId) initial.fieldDecisionAt ??= cursor;
  while (s.battle) {
    const b = s.battle;
    const due: CombatDeadline[] = [];
    const add = (deadline: CombatDeadline) => { if (deadline.at <= until) due.push(deadline); };
    if (!b.challengeId) {
      const movement = [b.fieldDecisionAt ?? cursor, s.fieldHero?.arrivedAt,
        s.fieldHero?.moveBlockedUntil, ...(s.fieldPopulation?.respawns.map(entry => entry.at) ?? [])]
        .filter((time): time is number => time !== undefined && time > cursor);
      add({ kind: "field", at: (b.fieldDecisionAt ?? cursor) <= cursor ? cursor : Math.min(...movement), priority: -0.5, key: "field" });
    }
    for (const buff of Object.values(s.buffs))
      if (Number.isFinite(buff.expiresAt))
        add({ kind: "buffs", at: Math.max(cursor, buff.expiresAt), priority: -2, key: "buffs" });
    for (const [id, drainAt] of Object.entries(s.combatEffects?.buffDrainAt ?? {}))
      if (s.buffs[id] && Number.isFinite(drainAt))
        add({ kind: "buffs", at: Math.max(cursor, drainAt), priority: -2, key: "buffs" });
    if (b.deadlineAt !== undefined) add({ kind: "timeout", at: Math.max(cursor, b.deadlineAt), priority: -1, key: "timeout" });
    if (b.cast) add({ kind: "cast", at: Math.max(cursor, b.cast.endsAt), priority: 0, key: b.cast.actionId ?? b.cast.skillId });
    for (const [index, delayed] of (b.delayedSkills ?? []).entries())
      add({ kind: "delayed", delayed, at: Math.max(cursor, delayed.endsAt), priority: 1, key: `${index}` });
    for (const [index, ground] of (b.groundEffects ?? []).entries())
      if ((ground.intervalMs ?? c.skills[ground.skillId]?.groundIntervalMs ?? 0) > 0 &&
        ground.nextTickAt < ground.expiresAt && (ground.remainingHits ?? 1) > 0)
        add({ kind: "ground", ground, at: Math.max(cursor, ground.nextTickAt), priority: 2, key: `${index}` });
    for (const enemy of enemies(s)) {
      const poison = enemy.statuses?.SC_POISON;
      if (poison) {
        poison.nextTickAt ??= Math.max(cursor, poison.startsAt ?? cursor) + 1000;
        if (poison.nextTickAt < poison.expiresAt)
          add({ kind: "poison", enemy, at: Math.max(cursor, poison.nextTickAt), priority: 3, key: enemy.id });
      }
      const attackAt = nextEnemyAttackAt(s, c, enemy, cursor, until);
      if (attackAt !== undefined) add({ kind: "enemy", enemy, at: attackAt, priority: 5, key: enemy.id });
    }
    if (!b.cast && enemies(s).length) add({ kind: "player", at: Math.max(cursor, b.startedAt, b.playerActionReadyAt ?? 0,
      Math.min(b.playerNextAttackAt, b.playerNextSkillAt ?? b.playerNextAttackAt)), priority: 4, key: s.id });
    due.sort((a, z) => a.at - z.at || a.priority - z.priority || (a.key < z.key ? -1 : a.key > z.key ? 1 : 0));
    const next = due[0];
    if (!next) break;
    cursor = next.at;
    s.lastSimulatedAt = cursor;
    const target = enemies(s).find(e => e.id === b.targetId) ?? enemies(s)[0];
    if (next.kind === "field") {
      updateFieldActors(s, c, cursor);
      b.fieldDecisionAt = cursor + 250;
    } else if (next.kind === "buffs") maintainPlayerBuffs(s, c, cursor);
    else if (next.kind === "timeout") {
      s.battle = null; s.status = "town"; s.autoResume = false; s.pendingAreaId = null;
      event(s, cursor, "challenge", "Tempo do desafio esgotado.");
    } else if (next.kind === "cast") {
      const cast = b.cast!, skill = c.skills[cast.skillId];
      const castTarget = enemies(s).find(e => e.id === cast.targetId);
      b.cast = undefined;
      b.playerActionReadyAt = cursor + Math.max(playerMotion(s, c), cast.afterCastDelayMs ??
        (skill ? afterCastDelay(s, c, skill, cast.level) : 0));
      b.playerNextSkillAt = b.playerActionReadyAt;
      blockFieldHero(s, cursor, cursor + playerMotion(s, c));
      // Ground/self casts can finish while the finite population is waiting to
      // respawn. Their saved position is independent of a living target actor.
      const resolutionTarget: BattleEnemy = castTarget ?? target ?? {
        id: cast.targetId, monsterId: b.monsterId, hp: 0, maxHp: b.maxHp,
        startedAt: cast.startedAt, arrivedAt: cursor, enemyNextAttackAt: Infinity,
        spawnDirection: 0, position: cast.position ?? battleHeroAt(s, cursor),
      };
      if (skill && (castTarget || skill.targetType !== "enemy"))
        completePlayerSkill(s, c, skill, cast.level, resolutionTarget, cursor, cast.actionId,
          skill.targetType === "ground" ? cast.position : undefined);
      else event(s, cursor, "cast-failed", "O alvo da conjuração foi derrotado.", undefined, "player", {
        skillId: cast.skillId, sourceActorId: s.id, actorAction: "none", actionId: cast.actionId,
      });
    } else if (next.kind === "delayed") {
      b.delayedSkills = b.delayedSkills?.filter(pending => pending !== next.delayed);
      const skill = c.skills[next.delayed.skillId];
      const delayedTarget = enemies(s).find(e => e.id === next.delayed.targetId) ?? target;
      if (skill && delayedTarget) applyEnemyStatus(s, c, skill, next.delayed.level, delayedTarget, cursor, next.delayed.position);
    } else if (next.kind === "ground") {
      const ground = next.ground, skill = c.skills[ground.skillId];
      const closest = enemies(s).filter(e => e.startedAt <= cursor && (!ground.targetId || e.id === ground.targetId))
        .sort((a, z) => battleDistance(enemyPositionAt(a, cursor), ground.position) -
          battleDistance(enemyPositionAt(z, cursor), ground.position) || (a.id < z.id ? -1 : a.id > z.id ? 1 : 0))[0];
      const center = ground.targetId ? undefined : ground.position;
      if (closest && skill && targets(s, skill, ground.level, closest, cursor, center).length) {
        resolveSkill(s, c, skill, ground.level, closest, cursor, true, center, playerAction(s, c, cursor, "none"));
        if (ground.remainingHits !== undefined) ground.remainingHits--;
      }
      ground.nextTickAt = cursor + (ground.intervalMs ?? skill?.groundIntervalMs ?? 1000);
    } else if (next.kind === "poison") {
      const poison = next.enemy.statuses!.SC_POISON;
      const damage = 3 + Math.floor(next.enemy.maxHp / 200);
      if (next.enemy.hp <= Math.max(Math.floor(next.enemy.maxHp / 4), damage)) delete next.enemy.statuses!.SC_POISON;
      else {
        next.enemy.hp -= damage;
        event(s, cursor, "damage", "Veneno", damage, "enemy", {
          enemyId: next.enemy.id, monsterId: next.enemy.monsterId, actorAction: "none",
          targetActorId: next.enemy.id, hitMotionMs: c.monsters[next.enemy.monsterId].damageMotionMs ?? 400,
        });
        poison.nextTickAt = cursor + 1000;
      }
    } else if (next.kind === "enemy") {
      enemyAttack(s, c, next.enemy, cursor);
      // A rejected stale spatial deadline must still advance the reducer.
      if (s.battle && next.enemy.enemyNextAttackAt <= cursor) next.enemy.enemyNextAttackAt = cursor + 1;
    }
    else if (target) playerCombatAction(s, c, cursor);
    if (s.battle?.fieldTransferReady && s.pendingAreaId) {
      const area = c.areas.find(entry => entry.id === s.pendingAreaId);
      freezeFieldHero(s, cursor);
      s.battle = null;
      s.pendingAreaId = null;
      if (area) {
        s.areaId = area.id;
        if (!s.visitedAreas.includes(area.id)) s.visitedAreas.push(area.id);
        s.nextEncounterAt = cursor;
        event(s, cursor, "hunt", `Caçando em ${area.name}.`);
      }
    }
  }
  if (s.battle) s.battle.groundEffects = s.battle.groundEffects?.filter(g => g.expiresAt > until && (g.remainingHits ?? 1) > 0);
  } finally {
    s.lastSimulatedAt = persistedAt;
  }
}
export function tick(s: GameState, c: Catalog, at: number, elapsedMs = 1000) {
  const replayingCombat = !!s.battle && (s.status === "hunting" || s.status === "challenge");
  if (!replayingCombat) {
    updateFieldHero(s, at);
    updateFieldPopulation(s, c, at);
  }
  // Town, rest and travel have no earlier combat deadlines to replay.
  if (!replayingCombat) maintainPlayerBuffs(s, c, at);
  const d = derivedStats(s, c);
  if (s.status === "resting" || s.status === "town") {
    if (Math.floor(at / 1000) !== Math.floor((at - elapsedMs) / 1000)) {
      s.hp = Math.min(d.maxHp, s.hp + Math.max(1, Math.ceil(d.maxHp / 30)));
      s.sp = Math.min(d.maxSp, s.sp + Math.max(1, Math.ceil(d.maxSp / 30)));
    }
    if (s.status === "resting" && s.restUntil > 0 && at >= s.restUntil) {
      healFull(s, c);
      s.restUntil = 0;
      s.status = s.restMode === "field" && s.areaId ? "resting" : "town";
      if (s.autoResume && s.areaId) {
        s.status = "hunting";
        s.restMode = undefined;
        s.nextEncounterAt = at + encounterDelay(s, s.areaId, 1000);
      }
    }
    return;
  }
  if (s.status !== "hunting" && s.status !== "challenge") return;
  if (!replayingCombat) {
    autoPotion(s, c, at);
    recoverResources(s, c, at, elapsedMs);
  }
  if (!s.battle) {
    if (s.status === "challenge") {
      s.status = "town";
      return;
    }
    if (at < s.nextEncounterAt) return;
    const area = c.areas.find((a) => a.id === s.areaId);
    if (!area?.monsters.length) {
      s.status = "town";
      return;
    }
    beginBattle(s, c, chooseAreaMonster(s, c, area, random(s)), at);
    if (!s.battle) return;
  }
  const b = s.battle!,
    list = enemies(s);
  for (const e of list) {
    if (e.fieldSlot !== undefined) continue;
    e.hostile ??= !!b.challengeId || (c.monsters[e.monsterId].aggressive ?? false);
    if (!e.homePosition || battleDistance(battleHeroAt(s, at), e.homePosition) > 1) {
      const angle = (e.spawnDirection * 45 - 90) * Math.PI / 180;
      e.homePosition = {
        x: battleHeroAt(s, at).x + Math.cos(angle) * 0.9 / BATTLE_CELLS_PER_UNIT,
        y: battleHeroAt(s, at).y + Math.sin(angle) * 0.9 / BATTLE_CELLS_PER_UNIT,
      };
    }
    const immobilized = combatStatus(c, e, at).immobilized;
    if (e.approachPausedAt !== undefined || at < e.arrivedAt) {
      if (immobilized) e.approachPausedAt ??= Math.max(e.startedAt, at - elapsedMs);
      else if (e.approachPausedAt !== undefined) {
        const pausedMs = Math.max(0, at - e.approachPausedAt);
        e.startedAt += pausedMs;
        e.arrivedAt += pausedMs;
        delete e.approachPausedAt;
      }
    }
    if (!immobilized && e.arrivedAt <= at && e.homePosition) {
      const dx = e.homePosition.x - e.position.x,
        dy = e.homePosition.y - e.position.y,
        distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const step = Math.min(distance, elapsedMs / 1000 / 12);
        e.position.x += (dx / distance) * step;
        e.position.y += (dy / distance) * step;
      }
    }
  }
  runCombatTimeline(s, c, at, Math.max(b.startedAt, at - elapsedMs));
  if (replayingCombat) {
    // These automations retain the 250 ms outer cadence. Their end-window
    // HP/SP mutations cannot rescue or fund an earlier combat deadline.
    maintainPlayerBuffs(s, c, at);
    if (s.status === "hunting" || s.status === "challenge") {
      autoPotion(s, c, at);
      recoverResources(s, c, at, elapsedMs);
    }
  }
  if (s.battle) syncBattle(s);
}
