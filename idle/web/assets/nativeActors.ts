import { GAME_ACTOR_SCALE, getActorPose, getActorActionDuration, type ActorAction, type DecodedActor } from "./renderer";
import { projectMapPoint, type MapProjection, type WorldPoint } from "./mapProjection";
import type { SpriteFrame } from "./sprite";

/** The simulation, animation clock and equipped layers remain owned by Scene. */
export interface NativeActorPaint {
  id: string;
  actor: DecodedActor;
  action: ActorAction;
  world?: WorldPoint;
  /** The existing projected scale, including any monster size cap, before 1.1. */
  scale: number;
  direction: number;
  elapsed: number;
  motionMs?: number;
  opacity?: number;
  bottom: number;
  /** Contact shadow dimensions in the parent canvas' CSS pixels. */
  shadow?: { radius: number; height: number; opacity: number };
}

const MAX_ACTORS = 160;
const MAX_LAYERS = 1024;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const MAX_PACKET_BYTES = 8 * 1024 * 1024;
const MAX_WARMUP_UPLOADS = 16;
const MAX_WARMUP_BYTES = 512 * 1024;
const ACK_TIMEOUT = 450;
const MAX_ACK_TIMEOUT = 1500;
const ACK_CADENCE_SAMPLES = 6;

type NativeLayer = { frame: string; x: number; y: number; width: number; height: number; angle: number; color: number[] };
type NativePaint = { id: string; poseToken: string; world: WorldPoint; layers: NativeLayer[]; shadow?: NativeActorPaint["shadow"] };
type PoseAck = { id: string; requested: string; drawn: string; held: boolean };
export type ActionOwnershipRecoveryState = { supported: boolean; failed: boolean; disposed: boolean;
  actorFallback: boolean; ownershipLost: boolean; actionTexturesWarm: boolean };

/** Reacquire only a supported native renderer with a previously warmed full action. */
export function canRecoverActionOwnership(state: ActionOwnershipRecoveryState): boolean {
  return state.supported && !state.failed && !state.disposed && !state.actorFallback &&
    state.ownershipLost && state.actionTexturesWarm;
}

/** A bounded, origin-scoped bridge; readiness is acknowledged by the native draw pass. */
export class NativeActorsBridge {
  private readonly session = crypto.randomUUID();
  private frameIds = new WeakMap<SpriteFrame, string>();
  private warmFrames = new WeakMap<DecodedActor, SpriteFrame[]>();
  private warmedFrames = new WeakSet<SpriteFrame>();
  private actionFrames = new WeakMap<DecodedActor, Map<string, SpriteFrame[]>>();
  private actorIds = new WeakMap<DecodedActor, number>();
  private nextActor = 0;
  private requestedPoses = new Map<string, string>();
  private drawnPoses = new Map<string, PoseAck>();
  private nextFrame = 0;
  private sequence = 0;
  private supported = false;
  private disposed = false;
  private failed = false;
  private errorReason: string | null = null;
  private readyFrames = new Set<string>();
  private pendingFrames = new Map<string, number>();
  private renderedActors = new Set<string>();
  private lastAck = -Infinity;
  private ackTimeoutMs = ACK_TIMEOUT;
  private ackGaps: number[] = [];
  /** Historical diagnostic evidence survives the existing failure fallback reset. */
  private lastAcknowledgedAt: number | null = null;
  private lastAcknowledgedActorCount = 0;
  private lastSequence = -1;
  private lastSend = -Infinity;
  private diagnostics = { ownershipChanges: 0, textureWaits: 0, warmupUploads: 0, acknowledgements: 0, heldNativeLayers: 0, heldPoseAcks: 0 };

  constructor(private readonly target: Window, private readonly origin: string, private readonly map: string) {
    this.post({ type: "ragidle-map-actors-init" });
  }

  private post(data: Record<string, unknown>): void {
    if (!this.disposed) this.target.postMessage({ ...data, map: this.map, session: this.session }, this.origin);
  }

