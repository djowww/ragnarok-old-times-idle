import type { BattleEnemy, Catalog, ElementalField, GameState, GroundPlacement } from '../shared/types.js';
import { clearSageField, sageFieldModifiers } from '../engine/sageFields.js';
import { derivedStats } from '../engine/stats.js';
import { ValidationError } from './validation.js';
import type { StateRepository } from './repository.js';

export const TRICK_DEAD_BUFF_ID = 'nv_trickdead';
export const SIGHT_BLASTER_BUFF_ID = 'sight_blaster';
export const MAGIC_ROD_BUFF_ID = 'sa_magicrod';
export const PRESERVE_BUFF_ID = 'st_preserve';
const VOLATILE_BUFF_IDS = [TRICK_DEAD_BUFF_ID, SIGHT_BLASTER_BUFF_ID, MAGIC_ROD_BUFF_ID, PRESERVE_BUFF_ID, 'chasewalk_strength', 'pf_fogwall'] as const;
const MAX_REMEMBERED_OPEN_CONNECTIONS = 256;
type VolatileBuffs = Record<string, GameState['buffs'][string]>;
type BladeStopStatus = NonNullable<NonNullable<BattleEnemy['statuses']>['SC_BLADESTOP']>;
type VolatileBladeStop = {
  wait?: NonNullable<NonNullable<GameState['combatEffects']>['bladeStopWait']>;
  link?: NonNullable<NonNullable<GameState['combatEffects']>['bladeStopLink']>;
  partners: Record<string, BladeStopStatus>;
  partnerMovement: Record<string, { startedAt: number; arrivedAt: number; approachPausedAt?: number }>;
};
type SyncStateAction = (state: GameState) => GameState;
type AsyncStateAction = (state: GameState) => Promise<GameState>;
type VolatileField = { group?: ElementalField; groundPlacements?: GroundPlacement[];
  playerHpAboveBase: number; enemyHpAboveBase: Record<string, number> };
const emptyField = (): VolatileField => ({ playerHpAboveBase: 0, enemyHpAboveBase: {} });

export function parseSessionOpenRequest(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.connectionId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.connectionId))
    throw new ValidationError();
  return body.connectionId.toLowerCase();
}

/** Holds the NoSave pair in process memory and drops the transient WAIT on new connections. */
export class SessionStateRepository implements StateRepository {
  readonly transactCooperatively?: NonNullable<StateRepository['transactCooperatively']>;
  readonly openSessionCooperatively?: (connectionId: string, action: AsyncStateAction) => Promise<GameState>;

  private volatileBuffs: VolatileBuffs = {};
  private volatileField: VolatileField = emptyField();
  private volatileBladeStop: VolatileBladeStop = { partners: {}, partnerMovement: {} };
  private readonly openedConnections = new Set<string>();
  private operationTail: Promise<void> = Promise.resolve();

  constructor(private readonly durable: StateRepository, private readonly catalog?: Catalog) {
    if (durable.transactCooperatively) {
      this.transactCooperatively = (requestId, action, fingerprint) =>
        this.withLock(() => this.transactCooperativelyUnlocked(requestId, action, fingerprint));
      this.openSessionCooperatively = (connectionId, action) =>
        this.withLock(() => this.openSessionCooperativelyUnlocked(connectionId, action));
    }
  }

  transact(requestId: string | null, action: SyncStateAction, fingerprint?: string): Promise<GameState> {
    return this.withLock(() => this.transactUnlocked(requestId, action, fingerprint));
  }

  openSession(connectionId: string, action: SyncStateAction): Promise<GameState> {
    return this.withLock(() => this.openSessionUnlocked(connectionId, action));
  }

  /** Explicit logout releases process-local NoSave state after pending commits. */
  endSession(): Promise<void> {
    return this.withLock(async () => {
      this.volatileBuffs = {};
      this.volatileField = emptyField();
      this.volatileBladeStop = { partners: {}, partnerMovement: {} };
      this.openedConnections.clear();
    });
  }

  read(): Promise<GameState> {
    return this.withLock(async () => this.hydrate(await this.durable.read()));
  }

  health(): Promise<boolean> { return this.durable.health(); }

