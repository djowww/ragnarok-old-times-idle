export const TRICK_DEAD_BASE_SP_COST = 5;
export const TRICK_DEAD_DURATION_MS = Number.POSITIVE_INFINITY;
export const TRICK_DEAD_PERSISTED = false;

export type TrickDeadAction = 'toggle' | 'move' | 'item' | 'skill' | 'basicAttack' | 'cast' | 'recoverHp' | 'recoverSp';
export type TrickDeadHitKind = 'basic' | 'skill';
export type TrickDeadLifecycleEvent = 'poll' | 'tick' | 'pause' | 'save' | 'sessionEnd' | 'death' | 'warp' | 'classIneligible';

export type TrickDeadToggleInput = {
  active: boolean;
  learned: boolean;
  classKey: string;
  inField: boolean;
  alive: boolean;
  sp: number;
  /** Caller-calculated SP cost after the source skill cost modifiers. */
  modifiedSpCost: number;
};

export type TrickDeadToggleResult = {
  accepted: boolean;
  active: boolean;
  sp: number;
  /** The source performs one status-resistance RNG draw when applying SC_TRICKDEAD. */
  activationRolls: number;
};

/** Resolves the manual NV_TRICKDEAD toggle without performing RNG or mutating input. */
export function resolveTrickDeadToggle(input: TrickDeadToggleInput): TrickDeadToggleResult {
  if (input.active) {
    return { accepted: true, active: false, sp: input.sp, activationRolls: 0 };
  }

  const eligibleClass = input.classKey === 'novice' || input.classKey === 'high_novice';
  const validCost = Number.isSafeInteger(input.modifiedSpCost) && input.modifiedSpCost >= 0;
  const validSp = Number.isSafeInteger(input.sp) && input.sp >= 0;
  if (!input.learned || !eligibleClass || !input.inField || !input.alive || !validCost || !validSp || input.sp < input.modifiedSpCost) {
    return { accepted: false, active: false, sp: input.sp, activationRolls: 0 };
  }

  return {
    accepted: true,
    active: true,
    sp: input.sp - input.modifiedSpCost,
    activationRolls: 1,
  };
}

/** While active, only the manual toggle remains usable; attacks/casts stop with the status. */
export function trickDeadActionAllowed(active: boolean, action: TrickDeadAction): boolean {
  return !active || action === 'toggle';
}

/** Source guards reject both ordinary attacks and skill damage before damage/status cleanup. */
export function trickDeadIncomingHit(active: boolean, _kind: TrickDeadHitKind): { blocked: boolean; consumeStatus: false } {
  return { blocked: active, consumeStatus: false };
}

/** NoSave is handled at session boundaries; reads, ticks, pauses, and saves do not expire the buff. */
export function trickDeadLifecycle(active: boolean, event: TrickDeadLifecycleEvent): boolean {
  if (!active) return false;
  return event !== 'sessionEnd' && event !== 'death' && event !== 'warp' && event !== 'classIneligible';
}
