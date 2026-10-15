import { type ConnectedMapMovement, type MapProjection, type WorldPoint } from './mapProjection';
import type { Catalog, GameEvent, GameState, Skill } from '../../shared/types';
import { activeFreeCastLevel } from '../../engine/stats';
import { trickDeadActive } from '../../engine/trickDead';

export function resolveEffectActors<T extends { x: number; ground: number; visualHeight: number }>(
  heroId: string,
  sourceActorId: string,
  targetActorId: string,
  hero: T,
  actors: ReadonlyMap<string, T>,
  fallbackSource: T,
  fallbackTarget: T,
) {
  return {
    caster: sourceActorId === heroId ? hero : actors.get(sourceActorId) ?? fallbackSource,
    target: targetActorId === heroId ? hero : actors.get(targetActorId) ?? fallbackTarget,
  };
}

/** NPC events store Hercules source names; resolve those to exported Idle skill aliases for FX. */
export function sceneEventSkill(event: GameEvent, skills: Record<string, Skill>): Skill | undefined {
  if (!event.skillId) return undefined;
  return skills[event.skillId] ?? Object.values(skills).find(skill =>
    skill.sourceName?.toLowerCase() === event.skillId!.toLowerCase());
}

export function soloPostureAt(state: GameState, catalog: Catalog, at: number) {
  const time = state.status === 'paused' ? state.pausedAt ?? state.lastSimulatedAt : at;
  const playDead = state.hp > 0 && trickDeadActive(state, catalog, time);
  return { playDead, castWalking: !playDead && activeFreeCastLevel(state, catalog, time) > 0 };
}

/** roBrowser d88a3cd4 SkillAction: Auto Counter holds ATTACK frame0, play:false. */
export function autoCounterPostureAt(state: GameState, catalog: Catalog, at: number) {
  const time = state.status === 'paused' ? state.pausedAt ?? state.lastSimulatedAt : at;
  const active = state.hp > 0 && Object.entries(state.buffs).some(([id, buff]) =>
    catalog.skills[id]?.sourceName === 'KN_AUTOCOUNTER' && buff.expiresAt > time && time >= (buff.startsAt ?? 0) + 100);
  return active ? { action: 'attack' as const, elapsed: 0, facing: state.playerFacing ?? { x: 0, y: 1 } } : undefined;
}
/** One source facing cell projected into sceneGroundPoint's 22x18-cell plane. */
export function postureFacingPoint(hero: { x: number; y: number }, facing: { x: number; y: number }) {
  return { x: hero.x + facing.x / 22, y: hero.y + facing.y / 18 };
}

/** Server action identities stay authoritative; only their first visible clock moves. */
export interface PresentedActorAction {
  id: number;
  actionId: string;
  actionAt: number;
  sourceActorId: string;
  actorAction: 'attack' | 'skill' | 'none';
  start: number;
  effectStart: number;
  impact: number;
  actionDuration: number;
  duration?: number;
  presentationDirection?: number;
  /** False when a reconnect/backlog action was intentionally compressed. */
  presented?: boolean;
}
export type ActorActionWatermark = Pick<PresentedActorAction, 'actionAt' | 'actionId' | 'id' | 'start'> & {
  end: number;
  presented: boolean;
};

/** Stop the body only; committed hits, popup clocks and loot remain visible. */
export function retireTrickDeadPoses<T extends Pick<PresentedActorAction, 'id' | 'actionAt' | 'sourceActorId' | 'actorAction'>>(
  cues: T[], events: readonly { id: number; at: number; kind: string; statusName?: string; sourceActorId?: string }[],
  marks: Map<string, ActorActionWatermark>, now: number,
): void {
  for (const event of events) {
    if (event.kind !== 'posture' || event.statusName !== 'NV_TRICKDEAD' || !event.sourceActorId) continue;
    const precedes = (cue: { actionAt: number; id: number }) =>
      cue.actionAt < event.at || cue.actionAt === event.at && cue.id <= event.id;
    for (const cue of cues) if (cue.sourceActorId === event.sourceActorId && precedes(cue)) cue.actorAction = 'none';
    const mark = marks.get(event.sourceActorId);
    if (mark && precedes(mark)) mark.end = Math.min(mark.end, now);
  }
}