  private async transactUnlocked(requestId: string | null, action: SyncStateAction, fingerprint?: string): Promise<GameState> {
    let invoked = false;
    let nextBuffs: VolatileBuffs | undefined;
    let nextField: VolatileField | undefined;
    let nextBladeStop: VolatileBladeStop | undefined;
    const saved = await this.durable.transact(requestId, state => {
      invoked = true;
      const next = action(this.hydrate(state));
      nextBuffs = this.readBuffs(next);
      nextField = this.readField(next);
      nextBladeStop = this.readBladeStop(next);
      const durableNext = structuredClone(next);
      this.stripDurableBuff(durableNext);
      this.stripDurableBladeStop(durableNext);
      this.stripDurableField(durableNext);
      return durableNext;
    }, fingerprint);
    // The callback is skipped for an idempotent receipt replay. In that case
    // the committed volatile value is authoritative and must not be replaced.
    if (invoked) { this.volatileField = nextField ?? emptyField(); this.volatileBuffs = nextBuffs ?? {}; this.volatileBladeStop = nextBladeStop ?? { partners: {}, partnerMovement: {} }; }
    return this.hydrate(saved);
  }

  private async transactCooperativelyUnlocked(requestId: string | null, action: AsyncStateAction, fingerprint?: string): Promise<GameState> {
    let invoked = false;
    let nextBuffs: VolatileBuffs | undefined;
    let nextField: VolatileField | undefined;
    let nextBladeStop: VolatileBladeStop | undefined;
    const saved = await this.durable.transactCooperatively!(requestId, async state => {
      invoked = true;
      const next = await action(this.hydrate(state));
      nextBuffs = this.readBuffs(next);
      nextField = this.readField(next);
      nextBladeStop = this.readBladeStop(next);
      const durableNext = structuredClone(next);
      this.stripDurableBuff(durableNext);
      this.stripDurableBladeStop(durableNext);
      this.stripDurableField(durableNext);
      return durableNext;
    }, fingerprint);
    if (invoked) { this.volatileField = nextField ?? emptyField(); this.volatileBuffs = nextBuffs ?? {}; this.volatileBladeStop = nextBladeStop ?? { partners: {}, partnerMovement: {} }; }
    return this.hydrate(saved);
  }

  private async openSessionUnlocked(connectionId: string, action: SyncStateAction): Promise<GameState> {
    const newConnection = !this.openedConnections.has(connectionId);
    let invoked = false;
    let nextBuffs: VolatileBuffs | undefined;
    let nextField: VolatileField | undefined;
    let nextBladeStop: VolatileBladeStop | undefined;
    const saved = await this.durable.transact(null, state => {
      invoked = true;
      const next = action(this.hydrate(state, newConnection ? null : this.volatileBuffs,
        newConnection ? null : this.volatileBladeStop, newConnection ? null : this.volatileField));
      nextBuffs = newConnection ? {} : this.readBuffs(next);
      nextField = newConnection ? emptyField() : this.readField(next);
      nextBladeStop = newConnection ? { partners: {}, partnerMovement: {} } : this.readBladeStop(next);
      const durableNext = structuredClone(next);
      this.stripDurableBuff(durableNext);
      this.stripDurableBladeStop(durableNext);
      this.stripDurableField(durableNext);
      return durableNext;
    });
    if (invoked) {
      this.volatileBuffs = nextBuffs ?? {};
      this.volatileField = nextField ?? emptyField();
      this.volatileBladeStop = nextBladeStop ?? { partners: {}, partnerMovement: {} };
      if (newConnection) this.rememberOpenedConnection(connectionId);
    }
    return this.hydrate(saved);
  }

  private async openSessionCooperativelyUnlocked(connectionId: string, action: AsyncStateAction): Promise<GameState> {
    const newConnection = !this.openedConnections.has(connectionId);
    let invoked = false;
    let nextBuffs: VolatileBuffs | undefined;
    let nextField: VolatileField | undefined;
    let nextBladeStop: VolatileBladeStop | undefined;
    const saved = await this.durable.transactCooperatively!(null, async state => {
      invoked = true;
      const next = await action(this.hydrate(state, newConnection ? null : this.volatileBuffs,
        newConnection ? null : this.volatileBladeStop, newConnection ? null : this.volatileField));
      nextBuffs = newConnection ? {} : this.readBuffs(next);
      nextField = newConnection ? emptyField() : this.readField(next);
      nextBladeStop = newConnection ? { partners: {}, partnerMovement: {} } : this.readBladeStop(next);
      const durableNext = structuredClone(next);
      this.stripDurableBuff(durableNext);
      this.stripDurableBladeStop(durableNext);
      this.stripDurableField(durableNext);
      return durableNext;
    });
    if (invoked) {
      this.volatileBuffs = nextBuffs ?? {};
      this.volatileField = nextField ?? emptyField();
      this.volatileBladeStop = nextBladeStop ?? { partners: {}, partnerMovement: {} };
      if (newConnection) this.rememberOpenedConnection(connectionId);
    }
    return this.hydrate(saved);
  }

