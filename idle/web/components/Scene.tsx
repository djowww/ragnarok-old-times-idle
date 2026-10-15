import { classicBuffActive } from '../../engine/classicBuffs';
import { resolveEffectActors, retireInterruptedCastCues, retireTrickDeadPoses, sceneEventSkill, soloPostureAt } from '../assets/combatPresentation';
import { currentPlayerCast } from '../../engine/playerCast';
import { isNpcStatusAction, npcStatusCastProgress } from '../../shared/playerStatusView';
import {monsterControlLabel} from '../../shared/monsterControlView';
import { useEffect, useMemo, useRef, useState } from "react";
import type { Appearance, Area, BattleEnemy, GameEvent, GameState, Skill, SpriteAsset, WeaponType } from "../../shared/types";
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO, battleHeroAt, enemyApproachProgress, enemyPositionAt, type BattlePoint } from "../../shared/battleSpatial";
import {
  drawActor,
  GAME_ACTOR_SCALE,
  getAttackAction,
  getActorActionDuration,
  getActorPlaybackDuration,
  getCombatActorAction,
  getActorPose,
  loadActor,
  type ActorAction,
  type DecodedActor,
} from "../assets/renderer";
import {
  drawDamagePopup,
  combatPopupText,
  drawEmotion,
  drawSkillEffect,
  drawGroundTexture,
  spiderWebRadius,
  venomDustPose,
  EMOTE_ACTIONS,
  loadSceneEffects,
  SKILL_CAST_MS,
  SKILL_EFFECT_MS,
  type SceneEffects,
} from "../assets/sceneEffects";
import { loadGroundLoot, type GroundLootVisual } from "../assets/groundLoot";
import { groundTrapVisualState, loadGroundTrap, spentGroundTrap, hasSceneAction, trapCueAction } from "../assets/groundTraps";
import { battleRouteTangent, ConnectedMapMovement, mapGroundHeight, mapGroundWalkable, projectBattlePoint, projectMapArea, projectMapPoint, sceneGroundPoint, screenGroundPoint, walkableSceneGroundPoint, type FieldMapOrigin, type MapProjection, type WorldPoint } from "../assets/mapProjection";
import { getMapLife, mapLifeCanWalk, mapLifePoseAt, mapLifeSpeechAt, prepareMapLife } from "../assets/mapLife";
import { POST_WAVE_SEARCH_MS } from "../../shared/hunt";
import { isTownScene } from "../../shared/worldScene";
import { isPecoMounted } from "../../engine/mountedPeco";
import { number, type PanelProps } from "./common";
import OriginalMap, { type MapStatus } from "./OriginalMap";
import { NativeActorsBridge } from "../assets/nativeActors";
import { corpseFrameAt, startCorpsePresentation, shiftCorpsePresentation, type CorpsePresentation } from "../assets/corpsePresentation";
import { ActorActionPresentation, EnemyActionPresentation, type EnemyActionFrame } from "../assets/enemyActionPresentation";
import { movementAtAction, presentLatestActorActions, presentedActorActionAt, presentedActorActions, lockActorDirection, projectStrikeContact, targetHealthAt, movementIsWalking, ActionTextureStartup, suppressActorReactions, presentedActorReactionAt, reconcileActorPlayback, autoCounterPostureAt, postureFacingPoint, type ActorActionWatermark } from "../assets/combatPresentation";
import { backslidingFacingDirection, backslidingPresentationPoint } from '../assets/backslidingPresentation';
import { sageFieldQuads, visibleSageField } from '../assets/sageFieldVisuals';
import { SceneClock } from '../assets/sceneClock';
import { heroWorldAtAction } from '../assets/combatPresentation';
import SkillIcon from './SkillIcon';
import "../styles/scene-polish-world.css";

type EquippedWeapon = { type: WeaponType; gender: "male" | "female"; job: string; mounted?: boolean };
function useActor(asset?: SpriteAsset, weapon?: EquippedWeapon, appearance?: Appearance, identity?: DecodedActor['identity']) {
  const [actor, setActor] = useState<DecodedActor | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    let retryTimer: number | undefined;
    let retryAttempt = 0;
    setActor(null);
    setError(false);
    const retry = () => {
      if (!live) return;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(retryAttempt++, 5));
      retryTimer = window.setTimeout(load, delay);
    };
    const load = () => {
      if (!asset || !live) return;
      void loadActor(asset, weapon, appearance, identity)
        .then((value) => {
          if (!live) return;
          const failed = value.fallback || !!value.error;
          setActor(value);
          setError(failed);
          if (failed) retry();
        })
        .catch(() => {
          if (!live) return;
          setError(true);
          retry();
        });
    };
    load();
    return () => {
      live = false;
      window.clearTimeout(retryTimer);
    };
  }, [asset, weapon?.type, weapon?.gender, weapon?.job, weapon?.mounted,
    appearance?.hairStyle, appearance?.hairColor, appearance?.clothesColor, identity?.job, identity?.gender]);
  return { actor, error };
}

export function ActorPreview({
  asset,
  name,
  weapon,
  appearance,
  large = false,
  size = "default",
  displayScale = 1,
  direction = 0,
}: {
  asset: SpriteAsset;
  name: string;
  weapon?: EquippedWeapon;
  appearance?: Appearance;
  large?: boolean;
  size?: "default" | "natural" | "world";
  displayScale?: number;
  direction?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { actor, error } = useActor(asset, weapon, appearance);
  const nativeBounds = actor ? actorBounds(actor, direction) : null;
  const width = size === "world" ? Math.max(92, Math.ceil((nativeBounds ? nativeBounds.right - nativeBounds.left : 76) + 16)) : size === "natural" ? 92 : 120;
  const height = size === "world" ? Math.max(92, Math.ceil((nativeBounds ? nativeBounds.bottom - nativeBounds.top : 76) + 16)) : size === "natural" ? 92 : 112;
  // Render the complete fitted pose with its padding before enlarging the canvas.
  // Scaling the finished preview preserves room for large monsters and weapons.
  const worldDisplayScale = displayScale * GAME_ACTOR_SCALE;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    if (actor) {
      const bounds = actorBounds(actor, direction);
      const scale = Math.min(
        size !== "default" ? 1 : large ? 2.2 : 1.8,
        (width - 16) / (bounds.right - bounds.left),
        (height - 16) / (bounds.bottom - bounds.top),
      );
      drawActor(
        ctx,
        actor,
        "idle",
        0,
        width / 2 - ((bounds.left + bounds.right) / 2) * scale,
        height - 8 - bounds.bottom * scale,
        scale,
        direction,
      );
    }
  }, [actor, large, size, width, height, direction]);
  return (
    <div className={`actor-preview ${large ? "large" : ""} ${size !== "default" ? size : ""}`}
      style={size === "world" ? { width: width * worldDisplayScale, height: height * worldDisplayScale }
        : displayScale !== 1 ? { width: width * displayScale, height: height * displayScale } : undefined}>
      <canvas
        ref={canvas}
        width={width}
        height={height}
        style={size === "world" ? { width: width * worldDisplayScale, height: height * worldDisplayScale }
          : { ...(displayScale !== 1 ? { width: width * displayScale, height: height * displayScale } : {}),
              scale: GAME_ACTOR_SCALE, transformOrigin: `50% ${(height - 8) / height * 100}%` }}
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
const FIELD_SCENE_ORIGIN = { x: 0.48, y: 0.76 };
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
  return actor ? getActorActionDuration(actor, base, direction, fallback) : fallback;
}

type SceneActorPaint = {
  opacity?: number;
  id: string;
  actor: DecodedActor;
  action: ActorAction;
  x: number;
  ground: number;
  world?: WorldPoint;
  scale: number;
  direction: number;
  elapsed: number;
  motionMs?: number;
  particle?: boolean;
  canvasOnly?: boolean;
};