type PresentedHealthHit = { id: number; targetActorId: string; impact: number; hit: boolean;
  targetHpBefore?: number; amount?: number; presented?: boolean };
/** Health shares the same impact clock as the sprite and damage popup. */
export function targetHealthAt(hp: number, maxHp: number, cues: readonly PresentedHealthHit[], actorId: string, time: number) {
  const future = cues.filter(cue => cue.hit && cue.targetActorId === actorId && cue.impact > time && cue.presented !== false);
  // Undo only damage not yet shown. An immediate counter/DOT may overtake a
  // queued swing; exact pre-hit health bounds each applied delta for overkill.
  const pendingDamage = future.reduce((sum,cue) => sum + Math.min(Math.max(0,cue.amount ?? 0),
    Math.max(0,cue.targetHpBefore ?? Infinity)),0);
  return Math.max(0, Math.min(maxHp, hp + pendingDamage));
}

/** Visual arrival can lag the server while a completed swing releases its pose. */
export function movementIsWalking(pose: { world: WorldPoint; tangent: WorldPoint } | null | undefined, serverWalking: boolean, canMove = true) {
  if (!canMove) return false;
  return pose ? Math.hypot(pose.tangent[0]-pose.world[0],pose.tangent[2]-pose.world[2]) > .0001 : serverWalking;
}

type MovementClock = { from: { x: number; y: number }; position: { x: number; y: number }; startedAt: number; arrivedAt: number };
/** A lethal hit may already have retargeted the current route by snapshot time. */
export function movementAtAction(current: MovementClock | undefined, previous: MovementClock | undefined, actionAt: number,
  origin?: { x: number; y: number }) {
  if (origin) return { point: { ...origin }, progress: 1,
    movement: { from: { ...origin }, position: { ...origin }, startedAt: actionAt, arrivedAt: actionAt } };
  let movement = [current, previous].filter((entry): entry is MovementClock => !!entry && entry.startedAt <= actionAt)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!movement) return undefined;
  // The engine's strike freeze replaces an unfinished visible chase with a
  // stationary snapshot. Finish the matching connected route at the hit time.
  if (movement === current && current.from.x === current.position.x && current.from.y === current.position.y &&
    previous && previous.startedAt <= actionAt && (previous.from.x !== previous.position.x || previous.from.y !== previous.position.y)) {
    const before = Math.max(0, Math.min(1, (actionAt - previous.startedAt) / Math.max(1, previous.arrivedAt - previous.startedAt)));
    if (Math.hypot(previous.from.x + (previous.position.x - previous.from.x) * before - current.position.x,
      previous.from.y + (previous.position.y - previous.from.y) * before - current.position.y) < .000001) movement = previous;
  }
  const progress = Math.max(0, Math.min(1, (actionAt - movement.startedAt) / Math.max(1, movement.arrivedAt - movement.startedAt)));
  return { movement, progress, point: {
    x: movement.from.x + (movement.position.x - movement.from.x) * progress,
    y: movement.from.y + (movement.position.y - movement.from.y) * progress,
  } };
}

/** Only a strike catches up to contact; ordinary cast freezes retain their pose. */
export function projectStrikeContact(router: ConnectedMapMovement, camera: MapProjection, actorId: string, actionId: string,
  strike: NonNullable<ReturnType<typeof movementAtAction>>, from: WorldPoint, to: WorldPoint, rendered?: WorldPoint): WorldPoint {
  const stationary = from[0] === to[0] && from[2] === to[2];
  const { movement, progress } = strike;
  return router.project(camera, actorId,
    stationary ? `strike:${actionId}` : JSON.stringify([movement.startedAt, movement.arrivedAt, movement.from, movement.position]),
    stationary ? rendered ?? from : from, to, stationary ? 1 : progress).world;
}

