import { GAME_ACTOR_SCALE, getActorPose, type ActorAction, type DecodedActor } from "./renderer";
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

type NativeLayer = { frame: string; x: number; y: number; width: number; height: number; angle: number; color: number[] };
type NativePaint = { id: string; world: WorldPoint; layers: NativeLayer[]; shadow?: NativeActorPaint["shadow"] };

/** A bounded, origin-scoped bridge; readiness is acknowledged by the native draw pass. */
export class NativeActorsBridge {
  private readonly session = crypto.randomUUID();
  private frameIds = new WeakMap<SpriteFrame, string>();
  private warmFrames = new WeakMap<DecodedActor, SpriteFrame[]>();
  private warmedFrames = new WeakSet<SpriteFrame>();
  private nextFrame = 0;
  private sequence = 0;
  private supported = false;
  private disposed = false;
  private failed = false;
  private readyFrames = new Set<string>();
  private pendingFrames = new Map<string, number>();
  private renderedActors = new Set<string>();
  private lastAck = -Infinity;
  private lastSequence = -1;
  private lastSend = -Infinity;
  private diagnostics = { ownershipChanges: 0, textureWaits: 0, warmupUploads: 0, acknowledgements: 0 };

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
      this.readyFrames.clear(); this.pendingFrames.clear(); this.renderedActors.clear();
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
    this.lastAck = performance.now();
    const rendered = new Set(data.actors as string[]);
    for (const id of rendered) if (!this.renderedActors.has(id)) this.diagnostics.ownershipChanges++;
    for (const id of this.renderedActors) if (!rendered.has(id)) this.diagnostics.ownershipChanges++;
    this.renderedActors = rendered;
    this.diagnostics.acknowledgements++;
    for (const id of data.frames as string[]) { this.readyFrames.add(id); this.pendingFrames.delete(id); }
    if (Array.isArray(data.missing)) for (const id of data.missing) if (typeof id === "string") {
      this.readyFrames.delete(id); this.pendingFrames.delete(id);
    }
    if (Array.isArray(data.evicted)) for (const id of data.evicted) if (typeof id === "string") {
      this.readyFrames.delete(id); this.pendingFrames.delete(id);
    }
  }

  getDiagnostics(): Readonly<{ ownershipChanges: number; textureWaits: number; warmupUploads: number; acknowledgements: number; pendingFrames: number }> {
    return { ...this.diagnostics, pendingFrames: this.pendingFrames.size };
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
          height: image.height * layer.scaleY * factor, angle: layer.rotation, color: layer.color.map(channel => channel / 255) });
      }
      if (!valid) continue;
      const shadow = paint.shadow ? { radius: paint.shadow.radius / projected,
        height: paint.shadow.height / projected, opacity: paint.shadow.opacity } : undefined;
      actors.push({ id: paint.id, world: paint.world, layers, ...(shadow ? { shadow } : {}) });
      layerCount += layers.length;
      if (!available) this.diagnostics.textureWaits++;
      if (now - this.lastAck < ACK_TIMEOUT && this.renderedActors.has(paint.id)) native.add(paint.id);
    }
    // Current poses have priority. Warm each referenced image once; eviction is
    // handled on demand so large actor collections cannot churn the native cache.
    let warmed = 0, warmupBytes = 0;
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
  }
}
