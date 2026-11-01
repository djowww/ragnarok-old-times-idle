import { ActionTextureStartup, lockActorDirection, presentedActorActions, reconcileActorPlayback,
  type ActorActionWatermark, type PresentedActorAction } from './combatPresentation';

export interface EnemyActionOptions<T> {
  decoded: boolean;
  direction: number;
  hasPose: (cue: T, direction: number) => boolean;
  playbackDuration: (cue: T, direction: number) => number;
  nativeState: (cue: T, direction: number) => 'ready' | 'pending' | 'canvas';
}
export interface EnemyActionFrame<T> {
  cue: T; elapsed: number; direction: number; waited: number; firstFrameDelay: number;
  canvasOnly: boolean; moved: Map<number, number>;
}

/** Selects an actor body animation at the renderer boundary. */
export class ActorActionPresentation {
  private renderers = new Map<string, { canvasOnly: boolean; released: boolean; deadline: number }>();
  constructor(private readonly startup = new ActionTextureStartup()) {}
  private key(cue: PresentedActorAction) { return JSON.stringify([cue.sourceActorId, cue.actionAt, cue.actionId]); }
  hasPendingFrame(cue: PresentedActorAction, now: number) {
    const renderer = this.renderers.get(this.key(cue));
    return cue.presented === true && cue.actorAction !== 'none' && !!renderer && !renderer.released && now <= renderer.deadline;
  }

  /** Geometry may need the pending target before the renderer locks its direction. */
  actionAt<T extends PresentedActorAction>(cues: T[], actorId: string, now: number): T | undefined {
    return presentedActorActions(cues, actorId).find(cue => cue.start <= now &&
      (now < cue.start + cue.actionDuration || this.startup.hasPendingDebut(cue, now) ||
        this.hasPendingFrame(cue, now)));
  }

  frame<T extends PresentedActorAction>(cues: T[], marks: Map<string, ActorActionWatermark>, actorId: string,
    now: number, options: EnemyActionOptions<T>): EnemyActionFrame<T> | undefined {
    const retained = new Set(cues.map(cue => this.key(cue)));
    for (const key of this.renderers.keys()) if (!retained.has(key)) this.renderers.delete(key);
    if (!options.decoded) return undefined;
    const candidate = this.actionAt(cues, actorId, now);
    if (!candidate || !options.hasPose(candidate, candidate.presentationDirection ?? options.direction)) return undefined;
    const moved = new Map<number, number>();
    const collect = (changes: Map<number, number>) => {
      for (const [id, delta] of changes) moved.set(id, (moved.get(id) ?? 0) + delta);
    };
    collect(this.startup.debut(cues, marks, actorId, now, candidate).moved);
    const direction = lockActorDirection(cues, candidate, options.direction);
    collect(reconcileActorPlayback(cues, marks, candidate, options.playbackDuration(candidate, direction)));
    const key = this.key(candidate), native = options.nativeState(candidate, direction);
    let renderer = this.renderers.get(key);
    if (!renderer) { renderer = { canvasOnly: native === 'canvas', released: native !== 'pending', deadline: candidate.start + 2000 }; this.renderers.set(key, renderer); }
    if (!renderer.released) {
      collect(this.startup.hold(cues, marks, candidate, now, native !== 'pending'));
      renderer.released = native !== 'pending' || this.startup.waitedFor(candidate) >= 450;
      renderer.canvasOnly = native === 'canvas' || native === 'pending' && renderer.released;
      if (renderer.released) collect(this.startup.alignFirstPaint(cues, marks, candidate, now));
    } else if (native !== 'ready') renderer.canvasOnly = true;
    return { cue: candidate, elapsed: Math.max(0, now - candidate.start), direction,
      waited: this.startup.waitedFor(candidate), firstFrameDelay: this.startup.debutDelayFor(candidate),
      canvasOnly: renderer.canvasOnly, moved };
  }
}

export { ActorActionPresentation as EnemyActionPresentation };