  private hydrate(state: GameState, buffs: VolatileBuffs | null = this.volatileBuffs,
    bladeStop: VolatileBladeStop | null = this.volatileBladeStop, field: VolatileField | null = this.volatileField): GameState {
    const hydrated = structuredClone(state);
    this.stripDurableBuff(hydrated);
    this.stripDurableBladeStop(hydrated, !bladeStop?.link || !Object.keys(bladeStop.partners).length);
    this.stripDurableField(hydrated);
    hydrated.buffs ??= {};
    if (buffs) for (const [id, buff] of Object.entries(buffs)) hydrated.buffs[id] = structuredClone(buff);
    if (buffs?.[PRESERVE_BUFF_ID]) ((hydrated.combatEffects ??= {}).buffLevels ??= {})[PRESERVE_BUFF_ID] = 1;
    if (bladeStop) {
      const effects = (hydrated.combatEffects ??= {});
      if (bladeStop.wait) effects.bladeStopWait = structuredClone(bladeStop.wait);
      if (bladeStop.link) effects.bladeStopLink = structuredClone(bladeStop.link);
      const blockUntil = Math.max(bladeStop.wait?.expiresAt ?? 0, bladeStop.link?.expiresAt ?? 0);
      if (hydrated.fieldHero && blockUntil > 0)
        hydrated.fieldHero.moveBlockedUntil = Math.max(hydrated.fieldHero.moveBlockedUntil ?? 0, blockUntil);
      for (const enemy of [...(hydrated.battle?.enemies ?? []), ...(hydrated.fieldPopulation?.enemies ?? [])]) {
        const status = bladeStop.partners[enemy.id];
        if (status) {
          (enemy.statuses ??= {}).SC_BLADESTOP = structuredClone(status);
          const movement = bladeStop.partnerMovement[enemy.id];
          if (movement) Object.assign(enemy, structuredClone(movement));
        }
      }
    }
    if (field?.groundPlacements?.length) hydrated.groundPlacements = structuredClone(field.groundPlacements);
    if (field?.group) {
      if (!this.catalog) throw new Error('Elemental field session requires its catalog');
      hydrated.elementalField = structuredClone(field.group);
      const seenEnemies = new Set<BattleEnemy>();
      for (const enemy of [...(hydrated.battle?.enemies ?? []), ...(hydrated.fieldPopulation?.enemies ?? [])]) {
        if (seenEnemies.has(enemy)) continue;
        seenEnemies.add(enemy);
        const percent = sageFieldModifiers(hydrated, enemy.id, hydrated.lastSimulatedAt).hpPercent;
        if (percent > 0) {
          enemy.elementalFieldBaseMaxHp ??= enemy.maxHp;
          enemy.maxHp = enemy.elementalFieldBaseMaxHp + Math.trunc(enemy.elementalFieldBaseMaxHp * percent / 100);
          if (enemy.hp > 0) enemy.hp = Math.min(enemy.maxHp, enemy.hp + (field.enemyHpAboveBase[enemy.id] ?? 0));
        }
      }
      if (hydrated.hp > 0) hydrated.hp = Math.min(derivedStats(hydrated, this.catalog).maxHp, hydrated.hp + field.playerHpAboveBase);
    }
    return hydrated;
  }