  receive(data: Record<string, unknown>): void {
    if (this.disposed || data.map !== this.map || data.session !== this.session) return;
    if (data.type === "ragidle-map-actors-error") {
      this.failed = true;
      this.supported = false;
      const reason = typeof data.reason === 'string' ? data.reason.slice(0, 1024)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
      this.errorReason = reason || 'Native actor renderer reported an error.';
      this.readyFrames.clear(); this.pendingFrames.clear(); this.renderedActors.clear();
      this.drawnPoses.clear(); this.diagnostics.heldNativeLayers = 0;
      this.lastAck = -Infinity;
      return;
    }
    if (this.failed) return;
    if (data.type === "ragidle-map-actors-ready" && data.version === 2) this.supported = true;
    if (data.type !== "ragidle-map-actors-rendered" || !Number.isInteger(data.sequence) ||
      Number(data.sequence) < this.lastSequence || !Array.isArray(data.actors) || !Array.isArray(data.frames)) return;
    if (data.actors.length > MAX_ACTORS || data.frames.length > MAX_LAYERS ||
      !data.actors.every(id => typeof id === "string" && id.length <= 160) ||
      !data.frames.every(id => typeof id === "string" && /^f\d+$/.test(id))) return;
    this.lastSequence = Number(data.sequence);
    const acknowledgedAt = performance.now();
    if (Number.isFinite(this.lastAck) && acknowledgedAt > this.lastAck) {
      // Slow native frames still own their depth-tested sprite. A fixed lease
      // must not expire between valid renderer heartbeats and duplicate it in Canvas.
      this.ackGaps.push(Math.min(MAX_ACK_TIMEOUT, acknowledgedAt - this.lastAck));
      if (this.ackGaps.length > ACK_CADENCE_SAMPLES) this.ackGaps.shift();
      this.ackTimeoutMs = Math.min(MAX_ACK_TIMEOUT,
        Math.max(ACK_TIMEOUT, Math.max(...this.ackGaps) * 1.5 + 100));
    }
    this.lastAck = acknowledgedAt;
    this.lastAcknowledgedAt = this.lastAck;
    const rendered = new Set(data.actors as string[]);
    this.lastAcknowledgedActorCount = rendered.size;
    for (const id of rendered) if (!this.renderedActors.has(id)) this.diagnostics.ownershipChanges++;
    for (const id of this.renderedActors) if (!rendered.has(id)) this.diagnostics.ownershipChanges++;
    this.renderedActors = rendered;
    this.diagnostics.acknowledgements++;
    this.drawnPoses.clear();
    if (Array.isArray(data.poses) && data.poses.length <= MAX_ACTORS) for (const pose of data.poses) {
      if (!pose || typeof pose !== "object") continue;
      const ack = pose as PoseAck;
      if (typeof ack.id !== "string" || ack.id.length > 160 || !rendered.has(ack.id) ||
        typeof ack.requested !== "string" || ack.requested.length > 160 ||
        typeof ack.drawn !== "string" || ack.drawn.length > 160 || typeof ack.held !== "boolean") continue;
      this.drawnPoses.set(ack.id, { id: ack.id, requested: ack.requested, drawn: ack.drawn, held: ack.held });
    }
    this.diagnostics.heldNativeLayers = [...this.drawnPoses.values()].filter(pose => pose.held).length;
    this.diagnostics.heldPoseAcks += this.diagnostics.heldNativeLayers;
    for (const id of data.frames as string[]) { this.readyFrames.add(id); this.pendingFrames.delete(id); }
    if (Array.isArray(data.missing)) for (const id of data.missing) if (typeof id === "string") {
      this.readyFrames.delete(id); this.pendingFrames.delete(id);
    }
    if (Array.isArray(data.evicted)) for (const id of data.evicted) if (typeof id === "string") {
      this.readyFrames.delete(id); this.pendingFrames.delete(id);
    }
  }