export function presentLatestActorActions<T extends PresentedActorAction>(
  cues: T[], watermarks: Map<string, ActorActionWatermark>, now: number, retained: T[] = [],
): void {
  const actors = new Map<string, Map<string, T>>();
  for (const cue of cues) {
    if (cue.actorAction === 'none') continue;
    const actions = actors.get(cue.sourceActorId) ?? new Map<string, T>();
    const key = JSON.stringify([cue.actionAt, cue.actionId]);
    const previous = actions.get(key);
    if (!previous || cue.id > previous.id) actions.set(key, cue);
    actors.set(cue.sourceActorId, actions);
  }
  for (const actions of actors.values()) {
    const ordered = [...actions.values()].sort((a, b) => a.actionAt - b.actionAt || a.id - b.id);
    // Live batches have a short history, a bounded action count and a bounded
    // future wait. Reconnect/catch-up cannot grow a seconds-long combat replay.
    const eligible = new Set(ordered.filter(cue => now - cue.start <= 2000).slice(-3));
    for (const cue of ordered) {
      const previous = watermarks.get(cue.sourceActorId);
      const existing = retained.find(entry => entry.sourceActorId === cue.sourceActorId &&
        entry.actionAt === cue.actionAt && entry.actionId === cue.actionId);
      const sameAction = previous?.actionAt === cue.actionAt && previous.actionId === cue.actionId;
      const newer = !previous || cue.actionAt > previous.actionAt ||
        (cue.actionAt === previous.actionAt && cue.actionId !== previous.actionId && cue.id > previous.id);
      const scheduled = Math.max(now, cue.start, previous?.end ?? now);
      const presented = existing ? existing.presented !== false : sameAction ? previous!.presented
        : newer && eligible.has(cue) && scheduled - now <= 1600;
      const start = existing?.start ?? (sameAction ? previous!.start : presented ? scheduled : cue.start);
      const actionDuration = existing?.actionDuration ?? cue.actionDuration;
      if (sameAction || newer) watermarks.set(cue.sourceActorId, { actionAt: cue.actionAt, actionId: cue.actionId,
        id: sameAction ? Math.max(previous!.id, cue.id) : cue.id, start,
        end: presented ? start + actionDuration : previous?.end ?? now, presented });
      for (const sibling of cues) {
        if (sibling.sourceActorId !== cue.sourceActorId || sibling.actionId !== cue.actionId ||
          sibling.actionAt !== cue.actionAt || sibling.actorAction === 'none') continue;
        const shift = start - sibling.start;
        sibling.start = start;
        sibling.effectStart += shift;
        sibling.impact += shift;
        sibling.presented = presented;
        sibling.actionDuration = actionDuration;
        sibling.presentationDirection = existing?.presentationDirection ?? cue.presentationDirection;
      }
    }
  }
}

/** One body action may own several target hits; all share its pose and clock. */
export function presentedActorActions<T extends PresentedActorAction>(cues: T[], actorId: string): T[] {
  const actions = new Map<string, T>();
  for (const cue of cues) {
    if (cue.sourceActorId !== actorId || !cue.presented || cue.actorAction === 'none') continue;
    const key = JSON.stringify([cue.actionAt, cue.actionId]), existing = actions.get(key);
    if (!existing || existing.presentationDirection === undefined && cue.presentationDirection !== undefined) actions.set(key, cue);
  }
  return [...actions.values()].sort((a, b) => a.start - b.start || a.id - b.id);
}
export function lockActorDirection<T extends PresentedActorAction>(cues: T[], active: T, direction: number): number {
  const siblings = cues.filter(cue => cue.sourceActorId === active.sourceActorId &&
    cue.actionAt === active.actionAt && cue.actionId === active.actionId && cue.actorAction !== 'none');
  const locked = siblings.find(cue => cue.presentationDirection !== undefined)?.presentationDirection ?? direction;
  for (const cue of siblings) cue.presentationDirection = locked;
  return locked;
}

