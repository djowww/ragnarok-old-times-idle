import { loadActor, type DecodedActor } from './renderer';

/** Original client placed skill unit; loaded from GRF by the asset proxy. */
export const GROUND_TRAP_ASSET = {
  spr: 'data/sprite/이팩트/기본트랩.spr',
  act: 'data/sprite/이팩트/기본트랩.act',
};
const HUNTER_CONTROL_TRAPS = new Set(['HT_SKIDTRAP', 'HT_ANKLESNARE', 'HT_SANDMAN', 'HT_FLASHER']);
export function hasSceneAction(kind: string, hasSkill: boolean): boolean {
  return ['damage', 'miss', 'dodge'].includes(kind) || hasSkill && ['skill', 'treatment', 'trap-placed', 'trap-trigger', 'ground-placed'].includes(kind);
}
export function trapCueAction(kind: string): 'skill' | 'none' | undefined {
  return ['trap-placed', 'ground-placed'].includes(kind) ? 'skill' : kind === 'trap-trigger' ? 'none' : undefined;
}
interface TrapLifetime {
  skillId: string;
  placedAt: number;
  expiresAt: number;
  triggeredAt?: number;
  capturedEnemyId?: string;
}

export function groundTrapVisualState(trap: TrapLifetime, now: number): 'armed' | 'captured' | 'spent' | null {
  if (!HUNTER_CONTROL_TRAPS.has(trap.skillId) || !Number.isFinite(now) ||
    now < trap.placedAt || now >= trap.expiresAt) return null;
  if (trap.triggeredAt === undefined || now < trap.triggeredAt) return 'armed';
  return trap.skillId === 'HT_ANKLESNARE' && trap.capturedEnemyId ? 'captured' : 'spent';
}

/** Preserve original pixels while dimming spent skill units in both renderers. */
export function spentGroundTrap(actor: DecodedActor): DecodedActor {
  if (!actor.body) return actor;
  return { ...actor, body: { ...actor.body, action: { ...actor.body.action,
    actions: actor.body.action.actions.map(action => ({ ...action,
      frames: action.frames.map(frame => ({ ...frame,
        layers: frame.layers.map(layer => ({ ...layer,
          color: [layer.color[0], layer.color[1], layer.color[2], Math.round(layer.color[3] * .45)] as [number, number, number, number],
        })),
      })),
    })),
  } } };
}

let trapPromise: Promise<DecodedActor | null> | undefined;
export function loadGroundTrap(): Promise<DecodedActor | null> {
  if (trapPromise) return trapPromise;
  const pending = (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const actor = await loadActor(GROUND_TRAP_ASSET);
      if (!actor.fallback) return actor;
      if (attempt < 2) await new Promise<void>(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
    return null;
  })();
  trapPromise = pending;
  void pending.then(actor => { if (!actor && trapPromise === pending) trapPromise = undefined; });
  return pending;
}