  private readField(state: GameState): VolatileField {
    const groundPlacements = state.groundPlacements?.length ? structuredClone(state.groundPlacements) : undefined;
    if (!state.elementalField) return { ...emptyField(), groundPlacements };
    if (!this.catalog) throw new Error('Elemental field session requires its catalog');
    const baseHp = derivedStats({ ...state, elementalField: undefined }, this.catalog).maxHp;
    const enemyHpAboveBase: Record<string, number> = {};
    for (const enemy of [...(state.battle?.enemies ?? []), ...(state.fieldPopulation?.enemies ?? [])])
      if (enemy.elementalFieldBaseMaxHp !== undefined)
        enemyHpAboveBase[enemy.id] = Math.max(0, enemy.hp - enemy.elementalFieldBaseMaxHp);
    return { group: structuredClone(state.elementalField), groundPlacements,
      playerHpAboveBase: Math.max(0, state.hp - baseHp), enemyHpAboveBase };
  }
  private stripDurableField(state: GameState): void {
    delete state.groundPlacements;
    if (state.elementalField) {
      if (!this.catalog) throw new Error('Elemental field session requires its catalog');
      const baseHp = derivedStats({ ...state, elementalField: undefined }, this.catalog).maxHp;
      state.hp = Math.min(state.hp, baseHp);
    }
    clearSageField(state);
  }

  private readBladeStop(state: GameState): VolatileBladeStop {
    const effects = state.combatEffects;
    const partners: VolatileBladeStop['partners'] = {};
    const partnerMovement: VolatileBladeStop['partnerMovement'] = {};
    for (const enemy of [...(state.battle?.enemies ?? []), ...(state.fieldPopulation?.enemies ?? [])]) {
      const status = enemy.statuses?.SC_BLADESTOP;
      if (status?.sourceActorId === state.id && status.partnerActorId === state.id) {
        partners[enemy.id] = structuredClone(status);
        partnerMovement[enemy.id] = { startedAt: enemy.startedAt, arrivedAt: enemy.arrivedAt,
          ...(enemy.approachPausedAt !== undefined && { approachPausedAt: enemy.approachPausedAt }) };
      }
    }
    return { ...(effects?.bladeStopWait && { wait: structuredClone(effects.bladeStopWait) }),
      ...(effects?.bladeStopLink && { link: structuredClone(effects.bladeStopLink) }), partners, partnerMovement };
  }

  private stripDurableBladeStop(state: GameState, resumeMovement = true): void {
    const effects = state.combatEffects;
    const stopDeadlines = [effects?.bladeStopWait?.expiresAt, effects?.bladeStopLink?.expiresAt]
      .filter((deadline): deadline is number => typeof deadline === 'number');
    let linkActorId = effects?.bladeStopLink?.partnerActorId;
    if (state.combatEffects) {
      delete state.combatEffects.bladeStopWait;
      delete state.combatEffects.bladeStopLink;
    }
    for (const enemy of [...(state.battle?.enemies ?? []), ...(state.fieldPopulation?.enemies ?? [])]) {
      const status = enemy.statuses?.SC_BLADESTOP;
      if (status?.sourceActorId === state.id && status.partnerActorId === state.id) {
        linkActorId ??= enemy.id;
        stopDeadlines.push(status.expiresAt);
        if (enemy.statuses) delete enemy.statuses.SC_BLADESTOP;
        if (resumeMovement && enemy.id === linkActorId && enemy.approachPausedAt !== undefined) {
          const pausedMs = Math.max(0, state.lastSimulatedAt - enemy.approachPausedAt);
          enemy.startedAt += pausedMs;
          enemy.arrivedAt += pausedMs;
          delete enemy.approachPausedAt;
        }
      }
    }
    if (state.fieldHero && stopDeadlines.includes(state.fieldHero.moveBlockedUntil ?? NaN))
      delete state.fieldHero.moveBlockedUntil;
  }

  private readBuffs(state: GameState): VolatileBuffs {
    const buffs: VolatileBuffs = {};
    for (const id of VOLATILE_BUFF_IDS) {
      const buff = state.buffs?.[id];
      if (buff) buffs[id] = structuredClone(buff);
    }
    return buffs;
  }

  private stripDurableBuff(state: GameState): void {
    if (state.buffs) for (const id of VOLATILE_BUFF_IDS) delete state.buffs[id];
    if (state.combatEffects?.buffLevels) delete state.combatEffects.buffLevels[PRESERVE_BUFF_ID];
  }

  private rememberOpenedConnection(connectionId: string): void {
    if (this.openedConnections.has(connectionId)) return;
    this.openedConnections.add(connectionId);
    if (this.openedConnections.size > MAX_REMEMBERED_OPEN_CONNECTIONS) {
      const oldest = this.openedConnections.values().next().value;
      if (oldest !== undefined) this.openedConnections.delete(oldest);
    }
  }

  private withLock<T>(action: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(action, action);
    this.operationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}