/** A later received action cannot replace the body before its visual turn. */
export function presentedActorActionAt<T extends PresentedActorAction>(cues: T[], actorId: string, time: number): T | undefined {
  return cues.find(cue => cue.sourceActorId === actorId && cue.actorAction !== 'none' && cue.presented === true &&
    cue.start <= time && time < cue.start + cue.actionDuration);
}

function shiftQueuedActorActions<T extends PresentedActorAction>(cues: T[], marks: Map<string, ActorActionWatermark>, active: T, delta: number) {
  const moved = new Map<number, number>();
  if (delta <= 0) return moved;
  const start = active.start;
  for (const cue of cues) if (cue.sourceActorId === active.sourceActorId && cue.actorAction !== 'none' &&
    cue.presented === true && cue.start >= start) {
    cue.start += delta; cue.effectStart += delta; cue.impact += delta;
    moved.set(cue.id, delta);
  }
  const watermark = marks.get(active.sourceActorId);
  if (watermark && watermark.presented && watermark.start >= start) {
    watermark.start += delta; watermark.end += delta;
  }
  return moved;
}

/** A cold native action waits at frame zero; source combat clocks never move. */
export class ActionTextureStartup {
  private states = new Map<string, { waited: number; released: boolean }>();
  private debuted = new Map<string, number>();
  private key(cue: PresentedActorAction) { return JSON.stringify([cue.sourceActorId, cue.actionAt, cue.actionId]); }
  waitedFor(cue: PresentedActorAction) { return this.states.get(this.key(cue))?.waited ?? 0; }
  debutDelayFor(cue: PresentedActorAction) { return this.debuted.get(this.key(cue)) ?? 0; }
  /** A render gap beyond the upload budget must not skip the first useful fallback pose. */
  alignFirstPaint<T extends PresentedActorAction>(cues: T[], marks: Map<string, ActorActionWatermark>, active: T, now: number) {
    return shiftQueuedActorActions(cues, marks, active, Math.max(0, now - active.start));
  }

  /** A scheduled action has not necessarily reached a useful map frame yet. */
  hasPendingDebut(cue: PresentedActorAction, now: number) {
    return cue.presented === true && cue.actorAction !== 'none' && !this.debuted.has(this.key(cue)) &&
      now <= cue.start + 2000;
  }

  /** Called only when this actor can be painted, before active-only selection. */
  debut<T extends PresentedActorAction>(cues: T[], marks: Map<string, ActorActionWatermark>, actorId: string, now: number, selected?: T) {
    const retained = new Set(cues.map(cue => this.key(cue)));
    for (const key of this.debuted.keys()) if (!retained.has(key)) this.debuted.delete(key);
    const active = selected ?? presentedActorActions(cues, actorId).find(cue => cue.start <= now &&
      (this.debuted.has(this.key(cue)) ? now < cue.start + cue.actionDuration : this.hasPendingDebut(cue, now)));
    if (!active || this.debuted.has(this.key(active))) return { active, moved: new Map<number, number>() };
    const delta = Math.max(0, now - active.start);
    this.debuted.set(this.key(active), delta);
    // Render/map arrival delay is separate from the finite GPU upload budget.
    // Only admitted recent actions debut; observed actions and old history do not restart.
    return { active, moved: shiftQueuedActorActions(cues, marks, active, delta) };
  }

