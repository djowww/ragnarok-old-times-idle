import { useEffect, useRef, useState } from "react";
import type { Area, GameEvent, Skill, SpriteAsset, WeaponType } from "../../shared/types";
import {
  drawActor,
  getAttackAction,
  getActorPose,
  loadActor,
  type ActorAction,
  type DecodedActor,
} from "../assets/renderer";
import {
  drawDamagePopup,
  drawEmotion,
  drawSkillEffect,
  EMOTE_ACTIONS,
  loadSceneEffects,
  SKILL_CAST_MS,
  SKILL_IMPACT_MS,
  type SceneEffects,
} from "../assets/sceneEffects";
import { loadGroundLoot, type GroundLootVisual } from "../assets/groundLoot";
import { Meter, number, type PanelProps } from "./common";
import OriginalMap, { type MapStatus } from "./OriginalMap";

type EquippedWeapon = { type: WeaponType; gender: "male" | "female"; job: string };
function useActor(asset?: SpriteAsset, weapon?: EquippedWeapon) {
  const [actor, setActor] = useState<DecodedActor | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setActor(null);
    setError(false);
    if (asset)
      void loadActor(asset, weapon)
        .then((value) => {
          if (live) {
            setActor(value);
            setError(value.fallback || !!value.error);
          }
        })
        .catch(() => {
          if (live) setError(true);
        });
    return () => {
      live = false;
    };
  }, [asset, weapon?.type, weapon?.gender, weapon?.job]);
  return { actor, error };
}

export function ActorPreview({
  asset,
  name,
  weapon,
  large = false,
}: {
  asset: SpriteAsset;
  name: string;
  weapon?: EquippedWeapon;
  large?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { actor, error } = useActor(asset, weapon);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 120, 112);
    ctx.imageSmoothingEnabled = false;
    if (actor) {
      const bounds = actorBounds(actor);
      const scale = Math.min(
        large ? 2.2 : 1.8,
        104 / (bounds.right - bounds.left),
        96 / (bounds.bottom - bounds.top),
      );
      drawActor(
        ctx,
        actor,
        "idle",
        0,
        60 - ((bounds.left + bounds.right) / 2) * scale,
        104 - bounds.bottom * scale,
        scale,
      );
    }
  }, [actor, large]);
  return (
    <div className={`actor-preview ${large ? "large" : ""}`}>
      <canvas
        ref={canvas}
        width="120"
        height="112"
        role="img"
        aria-label={name}
      />
      {error && (
        <span
          className="sprite-missing"
          title="Sprite indisponível; representação de reserva"
        >
          Recurso indisponível
        </span>
      )}
    </div>
  );
}

