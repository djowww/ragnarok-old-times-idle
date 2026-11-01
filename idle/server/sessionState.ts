import type { GameState } from '../shared/types.js';
import { ValidationError } from './validation.js';
import type { StateRepository } from './repository.js';

export const TRICK_DEAD_BUFF_ID = 'nv_trickdead';
export const SIGHT_BLASTER_BUFF_ID = 'sight_blaster';
const VOLATILE_BUFF_IDS = [TRICK_DEAD_BUFF_ID, SIGHT_BLASTER_BUFF_ID] as const;
const MAX_REMEMBERED_OPEN_CONNECTIONS = 256;
type VolatileBuffs = Record<string, GameState['buffs'][string]>;
type SyncStateAction = (state: GameState) => GameState;
type AsyncStateAction = (state: GameState) => Promise<GameState>;

export function parseSessionOpenRequest(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.connectionId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.connectionId))
    throw new ValidationError();
  return body.connectionId.toLowerCase();
}

/** Keeps the source NoSave status in process memory while the rest of GameState remains durable. */
export class SessionStateRepository implements StateRepository {
  readonly transactCooperatively?: NonNullable<StateRepository['transactCooperatively']>;
  readonly openSessionCooperatively?: (connectionId: string, action: AsyncStateAction) => Promise<GameState>;

  private volatileBuffs: VolatileBuffs = {};
  private readonly openedConnections = new Set<string>();
  private operationTail: Promise<void> = Promise.resolve();

  constructor(private readonly durable: StateRepository) {
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

  read(): Promise<GameState> {
    return this.withLock(async () => this.hydrate(await this.durable.read()));
  }

  health(): Promise<boolean> { return this.durable.health(); }

  private async transactUnlocked(requestId: string | null, action: SyncStateAction, fingerprint?: string): Promise<GameState> {
    let invoked = false;
    let nextBuffs: VolatileBuffs | undefined;
    const saved = await this.durable.transact(requestId, state => {
      invoked = true;
      const next = action(this.hydrate(state));
      nextBuffs = this.readBuffs(next);
      this.stripDurableBuff(next);
      return next;
    }, fingerprint);
    // The callback is skipped for an idempotent receipt replay. In that case
    // the committed volatile value is authoritative and must not be replaced.
    if (invoked) this.volatileBuffs = nextBuffs ?? {};
    return this.hydrate(saved);
  }

  private async transactCooperativelyUnlocked(requestId: string | null, action: AsyncStateAction, fingerprint?: string): Promise<GameState> {
    let invoked = false;
    let nextBuffs: VolatileBuffs | undefined;
    const saved = await this.durable.transactCooperatively!(requestId, async state => {
      invoked = true;
      const next = await action(this.hydrate(state));
      nextBuffs = this.readBuffs(next);
      this.stripDurableBuff(next);
      return next;
    }, fingerprint);
    if (invoked) this.volatileBuffs = nextBuffs ?? {};
    return this.hydrate(saved);
  }

  private async openSessionUnlocked(connectionId: string, action: SyncStateAction): Promise<GameState> {
    const newConnection = !this.openedConnections.has(connectionId);
    let invoked = false;
    let nextBuffs: VolatileBuffs | undefined;
    const saved = await this.durable.transact(null, state => {
      invoked = true;
      const next = action(this.hydrate(state, newConnection ? null : this.volatileBuffs));
      nextBuffs = newConnection ? {} : this.readBuffs(next);
      this.stripDurableBuff(next);
      return next;
    });
    if (invoked) {
      this.volatileBuffs = nextBuffs ?? {};
      if (newConnection) this.rememberOpenedConnection(connectionId);
    }
    return this.hydrate(saved);
  }

  private async openSessionCooperativelyUnlocked(connectionId: string, action: AsyncStateAction): Promise<GameState> {
    const newConnection = !this.openedConnections.has(connectionId);
    let invoked = false;
    let nextBuffs: VolatileBuffs | undefined;
    const saved = await this.durable.transactCooperatively!(null, async state => {
      invoked = true;
      const next = await action(this.hydrate(state, newConnection ? null : this.volatileBuffs));
      nextBuffs = newConnection ? {} : this.readBuffs(next);
      this.stripDurableBuff(next);
      return next;
    });
    if (invoked) {
      this.volatileBuffs = nextBuffs ?? {};
      if (newConnection) this.rememberOpenedConnection(connectionId);
    }
    return this.hydrate(saved);
  }

  private hydrate(state: GameState, buffs: VolatileBuffs | null = this.volatileBuffs): GameState {
    const hydrated = structuredClone(state);
    this.stripDurableBuff(hydrated);
    hydrated.buffs ??= {};
    if (buffs) for (const [id, buff] of Object.entries(buffs)) hydrated.buffs[id] = structuredClone(buff);
    return hydrated;
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