  getDiagnostics(actorId?: string, now = performance.now()) {
    const pose = actorId ? this.drawnPoses.get(actorId) : undefined;
    return { ...this.diagnostics, supported: this.supported, failed: this.failed, errorReason: this.errorReason,
      lastAckAt: this.lastAcknowledgedAt, ackTimeoutMs: this.ackTimeoutMs,
      lastAckAgeMs: this.lastAcknowledgedAt !== null && Number.isFinite(now) ? Math.max(0, now - this.lastAcknowledgedAt) : null,
      ackSequence: this.lastSequence >= 0 ? this.lastSequence : null, ackActorCount: this.lastAcknowledgedActorCount,
      readyFrames: this.readyFrames.size, pendingFrames: this.pendingFrames.size,
      requestedPose: actorId ? this.requestedPoses.get(actorId) ?? null : null,
      drawnPose: pose?.drawn ?? null, poseHeld: pose?.held ?? null };
  }

  /** A first death frame may use native only with current ownership and its entire ACT ready. */
  canPaintActionNatively(paint: Pick<NativeActorPaint, 'id' | 'actor' | 'action' | 'direction'>, now: number): boolean {
    return !this.disposed && !this.failed && this.supported && !paint.actor.fallback &&
      now - this.lastAck < this.ackTimeoutMs && this.renderedActors.has(paint.id) && this.areActionTexturesReady(paint,now);
  }
  /** Snapshot only; callers apply the pure recovery predicate before choosing Canvas. */
  actionOwnershipRecoveryState(paint: Pick<NativeActorPaint, 'id' | 'actor' | 'action' | 'direction'>, now: number): ActionOwnershipRecoveryState {
    const ownershipLost = now - this.lastAck >= this.ackTimeoutMs || !this.renderedActors.has(paint.id);
    const eligible = !this.disposed && !this.failed && this.supported && !paint.actor.fallback && ownershipLost;
    const frames = eligible ? this.currentActionFrames(paint) : [];
    const actionTexturesWarm = frames.length > 0 && frames.every(frame => {
      const id = this.frameIds.get(frame);
      return id !== undefined && this.readyFrames.has(id);
    });
    return { supported: this.supported, failed: this.failed, disposed: this.disposed,
      actorFallback: paint.actor.fallback, ownershipLost, actionTexturesWarm };
  }
  mayRecoverActionOwnership(paint: Pick<NativeActorPaint, 'id' | 'actor' | 'action' | 'direction'>, now: number): boolean {
    return canRecoverActionOwnership(this.actionOwnershipRecoveryState(paint, now));
  }
  /** Canvas takes over immediately when native ownership/readiness is unavailable. */
  areActionTexturesReady(paint: Pick<NativeActorPaint, 'id' | 'actor' | 'action' | 'direction'>, now: number): boolean {
    if (this.disposed || this.failed || !this.supported || paint.actor.fallback ||
      now - this.lastAck >= this.ackTimeoutMs || !this.renderedActors.has(paint.id)) return true;
    return this.currentActionFrames(paint).every(frame => {
      const id = this.frameIds.get(frame);
      return id !== undefined && this.readyFrames.has(id);
    });
  }

  private currentActionFrames(paint: Pick<NativeActorPaint, 'actor' | 'action' | 'direction'>): SpriteFrame[] {
    let cache = this.actionFrames.get(paint.actor);
    if (!cache) { cache = new Map(); this.actionFrames.set(paint.actor, cache); }
    const key = `${paint.action}:${paint.direction}`;
    const cached = cache.get(key);
    if (cached) return cached;
    // Sample a complete ACT cycle using the existing composition/fallback rules.
    // The maximum body frame count supplies enough samples for any resolved group.
    const samples = Math.max(1, ...(paint.actor.body?.action.actions.map(action => action.frames.length) ?? []));
    const duration = getActorActionDuration(paint.actor, paint.action, paint.direction);
    const referenced = new Set<SpriteFrame>();
    for (let i = 0; i < samples; i++) for (const layer of getActorPose(paint.actor, paint.action, duration * (i + .01) / samples, paint.direction)) referenced.add(layer.image);
    const frames = [...referenced];
    cache.set(key, frames);
    return frames;
  }