/** A small, feathered footprint follows the real terrain plane and ACT feet. */
function drawActorFootShadow(ctx: CanvasRenderingContext2D, paint: SceneActorPaint, camera: MapProjection | null, width: number, height: number): void {
  const bounds = actorBounds(paint.actor, paint.direction, false);
  const visualWidth = (bounds.right - bounds.left) * paint.scale * GAME_ACTOR_SCALE;
  const radius = Math.max(4, Math.min(30, visualWidth * 0.28));
  let axisX = { x: radius, y: 0 };
  let axisY = { x: 0, y: Math.max(2, Math.min(7, radius * 0.26)) };
  if (camera && paint.world) {
    const placement = projectMapPoint(camera, paint.world, width, height);
    const cells = radius / Math.max(0.05, placement.scale) / 35;
    const x = paint.world[0], y = paint.world[2];
    const alongX = projectMapPoint(camera, [x + cells, mapGroundHeight(camera, x + cells - 0.5, y - 0.5), y], width, height);
    const alongY = projectMapPoint(camera, [x, mapGroundHeight(camera, x - 0.5, y + cells - 0.5), y + cells], width, height);
    axisX = { x: alongX.x - placement.x, y: alongX.y - placement.y };
    axisY = { x: alongY.x - placement.x, y: alongY.y - placement.y };
  }
  ctx.save();
  ctx.globalAlpha *= paint.opacity ?? 1;
  ctx.transform(axisX.x, axisX.y, axisY.x, axisY.y, paint.x, paint.ground + 0.5);
  const shadow = ctx.createRadialGradient(0, 0, 0.08, 0, 0, 1);
  shadow.addColorStop(0, "rgba(24, 37, 29, 0.24)");
  shadow.addColorStop(0.45, "rgba(24, 37, 29, 0.13)");
  shadow.addColorStop(1, "rgba(24, 37, 29, 0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

type TargetPlacement = { x: number; ground: number; scale: number; visualHeight: number; world?: WorldPoint; width: number };
function drawTargetMarker(ctx: CanvasRenderingContext2D, target: TargetPlacement, camera: MapProjection | null, width: number, height: number): void {
  ctx.save();
  ctx.beginPath();
  if (camera && target.world) {
    const radius = Math.max(0.35, Math.min(1.15, target.width * GAME_ACTOR_SCALE / 35 * 0.34));
    const outline = projectMapArea(camera, target.world, radius, width, height);
    outline.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
  } else {
    const radius = Math.max(11, Math.min(34, target.width * target.scale * GAME_ACTOR_SCALE * 0.36));
    ctx.ellipse(target.x, target.ground, radius, Math.max(4, radius * 0.25), 0, 0, Math.PI * 2);
  }
  ctx.fillStyle = "rgba(255, 230, 151, 0.08)";
  ctx.strokeStyle = "rgba(255, 240, 178, 0.85)";
  ctx.lineWidth = 1.25;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTargetHealth(ctx: CanvasRenderingContext2D, target: TargetPlacement, label: string, hp: number, maxHp: number, width: number): void {
  const barWidth = 56;
  const y = Math.max(17, target.ground - target.visualHeight - 17);
  ctx.save();
  ctx.font = "bold 11px Tahoma, Arial, sans-serif";
  ctx.textAlign = "center";
  const halfWidth = Math.max(barWidth / 2, ctx.measureText(label).width / 2) + 5;
  const x = Math.max(halfWidth, Math.min(width - halfWidth, target.x));
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(30, 43, 35, 0.94)";
  ctx.fillStyle = "#fff1bb";
  ctx.strokeText(label, x, y);
  ctx.fillText(label, x, y);
  ctx.fillStyle = "#27382a";
  ctx.fillRect(x - barWidth / 2 - 1, y + 5, barWidth + 2, 7);
  ctx.fillStyle = "#e6e8d6";
  ctx.fillRect(x - barWidth / 2, y + 6, barWidth, 5);
  ctx.fillStyle = "#789554";
  ctx.fillRect(x - barWidth / 2, y + 6, barWidth * Math.max(0, Math.min(1, hp / Math.max(1, maxHp))), 5);
  ctx.restore();
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
    { x: 0.30, y: 0.80 }, { x: 0.59, y: 0.78 }, { x: 0.76, y: 0.68 },
    { x: 0.61, y: 0.56 }, { x: 0.36, y: 0.60 }, { x: 0.24, y: 0.70 },
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
function walkDuration(from: NormalizedPoint, to: NormalizedPoint): number {
  const cells = Math.hypot((to.x - from.x) * 22, (to.y - from.y) * 18);
  return Math.max(950, Math.min(POST_WAVE_SEARCH_MS - 900, cells / 2.8 * 1000));
}
function clearRoamSegment(camera: MapProjection | null, from: NormalizedPoint, to: NormalizedPoint, anchor: NormalizedPoint): boolean {
  if (!camera?.ground?.walkable) return true;
  const a = sceneGroundPoint(camera, from, anchor), b = sceneGroundPoint(camera, to, anchor);
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) * 4));
  for (let i = 0; i <= steps; i++)
    if (!mapGroundWalkable(camera, a[0] - 0.5 + (b[0] - a[0]) * i / steps,
      a[2] - 0.5 + (b[2] - a[2]) * i / steps)) return false;
  return true;
}
function roamTarget(motion: RoamingMotion, route: readonly NormalizedPoint[], camera: MapProjection | null, anchor: NormalizedPoint): NormalizedPoint {
  for (let offset = 0; offset < route.length; offset++) {
    const index = (motion.routeIndex + offset) % route.length;
    const candidate = route[index];
    if (Math.hypot(candidate.x - motion.position.x, candidate.y - motion.position.y) > 0.025 &&
      clearRoamSegment(camera, motion.position, candidate, anchor)) {
      motion.routeIndex = index;
      return candidate;
    }
  }
  // A short search around the current cell keeps narrow corridors moving.
  for (let offset = 0; offset < 8; offset++) {
    const angle = (motion.direction + offset) * Math.PI / 4;
    const candidate = { x: motion.position.x + Math.cos(angle) * 3 / 22, y: motion.position.y + Math.sin(angle) * 3 / 18 };
    if (clearRoamSegment(camera, motion.position, candidate, anchor)) return candidate;
  }
  return motion.position;
}
function resetRoaming(motion: RoamingMotion, areaId: string, scene: SceneKind, time: number, camera: MapProjection | null, anchor: NormalizedPoint): void {
  let position = { x: 0.5, y: 0.92 };
  if (camera?.ground?.walkable) {
    const origin = sceneGroundPoint(camera, position, anchor);
    if (!mapGroundWalkable(camera, origin[0] - 0.5, origin[2] - 0.5)) {
      search: for (let radius = 1; radius <= 4; radius++)
        for (let dx = -radius; dx <= radius; dx++)
          for (let dy = -radius; dy <= radius; dy++)
            if (mapGroundWalkable(camera, origin[0] - 0.5 + dx, origin[2] - 0.5 + dy)) {
              position = { x: position.x + dx / 22, y: position.y + dy / 18 };
              break search;
            }
    }
  }
  const route = HUNT_ROUTES[scene];
  const target = roamTarget({ ...motion, position, routeIndex: 0 }, route, camera, anchor);
  Object.assign(motion, {
    areaId,
    position,
    from: position,
    target,
    routeIndex: 0,
    startedAt: time,
    durationMs: walkDuration(position, target),
    pauseUntil: 0,
    pausedAt: null,
    direction: walkDirection(position, target),
    walking: false,
    wasHunting: false,
  });
}
function advanceRoaming(motion: RoamingMotion, route: readonly NormalizedPoint[], time: number, allowed: boolean, camera: MapProjection | null, anchor: NormalizedPoint): void {
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
  if (!motion.pauseUntil) motion.pauseUntil = time + 80;
  if (time < motion.pauseUntil) return;
  motion.routeIndex = (motion.routeIndex + 1) % route.length;
  motion.from = motion.position;
  motion.target = roamTarget(motion, route, camera, anchor);
  motion.startedAt = time;
  motion.durationMs = walkDuration(motion.from, motion.target);
  motion.direction = walkDirection(motion.from, motion.target);
  motion.pauseUntil = 0;
  motion.walking = true;
}
type CombatCue = {
  id: number;
  start: number;
  duration: number;
  actionDuration: number;
  motionMs: number;
  reactionSuppressed?: boolean;
  presentationDirection?: number;
  impact: number;
  reactionDuration: number;
  effectStart: number;
  sourceActorId: string;
  targetActorId: string;
  actorAction: "attack" | "skill" | "none";
  actionId: string;
  actionAt: number;
  action: "attack" | "enemyAttack" | "skill";
  hit: boolean;
  melee: boolean;
  skill?: Skill;
  skillLevel?: number;
  blocked?: boolean;
  enemyId?: string;
  castMs?: number;
  castAction?: boolean;
  hitCount?: number;
  eventAt?: number;
  effectEnemyId?: string;
  effectPosition?: GroundPosition;
  presented?: boolean;
  sourceGround?: GroundPosition;
  sourcePosition?: NormalizedPoint;
  movementDestination?: NormalizedPoint;
  actionFacing?: NormalizedPoint;
  actionAreaId?: string;
  targetHpBefore?: number;
  amount?: number;
};
function pruneActionWatermarks(watermarks: Map<string, ActorActionWatermark>, cues: CombatCue[]): void {
  // A watermark is needed only while a retained cue could revive an older
  // body action. Effects keep their own lifetimes without retaining actors.
  const retainedActors = new Set(cues.filter(cue => cue.actorAction !== "none").map(cue => cue.sourceActorId));
  for (const actorId of watermarks.keys()) if (!retainedActors.has(actorId)) watermarks.delete(actorId);
}
function newestCue(cues: CombatCue[], predicate: (cue: CombatCue) => boolean): CombatCue | undefined {
  let latest: CombatCue | undefined;
  for (const cue of cues)
    if (predicate(cue) && (!latest || cue.actionAt > latest.actionAt ||
      (cue.actionAt === latest.actionAt && cue.actionId !== latest.actionId && cue.id > latest.id))) latest = cue;
  return latest;
}
function actorActionCue(cues: CombatCue[], _watermarks: ReadonlyMap<string, ActorActionWatermark>, actorId: string, time: number): CombatCue | undefined {
  return presentedActorActionAt(cues.filter(cue => !cue.blocked), actorId, time);
}
function actorReactionCue(cues: CombatCue[], actorId: string, time: number): CombatCue | undefined {
  return presentedActorReactionAt(cues, actorId, time);
}
type LootCue = {
  id: number;
  itemId: number;
  quantity: number;
  start: number;
  until: number;
  order: number;
  killId: number;
  enemyId?: string;
  origin?: GroundPosition;
  presentationCueId?: number;
};
type GroundPosition = { point: NormalizedPoint; world?: WorldPoint; tangent?: WorldPoint };
type GroundLootReadout = { id: number; label: string };
const LOOT_LAND_MS = 190;
const LOOT_GROUND_MS = 4000;
const LOOT_COLLECT_MS = 600;
const LOOT_VISIBLE_MS = LOOT_LAND_MS + LOOT_GROUND_MS + LOOT_COLLECT_MS;
type PopupCue = {
  id: number;
  text: string;
  target: "player" | "enemy";
  critical?: boolean;
  start: number;
  enemyId?: string;
};

function battleScenePoint(point: BattlePoint, hero: NormalizedPoint): NormalizedPoint {
  // sceneGroundPoint spans 22x18 cells; battleSpatial uses twelve cells per unit.
  return {
    x: hero.x + (point.x - BATTLE_HERO.x) * BATTLE_CELLS_PER_UNIT / 22,
    y: hero.y + (point.y - BATTLE_HERO.y) * BATTLE_CELLS_PER_UNIT / 18,
  };
}
function enemyScreenEdge(enemy: BattleEnemy): NormalizedPoint {
  const angle = (enemy.spawnDirection * 45 - 90) * Math.PI / 180;
  return { x: 0.5 + Math.cos(angle) * 0.72, y: 0.5 + Math.sin(angle) * 0.72 };
}
function enemyArrival(enemy: BattleEnemy, serverNow: number, hero: NormalizedPoint, sourceOnly = false) {
  const progress = enemyApproachProgress(enemy, serverNow);
  const origin = enemy.fieldSlot !== undefined ? FIELD_SCENE_ORIGIN : hero;
  const target = battleScenePoint(enemy.position, origin);
  const from = battleScenePoint(enemyPositionAt(enemy, enemy.startedAt), origin);
  const sourcePoint = battleScenePoint(enemyPositionAt(enemy, serverNow), origin);
  const edge = enemyScreenEdge(enemy);
  // Only the beginning is cosmetic: enter from outside the viewport, then
  // converge to the shared cell position before ordinary ranged combat begins.
  const edgeAmount = sourceOnly || enemy.fieldSlot !== undefined ? 0 : Math.max(0, 1 - progress / 0.15) ** 2;
  return {
    point: { x: sourcePoint.x + (edge.x - from.x) * edgeAmount, y: sourcePoint.y + (edge.y - from.y) * edgeAmount },
    sourcePoint,
    from, target, progress, edgeAmount,
    walking: progress < 1 && enemy.approachPausedAt === undefined,
    direction: walkDirection(from, target),
  };
}

function enemyGroundPosition(camera: MapProjection | null, enemy: BattleEnemy, serverNow: number, hero: NormalizedPoint, anchor: NormalizedPoint, sourceOnly = false, movement?: ConnectedMapMovement, fieldOrigin?: FieldMapOrigin): GroundPosition {
  const arrival = enemyArrival(enemy, serverNow, hero, sourceOnly);
  if (!camera) return { point: arrival.point };
  if (fieldOrigin && enemy.fieldSlot !== undefined) {
    const position = enemyPositionAt(enemy, serverNow);
    const progress = enemyApproachProgress(enemy, serverNow);
    return { point: arrival.point, world: projectBattlePoint(camera, position, fieldOrigin),
      tangent: enemy.movementRoute?.length ? battleRouteTangent(camera, enemy.movementRoute, progress, fieldOrigin)
        : projectBattlePoint(camera, enemy.position, fieldOrigin) };
  }
  if (enemy.fieldSlot !== undefined && movement) {
    const pose = movement.project(camera, enemy.id,
      JSON.stringify([enemy.startedAt, enemy.arrivedAt, arrival.from, arrival.target]),
      sceneGroundPoint(camera, arrival.from, anchor), sceneGroundPoint(camera, arrival.target, anchor), arrival.progress);
    return { point: arrival.point, ...pose };
  }
  const source = enemy.fieldSlot !== undefined
    ? walkableSceneGroundPoint(camera, arrival.sourcePoint, anchor)
    : sceneGroundPoint(camera, arrival.sourcePoint, anchor);
  if (arrival.edgeAmount === 0) return { point: arrival.sourcePoint, world: source };
  const from = sceneGroundPoint(camera, arrival.from, anchor);
  const edge = screenGroundPoint(camera, enemyScreenEdge(enemy));
  const edgeAmount = arrival.edgeAmount;
  const x = source[0] + (edge[0] - from[0]) * edgeAmount;
  const y = source[2] + (edge[2] - from[2]) * edgeAmount;
  return { point: arrival.point, world: [x, mapGroundHeight(camera, x - 0.5, y - 0.5), y] };
}
function projectEnemyArrival(camera: MapProjection, enemy: BattleEnemy, serverNow: number, hero: NormalizedPoint, anchor: NormalizedPoint, width: number, height: number, sourceOnly = false, movement?: ConnectedMapMovement, fieldOrigin?: FieldMapOrigin) {
  return projectMapPoint(camera, enemyGroundPosition(camera, enemy, serverNow, hero, anchor, sourceOnly, movement, fieldOrigin).world!, width, height);
}
function skillFor(event: GameEvent, skills: Record<string, Skill>): Skill | undefined {
  return sceneEventSkill(event, skills);
}
function offensiveSceneSkill(skill: Skill | undefined): boolean {
  // Match encounters.offensiveSkill: a self buff must keep the edge entrance.
  return !!skill && (["physical", "magical", "steal"].includes(skill.kind) ||
    (!!skill.statusEffect && ["enemy", "ground"].includes(skill.targetType ?? "")) ||
    ["WZ_QUAGMIRE", "BA_FROSTJOKE", "DC_SCREAM"].includes(skill.sourceName ?? ""));
}
function sceneEnemies(state: GameState): BattleEnemy[] {
  if (isTownScene(state)) return [];
  const population = state.status !== "challenge" && !state.battle?.challengeId && state.fieldPopulation?.areaId === state.areaId
    ? state.fieldPopulation.enemies : [];
  const actors = new Map(population.map(enemy => [enemy.id, enemy]));
  for (const enemy of state.battle?.enemies ?? []) actors.set(enemy.id, enemy);
  return [...actors.values()];
}
export default function Scene({ catalog, snapshot, busy, onMapStatusChange }: PanelProps & {
  onMapStatusChange?: (status: MapStatus) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const groundLootElements = useRef(new Map<number, HTMLSpanElement>());
  const groundLootReadoutKey = useRef("");
  const [groundLootReadouts, setGroundLootReadouts] = useState<GroundLootReadout[]>([]);
  const projection = useRef<MapProjection | null>(null);
  const mapFollow = useRef<WorldPoint | null>(null);
  const nativeActors = useRef<NativeActorsBridge | null>(null);
  const stateRef = useRef(snapshot);
  const actorsRef = useRef<{
    hero: DecodedActor | null;
    enemy: DecodedActor | null;
  }>({ hero: null, enemy: null });
  const enemyActors = useRef(new Map<number, DecodedActor>());
  const groupHistory = useRef(new Map<string, { enemy: BattleEnemy; hero?: NormalizedPoint; deadServerAt?: number; ground?: GroundPosition; presentationCueId?: number } & CorpsePresentation>());
  const textureStartup = useRef(new ActionTextureStartup());
  const heroPresentation = useRef(new ActorActionPresentation(textureStartup.current));
  const enemyPresentation = useRef(new EnemyActionPresentation(textureStartup.current));
  const enemyPositions = useRef(new Map<string, GroundPosition>());
  const connectedMovement = useRef(new ConnectedMapMovement());
  const renderedHeroGround = useRef<{ map: string; areaId: string | null; ground: GroundPosition } | null>(null);
  const offensiveTargets = useRef(new Set<string>());
  const legacyOpponentPosition = useRef<GroundPosition | null>(null);
  const legacyOpponentId = useRef("enemy");
  const receivedAt = useRef(performance.now());
  const sceneClock = useRef(new SceneClock());
  const { state } = snapshot;
  const combatNow = state.status === 'paused' ? state.pausedAt ?? state.lastSimulatedAt : snapshot.serverTime;
  const bladeWait = state.combatEffects?.bladeStopWait;
  const bladeLink = state.combatEffects?.bladeStopLink;
  const bladePartner = bladeLink && (state.battle?.enemies ?? state.fieldPopulation?.enemies ?? [])
    .find(enemy => enemy.id === bladeLink.partnerActorId && enemy.hp > 0 &&
      enemy.statuses?.SC_BLADESTOP?.sourceActorId === state.id &&
      enemy.statuses.SC_BLADESTOP.partnerActorId === state.id && enemy.statuses.SC_BLADESTOP.expiresAt > combatNow);
  const bladeStopLabel = bladeWait && bladeWait.expiresAt > combatNow
    ? `Aguardando ataque · ${Math.ceil((bladeWait.expiresAt - combatNow) / 1000)}s`
    : bladePartner && bladeLink
      ? `Vínculo · ${catalog.monsters[bladePartner.monsterId]?.name ?? 'monstro'} · ${Math.ceil((bladeLink.expiresAt - combatNow) / 1000)}s`
      : undefined;
  const area = catalog.areas.find((a) => a.id === state.areaId);
  const challengeMonsterIds = useMemo(
    () => new Set(catalog.challenges.map((challenge) => challenge.monsterId)),
    [catalog.challenges],
  );
  const monster = state.battle && state.battle.hp > 0 && (!state.battle.enemies || state.battle.targetId)
    ? catalog.monsters[state.battle.monsterId]
    : undefined;
  const engagedCount = state.battle?.enemies?.filter(enemy => enemy.fieldSlot === undefined || enemy.engaged).length ?? 0;
  const equippedEntry = state.inventory.find((entry) => entry.uid === state.equipment.weapon);
  const equippedType = equippedEntry ? catalog.items[equippedEntry.itemId]?.weaponType : undefined;
  const mounted = isPecoMounted(state, catalog);
  const heroClass = catalog.classes[state.job];
  const hero = useActor(
    (mounted ? heroClass.mountedSprite?.[state.gender] : undefined) ?? heroClass.sprite[state.gender],
    equippedType ? { type: equippedType, gender: state.gender, job: state.job, mounted } : undefined,
    state.appearance,
    { job: state.job, gender: state.gender },
  );
  const enemy = useActor(monster?.sprite);
  const enemyAssetIds = [...new Set([...sceneEnemies(state).map((entry) => entry.monsterId),
    ...state.events.filter(event => event.kind === "kill" && event.monsterId &&
      event.at >= snapshot.serverTime - 2000 && (!event.areaId || (!isTownScene(state) && event.areaId === state.areaId)))
      .map(event => event.monsterId!)] )].sort().join(",");
  useEffect(() => {
    let live = true;
    const timers = new Set<number>();
    for (const id of enemyAssetIds.split(",").filter(Boolean).map(Number)) {
      if (enemyActors.current.has(id) && !enemyActors.current.get(id)?.fallback) continue;
      const asset = catalog.monsters[id]?.sprite;
      if (!asset) continue;
      const load = () => void loadActor(asset).then((actor) => {
        if (!live) return;
        enemyActors.current.set(id, actor);
        if (actor.fallback) {
          const timer = window.setTimeout(() => { timers.delete(timer); load(); }, 3000);
          timers.add(timer);
        }
      });
      load();
    }
    return () => { live = false; timers.forEach((timer) => window.clearTimeout(timer)); };
  }, [enemyAssetIds, catalog.monsters]);
  const scene: SceneKind =
    isTownScene(state)
      ? "town"
      : (area?.scene ?? "field");
  const mapName = scene === "town" ? "prontera" : (area?.map ?? "prontera");
  const mapOrigin = area?.fieldNavigation?.map === mapName ? area.fieldNavigation.origin : catalog.sceneNavigation?.[mapName]?.origin;
  const activeField = visibleSageField(state, mapName, state.lastSimulatedAt);
  const fieldClock = useRef<HTMLTimeElement | null>(null);
  const mapLife = useMemo(() => getMapLife(mapName, area, catalog), [mapName, area, catalog]);
  const ambientActors = useRef(new Map<string, DecodedActor>());
  useEffect(() => {
    let live = true;
    ambientActors.current.clear();
    for (const descriptor of mapLife) {
      void loadActor(descriptor.asset).then((actor) => {
        if (live && !actor.fallback && !actor.error) ambientActors.current.set(descriptor.id, actor);
      }).catch(() => undefined);
    }
    return () => { live = false; ambientActors.current.clear(); };
  }, [mapLife]);
  const [mapStatus, setMapStatus] = useState<MapStatus>({ map: mapName, phase: "loading" });
  const mapReady = mapStatus.map === mapName && mapStatus.phase === "ready";
  useEffect(() => {
    onMapStatusChange?.(mapStatus.map !== mapName ? { map: mapName, phase: "loading" }
      : mapReady && !hero.actor && !hero.error ? { map: mapName, phase: "loading", progress: 99 }
      : mapStatus);
  }, [mapStatus, mapName, mapReady, hero.actor, hero.error, onMapStatusChange]);
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
  const trapVisual = useRef<DecodedActor | null>(null);
  const spentTrapVisual = useRef<DecodedActor | null>(null);
  const lootCues = useRef<LootCue[]>([]);
  const lootVisuals = useRef(new Map<number, GroundLootVisual>());
  const emote = useRef({ action: -1, start: 0, next: performance.now() + 6000 + Math.random() * 6000 });
  const eventCursor = useRef(snapshot.state.events.at(-1)?.id ?? 0);
  const opponentRequest = useRef(0);
  const blockedTerminalId = useRef<number | null>(null);
  const combatCues = useRef<CombatCue[]>([]);
  const actionWatermarks = useRef(new Map<string, ActorActionWatermark>());
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
    presentationCueId?: number;
    deathPaintAt?: number;
    deathCanvas?: boolean;
  } | null>(null);
  const shiftPresentationAssociates = (moved: Map<number, number>) => {
    for (const popup of effects.current) popup.start += moved.get(popup.id) ?? 0;
    for (const entry of groupHistory.current.values()) {
      const delta = entry.presentationCueId === undefined ? 0 : moved.get(entry.presentationCueId) ?? 0;
      shiftCorpsePresentation(entry, delta);
    }
    const corpse = defeatedOpponent.current;
    if (corpse) {
      const delta = corpse.presentationCueId === undefined ? 0 : moved.get(corpse.presentationCueId) ?? 0;
      shiftCorpsePresentation(corpse, delta);
    }
    for (const drop of lootCues.current) {
      const delta = drop.presentationCueId === undefined ? 0 : moved.get(drop.presentationCueId) ?? 0;
      drop.start += delta; drop.until += delta;
    }
  };
  useEffect(() => {
    let hiddenAt: number | null = document.hidden ? performance.now() : null;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt !== null) {
        const paused = performance.now() - hiddenAt;
        sceneClock.current.reset();
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
    void loadGroundTrap().then((loaded) => {
      if (live) {
        trapVisual.current = loaded;
        spentTrapVisual.current = loaded ? spentGroundTrap(loaded) : null;
      }
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
    receivedAt.current = performance.now();
    const newEvents = state.events.filter((e) => e.id > eventCursor.current);
    eventCursor.current = state.events.at(-1)?.id ?? eventCursor.current;
    const now = performance.now();
    if (previous.areaId !== state.areaId || isTownScene(state) || state.status === "resting") {
      renderedHeroGround.current = null;
    }
    const holdHeroStrike = () => {
      const rendered = renderedHeroGround.current;
      // Capture contact while both snapshots are available, including actions
      // whose visual turn begins later without another response arriving.
      for (const cue of combatCues.current.filter(entry => entry.sourceActorId === state.id &&
        entry.presented && entry.actorAction !== 'none' && !entry.sourceGround && entry.start + entry.actionDuration > now)) {
      const strike = state.status !== "challenge" ? movementAtAction(
        state.fieldHero?.areaId === state.areaId ? state.fieldHero : undefined,
        previous.areaId === state.areaId && previous.fieldHero?.areaId === state.areaId ? previous.fieldHero : undefined,
        cue.actionAt, cue.actionAreaId === state.areaId ? cue.sourcePosition : undefined) : undefined;
      let ground = rendered?.map === mapName && rendered.areaId === state.areaId ? rendered.ground : undefined;
      if (strike) {
        const point = battleScenePoint(strike.point, FIELD_SCENE_ORIGIN);
        const camera = projection.current?.map === mapName ? projection.current : null;
        const { movement } = strike;
        const world = camera ? mapOrigin ? projectBattlePoint(camera, strike.point, mapOrigin)
          : projectStrikeContact(connectedMovement.current, camera, state.id, cue.actionId, strike,
            sceneGroundPoint(camera, battleScenePoint(movement.from, FIELD_SCENE_ORIGIN), FIELD_SCENE_ORIGIN),
            sceneGroundPoint(camera, battleScenePoint(movement.position, FIELD_SCENE_ORIGIN), FIELD_SCENE_ORIGIN), ground?.world) : undefined;
        ground = { point, world };
      }
      if (ground) cue.sourceGround = ground;
      }
    };
    combatCues.current = combatCues.current.filter(
      (cue) => cue.blocked || cue.start + cue.duration > now || textureStartup.current.hasPendingDebut(cue, now) || heroPresentation.current.hasPendingFrame(cue, now) || enemyPresentation.current.hasPendingFrame(cue, now),
    );
    lootCues.current = lootCues.current.filter((cue) => cue.until > now || cue.killId === blockedTerminalId.current);
    const actor = actorsRef.current.hero;
    const attackDuration = actorActionDuration(
      actor, actor ? getAttackAction(actor) : 40, HERO_COMBAT_DIRECTION, 500,
    );
    const serverOffset = now - snapshot.serverTime;
    const cueFor = (event: GameEvent, skill: Skill | undefined, enemyId = event.enemyId ?? legacyOpponentId.current): CombatCue => {
      const incoming = isNpcStatusAction(event, state.id) || event.target === "player" && event.kind === "damage" || event.kind === "dodge";
      const selfSkill = ["skill", "treatment"].includes(event.kind) && event.sourceActorId !== enemyId && (skill?.kind === "heal" || skill?.kind === "buff");
      const effectTick = ["Veneno", "Reflexão"].includes(event.text) || (!!skill &&
        [...(state.battle?.groundEffects ?? []), ...(previous.battle?.groundEffects ?? [])].some(effect => effect.skillId === skill.id) &&
        !state.events.some(entry => entry.kind === "skill" && entry.skillId === skill.id && entry.at === event.at));
      const actorAction = trapCueAction(event.kind) ?? event.actorAction ?? (effectTick ? "none" : skill && skill.kind !== "physical" ? "skill" : "attack");
      const monsterId = event.monsterId ?? groupHistory.current.get(enemyId)?.enemy.monsterId ?? previous.battle?.monsterId ?? state.battle?.monsterId;
      const sourceMonster = monsterId === undefined ? undefined : catalog.monsters[monsterId];
      const sourceActorId = event.sourceActorId ?? (incoming ? enemyId : state.id);
      const targetActorId = event.targetActorId ?? (event.target === "player" || event.kind === "dodge" || selfSkill ? state.id : enemyId);
      const fallbackMotion = sourceActorId === state.id
        ? actorAction === "skill" ? 400 : snapshot.stats.attackIntervalMs / 2 || attackDuration
        : sourceMonster?.attackMotionMs ?? actorActionDuration(enemyActors.current.get(monsterId ?? -1) ?? actorsRef.current.enemy, 16, ENEMY_COMBAT_DIRECTION, 700);
      const motionMs = Math.max(1, event.actionMotionMs ?? fallbackMotion);
      const sourceActor = sourceActorId === state.id ? actorsRef.current.hero : undefined;
      const actionDuration = sourceActor && actorAction !== 'none'
        ? getActorPlaybackDuration(sourceActor, getCombatActorAction(actorAction, skill?.sourceName), motionMs, HERO_COMBAT_DIRECTION) : motionMs;
      const start = serverOffset + (event.actionStartedAt ?? event.at);
      const effectStart = serverOffset + event.at;
      const impact = actorAction !== "none" && !selfSkill
        ? Math.max(effectStart, start + (actorAction === 'attack' ? motionMs : actionDuration * 0.5)) : effectStart;
      const reactionDuration = Math.max(0, event.hitMotionMs ?? (targetActorId === state.id ? 300 : sourceMonster?.damageMotionMs ?? 320));
      return {
        id: event.id, start, effectStart, impact, actionDuration, motionMs, reactionDuration,
        targetHpBefore: event.targetHpBefore, amount: event.kind === 'damage' ? event.amount : undefined,
        sourcePosition: event.actionSourcePosition, movementDestination: event.movementDestination,
        actionFacing: event.actionFacing, actionAreaId: event.areaId,
        duration: Math.max(actionDuration, impact - start + reactionDuration, skill ? effectStart - start + SKILL_EFFECT_MS : 0),
        sourceActorId, targetActorId, actorAction, castAction:event.kind === "cast",
        actionId: event.actionId ?? (skill ? `${sourceActorId}:${skill.id}:${event.at}` : `${event.id}`),
        actionAt: event.actionStartedAt ?? event.at,
        action: incoming ? "enemyAttack" : skill ? "skill" : "attack",
        hit: event.kind === "damage" && (event.amount ?? 0) > 0,
        melee: actorAction === "attack" && !incoming && !skill && equippedType !== "bow",
        skill, skillLevel: event.skillLevel, enemyId, castMs: sourceActorId === state.id ? undefined : event.castMs ?? 0, hitCount: event.hitCount, eventAt: event.at,
        effectEnemyId: targetActorId === state.id ? undefined : targetActorId ?? enemyId,
      };
    };
    // Group fights use each enemy's identity and server timestamps. Several
    // simultaneous hits must not be queued behind an unrelated monster's swing.
    if (state.fieldPopulation || state.battle?.enemies || previous.battle?.enemies || groupHistory.current.size) {
      if (previous.areaId !== state.areaId || isTownScene(state)) {
        groupHistory.current.clear();
        combatCues.current = [];
        actionWatermarks.current.clear();
        effects.current = [];
        lootCues.current = [];
        enemyPositions.current.clear();
        offensiveTargets.current.clear();
        legacyOpponentPosition.current = null;
      }
      if (state.status === "resting" && previous.status !== "resting") {
        combatCues.current = [];
        actionWatermarks.current.clear();
        effects.current = [];
      }
      const living = sceneEnemies(state);
      const alive = new Set(living.map((entry) => entry.id));
      const tracked = new Set([...alive, ...groupHistory.current.keys()]);
      // Read the current history too: an already active cast/hit must stay on
      // the shared position when the scene mounts midway through an encounter.
      for (const event of state.events) {
        if (!event.enemyId || !tracked.has(event.enemyId)) continue;
        const offensive = event.kind === "damage" || event.kind === "miss" || event.kind === "dodge" || event.kind === "kill" ||
          (["cast", "skill"].includes(event.kind) && offensiveSceneSkill(skillFor(event, catalog.skills)));
        if (offensive) offensiveTargets.current.add(event.enemyId);
      }
      const activeCast = state.battle?.cast;
      if (activeCast && offensiveSceneSkill(catalog.skills[activeCast.skillId]))
        offensiveTargets.current.add(activeCast.targetId);
      for (const entry of state.battle?.enemies ?? [])
        if (entry.hp < entry.maxHp) offensiveTargets.current.add(entry.id);
      for (const entry of living) groupHistory.current.set(entry.id,
        { enemy: entry, hero: groupHistory.current.get(entry.id)?.hero });
      const eventGround = (event: GameEvent): GroundPosition | undefined => {
        if (!event.enemyPosition) return;
        const anchor = { x: state.status === "challenge" || previous.status === "challenge" ? 0.38 : 0.48, y: 0.76 };
        const point = battleScenePoint(event.enemyPosition, event.areaId ? FIELD_SCENE_ORIGIN : anchor);
        const camera = projection.current?.map === mapName ? projection.current : null;
        return { point, world: camera ? event.areaId
          ? mapOrigin ? projectBattlePoint(camera, event.enemyPosition!, mapOrigin) : walkableSceneGroundPoint(camera, point, anchor)
          : sceneGroundPoint(camera, point, anchor) : undefined };
      };
      // A fast kill may occur entirely between two polls. Keep its recorded
      // corpse position without creating another living map actor.
      for (const killed of newEvents.filter(event => event.kind === "kill" && event.enemyId &&
        event.enemyPosition && event.monsterId && event.at >= snapshot.serverTime - 2000 &&
        (!event.areaId || (!isTownScene(state) && event.areaId === state.areaId)))) {
        if (groupHistory.current.has(killed.enemyId!)) continue;
        groupHistory.current.set(killed.enemyId!, { enemy: {
          id: killed.enemyId!, monsterId: killed.monsterId!, hp: 0, maxHp: catalog.monsters[killed.monsterId!]?.hp ?? 1,
          position: killed.enemyPosition!, approachFrom: killed.enemyPosition!, startedAt: killed.at,
          arrivedAt: killed.at, enemyNextAttackAt: killed.at, spawnDirection: 0,
          ...(killed.areaId ? { fieldSlot: 0 } : {}),
        } });
      }
      for (const [id, entry] of groupHistory.current) {
        if (alive.has(id)) continue;
        const killed = newEvents.find((event) => event.kind === "kill" && event.enemyId === id);
        if (killed && entry.deadAt === undefined) {
          startCorpsePresentation(entry, now);
          entry.deadServerAt = killed.at;
          const hero = entry.hero ?? encounterPose.current?.hero ?? roaming.current.position;
          const camera = projection.current?.map === mapName ? projection.current : null;
          entry.ground = entry.enemy.fieldSlot !== undefined
            ? enemyGroundPosition(camera, entry.enemy, killed.at, hero,
              { x: 0.48, y: 0.76 }, offensiveTargets.current.has(id), connectedMovement.current, mapOrigin)
            : eventGround(killed) ?? enemyGroundPosition(camera, entry.enemy, killed.at, hero,
              { x: state.status === "challenge" ? 0.38 : 0.48, y: 0.76 }, offensiveTargets.current.has(id));
        }
        const pendingHit = entry.presentationCueId !== undefined && combatCues.current.some(cue =>
          cue.id === entry.presentationCueId && (textureStartup.current.hasPendingDebut(cue, now) || heroPresentation.current.hasPendingFrame(cue, now)));
        if (entry.until === undefined || entry.until <= now && !pendingHit) {
          groupHistory.current.delete(id);
          enemyPositions.current.delete(id);
          offensiveTargets.current.delete(id);
        }
      }
      defeatedOpponent.current = null;
      blockedTerminalId.current = null;
      let killId = 0;
      let lootOrder = 0;
      const batchCues: CombatCue[] = [];
      for (const event of newEvents.filter((entry) => entry.at >= snapshot.serverTime - 2000)) {
        if (event.areaId && (isTownScene(state) || event.areaId !== state.areaId)) continue;
        const start = serverOffset + event.at;
        const skill = skillFor(event, catalog.skills);
        if (event.kind === "kill") { killId = event.id; lootOrder = 0; }
        if (event.kind === "loot" && event.itemId && catalog.items[event.itemId]) {
          lootCues.current.push({ id: event.id, itemId: event.itemId, quantity: event.quantity ?? 1,
            start: now, until: now + LOOT_VISIBLE_MS, order: lootOrder++, killId, enemyId: event.enemyId,
            origin: eventGround(event) ?? (event.enemyId ? groupHistory.current.get(event.enemyId)?.ground ?? enemyPositions.current.get(event.enemyId) : legacyOpponentPosition.current ?? undefined) });
          if (!lootVisuals.current.has(event.itemId))
            void loadGroundLoot(catalog.items[event.itemId]).then((visual) => lootVisuals.current.set(event.itemId!, visual));
        }
        if (state.status === "resting") continue;
        let eventCue: CombatCue | undefined;
        if (hasSceneAction(event.kind, !!skill) || isNpcStatusAction(event, state.id)) {
          const completedCast = skill ? state.events.slice().reverse().find((entry) => entry.kind === "cast" &&
            entry.skillId === skill.id && entry.at + (entry.castMs ?? 0) === event.at) : undefined;
          const groundSource = trapCueAction(event.kind) !== undefined ? event.enemyPosition : skill?.targetType === "ground" ? (
            previous.battle?.cast?.skillId === skill.id && previous.battle.cast.endsAt === event.at
              ? previous.battle.cast.position
              : [...(state.battle?.groundEffects ?? []), ...(previous.battle?.groundEffects ?? [])].find((entry) => entry.skillId === skill.id)?.position
          ) : undefined;
          const effectHero = state.fieldPopulation?.areaId === state.areaId && state.status !== "challenge"
            ? FIELD_SCENE_ORIGIN : encounterPose.current?.hero ?? (state.status === "challenge" ? { x: 0.38, y: 0.76 } : roaming.current.position);
          const groundPoint = groundSource ? battleScenePoint(groundSource, effectHero) : undefined;
          const effectCamera = projection.current?.map === mapName ? projection.current : null;
          eventCue = cueFor(event, skill);
          eventCue.effectEnemyId = completedCast?.enemyId ?? event.enemyId;
          eventCue.effectPosition = groundPoint ? { point: groundPoint, world: effectCamera ? sceneGroundPoint(effectCamera, groundPoint,
            { x: state.status === "challenge" ? 0.38 : 0.48, y: 0.76 }) : undefined } : undefined;
          batchCues.push(eventCue);
        }
        if (event.amount !== undefined && event.target) {
          effects.current.push({ id: event.id, text: combatPopupText(event),
            target: event.target, critical: event.critical, start: eventCue?.impact ?? start, enemyId: event.enemyId });
        } else if (event.kind === "miss" || event.kind === "dodge") {
          effects.current.push({ id: event.id, text: "MISS", target: event.kind === "dodge" ? "player" : "enemy", start: eventCue?.impact ?? start, enemyId: event.enemyId });
        }
      }
      combatCues.current = retireInterruptedCastCues(combatCues.current, newEvents);
      const retainedCastCues = retireInterruptedCastCues(batchCues, newEvents);
      batchCues.splice(0,batchCues.length,...retainedCastCues);
      retireTrickDeadPoses(combatCues.current, newEvents, actionWatermarks.current, now);
      retireTrickDeadPoses(batchCues, newEvents, actionWatermarks.current, now);
      presentLatestActorActions(batchCues, actionWatermarks.current, now, combatCues.current);
      for (const cue of batchCues) {
        const popup = effects.current.find(effect => effect.id === cue.id);
        if (popup) popup.start = cue.impact;
      }
      combatCues.current.push(...batchCues);
      holdHeroStrike();
      for (const event of newEvents.filter(entry => entry.kind === "kill" && entry.enemyId)) {
        const entry = groupHistory.current.get(event.enemyId!);
        const finishing = newestCue(batchCues, cue => cue.targetActorId === event.enemyId && cue.hit && cue.actionAt <= event.at);
        if (!entry || !finishing) continue;
        const impact = Math.max(now, finishing.impact);
        entry.until! += impact - entry.deadAt!;
        entry.deadAt = impact;
        entry.presentationCueId = finishing.id;
        for (const loot of lootCues.current.filter(drop => drop.killId === event.id)) {
          loot.start = entry.deadAt;
          loot.presentationCueId = finishing.id;
          loot.until = loot.start + LOOT_VISIBLE_MS;
        }
      }
      combatCues.current = combatCues.current.slice(-60);
      pruneActionWatermarks(actionWatermarks.current, combatCues.current);
      effects.current = effects.current.filter((entry) => now - entry.start < 1500 || combatCues.current.some(cue =>
        cue.id === entry.id && (textureStartup.current.hasPendingDebut(cue, now) || heroPresentation.current.hasPendingFrame(cue, now) || enemyPresentation.current.hasPendingFrame(cue, now)))).slice(-60);
      return;
    }
    // Old saves without the population list use the same timestamp projection
    // and actor clocks. A corpse's hold never queues another actor's action.
    if (previous.areaId !== state.areaId) {
      defeatedOpponent.current = null;
      combatCues.current = [];
      actionWatermarks.current.clear();
      lootCues.current = [];
      effects.current = [];
      enemyPositions.current.clear();
      offensiveTargets.current.clear();
      legacyOpponentPosition.current = null;
      legacyOpponentId.current = "enemy";
      blockedTerminalId.current = null;
      opponentRequest.current++;
      emote.current = { action: -1, start: 0, next: now + 6000 + Math.random() * 6000 };
      return;
    }
    const freshEvents = newEvents.filter(entry => entry.at >= snapshot.serverTime - 4000)
      .sort((a, b) => a.at - b.at || a.id - b.id);
    const batchCues: CombatCue[] = [];
    let lastKillId = 0;
    let lootOrder = 0;
    let terminal: GameEvent | undefined;
    for (const event of freshEvents) {
      if (event.kind === "encounter") {
        legacyOpponentId.current = event.enemyId ?? "enemy";
        continue;
      }
      if (event.kind === "kill" || event.kind === "death") {
        terminal = event;
        if (event.kind === "kill") { lastKillId = event.id; lootOrder = 0; }
        continue;
      }
      if (event.kind === "loot" && event.itemId && catalog.items[event.itemId]) {
        lootCues.current.push({ id: event.id, itemId: event.itemId, quantity: event.quantity ?? 1,
          start: now, until: now + LOOT_VISIBLE_MS, order: lootOrder++, killId: lastKillId,
          enemyId: event.enemyId, origin: event.enemyPosition ? {
            point: battleScenePoint(event.enemyPosition, encounterPose.current?.hero ?? roaming.current.position),
            world: projection.current?.map === mapName ? sceneGroundPoint(projection.current,
              battleScenePoint(event.enemyPosition, encounterPose.current?.hero ?? roaming.current.position),
              { x: state.status === "challenge" ? 0.38 : 0.48, y: 0.76 }) : undefined,
          } : legacyOpponentPosition.current ?? undefined });
        if (!lootVisuals.current.has(event.itemId))
          void loadGroundLoot(catalog.items[event.itemId]).then(visual => lootVisuals.current.set(event.itemId!, visual));
        continue;
      }
      if (event.at < snapshot.serverTime - 2000) continue;
      const skill = skillFor(event, catalog.skills) ?? (event.kind === "skill"
        ? Object.values(catalog.skills).find(entry => entry.name === event.text) : undefined);
      const visibleAction = hasSceneAction(event.kind, !!skill);
      const cue = visibleAction ? cueFor(event, skill) : undefined;
      if (cue && trapCueAction(event.kind) !== undefined && event.enemyPosition) {
        const point = battleScenePoint(event.enemyPosition, encounterPose.current?.hero ?? roaming.current.position);
        cue.effectPosition = { point, world: projection.current?.map === mapName ? sceneGroundPoint(projection.current, point,
          { x: state.status === "challenge" ? 0.38 : 0.48, y: 0.76 }) : undefined };
      }
      if (cue) {
        if (event.enemyId) legacyOpponentId.current = event.enemyId;
        batchCues.push(cue);
      }
      if (event.amount !== undefined && event.target)
        effects.current.push({ id: event.id, text: combatPopupText(event),
          target: event.target, critical: event.critical, start: cue?.impact ?? serverOffset + event.at, enemyId: event.enemyId });
      else if (event.kind === "miss" || event.kind === "dodge")
        effects.current.push({ id: event.id, text: "MISS", target: isNpcStatusAction(event, state.id) || event.kind === "dodge" ? "player" : "enemy",
          start: cue?.impact ?? serverOffset + event.at, enemyId: event.enemyId });
    }
    presentLatestActorActions(batchCues, actionWatermarks.current, now, combatCues.current);
    for (const cue of batchCues) {
      const popup = effects.current.find(effect => effect.id === cue.id);
      if (popup) popup.start = cue.impact;
    }
    combatCues.current = [...combatCues.current, ...batchCues].slice(-60);
    holdHeroStrike();
    pruneActionWatermarks(actionWatermarks.current, combatCues.current);
    effects.current = effects.current.filter(effect => now - effect.start < 1500 || combatCues.current.some(cue =>
      cue.id === effect.id && (textureStartup.current.hasPendingDebut(cue, now) || heroPresentation.current.hasPendingFrame(cue, now) || enemyPresentation.current.hasPendingFrame(cue, now)))).slice(-60);
    if (terminal) {
      const terminalEvent = terminal;
      const monsterId = terminal.monsterId ?? previous.battle?.monsterId ?? state.battle?.monsterId;
      const opponent = monsterId === undefined ? Object.values(catalog.monsters).find(entry => terminalEvent.text === `${entry.name} derrotado.`) : catalog.monsters[monsterId];
      const finishing = newestCue(combatCues.current, cue => cue.hit && cue.eventAt! <= terminalEvent.at &&
        cue.targetActorId === (terminalEvent.kind === "kill" ? terminalEvent.enemyId ?? legacyOpponentId.current : state.id));
      const deadAt = terminal.kind === "kill" ? Math.max(now, finishing?.impact ?? now) : undefined;
      const request = ++opponentRequest.current;
      const areaId = state.areaId;
      const keepCorpse = (actor: DecodedActor) => {
        if (request !== opponentRequest.current || stateRef.current.state.areaId !== areaId || !opponent) return;
        const clock: CorpsePresentation = {};
        if (deadAt !== undefined) {
          startCorpsePresentation(clock, Math.max(now, finishing?.impact ?? deadAt));
          if (performance.now() >= clock.until!) return;
        }
        defeatedOpponent.current = { actor, monsterId: opponent.id, terminalId: terminalEvent.id,
          presentationCueId: finishing?.id,
          ...clock, until: clock.until ?? now + actorActionDuration(actor, 32, ENEMY_COMBAT_DIRECTION, 700) + 200 };
      };
      if (opponent) {
        const ready = lastOpponent.current?.monsterId === opponent.id ? lastOpponent.current.actor
          : previous.battle?.monsterId === opponent.id ? actorsRef.current.enemy : null;
        if (ready) keepCorpse(ready);
        else void loadActor(opponent.sprite).then(keepCorpse);
      }
      for (const loot of lootCues.current.filter(drop => drop.killId === terminalEvent.id)) {
        loot.start = deadAt ?? now;
        loot.presentationCueId = finishing?.id;
        loot.until = loot.start + LOOT_VISIBLE_MS;
      }
    }
  }, [snapshot, state.events, catalog]);
  useEffect(() => () => { opponentRequest.current++; }, []);
  useEffect(() => {
    actorsRef.current = { hero: hero.actor, enemy: enemy.actor };
    if (hero.actor && !hero.actor.fallback) {
      const actions = presentedActorActions(combatCues.current, state.id);
      for (const cue of actions) shiftPresentationAssociates(reconcileActorPlayback(combatCues.current, actionWatermarks.current, cue,
        getActorPlaybackDuration(hero.actor, getCombatActorAction(cue.actorAction, cue.skill?.sourceName), cue.motionMs,
          cue.presentationDirection ?? HERO_COMBAT_DIRECTION)));
    }
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
      const serverNow = sceneClock.current.at({ id: current.id, serverTime: stateRef.current.serverTime,
        receivedAt: receivedAt.current, at: time,
        pausedAt: current.status === "paused" ? current.pausedAt ?? current.lastSimulatedAt : undefined });
      const groupEnemies = [...groupHistory.current.values()].filter((entry) =>
        entry.deadAt === undefined || time < (entry.until ?? 0),
      ).sort((a, b) => Number(a.deadAt !== undefined) - Number(b.deadAt !== undefined));
      const visibleEnemyIds = new Set(groupEnemies.map((entry) => entry.enemy.id));
      const groupMode = !!current.battle?.enemies || groupEnemies.length > 0;
      const soloPosture = soloPostureAt(current, catalog, serverNow);
      const groupHeroCue = isArriving || soloPosture.playDead ? undefined : heroPresentation.current.actionAt(combatCues.current.filter(cue => !cue.blocked), current.id, time);
      const backslidingCue = groupHeroCue?.skill?.sourceName === 'TF_BACKSLIDING' &&
        groupHeroCue.sourcePosition && groupHeroCue.movementDestination ? groupHeroCue : undefined;
      const camera = projection.current?.map === mapName ? projection.current : null;
      const currentArea = catalog.areas.find(candidate => candidate.id === current.areaId);
      const fieldOrigin = currentArea?.fieldNavigation?.map === mapName ? currentArea.fieldNavigation.origin : undefined;
      const backslidingDirection = backslidingCue ? backslidingFacingDirection(
        backslidingCue.sourcePosition!, backslidingCue.actionFacing ?? { x: 0, y: 1 },
        camera && fieldOrigin ? point => projectMapPoint(camera,
          projectBattlePoint(camera, point, fieldOrigin), width, height) : undefined,
      ) : undefined;
      let heroFrame: EnemyActionFrame<CombatCue> | undefined;
      if (backslidingCue && current.hp > 0 && current.status !== 'resting' && current.status !== 'paused') {
        const actor = actorsRef.current.hero;
        heroFrame = heroPresentation.current.frame(combatCues.current.filter(cue => !cue.blocked),
          actionWatermarks.current, current.id, time, {
            decoded: !!actor && !actor.fallback,
            direction: backslidingDirection!,
            hasPose: (cue, look) => !!actor && getActorPose(actor,
              getCombatActorAction(cue.actorAction, cue.skill?.sourceName), 0, look, cue.motionMs).length > 0,
            playbackDuration: (cue, look) => getActorPlaybackDuration(actor!,
              getCombatActorAction(cue.actorAction, cue.skill?.sourceName), cue.motionMs, look),
            nativeState: (cue, look) => {
              if (!camera || motion.matches || !nativeActors.current || !actor) return 'canvas';
              const paint = { id: current.id, actor, action: getCombatActorAction(cue.actorAction, cue.skill?.sourceName), direction: look };
              return nativeActors.current.canPaintActionNatively(paint, time) ? 'ready'
                : nativeActors.current.mayRecoverActionOwnership(paint, time) ? 'pending'
                : nativeActors.current.areActionTexturesReady(paint, time) ? 'canvas' : 'pending';
            },
          });
        if (heroFrame) shiftPresentationAssociates(heroFrame.moved);
      }
      const backslidingPoint = backslidingCue ? backslidingPresentationPoint({
        origin: backslidingCue.sourcePosition!, destination: backslidingCue.movementDestination!,
        startedAt: heroFrame?.cue.start ?? backslidingCue.start,
        nativePlaybackMs: heroFrame?.cue.actionDuration ?? backslidingCue.actionDuration,
      }, time) : undefined;
      // The scene origin stays stable through roaming and combat.
      const formationAnchor = { x: current.status === "challenge" ? 0.38 : 0.48, y: 0.76 };
      const fieldPopulation = current.fieldPopulation?.areaId === current.areaId && scene !== "town" && current.status !== "challenge";
      // A source cast may already have begun while the previous swing is still
      // being presented. Its body and facing wait for the current visual turn.
      const casting = !soloPosture.playDead && !groupHeroCue ? currentPlayerCast(current, serverNow) : undefined;
      const facingTargetId = casting?.targetId ?? groupHeroCue?.effectEnemyId ?? groupHeroCue?.enemyId ?? current.battle?.targetId;
      const primaryEnemy = groupEnemies.find((entry) => entry.enemy.id === facingTargetId) ??
        groupEnemies.find((entry) => entry.enemy.id === current.battle?.targetId) ??
        groupEnemies.find((entry) => entry.deadAt === undefined) ?? groupEnemies[0];
      const huntActive = current.status === "hunting" && !!current.areaId && current.hp > 0;
      const route = HUNT_ROUTES[scene];
      const motionState = roaming.current;
      if (fieldPopulation && motionState.areaId !== current.areaId) Object.assign(motionState, {
        areaId: current.areaId, position: { ...formationAnchor }, from: { ...formationAnchor },
        target: { ...formationAnchor }, walking: false, wasHunting: false,
      });
      if (fieldPopulation && current.fieldHero) {
        motionState.position = battleScenePoint(backslidingPoint ?? battleHeroAt(current, serverNow), formationAnchor);
        motionState.from = battleScenePoint(current.fieldHero.from, formationAnchor);
        motionState.target = battleScenePoint(current.fieldHero.position, formationAnchor);
      }
      if (!huntActive) {
        motionState.wasHunting = false;
        motionState.pausedAt = null;
      } else if (!fieldPopulation) {
        if (motionState.areaId !== current.areaId)
          resetRoaming(motionState, current.areaId!, scene, time, camera, formationAnchor);
        if (!motionState.wasHunting) {
          motionState.from = motionState.position;
          motionState.routeIndex = 0;
          motionState.target = roamTarget(motionState, route, camera, formationAnchor);
          motionState.startedAt = time;
          motionState.durationMs = walkDuration(motionState.from, motionState.target);
          motionState.pauseUntil = 0;
          motionState.pausedAt = null;
          motionState.direction = walkDirection(motionState.from, motionState.target);
          motionState.walking = false;
          motionState.wasHunting = true;
        }
      }
      const defeated = defeatedOpponent.current;
      const lingering = defeated && time < defeated.until ? defeated : null;
      const cue = newestCue(isArriving ? [] : combatCues.current,
        (entry) => !entry.blocked && time >= entry.start && time < entry.start + entry.duration,
      );
      const battleVisible = !!current.battle && !isArriving;
      const showDefeated = !isArriving && !!lingering && (!current.battle || !cue || cue.id <= lingering.terminalId);
      const fighting = battleVisible || !!showDefeated || !!groupHeroCue;
      const roamAllowed = huntActive && !battleVisible && !showDefeated;
      advanceRoaming(motionState, route, time, roamAllowed && !fieldPopulation && !motion.matches, camera, formationAnchor);
      if (fieldPopulation) motionState.walking = huntActive && !!current.fieldHero &&
        serverNow >= current.fieldHero.startedAt && serverNow < current.fieldHero.arrivedAt &&
        Math.hypot(current.fieldHero.position.x - current.fieldHero.from.x, current.fieldHero.position.y - current.fieldHero.from.y) > 0.0001;
      if (!current.battle && !lingering) encounterPose.current = null;
      if (!fieldPopulation && huntActive && battleVisible && current.battle && (
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
      const encounter = !fieldPopulation && huntLocation && encounterPose.current?.areaId === current.areaId && fighting
        ? encounterPose.current
        : null;
      const strikePose = !backslidingCue && groupHeroCue?.sourceGround ? { ground: groupHeroCue.sourceGround } : null;
      const heroPoint = backslidingPoint && !camera ? battleScenePoint(backslidingPoint, formationAnchor) :
        strikePose?.ground.point ?? encounter?.hero ?? (huntLocation ? motionState.position : { x: fighting ? 0.38 : 0.48, y: 0.76 });
      const primaryHero = primaryEnemy?.hero ?? heroPoint;
      const primaryArrival = primaryEnemy ? enemyArrival(primaryEnemy.enemy, primaryEnemy.deadServerAt ?? serverNow, primaryHero, offensiveTargets.current.has(primaryEnemy.enemy.id)) : undefined;
      const enemyPoint = primaryEnemy?.ground?.point ?? primaryArrival?.point ?? encounter?.enemy ?? { x: 0.66, y: 0.76 };
      const heroFromWorld = camera ? sceneGroundPoint(camera, motionState.from, formationAnchor) : null;
      const heroToWorld = camera ? sceneGroundPoint(camera, motionState.target, formationAnchor) : null;
      const fieldHeroPoint = fieldPopulation && current.fieldHero ? backslidingPoint ?? battleHeroAt(current, serverNow) : undefined;
      const fieldHeroWorld = camera && fieldOrigin && fieldHeroPoint ? projectBattlePoint(camera, fieldHeroPoint, fieldOrigin) : undefined;
      const fieldHeroTangent = camera && fieldOrigin && current.fieldHero
        ? current.fieldHero.movementRoute?.length
          ? battleRouteTangent(camera, current.fieldHero.movementRoute,
            Math.max(0, Math.min(1, (serverNow - current.fieldHero.startedAt) / Math.max(1, current.fieldHero.arrivedAt - current.fieldHero.startedAt))), fieldOrigin)
          : projectBattlePoint(camera, current.fieldHero.position, fieldOrigin)
        : undefined;
      const heroMovement = camera && !strikePose && fieldPopulation && current.fieldHero && fieldOrigin && fieldHeroWorld && fieldHeroTangent
        ? { world: fieldHeroWorld, tangent: fieldHeroTangent }
        : camera && !strikePose && fieldPopulation && current.fieldHero && !fieldOrigin
        ? connectedMovement.current.project(camera, current.id,
          JSON.stringify([current.fieldHero.startedAt, current.fieldHero.arrivedAt, current.fieldHero.from, current.fieldHero.position]),
          heroFromWorld!, heroToWorld!,
          ((current.status === "paused" ? current.pausedAt ?? current.lastSimulatedAt : serverNow) - current.fieldHero.startedAt) /
            Math.max(1, current.fieldHero.arrivedAt - current.fieldHero.startedAt),
          { now: time, maxSpeed: current.status === 'paused' || serverNow < current.fieldHero.startedAt ? 0 : Math.hypot(heroToWorld![0] - heroFromWorld![0], heroToWorld![2] - heroFromWorld![2]) /
            Math.max(1, current.fieldHero.arrivedAt - current.fieldHero.startedAt) }) : null;
      const heroPlacement = camera ? projectMapPoint(camera, heroWorldAtAction(strikePose?.ground, fieldHeroWorld,
        () => fieldPopulation ? heroMovement?.world ?? walkableSceneGroundPoint(camera, heroPoint, formationAnchor)
          : sceneGroundPoint(camera, heroPoint, formationAnchor)), width, height) : null;
      renderedHeroGround.current = { map: mapName, areaId: current.areaId,
        ground: { point: strikePose?.ground.point ?? (fieldHeroPoint ? battleScenePoint(fieldHeroPoint, FIELD_SCENE_ORIGIN) : { ...heroPoint }), world: heroPlacement?.world } };
      mapFollow.current = fieldPopulation ? heroPlacement?.world ?? null : null;
      const castingSkill = casting ? catalog.skills[casting.skillId] : undefined;
      const castPoint = casting?.position && castingSkill?.targetType === "ground" ? battleScenePoint(casting.position, fieldPopulation ? formationAnchor : heroPoint) : undefined;
      const castPlacement = camera && castPoint ? projectMapPoint(camera, sceneGroundPoint(camera, castPoint, formationAnchor), width, height) : null;
      const enemyContactPoint = {
        x: heroPoint.x + (enemyPoint.x - heroPoint.x) * 0.45,
        y: heroPoint.y + (enemyPoint.y - heroPoint.y) * 0.45,
      };
      const enemyPlacement = camera ? primaryEnemy
        ? primaryEnemy.ground?.world ? projectMapPoint(camera, primaryEnemy.ground.world, width, height)
          : projectEnemyArrival(camera, primaryEnemy.enemy, primaryEnemy.deadServerAt ?? serverNow, primaryHero, formationAnchor, width, height, offensiveTargets.current.has(primaryEnemy.enemy.id), connectedMovement.current, fieldOrigin)
        : projectMapPoint(camera, sceneGroundPoint(camera, enemyContactPoint, formationAnchor), width, height) : null;
      const heroBaseX = heroPlacement?.x ?? width * heroPoint.x;
      const enemyX = enemyPlacement?.x ?? width * enemyPoint.x;
      const heroGround = heroPlacement?.y ?? height * heroPoint.y;
      const enemyGround = enemyPlacement?.y ?? height * enemyPoint.y;
      if (!groupMode && fighting) legacyOpponentPosition.current = {
        point: camera ? enemyContactPoint : enemyPoint, world: enemyPlacement?.world,
      };
      const roamingDirection = camera && heroMovement && heroPlacement
        ? walkDirection(heroPlacement, projectMapPoint(camera, heroMovement.tangent, width, height)) : camera && huntLocation
        ? walkDirection(
          projectMapPoint(camera, sceneGroundPoint(camera, motionState.from, formationAnchor), width, height),
          projectMapPoint(camera, sceneGroundPoint(camera, motionState.target, formationAnchor), width, height),
        )
        : motionState.direction;
      const heroWalking = movementIsWalking(heroMovement, motionState.walking,
        !fieldPopulation || !current.fieldHero || serverNow >= current.fieldHero.startedAt) && huntActive && !soloPosture.playDead && (!casting || soloPosture.castWalking) && !groupHeroCue && !strikePose;
      const counterPosture = !isArriving && !soloPosture.playDead && !casting && !groupHeroCue ? autoCounterPostureAt(current, catalog, serverNow) : undefined;
      let heroDirection = heroWalking ? roamingDirection : camera && fighting ? walkDirection({ x: heroBaseX, y: heroGround }, { x: castPlacement?.x ?? enemyX, y: castPlacement?.y ?? enemyGround }) : groupMode && fighting ? walkDirection(heroPoint, castPoint ?? enemyPoint) : encounter?.heroDirection ?? (huntLocation ? roamingDirection : HERO_COMBAT_DIRECTION);
      if (counterPosture) {
        const towards = postureFacingPoint(heroPoint, counterPosture.facing);
        heroDirection = camera ? walkDirection({ x: heroBaseX, y: heroGround },
          projectMapPoint(camera, sceneGroundPoint(camera, towards, formationAnchor), width, height)) : walkDirection(heroPoint, towards);
      }
      if (groupHeroCue) {
        heroDirection = lockActorDirection(combatCues.current, groupHeroCue, heroDirection);
      }
      if (backslidingCue && backslidingDirection !== undefined) {
        heroDirection = heroFrame?.direction ?? backslidingDirection;
      }
      const enemyDirection = encounter ? (heroDirection + 4) % 8 : ENEMY_COMBAT_DIRECTION;
      const heroActor = actorsRef.current.hero;
      const opponentActor = showDefeated ? lingering!.actor : actorsRef.current.enemy;
      const opponentId = showDefeated ? lingering!.monsterId : current.battle?.monsterId;
      const heroBounds = heroActor ? actorBounds(heroActor, heroDirection, false) : { left: -18, right: 18, top: -75, bottom: 0 };
      const enemyBounds = opponentActor ? actorBounds(opponentActor, enemyDirection, false) : { left: -18, right: 18, top: -50, bottom: 0 };
      const heroHeight = Math.max(1, heroBounds.bottom - heroBounds.top);
      const enemyHeight = Math.max(1, enemyBounds.bottom - enemyBounds.top);
      const worldScale = heroPlacement?.scale ?? (width < 440 ? 1 : 1.12);
      const depth = Math.max(0, Math.min(1, (heroPoint.y - 0.64) / 0.14));
      const heroScale = worldScale * (!camera && huntLocation && !groupMode ? 0.9 + depth * 0.1 : 1);
      const heroVisualHeight = heroHeight * heroScale;
      const enemyScale = Math.min(
        enemyPlacement?.scale ?? worldScale,
        opponentId !== undefined && challengeMonsterIds.has(opponentId) ? heroVisualHeight * 1.8 / enemyHeight : Infinity,
        height * 0.59 / enemyHeight,
        width * 0.27 / Math.max(1, enemyBounds.right - enemyBounds.left),
      );
      const enemyVisualHeight = enemyHeight * enemyScale;
      const heroCue = groupHeroCue;
      if (!backslidingCue && heroCue && current.hp > 0 &&
        current.status !== 'resting' && current.status !== 'paused') {
        heroFrame = heroPresentation.current.frame(combatCues.current.filter(cue => !cue.blocked),
          actionWatermarks.current, current.id, time, {
            decoded: !!heroActor && !heroActor.fallback,
            direction: heroDirection,
            hasPose: (cue, facing) => !!heroActor && getActorPose(heroActor,
              getCombatActorAction(cue.actorAction, cue.skill?.sourceName), 0, facing, cue.motionMs).length > 0,
            playbackDuration: (cue, facing) => getActorPlaybackDuration(heroActor!,
              getCombatActorAction(cue.actorAction, cue.skill?.sourceName), cue.motionMs, facing),
            nativeState: (cue, facing) => {
              if (!camera || !heroPlacement?.world || motion.matches || !nativeActors.current) return 'canvas';
              const paint = { id: current.id, actor: heroActor!, action: getCombatActorAction(cue.actorAction, cue.skill?.sourceName), direction: facing };
              return nativeActors.current.canPaintActionNatively(paint, time) ? 'ready'
                : nativeActors.current.mayRecoverActionOwnership(paint, time) ? 'pending'
                : nativeActors.current.areActionTexturesReady(paint, time) ? 'canvas' : 'pending';
            },
          });
        if (heroFrame) { shiftPresentationAssociates(heroFrame.moved); heroDirection = heroFrame.direction; }
      }
      // Prepare incoming offense before health, reactions and popups consume its
      // impact clock. Monster decode and native idle ACKs must not spend the swing.
      const enemyFrames = new Map<string, EnemyActionFrame<CombatCue>>();
      const prepareEnemyAction = (id: string, actor: DecodedActor | null, direction: number, hasWorld: boolean) => {
        const frame = enemyPresentation.current.frame(combatCues.current.filter(cue => !cue.blocked),
          actionWatermarks.current, id, time, {
            decoded: !!actor && !actor.fallback,
            direction,
            hasPose: (cue, facing) => !!actor && getActorPose(actor, cue.actorAction === 'attack' ? 'attack' : 'skill', 0, facing, cue.motionMs).length > 0,
            playbackDuration: (cue, facing) => getActorPlaybackDuration(actor!, cue.actorAction === 'attack' ? 'attack' : 'skill', cue.motionMs, facing),
            nativeState: (cue, facing) => {
              if (!camera || !hasWorld || motion.matches || !nativeActors.current) return 'canvas';
              const paint = { id, actor: actor!, action: cue.actorAction === 'attack' ? 'attack' as const : 'skill' as const, direction: facing };
              return nativeActors.current.canPaintActionNatively(paint, time) ? 'ready'
                : nativeActors.current.mayRecoverActionOwnership(paint, time) ? 'pending'
                : nativeActors.current.areActionTexturesReady(paint, time) ? 'canvas' : 'pending';
            },
          });
        if (frame) { shiftPresentationAssociates(frame.moved); enemyFrames.set(id, frame); }
      };
      if (!isArriving && current.status !== 'paused') {
        if (groupMode) for (const entry of groupEnemies) {
          if (entry.deadAt !== undefined && time >= entry.deadAt) continue;
          const actor = enemyActors.current.get(entry.enemy.monsterId) ?? (entry.enemy.monsterId === current.battle?.monsterId ? actorsRef.current.enemy : null);
          entry.hero ??= { ...heroPoint };
          const sourceOnly = offensiveTargets.current.has(entry.enemy.id);
          const arrival = enemyArrival(entry.enemy, entry.deadServerAt ?? serverNow, entry.hero, sourceOnly);
          const ground = entry.ground ?? enemyGroundPosition(camera, entry.enemy, entry.deadServerAt ?? serverNow,
            entry.hero, formationAnchor, sourceOnly, connectedMovement.current, fieldOrigin);
          const placement = camera && ground.world ? projectMapPoint(camera, ground.world, width, height) : null;
          const facing = placement ? walkDirection({ x: placement.x, y: placement.y }, { x: heroBaseX, y: heroGround })
            : walkDirection(arrival.target, heroPoint);
          prepareEnemyAction(entry.enemy.id, actor, facing, !!ground.world);
        } else if (opponentActor && !showDefeated) prepareEnemyAction(legacyOpponentId.current, opponentActor, enemyDirection, !!enemyPlacement?.world);
      }
      const activeLoot = (isArriving ? [] : lootCues.current).filter((entry) =>
        time >= entry.start && time < entry.until &&
        (blockedTerminalId.current === null || entry.killId !== blockedTerminalId.current),
      );
      const legacyEnemyFrame = enemyFrames.get(legacyOpponentId.current);
      const enemySwing = legacyEnemyFrame?.cue ?? actorActionCue(isArriving ? [] : combatCues.current, actionWatermarks.current, legacyOpponentId.current, time);
      // Original ACT layers animate the swing around the standing map cell.
      // A synthetic horizontal lunge broke diagonal facing and crossed walls.
      const heroX = heroBaseX;
      const heroFeetWorld = heroPlacement?.world;
      const recent = effects.current.filter((e) =>
        !(blockedTerminalId.current !== null && e.id > blockedTerminalId.current) &&
        time >= e.start && time - e.start < 1500,
      );
      suppressActorReactions(combatCues.current, current.id, time, !!casting || !!heroCue);
      const heroHurt = actorReactionCue(isArriving ? [] : combatCues.current, current.id, time);
      const enemyHurt = actorReactionCue(isArriving ? [] : combatCues.current, legacyOpponentId.current, time);
      const actorPaints: SceneActorPaint[] = [];
      const groupLabels: Array<() => void> = [];
      let selectedTarget: TargetPlacement | undefined;
      let selectedTargetId = "";
      let preImpactHealthBars = 0;
      const paint = (
        id: string,
        actor: DecodedActor,
        action: ActorAction,
        x: number,
        ground: number,
        scale: number,
        direction: number,
        elapsed = time,
        motionMs?: number,
        world?: WorldPoint,
        particle?: boolean,
        canvasOnly?: boolean,
      ) => {
        actorPaints.push({ id, actor, action, x, ground, scale, direction, elapsed, motionMs, world, particle, canvasOnly });
      };
      const heroAction: ActorAction = current.hp <= 0 || soloPosture.playDead ? "dead"
        : current.status === "resting" || (current.status === "paused" && current.areaId) ? 16
          : casting ? (heroWalking ? 8 : "cast")
            : heroCue ? getCombatActorAction(heroCue.actorAction, heroCue.skill?.sourceName)
              : counterPosture ? counterPosture.action : heroHurt ? "hurt" : heroWalking ? 8 : "idle";
      const groupPositions = new Map<string, { x: number; ground: number; visualHeight: number; world?: WorldPoint }>();
      if (camera) for (const route of prepareMapLife(mapLife, camera, formationAnchor)) {
        const actor = ambientActors.current.get(route.id);
        if (!actor) continue;
        const pose = mapLifePoseAt(route, time, motion.matches, mapLifeCanWalk(actor));
        const placement = projectMapPoint(camera, sceneGroundPoint(camera, pose.point, formationAnchor), width, height);
        if (placement.x < -80 || placement.x > width + 80 || placement.y < 0 || placement.y > height + 80) continue;
        const bounds = actorBounds(actor, pose.direction, false);
        paint(route.id, actor, pose.action, placement.x, placement.y, placement.scale, pose.direction, pose.elapsed, undefined, placement.world);
        if (route.kind === "npc") groupLabels.push(() => {
          ctx.font = "10px Tahoma, sans-serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#364a3c";
          ctx.fillStyle = "#e4ece0";
          ctx.strokeText(route.label, placement.x, placement.y + 16);
          ctx.fillText(route.label, placement.x, placement.y + 16);
          const speech = mapLifeSpeechAt(mapLife, route.id, time, motion.matches);
          if (!speech) return;
          const visualHeight = (bounds.bottom - bounds.top) * placement.scale * GAME_ACTOR_SCALE;
          const y = placement.y - visualHeight - 22;
          ctx.font = "11px Tahoma, sans-serif";
          const bubbleWidth = ctx.measureText(speech.text).width + 18;
          const x = Math.max(bubbleWidth / 2 + 6, Math.min(width - bubbleWidth / 2 - 6, placement.x));
          ctx.fillStyle = "#fffff5ed";
          ctx.strokeStyle = "#788376";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x - bubbleWidth / 2, y - 18, bubbleWidth, 24, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#344033";
          ctx.fillText(speech.text, x, y - 2);
          if (speech.elapsed < 1400) drawEmotion(ctx, visuals.current, {
            action: speech.emotion, x: placement.x, y: y - 27,
            scale: placement.scale, maxHeight: visualHeight / GAME_ACTOR_SCALE * 0.4,
            elapsedMs: speech.elapsed, reducedMotion: motion.matches,
          });
        });
      }
      if (heroActor)
        paint(
          current.id,
          heroActor,
          heroAction,
          heroX,
          heroGround,
          heroScale,
          heroDirection,
          casting ? serverNow - casting.startedAt : heroFrame ? heroFrame.elapsed : heroCue ? time - heroCue.start : counterPosture ? counterPosture.elapsed : heroHurt ? time - heroHurt.impact : heroWalking ? time : 0,
          casting ? undefined : heroCue?.motionMs ?? heroHurt?.reactionDuration,
          heroFeetWorld,
          undefined,
          heroFrame?.canvasOnly,
        );
      const opponentDead = showDefeated && lingering!.deadAt !== undefined && time >= lingering!.deadAt;
      if (groupMode && !isArriving) {
        for (const entry of [...groupEnemies].sort((a, b) => a.enemy.position.y - b.enemy.position.y)) {
          const actor = enemyActors.current.get(entry.enemy.monsterId) ?? (entry.enemy.monsterId === current.battle?.monsterId ? actorsRef.current.enemy : null);
          if (!actor) continue;
          entry.hero ??= { ...heroPoint };
          const sourceOnly = offensiveTargets.current.has(entry.enemy.id);
          const arrival = enemyArrival(entry.enemy, entry.deadServerAt ?? serverNow, entry.hero, sourceOnly);
          const groundPose = entry.ground ?? enemyGroundPosition(camera, entry.enemy, entry.deadServerAt ?? serverNow,
            entry.hero, formationAnchor, sourceOnly, connectedMovement.current, fieldOrigin);
          const placement = camera && groundPose.world ? projectMapPoint(camera, groundPose.world, width, height) : null;
          const destination = camera ? projectMapPoint(camera, groundPose.tangent ?? sceneGroundPoint(camera, arrival.target, formationAnchor), width, height) : null;
          const walking = arrival.walking && (!groundPose.tangent || !groundPose.world ||
            Math.hypot(groundPose.tangent[0] - groundPose.world[0], groundPose.tangent[2] - groundPose.world[2]) > .0001);
          const enemyFrame = enemyFrames.get(entry.enemy.id);
          const direction = enemyFrame?.direction ?? (placement ? walkDirection({ x: placement.x, y: placement.y }, walking && destination ? destination : { x: heroBaseX, y: heroGround }) : walking ? arrival.direction : walkDirection(arrival.target, heroPoint));
          const bounds = actorBounds(actor, direction, false);
          const nativeHeight = Math.max(1, bounds.bottom - bounds.top);
          const scale = Math.min(placement?.scale ?? worldScale, height * 0.3 / nativeHeight,
            challengeMonsterIds.has(entry.enemy.monsterId) ? heroVisualHeight * 1.8 / nativeHeight : Infinity);
          const position = entry.ground?.point ?? arrival.point;
          const x = placement?.x ?? width * position.x;
          const ground = placement?.y ?? height * position.y;
          const visualHeight = nativeHeight * scale * GAME_ACTOR_SCALE;
          groupPositions.set(entry.enemy.id, { x, ground, visualHeight, world: placement?.world });
          enemyPositions.current.set(entry.enemy.id, { point: position, world: placement?.world });
          if (!visibleEnemyIds.has(entry.enemy.id)) continue;
          const targetCue = enemyFrame?.cue ?? actorActionCue(combatCues.current, actionWatermarks.current, entry.enemy.id, time);
          const hurt = actorReactionCue(combatCues.current, entry.enemy.id, time);
          const dead = entry.deadAt !== undefined && time >= entry.deadAt;
          const deathFrame = dead && !actor.fallback && getActorPose(actor, 'dead', 0, direction).length
            ? corpseFrameAt(entry, time, getActorActionDuration(actor, 'dead', direction),
              nativeActors.current?.canPaintActionNatively({ id:entry.enemy.id, actor, action:'dead', direction }, time) ?? false)
            : undefined;
          if (dead && !deathFrame) continue;
          paint(entry.enemy.id, actor, dead ? "dead" : targetCue ? targetCue.actorAction === "attack" ? "attack" : "skill" : hurt ? "hurt" : walking ? 8 : "idle",
            x, ground, scale, direction, deathFrame ? deathFrame.elapsed : enemyFrame ? enemyFrame.elapsed : targetCue ? time - targetCue.start : hurt ? time - hurt.impact : time,
            dead ? undefined : targetCue?.motionMs ?? hurt?.reactionDuration, placement?.world, undefined, deathFrame?.canvasOnly ?? enemyFrame?.canvasOnly);
          const visualHp = targetHealthAt(entry.deadAt === undefined ? entry.enemy.hp : 0, entry.enemy.maxHp, combatCues.current, entry.enemy.id, time);
          if (!dead && visualHp > 0 && (entry.enemy.engaged || entry.enemy.id === facingTargetId)) {
            const selected = entry.enemy.id === facingTargetId;
            const target = { x, ground, scale, visualHeight, world: placement?.world, width: bounds.right - bounds.left };
            if (selected) { selectedTarget = target; selectedTargetId = entry.enemy.id; }
            if (entry.deadAt !== undefined && time < entry.deadAt) preImpactHealthBars++;
            groupLabels.push(() => {
              if (selected) {
                const control=monsterControlLabel(entry.enemy,serverNow);
                drawTargetHealth(ctx, target, `${catalog.monsters[entry.enemy.monsterId]?.name ?? "Monstro"}${control?` · ${control}`:''}`, visualHp, entry.enemy.maxHp, width);
                return;
              }
              const barWidth = 24;
              ctx.fillStyle = "#cbd8cd";
              ctx.fillRect(x - barWidth / 2, ground + 12, barWidth, 4);
              ctx.fillStyle = "#739358";
              ctx.fillRect(x - barWidth / 2, ground + 12, barWidth * Math.max(0, visualHp / entry.enemy.maxHp), 4);
            });
          }
        }
      } else if (fighting && opponentActor) {
        const deathFrame = opponentDead && !opponentActor.fallback && getActorPose(opponentActor,'dead',0,enemyDirection).length
          ? corpseFrameAt(lingering!,time,getActorActionDuration(opponentActor,'dead',enemyDirection),
            nativeActors.current?.canPaintActionNatively({id:legacyOpponentId.current,actor:opponentActor,action:'dead',direction:enemyDirection},time) ?? false)
          : undefined;
        if (!opponentDead || deathFrame)
        paint(
          legacyOpponentId.current,
          opponentActor,
          opponentDead ? "dead" : enemySwing ? enemySwing.actorAction === "attack" ? "attack" : "skill" : enemyHurt ? "hurt" : "idle",
          enemyX,
          enemyGround,
          enemyScale,
          legacyEnemyFrame?.direction ?? enemyDirection,
          deathFrame ? deathFrame.elapsed
            : legacyEnemyFrame ? legacyEnemyFrame.elapsed : enemySwing ? time - enemySwing.start : enemyHurt ? time - enemyHurt.impact : 0,
          opponentDead ? undefined : enemySwing?.motionMs ?? enemyHurt?.reactionDuration,
          enemyPlacement?.world,
          undefined,
          deathFrame?.canvasOnly ?? legacyEnemyFrame?.canvasOnly,
        );
      }
      if (!groupMode && fighting && !showDefeated && current.battle && current.battle.hp > 0) {
        selectedTargetId = legacyOpponentId.current;
        selectedTarget = { x: enemyX, ground: enemyGround, scale: enemyScale,
          visualHeight: enemyVisualHeight * GAME_ACTOR_SCALE, world: enemyPlacement?.world,
          width: enemyBounds.right - enemyBounds.left };
        const target = selectedTarget;
        groupLabels.push(() => drawTargetHealth(ctx, target, catalog.monsters[current.battle!.monsterId]?.name ?? "Monstro", current.battle!.hp, current.battle!.maxHp, width));
      }
      let armedTrapCount = 0;
      if (!isArriving && trapVisual.current) for (const trap of current.battle?.traps ?? []) {
        const skill = catalog.skills[trap.skillId];
        const phase = groundTrapVisualState({ ...trap, skillId: skill?.sourceName ?? trap.skillId }, serverNow);
        if (!phase) continue;
        const point = battleScenePoint(trap.position, formationAnchor);
        const placement = camera ? projectMapPoint(camera, sceneGroundPoint(camera, point, formationAnchor), width, height) : null;
        paint(`trap:${trap.id}`, phase === 'spent' ? spentTrapVisual.current ?? trapVisual.current : trapVisual.current, 0, placement?.x ?? point.x * width,
          placement?.y ?? point.y * height, (placement?.scale ?? 1) / GAME_ACTOR_SCALE, 0, 0, undefined, placement?.world);
        armedTrapCount++;
      }
      canvas.current!.dataset.groundTraps = String(armedTrapCount);
      let groundUnitCount = 0;
      if (!isArriving) for (const unit of current.battle?.skillUnits ?? []) {
        if (serverNow < unit.placedAt || serverNow >= unit.expiresAt) continue;
        const source = catalog.skills[unit.skillId]?.sourceName;
        for (const cell of unit.cells) {
          const point = battleScenePoint(cell, formationAnchor);
          const placement = camera ? projectMapPoint(camera, sceneGroundPoint(camera, point, formationAnchor), width, height) : null;
          if (source === 'AS_VENOMDUST' && visuals.current?.venomDust) {
            const pose = venomDustPose(serverNow - unit.placedAt, motion.matches);
            const world: WorldPoint | undefined = placement?.world ? [placement.world[0], placement.world[1] + pose.height, placement.world[2]] : undefined;
            const lifted = camera && world ? projectMapPoint(camera, world, width, height) : placement;
            paint(`unit:${unit.id}:${cell.x}:${cell.y}`, visuals.current.venomDust, 0, lifted?.x ?? point.x * width,
              lifted?.y ?? point.y * height, (lifted?.scale ?? 1) * pose.scale / GAME_ACTOR_SCALE,
              0, serverNow - unit.placedAt, undefined, world, true);
            groundUnitCount++;
          } else if (source === 'PF_SPIDERWEB' && visuals.current?.spiderWeb) {
            const radius = spiderWebRadius(serverNow - unit.placedAt, 0, motion.matches);
            const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
              const p = battleScenePoint({ x: cell.x + x * radius / BATTLE_CELLS_PER_UNIT, y: cell.y + y * radius / BATTLE_CELLS_PER_UNIT }, formationAnchor);
              return camera ? projectMapPoint(camera, sceneGroundPoint(camera, p, formationAnchor), width, height) : { x: p.x * width, y: p.y * height };
            });
            if (corners.every(p => p !== null)) { drawGroundTexture(ctx, visuals.current.spiderWeb, corners as { x: number; y: number }[]); groundUnitCount++; }
          }
        }
      }
      canvas.current!.dataset.soloGroundUnits = String(groundUnitCount);
      const field = visibleSageField(current, mapName, serverNow);
      const fieldTexture = field && visuals.current?.elementalFields?.[field.sourceName];
      const fieldQuads = fieldTexture ? sageFieldQuads(current, mapName, serverNow, camera,
        width, height, motion.matches, isArriving) : [];
      for (const corners of fieldQuads) drawGroundTexture(ctx, fieldTexture!, corners);
      canvas.current!.dataset.elementalFieldCells = String(fieldQuads.length);
      const fieldTime = field ? `${Math.ceil((field.expiresAt - serverNow) / 1000)}s` : '';
      if (fieldClock.current && fieldClock.current.textContent !== fieldTime) fieldClock.current.textContent = fieldTime;
      for (const actorPaint of actorPaints) if (actorPaint.id === current.id)
        actorPaint.opacity = classicBuffActive(current, catalog, 'ST_CHASEWALK', serverNow) ? .45 : 1;
      const orderedActors = actorPaints.sort((a, b) => a.ground - b.ground);
      const nativeIds = camera ? nativeActors.current?.submit(orderedActors.filter(actorPaint => !actorPaint.canvasOnly).map(actorPaint => {
        const bounds = actorBounds(actorPaint.actor, actorPaint.direction, false);
        const visualWidth = (bounds.right - bounds.left) * actorPaint.scale * GAME_ACTOR_SCALE;
        const radius = Math.max(4, Math.min(30, visualWidth * 0.28));
        return { ...actorPaint, elapsed: motion.matches ? 0 : actorPaint.elapsed, bottom: actorPaint.particle ? 0 : bounds.bottom,
          shadow: actorPaint.particle ? undefined : { radius, height: Math.max(2, Math.min(7, radius * 0.26)), opacity: 0.24 * (actorPaint.opacity ?? 1) } };
      }), camera, width, height, time) ?? new Set<string>() : new Set<string>();
      canvas.current!.dataset.nativeActors = String(nativeIds.size);
      canvas.current!.dataset.canvasActors = String(actorPaints.length - nativeIds.size);
      canvas.current!.dataset.heroRenderer = nativeIds.has(current.id) ? "native" : "canvas";
      canvas.current!.dataset.heroAction = String(heroAction);
      canvas.current!.dataset.heroActionElapsedMs = String(motion.matches ? 0 : Math.max(0, heroCue ? time - heroCue.start : 0));
      canvas.current!.dataset.heroActionMotionMs = String(heroCue?.motionMs ?? 0);
      canvas.current!.dataset.heroActionPlaybackMs = String(heroCue?.actionDuration ?? 0);
      canvas.current!.dataset.heroActionId = heroCue?.actionId ?? "";
      canvas.current!.dataset.heroTextureStartupMs = String(heroCue ? textureStartup.current.waitedFor(heroCue) : 0);
      canvas.current!.dataset.heroFirstFrameDelayMs = String(heroCue ? textureStartup.current.debutDelayFor(heroCue) : 0);
      canvas.current!.dataset.heroDirection = String(heroDirection);
      canvas.current!.dataset.heroVisualX = String(heroX);
      canvas.current!.dataset.heroVisualY = String(heroGround);
      canvas.current!.dataset.heroWorldX = String(heroPlacement?.world[0] ?? "");
      canvas.current!.dataset.heroWorldZ = String(heroPlacement?.world[2] ?? "");
      canvas.current!.dataset.visualTargetId = selectedTargetId;
      canvas.current!.dataset.preImpactHealthBars = String(preImpactHealthBars);
      canvas.current!.dataset.pendingDeaths = String(groupEnemies.filter(entry => entry.deadAt !== undefined && time < entry.deadAt).length);
      canvas.current!.dataset.deathPaints = JSON.stringify(actorPaints.filter(paint => paint.action === 'dead').map(paint => ({
        id:paint.id, elapsed:paint.elapsed, canvasOnly:paint.canvasOnly === true,
        impact:groupHistory.current.get(paint.id)?.deadAt,
        paintAt:groupHistory.current.get(paint.id)?.deathPaintAt,
        until:groupHistory.current.get(paint.id)?.until,
      })));
      canvas.current!.dataset.enemyActionPaints = JSON.stringify([...enemyFrames].map(([id, frame]) => ({
        id, actionId: frame.cue.actionId, actionAt: frame.cue.actionAt, elapsed: frame.elapsed,
        motionMs: frame.cue.motionMs, playbackMs: frame.cue.actionDuration, direction: frame.direction,
        impact: frame.cue.impact, waited: frame.waited, firstFrameDelay: frame.firstFrameDelay,
        renderer: nativeIds.has(id) ? 'native' : 'canvas', canvasOnly: frame.canvasOnly,
      })));
      const nativeDiagnostics = nativeActors.current?.getDiagnostics(current.id, time);
      canvas.current!.dataset.nativeSupported = String(nativeDiagnostics?.supported ?? false);
      canvas.current!.dataset.nativeFailed = String(nativeDiagnostics?.failed ?? false);
      canvas.current!.dataset.nativeErrorReason = nativeDiagnostics?.errorReason ?? '';
      canvas.current!.dataset.nativeLastAckAt = String(nativeDiagnostics?.lastAckAt ?? '');
      canvas.current!.dataset.nativeLastAckAgeMs = String(nativeDiagnostics?.lastAckAgeMs ?? '');
      canvas.current!.dataset.nativeAckSequence = String(nativeDiagnostics?.ackSequence ?? '');
      canvas.current!.dataset.nativeAckActors = String(nativeDiagnostics?.ackActorCount ?? 0);
      canvas.current!.dataset.nativeReadyFrames = String(nativeDiagnostics?.readyFrames ?? 0);
      canvas.current!.dataset.nativePendingFrames = String(nativeDiagnostics?.pendingFrames ?? 0);
      canvas.current!.dataset.nativeAcknowledgements = String(nativeDiagnostics?.acknowledgements ?? 0);
      canvas.current!.dataset.nativeTextureWaits = String(nativeDiagnostics?.textureWaits ?? 0);
      canvas.current!.dataset.nativeOwnershipChanges = String(nativeDiagnostics?.ownershipChanges ?? 0);
      canvas.current!.dataset.heroRequestedPose = nativeDiagnostics?.requestedPose ?? '';
      canvas.current!.dataset.heroDrawnPose = nativeDiagnostics?.drawnPose ?? '';
      canvas.current!.dataset.heroPoseHeld = String(nativeDiagnostics?.poseHeld ?? 'unknown');
      canvas.current!.dataset.nativeHeldPoseAcks = String(nativeDiagnostics?.heldPoseAcks ?? 0);
      actorPaints.forEach((actorPaint) => {
        if (!nativeIds.has(actorPaint.id) && !actorPaint.particle) drawActorFootShadow(ctx, actorPaint, camera, width, height);
      });
      if (selectedTarget) drawTargetMarker(ctx, selectedTarget, camera, width, height);
      for (const actorPaint of orderedActors) {
        if (nativeIds.has(actorPaint.id)) continue;
        const bounds = actorBounds(actorPaint.actor, actorPaint.direction, false);
        const scale = actorPaint.scale * GAME_ACTOR_SCALE;
        ctx.save(); ctx.globalAlpha *= actorPaint.opacity ?? 1;
        drawActor(ctx, actorPaint.actor, actorPaint.action, motion.matches ? 0 : actorPaint.elapsed,
          actorPaint.x, actorPaint.ground - (actorPaint.particle ? 0 : bounds.bottom) * scale,
          scale, actorPaint.direction, actorPaint.motionMs);
        ctx.restore();
      }
      groupLabels.forEach((draw) => draw());
      const assets = visuals.current;
      const skillCues = (isArriving ? [] : combatCues.current).filter(entry => entry.skill && time >= entry.effectStart && time < entry.effectStart + SKILL_EFFECT_MS);
      const composedSkills = new Map<string, CombatCue>();
      for (const skillCue of skillCues) {
        const radius = skillCue.skill!.aoeRadius?.[Math.max(0, (skillCue.skillLevel ?? 1) - 1)] ?? 0;
        const key = radius > 0 ? `${skillCue.skill!.id}:${skillCue.actionId}` : `${skillCue.actionId}:${skillCue.targetActorId}`;
        if (!composedSkills.has(key)) composedSkills.set(key, skillCue);
      }
      const areaFor = (world: WorldPoint | undefined, radius: number) => camera && world && radius > 0
        ? { center: projectMapPoint(camera, world, width, height), outline: projectMapArea(camera, world, radius, width, height) }
        : undefined;
      for (const skillCue of composedSkills.values()) {
        const skill = skillCue.skill!;
        const selfTarget = skillCue.targetActorId === current.id;
        const targetId = skillCue.effectEnemyId ?? (selfTarget ? undefined : skillCue.targetActorId ?? skillCue.enemyId);
        const fallbackActor = { x: enemyX, ground: enemyGround, visualHeight: enemyVisualHeight };
        const heroActor = { x: heroX, ground: heroGround, visualHeight: heroVisualHeight };
        const endpoints = resolveEffectActors(current.id, skillCue.sourceActorId, skillCue.targetActorId, heroActor,
          groupPositions, fallbackActor, selfTarget ? heroActor : fallbackActor);
        const target = targetId ? groupPositions.get(targetId) : undefined;
        const groundPlacement = camera && skillCue.effectPosition?.world ? projectMapPoint(camera, skillCue.effectPosition.world, width, height) : null;
        const groundTarget = skillCue.effectPosition ? {
          x: groundPlacement?.x ?? skillCue.effectPosition.point.x * width,
          y: groundPlacement?.y ?? skillCue.effectPosition.point.y * height,
          world: skillCue.effectPosition.world,
        } : undefined;
        const radius = skill.aoeRadius?.[Math.max(0, (skillCue.skillLevel ?? 1) - 1)] ?? 0;
        drawSkillEffect(ctx, assets, {
          skillId: skill.id,
          sourceName: skill.sourceName,
          name: skill.name,
          element: skill.element,
          kind: skill.kind,
          x: groundTarget && !selfTarget ? groundTarget.x : endpoints.target.x,
          y: groundTarget && !selfTarget ? groundTarget.y : endpoints.target.ground - endpoints.target.visualHeight * 0.55,
          casterX: endpoints.caster.x,
          casterY: endpoints.caster.ground - 4,
          elapsedMs: time - skillCue.effectStart,
          level: skillCue.skillLevel,
          castMs: skillCue.castMs ?? SKILL_CAST_MS,
          hitCount: skillCue.hitCount,
          aoeRadius: radius,
          area: areaFor(selfTarget ? heroPlacement?.world : groundTarget?.world ?? target?.world ?? enemyPlacement?.world, radius),
          worldScale,
          reducedMotion: motion.matches,
        });
      }
      if (casting) {
        const skill = castingSkill;
        const target = casting.targetId ? groupPositions.get(casting.targetId) : undefined;
        const groundTarget = castPoint ? { x: castPlacement?.x ?? castPoint.x * width, y: castPlacement?.y ?? castPoint.y * height } : undefined;
        if (skill) drawSkillEffect(ctx, assets, {
          skillId: skill.id, sourceName: skill.sourceName, name: skill.name,
          kind: skill.kind, element: skill.element, level: casting.level,
          x: groundTarget?.x ?? target?.x ?? enemyX, y: groundTarget?.y ?? (target?.ground ?? enemyGround) - (target?.visualHeight ?? enemyVisualHeight) * 0.55,
          casterX: heroX, casterY: heroGround - 4,
          elapsedMs: serverNow - casting.startedAt, castMs: casting.endsAt - casting.startedAt,
          aoeRadius: skill.aoeRadius?.[Math.max(0, casting.level - 1)],
          area: areaFor(castPlacement?.world ?? target?.world ?? enemyPlacement?.world, skill.aoeRadius?.[Math.max(0, casting.level - 1)] ?? 0),
          worldScale,
          reducedMotion: motion.matches,
        });
        const progress = Math.max(0, Math.min(1, (serverNow - casting.startedAt) / Math.max(1, casting.endsAt - casting.startedAt)));
        const barY = heroGround - heroVisualHeight - 14;
        ctx.fillStyle = "#18323bbf";
        ctx.fillRect(heroX - 40, barY, 80, 7);
        ctx.fillStyle = "#85d4e9";
        ctx.fillRect(heroX - 39, barY + 1, 78 * progress, 5);
        ctx.strokeStyle = "#d2e4d5";
        ctx.lineWidth = 1;
        ctx.strokeRect(heroX - 40, barY, 80, 7);
      }
      const supportCasting = !casting && current.supportCast &&
        current.supportCast.startedAt <= serverNow && serverNow < current.supportCast.endsAt
        ? current.supportCast : undefined;
      const supportSkill = supportCasting ? catalog.skills[supportCasting.skillId] : undefined;
      if (supportCasting && supportSkill) {
        const progress = Math.max(0, Math.min(1,
          (serverNow - supportCasting.startedAt) / Math.max(1, supportCasting.endsAt - supportCasting.startedAt)));
        const centerY = heroGround - heroVisualHeight * 0.55;
        const pulse = motion.matches ? 1 : 0.65 + 0.35 * Math.sin((serverNow - supportCasting.startedAt) / 140);
        ctx.save();
        ctx.globalAlpha = 0.3 + 0.35 * pulse;
        ctx.strokeStyle = supportSkill.element === 'fire' ? '#ff9a52' : supportSkill.element === 'water' ? '#70d9ee' :
          supportSkill.element === 'wind' ? '#c5ee91' : '#e2be80';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(heroX, centerY, 13 + 5 * pulse, 5 + 3 * pulse, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        const barY = heroGround - heroVisualHeight - 14;
        ctx.fillStyle = '#18323bbf'; ctx.fillRect(heroX - 40, barY, 80, 7);
        ctx.fillStyle = '#85d4e9'; ctx.fillRect(heroX - 39, barY + 1, 78 * progress, 5);
        ctx.strokeStyle = '#d2e4d5'; ctx.lineWidth = 1; ctx.strokeRect(heroX - 40, barY, 80, 7);
      }
      for (const enemy of current.battle?.enemies ?? []) {
        const progress = npcStatusCastProgress(enemy, current.id, current.areaId, serverNow), position = groupPositions.get(enemy.id);
        if (progress === undefined || !position) continue;
        const y = position.ground - position.visualHeight - 14;
        ctx.fillStyle = '#18323bbf'; ctx.fillRect(position.x - 30, y, 60, 7);
        ctx.fillStyle = '#85d4e9'; ctx.fillRect(position.x - 29, y + 1, 58 * progress, 5);
        ctx.strokeStyle = '#d2e4d5'; ctx.lineWidth = 1; ctx.strokeRect(position.x - 30, y, 60, 7);
      }
      const sceneRect = activeLoot.length ? element.getBoundingClientRect() : null;
      const destinations = activeLoot.length ? Array.from(document.querySelectorAll<HTMLElement>("[data-loot-destination]")) : [];
      const bagRect = destinations.map((entry) => entry.getBoundingClientRect()).find((rect) =>
        sceneRect && rect.left + rect.width / 2 >= sceneRect.left && rect.left + rect.width / 2 <= sceneRect.right &&
        rect.top + rect.height / 2 >= sceneRect.top && rect.top + rect.height / 2 <= sceneRect.bottom,
      ) ?? destinations[0]?.getBoundingClientRect();
      const bagX = bagRect && sceneRect ? Math.max(12, Math.min(width - 12, bagRect.left + bagRect.width / 2 - sceneRect.left)) : heroX;
      const bagY = bagRect && sceneRect ? Math.max(12, Math.min(height - 12, bagRect.top + bagRect.height / 2 - sceneRect.top)) : heroGround - heroVisualHeight * 0.55;
      const lootReadouts: GroundLootReadout[] = [];
      const lootHitRegions: Array<{ id: number; x: number; y: number; width: number; height: number; tooltipX: number }> = [];
      for (const drop of activeLoot) {
        const elapsed = time - drop.start;
        const land = motion.matches ? 1 : Math.min(1, elapsed / LOOT_LAND_MS);
        const collect = Math.max(0, Math.min(1, (elapsed - LOOT_LAND_MS - LOOT_GROUND_MS) / LOOT_COLLECT_MS));
        const eased = collect * collect * (3 - 2 * collect);
        const row = Math.floor(drop.order / 5);
        const dropOrigin = drop.enemyId ? groupPositions.get(drop.enemyId) : undefined;
        drop.origin ??= {
          point: { x: (dropOrigin?.x ?? enemyX) / width, y: (dropOrigin?.ground ?? enemyGround) / height },
          world: dropOrigin?.world ?? enemyPlacement?.world,
        };
        const dropPlacement = camera && drop.origin.world ? projectMapPoint(camera, drop.origin.world, width, height) : null;
        const dropScale = dropPlacement?.scale ?? worldScale;
        const groundX = (dropPlacement?.x ?? drop.origin.point.x * width) + (((drop.order % 5) - 2) * 20 + (row % 2) * 10) * dropScale;
        const groundY = (dropPlacement?.y ?? drop.origin.point.y * height) - (4 + row * 18 + (1 - land) * 30 + Math.sin(land * Math.PI) * 6) * dropScale;
        const x = motion.matches ? groundX : groundX + (bagX - groundX) * eased;
        const y = motion.matches ? groundY : groundY + (bagY - groundY) * eased;
        const visual = lootVisuals.current.get(drop.itemId);
        const item = catalog.items[drop.itemId];
        const label = `${item?.type === "equipment" ? "Equipamento não identificado" : item?.name ?? "Item"} ×${drop.quantity}`;
        if (elapsed >= LOOT_LAND_MS && elapsed < LOOT_LAND_MS + LOOT_GROUND_MS) {
          lootReadouts.push({ id: drop.id, label });
          const bounds = visual?.actor ? actorBounds(visual.actor) : undefined;
          const visualWidth = bounds ? bounds.right - bounds.left : visual?.icon ? 24 : 16;
          const visualHeight = bounds ? bounds.bottom - bounds.top : visual?.icon ? 24 : 13;
          const centerX = groundX + (bounds ? (bounds.left + bounds.right) / 2 * dropScale : 0);
          const centerY = groundY - (bounds ? visualHeight / 2 : visual?.icon ? 12 : 9.5) * dropScale;
          ctx.font = "11px Tahoma, Arial, sans-serif";
          const halfWidth = Math.min(130, ctx.measureText(label).width / 2 + 9);
          lootHitRegions.push({ id: drop.id, x: centerX, y: centerY,
            width: Math.min(visualWidth, 18) * dropScale,
            height: Math.min(visualHeight, 16) * dropScale,
            tooltipX: Math.max(halfWidth + 5, Math.min(width - halfWidth - 5, centerX)) });
        }
        ctx.save();
        ctx.globalAlpha = motion.matches ? 1 - collect : collect > 0.8 ? Math.max(0, (1 - collect) * 5) : 1;
        ctx.fillStyle = "#fff6af77";
        ctx.beginPath();
        ctx.ellipse(x, y + 3 * dropScale, 12 * dropScale, 4 * dropScale, 0, 0, Math.PI * 2);
        ctx.fill();
        if (visual?.actor) {
          const bounds = actorBounds(visual.actor);
          const scale = dropScale;
          drawActor(ctx, visual.actor, 0, motion.matches ? 0 : elapsed, x, y - bounds.bottom * scale, scale);
        } else if (visual?.icon) {
          ctx.imageSmoothingEnabled = false;
          const size = 24 * dropScale;
          ctx.drawImage(visual.icon, x - size / 2, y - size, size, size);
        } else {
          ctx.fillStyle = "#f5d891";
          ctx.fillRect(x - 8 * dropScale, y - 16 * dropScale, 16 * dropScale, 13 * dropScale);
          ctx.strokeStyle = "#795b30";
          ctx.strokeRect(x - 8 * dropScale, y - 16 * dropScale, 16 * dropScale, 13 * dropScale);
        }
        if (item && elapsed > LOOT_LAND_MS && elapsed < LOOT_LAND_MS + 700) {
          ctx.font = "bold 11px Tahoma, sans-serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#314037";
          ctx.fillStyle = "#fff7d8";
          ctx.strokeText(label, groundX, groundY - 30 * dropScale);
          ctx.fillText(label, groundX, groundY - 30 * dropScale);
        }
        ctx.restore();
      }
      for (const region of lootHitRegions) {
        const hitArea = groundLootElements.current.get(region.id);
        if (!hitArea) continue;
        // Stay inside this image's nearest-center region, including drops from other kills.
        const nearest = lootHitRegions.reduce((distance, other) => other.id === region.id ? distance
          : Math.min(distance, Math.hypot(other.x - region.x, other.y - region.y)), Infinity);
        const factor = Math.min(1, nearest * 0.48 / Math.max(0.01, Math.hypot(region.width / 2, region.height / 2)));
        const hitWidth = region.width * factor, hitHeight = region.height * factor;
        hitArea.style.width = `${hitWidth}px`;
        hitArea.style.height = `${hitHeight}px`;
        hitArea.style.transform = `translate(${region.x - hitWidth / 2}px, ${region.y - hitHeight / 2}px)`;
        hitArea.style.visibility = "visible";
        hitArea.style.setProperty("--loot-tooltip-shift", `${region.tooltipX - region.x}px`);
      }
      const readoutKey = JSON.stringify(lootReadouts);
      if (readoutKey !== groundLootReadoutKey.current) {
        groundLootReadoutKey.current = readoutKey;
        setGroundLootReadouts(lootReadouts);
      }
      const idleMoment = !cue && (!fighting || (fieldPopulation && current.fieldHero?.phase === "waiting")) && !heroWalking && current.hp > 0;
      if (idleMoment && time >= emote.current.next) {
        emote.current.action = EMOTE_ACTIONS[Math.floor(Math.random() * EMOTE_ACTIONS.length)];
        emote.current.start = time;
        emote.current.next = time + 18000 + Math.random() * 17000;
      }
      if (idleMoment && emote.current.action >= 0 && time - emote.current.start < 1500)
        drawEmotion(ctx, assets, {
          action: emote.current.action,
          x: heroX,
          y: heroGround - heroVisualHeight - 8 * heroScale,
          scale: heroScale,
          maxHeight: heroVisualHeight * 0.45,
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
      if (showDefeated && !groupMode) {
        const id = showDefeated ? lingering!.monsterId : current.battle?.monsterId;
        const name = id === undefined ? undefined : catalog.monsters[id]?.name;
        if (name) {
          ctx.strokeText(name, enemyX, enemyGround + 28);
          ctx.fillText(name, enemyX, enemyGround + 28);
        }
      }
      for (const e of recent) {
        const target = e.enemyId ? groupPositions.get(e.enemyId) : undefined;
        const x = e.target === "enemy" ? target?.x ?? enemyX : heroBaseX;
        const y = (e.target === "enemy" ? target?.ground ?? enemyGround : heroGround) - (e.target === "enemy" ? target?.visualHeight ?? enemyVisualHeight : heroVisualHeight) * 0.64;
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
  }, [scene, mapName, catalog, mapLife, mapReady, isArriving]);
  return (
    <div className={`scene scene-${scene} ${mapReady ? "map-ready" : "map-not-ready"}`}>
      <OriginalMap map={mapName} fieldOrigin={mapOrigin} followTarget={mapFollow} nativeActors={nativeActors} onStatusChange={setMapStatus} onProjection={(value) => { projection.current = value; }} />
      <canvas
        ref={canvas}
        aria-hidden={!mapReady}
        aria-label={
          isArriving
            ? `${state.name} chegando a ${area?.name ?? "Rune-Midgard"}`
            : state.status === "hunting" && state.fieldHero?.phase === "chasing"
            ? `${state.name} caminhando até ${monster?.name ?? "um monstro"}`
            : state.status === "hunting" && state.fieldHero?.phase === "waiting"
            ? `${state.name} aguardando o respawn dos monstros`
            : monster && state.battle
            ? engagedCount > 1
              ? `${state.name} enfrenta ${engagedCount} monstros. Alvo: ${monster.name}.`
              : `${state.name} enfrenta ${monster.name}`
            : `${state.name} em ${scene === "town" ? "Prontera" : (area?.name ?? "Rune-Midgard")}`
        }
        role="img"
      />
      <div className="scene-ground-loot-layer">
        {mapReady && groundLootReadouts.map((drop) => (
          <span
            key={drop.id}
            className="scene-ground-loot-hit"
            ref={(element) => {
              if (element) groundLootElements.current.set(drop.id, element);
              else groundLootElements.current.delete(drop.id);
            }}
            role="img"
            aria-label="Item no chão"
            aria-describedby={`scene-loot-tooltip-${drop.id}`}
            tabIndex={0}
            onKeyDown={(event) => { if (event.key === "Escape") event.currentTarget.blur(); }}
          >
            <span className="scene-ground-loot-tooltip" id={`scene-loot-tooltip-${drop.id}`} role="tooltip">
              {drop.label}
            </span>
          </span>
        ))}
      </div>
      {mapReady && !isArriving && activeField && catalog.skills[activeField.skillId] &&
        <span className="scene-elemental-field" role="status"
          title={`${catalog.skills[activeField.skillId].name} · Campo no chão · ${activeField.cells.length} células`}>
          <SkillIcon skill={catalog.skills[activeField.skillId]} />
          <time ref={fieldClock}>{Math.ceil((activeField.expiresAt - state.lastSimulatedAt) / 1000)}s</time>
        </span>}
      {bladeStopLabel && <div className="scene-blade-stop" role="status">Imobilizar · {bladeStopLabel}</div>}
      {state.battle?.cast && <span className="sr-only" role="status">
        Conjurando {catalog.skills[state.battle.cast.skillId]?.name ?? "habilidade"}.
      </span>}
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
                      : state.fieldHero?.phase === "chasing"
                        ? "Caminhando até o alvo"
                        : state.fieldHero?.phase === "waiting"
                          ? "Aguardando respawn"
                          : state.battle
                        ? "Combatendo"
                        : "Procurando monstros"
                    : "Caça automática"}
        </small>
      </div>
      {monster && state.battle && !isArriving && (
        <span className="sr-only">
          Alvo: {monster.name}. HP: {number(state.battle.hp)} de {number(state.battle.maxHp)}.
          {monsterControlLabel(state.battle.enemies?.find(enemy=>enemy.id===state.battle?.targetId),state.status==='paused'?state.pausedAt??state.lastSimulatedAt:snapshot.serverTime)}
        </span>
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