type Bounds = { left: number; right: number; top: number; bottom: number };
// Ragnarok ACT directions: 2 faces west and 6 faces east.
const HERO_COMBAT_DIRECTION = 6;
const ENEMY_COMBAT_DIRECTION = 2;
const boundsCache = new WeakMap<DecodedActor, Map<string, Bounds>>();
function actorBounds(actor: DecodedActor, direction = 0, includeWeapon = true): Bounds {
  const key = `${direction}:${includeWeapon}`;
  const cached = boundsCache.get(actor)?.get(key);
  if (cached) return cached;
  const silhouette = includeWeapon ? actor : { ...actor, weapon: undefined };
  const pose = getActorPose(silhouette, "idle", 0, direction);
  if (!pose.length) return { left: -15, right: 15, top: -40, bottom: 0 };
  const points = pose.flatMap((layer) => {
    const angle = (layer.rotation * Math.PI) / 180;
    return [-1, 1].flatMap((x) =>
      [-1, 1].map((y) => {
        const dx = (x * layer.image.width * layer.scaleX) / 2;
        const dy = (y * layer.image.height * layer.scaleY) / 2;
        return {
          x: layer.x + dx * Math.cos(angle) - dy * Math.sin(angle),
          y: layer.y + dx * Math.sin(angle) + dy * Math.cos(angle),
        };
      }),
    );
  });
  const result = {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
  let entries = boundsCache.get(actor);
  if (!entries) { entries = new Map(); boundsCache.set(actor, entries); }
  entries.set(key, result);
  return result;
}

function actorActionDuration(actor: DecodedActor | null, base: number, direction: number, fallback: number): number {
  const actions = actor?.body?.action.actions;
  const directed = actions?.[base + direction];
  const action = directed?.frames.length ? directed : actions?.[base];
  return action?.frames.length
    ? action.frames.length * Math.max(25, action.delayMs)
    : fallback;
}

type SceneKind = Area["scene"] | "town";
type NormalizedPoint = { x: number; y: number };
type RoamingMotion = {
  areaId: string | null;
  position: NormalizedPoint;
  from: NormalizedPoint;
  target: NormalizedPoint;
  routeIndex: number;
  startedAt: number;
  durationMs: number;
  pauseUntil: number;
  pausedAt: number | null;
  direction: number;
  walking: boolean;
  wasHunting: boolean;
};
type HuntEncounterPose = {
  areaId: string;
  startedAt: number;
  hero: NormalizedPoint;
  enemy: NormalizedPoint;
  heroDirection: number;
};
const HUNT_ROUTES: Record<SceneKind, readonly NormalizedPoint[]> = {
  town: [{ x: 0.48, y: 0.76 }],
  field: [
    { x: 0.38, y: 0.74 }, { x: 0.59, y: 0.75 }, { x: 0.67, y: 0.70 },
    { x: 0.57, y: 0.66 }, { x: 0.41, y: 0.67 }, { x: 0.32, y: 0.72 },
  ],
  forest: [
    { x: 0.42, y: 0.74 }, { x: 0.57, y: 0.75 }, { x: 0.61, y: 0.70 },
    { x: 0.53, y: 0.66 }, { x: 0.42, y: 0.68 },
  ],
  sewer: [
    { x: 0.44, y: 0.75 }, { x: 0.56, y: 0.75 }, { x: 0.60, y: 0.71 },
    { x: 0.54, y: 0.67 }, { x: 0.43, y: 0.68 }, { x: 0.39, y: 0.72 },
  ],
  cave: [
    { x: 0.43, y: 0.74 }, { x: 0.57, y: 0.75 }, { x: 0.61, y: 0.71 },
    { x: 0.53, y: 0.66 }, { x: 0.41, y: 0.68 },
  ],
  sea: [
    { x: 0.37, y: 0.74 }, { x: 0.57, y: 0.75 }, { x: 0.64, y: 0.71 },
    { x: 0.56, y: 0.66 }, { x: 0.39, y: 0.67 }, { x: 0.32, y: 0.71 },
  ],
  orc: [
    { x: 0.35, y: 0.74 }, { x: 0.59, y: 0.75 }, { x: 0.67, y: 0.71 },
    { x: 0.58, y: 0.66 }, { x: 0.40, y: 0.67 }, { x: 0.31, y: 0.71 },
  ],
  desert: [
    { x: 0.36, y: 0.74 }, { x: 0.60, y: 0.75 }, { x: 0.66, y: 0.70 },
    { x: 0.56, y: 0.66 }, { x: 0.39, y: 0.67 }, { x: 0.32, y: 0.71 },
  ],
  castle: [
    { x: 0.43, y: 0.74 }, { x: 0.56, y: 0.75 }, { x: 0.60, y: 0.71 },
    { x: 0.54, y: 0.66 }, { x: 0.42, y: 0.68 }, { x: 0.38, y: 0.72 },
  ],
};
function walkDirection(from: NormalizedPoint, to: NormalizedPoint): number {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return (6 + Math.round(angle / (Math.PI / 4)) + 8) % 8;
}
function walkDuration(from: NormalizedPoint, to: NormalizedPoint, width: number, height: number): number {
  const distance = Math.hypot((to.x - from.x) * width, (to.y - from.y) * height);
  return Math.max(950, Math.min(4200, (distance / 120) * 1000));
}
function resetRoaming(motion: RoamingMotion, areaId: string, scene: SceneKind, time: number, width: number, height: number): void {
  const position = { x: 0.5, y: 0.92 };
  const route = HUNT_ROUTES[scene];
  const target = route[0] ?? position;
  Object.assign(motion, {
    areaId,
    position,
    from: position,
    target,
    routeIndex: 0,
    startedAt: time,
    durationMs: walkDuration(position, target, width, height),
    pauseUntil: 0,
    pausedAt: null,
    direction: walkDirection(position, target),
    walking: false,
    wasHunting: false,
  });
}
function advanceRoaming(motion: RoamingMotion, route: readonly NormalizedPoint[], time: number, width: number, height: number, allowed: boolean): void {
  if (!allowed) {
    motion.pausedAt ??= time;
    motion.walking = false;
    return;
  }
  if (motion.pausedAt !== null) {
    const pauseDuration = time - motion.pausedAt;
    motion.startedAt += pauseDuration;
    if (motion.pauseUntil) motion.pauseUntil += pauseDuration;
    motion.pausedAt = null;
  }
  if (time < motion.pauseUntil) {
    motion.walking = false;
    return;
  }
  const progress = Math.max(0, Math.min(1, (time - motion.startedAt) / Math.max(1, motion.durationMs)));
  if (progress < 1) {
    const eased = progress * progress * (3 - 2 * progress);
    motion.position = {
      x: motion.from.x + (motion.target.x - motion.from.x) * eased,
      y: motion.from.y + (motion.target.y - motion.from.y) * eased,
    };
    motion.walking = true;
    return;
  }
  motion.position = motion.target;
  motion.walking = false;
  if (!motion.pauseUntil) motion.pauseUntil = time + 260;
  if (time < motion.pauseUntil) return;
  motion.routeIndex = (motion.routeIndex + 1) % route.length;
  motion.from = motion.position;
  motion.target = route[motion.routeIndex] ?? motion.from;
  motion.startedAt = time;
  motion.durationMs = walkDuration(motion.from, motion.target, width, height);
  motion.direction = walkDirection(motion.from, motion.target);
  motion.pauseUntil = 0;
  motion.walking = true;
}
type CombatCue = {
  id: number;
  start: number;
  duration: number;
  action: "attack" | "enemyAttack" | "skill";
  hit: boolean;
  melee: boolean;
  skill?: Skill;
  skillLevel?: number;
  blocked?: boolean;
};
type LootCue = {
  id: number;
  itemId: number;
  quantity: number;
  start: number;
  until: number;
  order: number;
  killId: number;
};
type PopupCue = {
  id: number;
  text: string;
  target: "player" | "enemy";
  critical?: boolean;
  start: number;
};
function skillFor(event: GameEvent, skills: Record<string, Skill>): Skill | undefined {
  return event.skillId ? skills[event.skillId] : undefined;
}
export default function Scene({ catalog, snapshot, busy }: PanelProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(snapshot);
  const actorsRef = useRef<{
    hero: DecodedActor | null;
    enemy: DecodedActor | null;
  }>({ hero: null, enemy: null });
  const { state } = snapshot;
  const area = catalog.areas.find((a) => a.id === state.areaId);
  const monster = state.battle
    ? catalog.monsters[state.battle.monsterId]
    : undefined;
  const equippedEntry = state.inventory.find((entry) => entry.uid === state.equipment.weapon);
  const equippedType = equippedEntry ? catalog.items[equippedEntry.itemId]?.weaponType : undefined;
  const hero = useActor(
    catalog.classes[state.job].sprite[state.gender],
    equippedType ? { type: equippedType, gender: state.gender, job: state.job } : undefined,
  );
  const enemy = useActor(monster?.sprite);
  const scene: SceneKind =
    state.status === "town" || (state.status === "resting" && !state.areaId)
      ? "town"
      : (area?.scene ?? "field");
  const mapName = scene === "town" ? "prontera" : (area?.map ?? "prontera");
  const [mapStatus, setMapStatus] = useState<MapStatus>({ map: mapName, phase: "loading" });
  const mapReady = mapStatus.map === mapName && mapStatus.phase === "ready";
  const [arrivedAreaId, setArrivedAreaId] = useState<string | null>(null);
  const isArriving = state.status === "hunting" && !!state.areaId && mapReady && arrivedAreaId !== state.areaId;
  const roaming = useRef<RoamingMotion>({
    areaId: null,
    position: { x: 0.48, y: 0.76 },
    from: { x: 0.48, y: 0.76 },
    target: { x: 0.48, y: 0.76 },
    routeIndex: 0,
    startedAt: 0,
    durationMs: 0,
    pauseUntil: 0,
    pausedAt: null,
    direction: HERO_COMBAT_DIRECTION,
    walking: false,
    wasHunting: false,
  });
  const encounterPose = useRef<HuntEncounterPose | null>(null);
  useEffect(() => {
    if (!mapReady || state.status !== "hunting" || !state.areaId) {
      setArrivedAreaId(null);
      return;
    }
    const areaId = state.areaId;
    setArrivedAreaId(null);
    const timeout = window.setTimeout(() => setArrivedAreaId(areaId), 1200);
    return () => window.clearTimeout(timeout);
  }, [mapReady, state.areaId, state.status]);
  const effects = useRef<PopupCue[]>([]);
  const visuals = useRef<SceneEffects | null>(null);
  const lootCues = useRef<LootCue[]>([]);
  const lootVisuals = useRef(new Map<number, GroundLootVisual>());
  const emote = useRef({ action: -1, start: 0, next: performance.now() + 6000 + Math.random() * 6000 });
  const eventCursor = useRef(snapshot.state.events.at(-1)?.id ?? 0);
  const opponentRequest = useRef(0);
  const blockedTerminalId = useRef<number | null>(null);
  const combatCues = useRef<CombatCue[]>([]);
  const lastOpponent = useRef<{
    actor: DecodedActor;
    monsterId: number;
    areaId: typeof state.areaId;
  } | null>(null);
  const defeatedOpponent = useRef<{
    actor: DecodedActor;
    monsterId: number;
    terminalId: number;
    until: number;
    deadAt?: number;
  } | null>(null);
  useEffect(() => {
    let hiddenAt: number | null = document.hidden ? performance.now() : null;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt !== null) {
        const paused = performance.now() - hiddenAt;
        emote.current.next += paused;
        if (emote.current.action >= 0) emote.current.start += paused;
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    let live = true;
    void loadSceneEffects().then((loaded) => {
      if (live) visuals.current = loaded;
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    const ids = new Set([...(monster?.drops ?? []), ...(monster?.mvpDrops ?? [])].map((drop) => drop.itemId));
    for (const id of ids) {
      const item = catalog.items[id];
      if (!item || lootVisuals.current.has(id)) continue;
      void loadGroundLoot(item).then((visual) => {
        if (live) lootVisuals.current.set(id, visual);
      });
    }
    return () => { live = false; };
  }, [monster, catalog]);
  useEffect(() => {
    const previous = stateRef.current.state;
    stateRef.current = snapshot;
    const newEvents = state.events.filter((e) => e.id > eventCursor.current);
    eventCursor.current = state.events.at(-1)?.id ?? eventCursor.current;
    const now = performance.now();
    combatCues.current = combatCues.current.filter(
      (cue) => cue.blocked || cue.start + cue.duration > now,
    );
    lootCues.current = lootCues.current.filter((cue) => cue.until > now || cue.killId === blockedTerminalId.current);
    const actor = actorsRef.current.hero;
    const attackDuration = actorActionDuration(
      actor, actor ? getAttackAction(actor) : 40, HERO_COMBAT_DIRECTION, 500,
    );
    const effectStarts = new Map<number, number>();
    const recentEvents = newEvents.filter((entry) => entry.at >= snapshot.serverTime - 4000)
      .sort((a, b) => a.at - b.at || a.id - b.id);
    const recentTerminals = recentEvents.filter((entry) => entry.kind === "kill" || entry.kind === "death");
    // A throttled browser can receive several complete battles at once. Show
    // the latest complete encounter rather than aim earlier hits at its monster.
    const cutoffId = recentTerminals.length > 1 ? recentTerminals[recentTerminals.length - 2].id : -1;
    let freshEvents = recentEvents.filter((entry) => entry.id > cutoffId);
    // A resumed or busy browser can receive a whole fight in one snapshot.
    // Preserve the finishing blow and every drop, but skip older swings that
    // would leave the animation several seconds behind the server.
    if (freshEvents.length > 14) {
      let lastTerminalIndex = -1;
      for (let index = freshEvents.length - 1; index >= 0; index--)
        if (freshEvents[index].kind === "kill" || freshEvents[index].kind === "death") {
          lastTerminalIndex = index;
          break;
        }
      freshEvents = freshEvents.slice(lastTerminalIndex >= 0
        ? Math.max(0, lastTerminalIndex - 3)
        : freshEvents.length - 8);
    }
    if (cutoffId >= 0) {
      combatCues.current = combatCues.current.filter((cue) => cue.id > cutoffId);
      effects.current = effects.current.filter((effect) => effect.id > cutoffId);
      lootCues.current = lootCues.current.filter((cue) => cue.id > cutoffId);
      defeatedOpponent.current = null;
    }
    let nextCueStart = Math.max(
      now,
      ...combatCues.current.map((cue) => cue.start + cue.duration),
      previous.areaId === state.areaId ? (defeatedOpponent.current?.until ?? 0) : 0,
    );
    if (freshEvents.length && nextCueStart - now > 2400 && blockedTerminalId.current === null &&
      !(previous.areaId === state.areaId && (defeatedOpponent.current?.until ?? 0) > now)) {
      combatCues.current = combatCues.current.filter((cue) => cue.start <= now && cue.start + cue.duration > now);
      effects.current = effects.current.filter((effect) => effect.start <= now && now - effect.start < 1500);
      lootCues.current = lootCues.current.filter((drop) => drop.start <= now && drop.until > now);
      nextCueStart = Math.max(
        now,
        ...combatCues.current.map((cue) => cue.start + cue.duration),
        previous.areaId === state.areaId ? (defeatedOpponent.current?.until ?? 0) : 0,
      );
    }
    let precedingSkill: { at: number; skill: Skill; level?: number } | undefined;
    let lastKillId = 0;
    let lootBatchStart: number | undefined;
    let lootOrder = 0;
    let cueMonsterId = previous.battle?.monsterId ?? state.battle?.monsterId;
    let killHoldMs = 0;
    const loadedOpponentFor = (id: number | undefined): DecodedActor | null => id === undefined ? null
      : lastOpponent.current?.monsterId === id && lastOpponent.current.areaId === state.areaId
        ? lastOpponent.current.actor
        : previous.battle?.monsterId === id ? actorsRef.current.enemy : null;
    for (const event of freshEvents) {
      if (event.kind === "encounter") {
        cueMonsterId = Object.values(catalog.monsters).find((entry) => entry.name === event.text)?.id;
        continue;
      }
      if (event.kind === "kill") {
        // Keep the death ACT visible before the following encounter begins.
        killHoldMs = actorActionDuration(loadedOpponentFor(cueMonsterId), 32, ENEMY_COMBAT_DIRECTION, 700) + 80;
        nextCueStart += killHoldMs;
        lastKillId = event.id;
        lootBatchStart = undefined;
        lootOrder = 0;
        cueMonsterId = undefined;
        continue;
      }
      if (event.kind === "death") {
        cueMonsterId = undefined;
        continue;
      }
      if (event.kind === "loot") {
        if (event.itemId && catalog.items[event.itemId] && previous.areaId === state.areaId) {
          if (lootBatchStart === undefined) {
            lootBatchStart = nextCueStart;
            nextCueStart += 840;
          }
          lootCues.current.push({
            id: event.id,
            itemId: event.itemId,
            quantity: event.quantity ?? 1,
            start: lootBatchStart,
            until: lootBatchStart + 840,
            order: lootOrder++,
            killId: lastKillId,
          });
          if (!lootVisuals.current.has(event.itemId))
            void loadGroundLoot(catalog.items[event.itemId]).then((visual) => {
              lootVisuals.current.set(event.itemId!, visual);
            });
        }
        continue;
      }
      if (event.kind === "skill") {
        const skill = skillFor(event, catalog.skills) ?? Object.values(catalog.skills).find((entry) => entry.name === event.text);
        if (skill) precedingSkill = { at: event.at, skill, level: event.skillLevel };
        // Damage and miss events carry the same skill ID and own the visible hit.
        if (skill && skill.kind !== "physical" && skill.kind !== "magical") {
          const duration = 1000;
          effectStarts.set(event.id, nextCueStart + SKILL_CAST_MS + 40);
          combatCues.current.push({ id: event.id, start: nextCueStart, duration, action: "skill", hit: false, melee: false, skill });
          nextCueStart += duration;
        }
        continue;
      }
      if ((event.kind === "damage" && event.target === "enemy") ||
        (event.kind === "miss" && event.target !== "player")) {
        const skill = skillFor(event, catalog.skills) ??
          (precedingSkill?.at === event.at ? precedingSkill.skill : undefined);
        const magical = skill?.kind === "magical";
        const duration = magical ? 1100 : attackDuration;
        const melee = !magical && equippedType !== "bow";
        effectStarts.set(event.id, nextCueStart + (magical ? SKILL_IMPACT_MS : duration * 0.5));
        combatCues.current.push({
          id: event.id,
          start: nextCueStart,
          duration,
          action: magical ? "skill" : "attack",
          hit: event.kind === "damage",
          melee,
          skill,
          skillLevel: event.skillLevel ?? (precedingSkill?.at === event.at ? precedingSkill.level : undefined),
        });
        nextCueStart += duration;
      }
      if ((event.kind === "damage" && event.target === "player") || event.kind === "dodge") {
        const loadedOpponent = loadedOpponentFor(cueMonsterId);
        // First encounters may arrive before their ACT. A full average monster
        // swing is safer than cutting it in half; non-looping frames hold.
        const duration = actorActionDuration(loadedOpponent, 16, ENEMY_COMBAT_DIRECTION, 700);
        effectStarts.set(event.id, nextCueStart + duration * 0.5);
        combatCues.current.push({
          id: event.id,
          start: nextCueStart,
          duration,
          action: "enemyAttack",
          hit: event.kind === "damage",
          melee: false,
        });
        nextCueStart += duration;
      }
    }
    if (blockedTerminalId.current !== null)
      for (const cue of combatCues.current)
        if (cue.id > blockedTerminalId.current) cue.blocked = true;
    const kill = [...freshEvents].reverse().find((event) => event.kind === "kill");
    const death = [...freshEvents].reverse().find((event) => event.kind === "death");
    const terminal = kill ?? death;
    const finishingAttack = kill
      ? [...combatCues.current].reverse().find((cue) => (cue.action === "attack" || cue.action === "skill") && cue.hit && cue.id < kill.id)
      : undefined;
    const fatalSwing = death
      ? [...combatCues.current].reverse().find((cue) => cue.action === "enemyAttack" && cue.hit && cue.id < death.id)
      : undefined;
    const terminalCue = finishingAttack ?? fatalSwing;
    const suspendedIds = new Set<number>();
    let suspendedEffects: typeof effects.current = [];
    if (blockedTerminalId.current !== null && (previous.areaId !== state.areaId || terminal)) {
      const oldTerminalId = blockedTerminalId.current;
      const blocked = combatCues.current.filter((cue) => cue.blocked && cue.id > oldTerminalId);
      const shift = blocked.length ? Math.max(0, now - blocked[0].start) : 0;
      for (const cue of blocked) { cue.start += shift; cue.blocked = false; }
      for (const effect of effects.current) if (effect.id > oldTerminalId) effect.start += shift;
      for (const [id, start] of effectStarts) if (id > oldTerminalId) effectStarts.set(id, start + shift);
      blockedTerminalId.current = null;
    }
    if (previous.areaId !== state.areaId || terminal)
      opponentRequest.current++;
    const encounter = terminal ? [...freshEvents].reverse().find(
      (event) => event.kind === "encounter" && event.id < terminal.id,
    ) : undefined;
    const opponent = kill
      ? Object.values(catalog.monsters).find((entry) => kill.text === `${entry.name} derrotado.`)
      : encounter
        ? Object.values(catalog.monsters).find((entry) => entry.name === encounter.text)
        : previous.battle ? catalog.monsters[previous.battle.monsterId] : undefined;
    // Each snapshot shows its latest completed encounter. Keep that actor
    // through a killing blow or the monster's fatal attack on the player.
    if (terminal && terminalCue && opponent && previous.areaId === state.areaId) {
      const terminalId = terminal.id;
      const terminalEnd = terminalCue.start + terminalCue.duration;
      const deadAt = kill ? terminalEnd : undefined;
      const shiftAfterTerminal = (amount: number) => {
        if (amount <= 0) return;
        for (const cue of combatCues.current) if (cue.id > terminalId) cue.start += amount;
        for (const [id, start] of effectStarts) if (id > terminalId) effectStarts.set(id, start + amount);
        for (const effect of effects.current) if (effect.id > terminalId) effect.start += amount;
        for (const drop of lootCues.current) if (drop.killId === terminalId || drop.id > terminalId) {
          drop.start += amount;
          drop.until += amount;
        }
      };
      const terminalUntil = (actor: DecodedActor, shift: number) => Math.max(
        terminalEnd + shift + 200,
        deadAt === undefined ? 0 : terminalEnd + shift + killHoldMs,
        deadAt === undefined ? 0 : deadAt + shift + actorActionDuration(actor, 32, ENEMY_COMBAT_DIRECTION, 500) + 80,
        ...lootCues.current
          .filter((drop) => drop.killId === terminalId)
          .map((drop) => drop.until + 80),
      );
      const ready = lastOpponent.current?.monsterId === opponent.id &&
        lastOpponent.current.areaId === state.areaId ? lastOpponent.current.actor :
        state.battle?.monsterId === opponent.id ? actorsRef.current.enemy : null;
      if (ready) {
        if (kill) shiftAfterTerminal(Math.max(0,
          actorActionDuration(ready, 32, ENEMY_COMBAT_DIRECTION, 700) + 80 - killHoldMs,
        ));
        defeatedOpponent.current = {
          actor: ready, monsterId: opponent.id, terminalId,
          until: terminalUntil(ready, 0), deadAt,
        };
      } else {
        const request = opponentRequest.current;
        const areaId = state.areaId;
        const pending = combatCues.current.filter(
          (cue) => cue.id <= terminalId && (!encounter || cue.id > encounter.id),
        );
        for (const cue of pending) suspendedIds.add(cue.id);
        blockedTerminalId.current = terminalId;
        combatCues.current = combatCues.current.filter((cue) => !suspendedIds.has(cue.id));
        for (const cue of combatCues.current) if (cue.id > terminalId) cue.blocked = true;
        void loadActor(opponent.sprite).then((actor) => {
          if (opponentRequest.current !== request || stateRef.current.state.areaId !== areaId)
            return;
          const delay = pending.length ? Math.max(0, performance.now() - pending[0].start) : 0;
          for (const cue of pending) cue.start += delay;
          const extraHold = kill ? Math.max(0,
            actorActionDuration(actor, 32, ENEMY_COMBAT_DIRECTION, 700) + 80 - killHoldMs,
          ) : 0;
          shiftAfterTerminal(delay + extraHold);
          for (const cue of combatCues.current) if (cue.id > terminalId) cue.blocked = false;
          blockedTerminalId.current = null;
          combatCues.current = [...combatCues.current, ...pending]
            .sort((a, b) => a.start - b.start || a.id - b.id);
          for (const effect of suspendedEffects) effect.start += delay;
          effects.current = [...effects.current, ...suspendedEffects].slice(-60);
          defeatedOpponent.current = {
            actor, monsterId: opponent.id, terminalId,
            until: terminalUntil(actor, delay),
            deadAt: deadAt === undefined ? undefined : deadAt + delay,
          };
        }).catch(() => {
          if (opponentRequest.current === request) {
            const later = combatCues.current.filter((cue) => cue.blocked && cue.id > terminalId);
            const shift = later.length ? Math.max(0, performance.now() - later[0].start) : 0;
            for (const cue of later) { cue.start += shift; cue.blocked = false; }
            for (const effect of effects.current) if (effect.id > terminalId) effect.start += shift;
            for (const drop of lootCues.current) if (drop.killId === terminalId || drop.id > terminalId) {
              drop.start += shift;
              drop.until += shift;
            }
            blockedTerminalId.current = null;
          }
        });
      }
    }
    if (previous.areaId !== state.areaId) {
      defeatedOpponent.current = null;
      combatCues.current = [];
      lootCues.current = [];
      blockedTerminalId.current = null;
      effects.current = [];
      emote.current = { action: -1, start: 0, next: now + 6000 + Math.random() * 6000 };
    }
    // A command can advance the old hunt before changing area. Its damage
    // events belong to that old map and must not appear in the new scene.
    const displayedEvents = previous.areaId === state.areaId ? freshEvents : [];
    effects.current = [
      ...effects.current.filter((e) => (blockedTerminalId.current !== null && e.id > blockedTerminalId.current) || now - e.start < 1500),
      ...displayedEvents.filter((e) => e.amount !== undefined && e.target).map((e) => ({
        id: e.id,
        text: e.kind === "skill" && e.target === "player" ? `+${e.amount}` : `${e.amount}`,
        target: e.target!,
        critical: e.critical,
        start: effectStarts.get(e.id) ?? now,
      })),
      ...displayedEvents.filter((e) => e.kind === "miss" || e.kind === "dodge").map((e) => ({
        id: e.id,
        text: "MISS",
        target: (e.kind === "dodge" ? "player" : "enemy") as "player" | "enemy",
        start: effectStarts.get(e.id) ?? now,
      })),
    ].slice(-60);
    suspendedEffects = effects.current.filter((effect) => suspendedIds.has(effect.id));
    effects.current = effects.current.filter((effect) => !suspendedIds.has(effect.id));
  }, [snapshot, state.events, catalog]);
  useEffect(() => () => { opponentRequest.current++; }, []);
  useEffect(() => {
    actorsRef.current = { hero: hero.actor, enemy: enemy.actor };
    if (enemy.actor && state.battle)
      lastOpponent.current = {
        actor: enemy.actor,
        monsterId: state.battle.monsterId,
        areaId: state.areaId,
      };
  }, [hero.actor, enemy.actor, state.battle, state.areaId]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let previous = 0;
    let width = 640;
    let height = 350;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resize = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
    resize.observe(element);
    const render = (time: number) => {
      raf = requestAnimationFrame(render);
      if (time - previous < (motion.matches ? 250 : 16) || document.hidden)
        return;
      previous = time;
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      if (!mapReady) return;
      const current = stateRef.current.state;
      const huntActive = current.status === "hunting" && !!current.areaId && current.hp > 0;
      const route = HUNT_ROUTES[scene];
      const motionState = roaming.current;
      if (!huntActive) {
        motionState.wasHunting = false;
        motionState.pausedAt = null;
      } else {
        if (motionState.areaId !== current.areaId)
          resetRoaming(motionState, current.areaId!, scene, time, width, height);
        if (!motionState.wasHunting) {
          motionState.from = motionState.position;
          motionState.routeIndex = 0;
          motionState.target = route[0] ?? motionState.position;
          motionState.startedAt = time;
          motionState.durationMs = walkDuration(motionState.from, motionState.target, width, height);
          motionState.pauseUntil = 0;
          motionState.pausedAt = null;
          motionState.direction = walkDirection(motionState.from, motionState.target);
          motionState.walking = false;
          motionState.wasHunting = true;
        }
      }
      const defeated = defeatedOpponent.current;
      const lingering = defeated && time < defeated.until ? defeated : null;
      const cue = (isArriving ? [] : combatCues.current).find(
        (entry) => !entry.blocked && time >= entry.start && time < entry.start + entry.duration,
      );
      const activeLoot = (isArriving ? [] : lootCues.current).filter((entry) =>
        time >= entry.start && time < entry.until &&
        (blockedTerminalId.current === null || entry.killId !== blockedTerminalId.current),
      );
      const battleVisible = !!current.battle && !isArriving;
      const showDefeated = !isArriving && !!lingering && (!current.battle || !cue || cue.id <= lingering.terminalId);
      const fighting = battleVisible || !!showDefeated;
      const roamAllowed = huntActive && !battleVisible && !showDefeated && activeLoot.length === 0;
      advanceRoaming(motionState, route, time, width, height, roamAllowed && !motion.matches);
      if (!current.battle && !lingering && !activeLoot.length) encounterPose.current = null;
      if (huntActive && battleVisible && current.battle && (
        encounterPose.current?.areaId !== current.areaId ||
        encounterPose.current.startedAt !== current.battle.startedAt
      )) {
        const heroPoint = motionState.position;
        const nextPoint = route[(motionState.routeIndex + 1) % route.length] ?? route[0] ?? heroPoint;
        const dx = nextPoint.x - heroPoint.x;
        const dy = nextPoint.y - heroPoint.y;
        const length = Math.hypot(dx, dy) || 1;
        const enemyPoint = {
          x: Math.max(0.18, Math.min(0.82, heroPoint.x + (dx / length) * 0.14)),
          y: Math.max(0.61, Math.min(0.82, heroPoint.y + (dy / length) * 0.055)),
        };
        encounterPose.current = {
          areaId: current.areaId!,
          startedAt: current.battle.startedAt,
          hero: { ...heroPoint },
          enemy: enemyPoint,
          heroDirection: walkDirection(heroPoint, enemyPoint),
        };
      }
      if (!huntActive && current.status !== "paused") encounterPose.current = null;
      const huntLocation = !!current.areaId && scene !== "town" && current.status !== "challenge" && motionState.areaId === current.areaId;
      const encounter = huntLocation && encounterPose.current?.areaId === current.areaId && (fighting || activeLoot.length)
        ? encounterPose.current
        : null;
      const heroPoint = encounter?.hero ?? (huntLocation ? motionState.position : { x: fighting ? 0.38 : 0.48, y: 0.76 });
      const enemyPoint = encounter?.enemy ?? { x: 0.66, y: 0.76 };
      const heroBaseX = width * heroPoint.x;
      const enemyX = width * enemyPoint.x;
      const heroGround = height * heroPoint.y;
      const enemyGround = height * enemyPoint.y;
      const heroDirection = encounter?.heroDirection ?? (huntLocation ? motionState.direction : HERO_COMBAT_DIRECTION);
      const enemyDirection = encounter ? (heroDirection + 4) % 8 : ENEMY_COMBAT_DIRECTION;
      const heroTargetHeight = width < 440 ? 72 : 92;
      const worldTargetHeight = width < 440 ? 96 : 123;
      const heroActor = actorsRef.current.hero;
      const opponentActor = showDefeated ? lingering!.actor : actorsRef.current.enemy;
      const heroBounds = heroActor ? actorBounds(heroActor, heroDirection, false) : { left: -18, right: 18, top: -75, bottom: 0 };
      const enemyBounds = opponentActor ? actorBounds(opponentActor, enemyDirection, false) : { left: -18, right: 18, top: -50, bottom: 0 };
      const heroHeight = Math.max(1, heroBounds.bottom - heroBounds.top);
      const enemyHeight = Math.max(1, enemyBounds.bottom - enemyBounds.top);
      const worldScale = Math.min(2.8, worldTargetHeight / heroHeight);
      const depth = Math.max(0, Math.min(1, (heroPoint.y - 0.64) / 0.14));
      const heroScale = Math.min(worldScale, heroTargetHeight / heroHeight) * (huntLocation ? 0.82 + depth * 0.18 : 1);
      const enemyScale = Math.min(worldScale, height * 0.59 / enemyHeight, width * 0.27 / Math.max(1, enemyBounds.right - enemyBounds.left));
      const heroVisualHeight = heroHeight * heroScale;
      const enemyVisualHeight = enemyHeight * enemyScale;
      const attack = cue?.action === "attack" || (cue?.action === "skill" && cue.hit) ? cue : undefined;
      const enemySwing = cue?.action === "enemyAttack" ? cue : undefined;
      const attackProgress = attack ? Math.min(1, (time - attack.start) / attack.duration) : 0;
      const strikeReached = !!attack && attackProgress >= (attack.action === "skill" ? SKILL_IMPACT_MS / attack.duration : 0.5);
      const contactGap = ((heroBounds.right - heroBounds.left) * heroScale + (enemyBounds.right - enemyBounds.left) * enemyScale) * 0.46;
      const lunge = Math.sin(Math.PI * attackProgress) ** 2;
      const contactDirection = Math.sign(enemyX - heroBaseX);
      const advance = attack?.melee && !motion.matches
        ? contactDirection * lunge * Math.max(0, Math.abs(enemyX - heroBaseX) - contactGap)
        : 0;
      const heroX = heroBaseX + advance;
      const hideNextOpponent = !!activeLoot.length && !showDefeated && battleVisible && (!cue || cue.id > activeLoot[0].killId);
      const shadows = [{ x: heroX, ground: heroGround, radius: Math.max(10, (heroBounds.right - heroBounds.left) * heroScale * 0.33) }];
      if (fighting && !hideNextOpponent)
        shadows.push({ x: enemyX, ground: enemyGround, radius: Math.max(8, (enemyBounds.right - enemyBounds.left) * enemyScale * 0.33) });
      for (const { x, ground: shadowGround, radius } of shadows) {
        ctx.fillStyle = "#3a584744";
        ctx.beginPath();
        ctx.ellipse(x, shadowGround + 1, Math.min(36, radius), 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const recent = effects.current.filter((e) =>
        !(blockedTerminalId.current !== null && e.id > blockedTerminalId.current) &&
        time >= e.start && time - e.start < 1500,
      );
      const heroHurt = !!enemySwing?.hit && time - enemySwing.start >= enemySwing.duration / 2;
      const enemyHurt = !!attack?.hit && strikeReached;
      const paint = (
        actor: DecodedActor,
        action: ActorAction,
        x: number,
        ground: number,
        scale: number,
        direction: number,
        elapsed = time,
      ) => {
        const bounds = actorBounds(actor, direction, false);
        drawActor(
          ctx,
          actor,
          action,
          motion.matches ? 0 : elapsed,
          x,
          ground - bounds.bottom * scale,
          scale,
          direction,
        );
      };
      if (heroActor)
        paint(
          heroActor,
          cue
            ? cue.action === "attack" ? "attack" : cue.action === "skill" && time - cue.start < SKILL_CAST_MS ? "cast" : heroHurt ? "hurt" : "idle"
            : current.hp <= 0
              ? "dead"
                : roamAllowed && motionState.walking ? 8 : "idle",
          heroX,
          heroGround,
          heroScale,
          heroDirection,
          cue?.action === "skill" ? time - cue.start : attack ? time - attack.start : heroHurt ? time - enemySwing!.start - enemySwing!.duration / 2 : roamAllowed && motionState.walking ? time : 0,
        );
      const opponentDead = showDefeated && lingering!.deadAt !== undefined && time >= lingering!.deadAt;
      if (fighting && opponentActor && !hideNextOpponent)
        paint(
          opponentActor,
          opponentDead ? "dead" : enemyHurt ? "hurt" : enemySwing ? "attack" : "idle",
          enemyX,
          enemyGround,
          enemyScale,
          enemyDirection,
          opponentDead ? time - lingering!.deadAt!
            : enemyHurt ? Math.max(0, time - (attack!.start + (attack!.action === "skill" ? SKILL_IMPACT_MS : attack!.duration * 0.5)))
              : enemySwing ? time - enemySwing.start : 0,
        );
      const assets = visuals.current;
      if (cue?.skill) {
        const selfTarget = cue.skill.kind === "heal" || cue.skill.kind === "buff";
        drawSkillEffect(ctx, assets, {
          skillId: cue.skill.id,
          name: cue.skill.name,
          element: cue.skill.element,
          kind: cue.skill.kind,
          x: selfTarget ? heroX : enemyX,
          y: (selfTarget ? heroGround : enemyGround) - (selfTarget ? heroVisualHeight : enemyVisualHeight) * 0.55,
          casterX: heroX,
          casterY: heroGround - 4,
          elapsedMs: time - cue.start,
          level: cue.skillLevel,
          castMs: SKILL_CAST_MS,
          reducedMotion: motion.matches,
        });
      }
      const sceneRect = activeLoot.length ? element.getBoundingClientRect() : null;
      const destinations = activeLoot.length ? Array.from(document.querySelectorAll<HTMLElement>("[data-loot-destination]")) : [];
      const bagRect = destinations.map((entry) => entry.getBoundingClientRect()).find((rect) =>
        sceneRect && rect.left + rect.width / 2 >= sceneRect.left && rect.left + rect.width / 2 <= sceneRect.right &&
        rect.top + rect.height / 2 >= sceneRect.top && rect.top + rect.height / 2 <= sceneRect.bottom,
      ) ?? destinations[0]?.getBoundingClientRect();
      const bagX = bagRect && sceneRect ? Math.max(12, Math.min(width - 12, bagRect.left + bagRect.width / 2 - sceneRect.left)) : heroX;
      const bagY = bagRect && sceneRect ? Math.max(12, Math.min(height - 12, bagRect.top + bagRect.height / 2 - sceneRect.top)) : heroGround - heroVisualHeight * 0.55;
      for (const drop of activeLoot) {
        const elapsed = time - drop.start;
        const duration = drop.until - drop.start;
        const land = motion.matches ? 1 : Math.min(1, elapsed / 190);
        const collect = motion.matches ? (elapsed >= duration * 0.6 ? 1 : 0) : Math.max(0, Math.min(1, (elapsed - 470) / 320));
        const eased = collect * collect * (3 - 2 * collect);
        const row = Math.floor(drop.order / 5);
        const groundX = enemyX + ((drop.order % 5) - 2) * 24 + (row % 2) * 12;
        const groundY = enemyGround - 4 - row * 21 - (1 - land) * 38 - Math.sin(land * Math.PI) * 7;
        const x = groundX + (bagX - groundX) * eased;
        const y = groundY + (bagY - groundY) * eased;
        const visual = lootVisuals.current.get(drop.itemId);
        const item = catalog.items[drop.itemId];
        ctx.save();
        ctx.globalAlpha = collect > 0.8 ? Math.max(0, (1 - collect) * 5) : 1;
        ctx.fillStyle = "#fff6af77";
        ctx.beginPath();
        ctx.ellipse(x, y + 3, 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        if (visual?.actor) {
          const bounds = actorBounds(visual.actor);
          const scale = Math.min(1.4, worldScale * 0.78);
          drawActor(ctx, visual.actor, 0, motion.matches ? 0 : elapsed, x, y - bounds.bottom * scale, scale);
        } else if (visual?.icon) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(visual.icon, x - 15, y - 30, 30, 30);
        } else {
          ctx.fillStyle = "#f5d891";
          ctx.fillRect(x - 9, y - 18, 18, 15);
          ctx.strokeStyle = "#795b30";
          ctx.strokeRect(x - 9, y - 18, 18, 15);
        }
        if (item && elapsed > 130 && elapsed < 580) {
          ctx.font = "bold 11px Tahoma, sans-serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#314037";
          ctx.fillStyle = "#fff7d8";
          const label = `${item.name}${drop.quantity > 1 ? ` ×${drop.quantity}` : ""}`;
          ctx.strokeText(label, groundX, groundY - 38);
          ctx.fillText(label, groundX, groundY - 38);
        }
        ctx.restore();
      }
      const idleMoment = !cue && !fighting && !activeLoot.length && !(roamAllowed && motionState.walking) && current.hp > 0;
      if (idleMoment && time >= emote.current.next) {
        emote.current.action = EMOTE_ACTIONS[Math.floor(Math.random() * EMOTE_ACTIONS.length)];
        emote.current.start = time;
        emote.current.next = time + 18000 + Math.random() * 17000;
      }
      if (idleMoment && emote.current.action >= 0 && time - emote.current.start < 1500)
        drawEmotion(ctx, assets, {
          action: emote.current.action,
          x: heroX,
          y: heroGround - heroVisualHeight - 24,
          elapsedMs: time - emote.current.start,
          reducedMotion: motion.matches,
        });
      ctx.font = "bold 12px Tahoma";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fcf8dc";
      ctx.strokeStyle = "#364a3c";
      ctx.lineWidth = 3;
      ctx.strokeText(current.name, heroX, heroGround + 28);
      ctx.fillText(current.name, heroX, heroGround + 28);
      if (fighting && !hideNextOpponent) {
        const id = showDefeated ? lingering!.monsterId : current.battle?.monsterId;
        const name = id === undefined ? undefined : catalog.monsters[id]?.name;
        if (name) {
          ctx.strokeText(name, enemyX, enemyGround + 28);
          ctx.fillText(name, enemyX, enemyGround + 28);
        }
      }
      for (const e of recent) {
        const x = e.target === "enemy" ? enemyX : heroBaseX;
        const y = (e.target === "enemy" ? enemyGround : heroGround) - (e.target === "enemy" ? enemyVisualHeight : heroVisualHeight) * 0.64;
        drawDamagePopup(ctx, assets, {
          text: e.text,
          target: e.target,
          critical: e.critical,
          x,
          y,
          elapsedMs: time - e.start,
          reducedMotion: motion.matches,
        });
      }
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, [scene, catalog, mapReady, isArriving]);
  return (
    <div className={`scene scene-${scene} ${mapReady ? "map-ready" : "map-not-ready"}`}>
      <OriginalMap map={mapName} onStatusChange={setMapStatus} />
      <canvas
        ref={canvas}
        aria-hidden={!mapReady}
        aria-label={
          isArriving
            ? `${state.name} chegando a ${area?.name ?? "Rune-Midgard"}`
            : monster && state.battle
            ? `${state.name} enfrenta ${monster.name}`
            : `${state.name} em ${scene === "town" ? "Prontera" : (area?.name ?? "Rune-Midgard")}`
        }
        role="img"
      />
      <div className="scene-location">
        <span>
          {state.status === "challenge"
            ? "Desafio em andamento"
            : scene === "town"
              ? "Cidade de Prontera"
              : area?.name}
        </span>
        <small>
          {state.status === "town"
            ? "Prepare-se para a próxima aventura"
            : state.status === "resting"
              ? "Recuperando HP e SP"
              : state.status === "paused"
                ? "Sua caçada está pausada"
                  : state.status === "hunting"
                    ? isArriving
                      ? "Chegando ao mapa"
                      : state.battle
                        ? "Combatendo"
                        : "Procurando monstros"
                    : "Caça automática"}
        </small>
      </div>
      {monster && state.battle && !isArriving && (
        <div className="target-card">
          <div>
            <b>{monster.name}</b>
            <span>Nv. {monster.level}</span>
          </div>
          <Meter
            label="HP"
            value={state.battle.hp}
            max={state.battle.maxHp}
            kind="enemy"
            text={`${number(state.battle.hp)} / ${number(state.battle.maxHp)}`}
          />
        </div>
      )}
      {(hero.error || enemy.error) && (
        <div className="scene-warning" role="status">
          <span>
            Um sprite está indisponível. Você pode continuar a aventura.
          </span>
          <button disabled={busy} onClick={() => window.location.reload()}>
            Recarregar recursos
          </button>
        </div>
      )}
    </div>
  );
}