  private referencedFrames(actor: DecodedActor): SpriteFrame[] {
    let frames = this.warmFrames.get(actor);
    if (frames) return frames;
    const referenced = new Set<SpriteFrame>();
    for (const part of [actor.body, actor.head, actor.weapon, actor.weaponTrail]) if (part) {
      for (const action of part.action.actions) for (const pose of action.frames) for (const layer of pose.layers) {
        if (layer.index < 0) continue;
        const image = part.sprite.frames[layer.index + (layer.type === 1 ? part.sprite.indexedCount : 0)];
        if (image) referenced.add(image);
      }
    }
    frames = [...referenced];
    this.warmFrames.set(actor, frames);
    return frames;
  }

  /** Native ownership survives texture uploads; the iframe retains the last complete pose. */
  submit(paints: readonly NativeActorPaint[], camera: MapProjection, width: number, height: number, now: number): ReadonlySet<string> {
    const native = new Set<string>();
    if (this.disposed || this.failed || camera.map !== this.map || !Number.isFinite(now)) return native;
    if (!this.supported) {
      if (now - this.lastSend >= 500) { this.post({ type: "ragidle-map-actors-init" }); this.lastSend = now; }
      return native;
    }
    const actors: NativePaint[] = [];
    this.requestedPoses.clear();
    const frames: Array<{ id: string; width: number; height: number; rgba: Uint8ClampedArray }> = [];
    const queued = new Set<string>();
    let bytes = 0, layerCount = 0;
    const frameId = (image: SpriteFrame) => {
      let id = this.frameIds.get(image);
      if (!id) { id = `f${++this.nextFrame}`; this.frameIds.set(image, id); }
      return id;
    };
    const validFrame = (image: SpriteFrame) => image.width > 0 && image.height > 0 &&
      image.width <= 1024 && image.height <= 1024 && image.rgba.byteLength <= MAX_FRAME_BYTES;
    const queueFrame = (image: SpriteFrame, id: string): boolean => {
      const pending = this.pendingFrames.get(id);
      if (this.readyFrames.has(id) || queued.has(id) || (pending !== undefined && now - pending <= 500) ||
        !validFrame(image) || frames.length >= 512 || bytes + image.rgba.byteLength > MAX_PACKET_BYTES) return false;
      // Structured cloning preserves the pixels used by the existing canvas fallback.
      frames.push({ id, width: image.width, height: image.height, rgba: image.rgba });
      bytes += image.rgba.byteLength;
      queued.add(id);
      this.pendingFrames.set(id, now);
      this.warmedFrames.add(image);
      return true;
    };
    for (const paint of paints.slice(0, MAX_ACTORS)) {
      if (!paint.world || paint.actor.fallback || !paint.id || paint.id.length > 160 ||
        !paint.world.every(Number.isFinite) || !Number.isFinite(paint.scale) || paint.scale <= 0) continue;
      const projected = projectMapPoint(camera, paint.world, width, height).scale;
      const factor = paint.scale * GAME_ACTOR_SCALE / projected;
      const pose = getActorPose(paint.actor, paint.action, paint.elapsed, paint.direction, paint.motionMs);
      if (!pose.length || pose.length + layerCount > MAX_LAYERS) continue;
      const layers: NativeLayer[] = [];
      let available = true, valid = true;
      for (const layer of pose) {
        const image = layer.image;
        if (!validFrame(image)) { valid = false; break; }
        const id = frameId(image);
        if (!this.readyFrames.has(id)) {
          available = false;
          queueFrame(image, id);
        }
        layers.push({ frame: id, x: layer.x * factor, y: (layer.y - paint.bottom) * factor,
          width: image.width * layer.scaleX * (layer.mirror ? -1 : 1) * factor,
          height: image.height * layer.scaleY * factor, angle: layer.rotation, color: layer.color.map((channel, index) => channel / 255 * (index === 3 ? paint.opacity ?? 1 : 1)) });
      }
      if (!valid) continue;
      let actorId = this.actorIds.get(paint.actor);
      if (!actorId) { actorId = ++this.nextActor; this.actorIds.set(paint.actor, actorId); }
      // Hash unprojected pose geometry: camera/world movement must not change identity.
      const signature = `${paint.opacity ?? 1}:` + pose.map(layer => [frameId(layer.image), layer.x, layer.y, layer.scaleX, layer.scaleY, layer.mirror, layer.rotation, ...layer.color].join(",")).join(";");
      let hash = 2166136261;
      for (let i = 0; i < signature.length; i++) hash = Math.imul(hash ^ signature.charCodeAt(i), 16777619);
      const poseToken = `${actorId}:${paint.action}:${paint.direction}:${hash >>> 0}`;
      this.requestedPoses.set(paint.id, poseToken);
      const shadow = paint.shadow ? { radius: paint.shadow.radius / projected,
        height: paint.shadow.height / projected, opacity: paint.shadow.opacity } : undefined;
      actors.push({ id: paint.id, poseToken, world: paint.world, layers, ...(shadow ? { shadow } : {}) });
      layerCount += layers.length;
      if (!available) this.diagnostics.textureWaits++;
      if (now - this.lastAck < this.ackTimeoutMs && this.renderedActors.has(paint.id)) native.add(paint.id);
    }
    // Current poses have priority. Warm each referenced image once; eviction is
    // handled on demand so large actor collections cannot churn the native cache.
    let warmed = 0, warmupBytes = 0;
    for (const paint of paints.slice(0, MAX_ACTORS)) {
      if (warmed >= MAX_WARMUP_UPLOADS) break;
      if (paint.actor.fallback || !paint.world || !this.requestedPoses.has(paint.id)) continue;
      for (const image of this.currentActionFrames(paint)) {
        if (warmed >= MAX_WARMUP_UPLOADS) break;
        if (warmupBytes + image.rgba.byteLength <= MAX_WARMUP_BYTES && queueFrame(image, frameId(image))) {
          warmed++; warmupBytes += image.rgba.byteLength; this.diagnostics.warmupUploads++;
        }
      }
    }
    for (const paint of paints.slice(0, MAX_ACTORS)) {
      if (warmed >= MAX_WARMUP_UPLOADS) break;
      if (paint.actor.fallback || !paint.world) continue;
      for (const image of this.referencedFrames(paint.actor)) {
        if (warmed >= MAX_WARMUP_UPLOADS) break;
        if (!this.warmedFrames.has(image) && warmupBytes + image.rgba.byteLength <= MAX_WARMUP_BYTES && queueFrame(image, frameId(image))) {
          warmed++;
          warmupBytes += image.rgba.byteLength;
          this.diagnostics.warmupUploads++;
        }
      }
    }
    if (frames.length) this.post({ type: "ragidle-map-actor-frames", frames });
    this.post({ type: "ragidle-map-actors", sequence: ++this.sequence, actors });
    this.lastSend = now;
    if (this.pendingFrames.size > 512) for (const [id, sent] of this.pendingFrames) if (now - sent > 2000) this.pendingFrames.delete(id);
    while (this.pendingFrames.size > 512) {
      const oldest = this.pendingFrames.keys().next().value;
      if (!oldest) break;
      this.pendingFrames.delete(oldest);
    }
    return native;
  }

  dispose(): void {
    if (this.disposed) return;
    this.post({ type: "ragidle-map-actors-clear" });
    this.disposed = true;
    this.supported = false;
    this.readyFrames.clear(); this.pendingFrames.clear(); this.renderedActors.clear();
    this.requestedPoses.clear(); this.drawnPoses.clear(); this.diagnostics.heldNativeLayers = 0;
  }
}