  hold<T extends PresentedActorAction>(cues: T[], marks: Map<string, ActorActionWatermark>, active: T,
    now: number, ready: boolean): Map<number, number> {
    const moved = new Map<number, number>();
    const retained = new Set(cues.map(cue => this.key(cue)));
    for (const key of this.states.keys()) if (!retained.has(key)) this.states.delete(key);
    if (active.presented !== true || active.actorAction === 'none' || active.start > now) return moved;
    const key = this.key(active);
    let state = this.states.get(key);
    if (!state) { state = { waited: 0, released: ready }; this.states.set(key, state); }
    if (state.released) return moved;
    const delta = Math.min(Math.max(0, now - active.start), 450 - state.waited);
    state.waited += delta;
    state.released = ready || state.waited >= 450;
    if (delta <= 0) return moved;
    // Shift the queued actor once, including every AoE sibling, but leave DOT,
    // reflection and other actors on their independent presentation clocks.
    return shiftQueuedActorActions(cues, marks, active, delta);
  }
}

export interface PresentedActorReaction {
  id: number; targetActorId: string; hit: boolean; impact: number; reactionDuration: number;
  blocked?: boolean; reactionSuppressed?: boolean;
}

/** Reconcile actual ACT length once decoded, keeping damage at its own clock. */
export function reconcileActorPlayback<T extends PresentedActorAction>(cues: T[], marks: Map<string, ActorActionWatermark>, active: T, duration: number): Map<number, number> {
  const moved = new Map<number, number>();
  if (!active.presented || !Number.isFinite(duration) || duration <= 0) return moved;
  const delta = duration - active.actionDuration;
  if (Math.abs(delta) < .000001) return moved;
  const oldEnd = active.start + active.actionDuration;
  for (const cue of cues) {
    if (cue.sourceActorId !== active.sourceActorId || cue.actorAction === 'none' || !cue.presented) continue;
    if (cue.actionAt === active.actionAt && cue.actionId === active.actionId) {
      cue.actionDuration = duration;
      cue.duration = Math.max(cue.duration ?? duration, duration);
    } else if (cue.start >= oldEnd) {
      cue.start += delta; cue.effectStart += delta; cue.impact += delta;
      moved.set(cue.id, delta);
    }
  }
  const mark = marks.get(active.sourceActorId);
  if (mark?.presented) {
    if (mark.actionAt === active.actionAt && mark.actionId === active.actionId) mark.end += delta;
    else if (mark.start >= oldEnd) { mark.start += delta; mark.end += delta; }
  }
  return moved;
}
/** Preserve the Idle's offensive priority without replaying a hidden hurt tail. */
export function suppressActorReactions<T extends PresentedActorReaction>(cues: T[], actorId: string, now: number, offenseVisible: boolean) {
  if (!offenseVisible) return;
  for (const cue of cues) if (!cue.blocked && cue.targetActorId === actorId && cue.hit &&
    cue.impact <= now && now < cue.impact + cue.reactionDuration) cue.reactionSuppressed = true;
}
export function presentedActorReactionAt<T extends PresentedActorReaction>(cues: T[], actorId: string, now: number): T | undefined {
  let latest: T | undefined;
  for (const cue of cues) if (!cue.blocked && !cue.reactionSuppressed && cue.targetActorId === actorId && cue.hit &&
    cue.impact <= now && now < cue.impact + cue.reactionDuration &&
    (!latest || cue.impact > latest.impact || cue.impact === latest.impact && cue.id > latest.id)) latest = cue;
  return latest;
}

/** Remove only the visual cast explicitly retired by the authoritative event. */
export function retireInterruptedCastCues<T extends { sourceActorId:string; actionId:string; castAction?:boolean }>(cues:T[],events:readonly {kind:string;sourceActorId?:string;actionId?:string}[]):T[] {
  return cues.filter(cue=>!cue.castAction||!events.some(event=>event.kind==='cast-interrupted'&&event.actionId&&event.sourceActorId===cue.sourceActorId&&event.actionId===cue.actionId));
}


/** Position selected by the scene for a presented action. */
export function heroWorldAtAction(strike: { world?: WorldPoint } | null | undefined,
  movement: WorldPoint | undefined, fallback: () => WorldPoint): WorldPoint {
  return strike?.world ?? movement ?? fallback();
}
