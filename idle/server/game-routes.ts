import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import type { Catalog, GameState, RewardSummary } from '../shared/types.js';
import type { StateRepository } from './repository.js';
import type { GameProfiles } from './identity/types.js';
import { PortalError } from './identity/types.js';
import type { AuthService } from './identity/service.js';
import type { AccountView } from '../shared/portal-types.js';
import { advanceState, advanceStateCooperatively, applyCommand, getSnapshot } from '../engine/index.js';
import { parseCommandRequest } from './validation.js';

const callerRepositories = new WeakMap<FastifyRequest, StateRepository>();
export function callerRepository(request: FastifyRequest): StateRepository | undefined { return callerRepositories.get(request); }
export function assertExpectedIdentity(headers: Record<string, string | string[] | undefined>, account: Pick<AccountView, 'accountId' | 'profileId'> | null): void {
  const header = headers['x-idle-expected-identity'];
  if (header === undefined) return;
  let expected: unknown;
  try { expected = typeof header === 'string' ? JSON.parse(header) : null; } catch { expected = null; }
  // This is only a consistency guard. The cookie alone selects the account and repository.
  // Logout may already have no session; validate the header but keep that exit idempotent.
  if (!Array.isArray(expected) || expected.length !== 2 || expected.some(value => typeof value !== 'string' || !value) ||
    (account && (expected[0] !== account.accountId || expected[1] !== account.profileId)))
    throw new PortalError('AUTH_REQUIRED', 401, 'A sessão desta aba mudou. Entre novamente para continuar.');
}
export async function resolveGameRepository(request: FastifyRequest, auth: AuthService, profiles: GameProfiles): Promise<StateRepository> {
  const identity = await auth.resolve(request.cookies.idle_session);
  if (!identity) throw new PortalError('AUTH_REQUIRED', 401, 'Entre na sua conta para continuar.');
  assertExpectedIdentity(request.headers, identity);
  const repository = profiles.forProfile(identity.profileId);
  callerRepositories.set(request, repository);
  return repository;
}
const OFFLINE_SUMMARY_THRESHOLD_MS = 30_000;
const SESSION_CONTACT_INTERVAL_MS = 10_000;
function difference(total: RewardSummary, previous: RewardSummary): RewardSummary {
  const result = structuredClone(total);
  for (const key of Object.keys(result) as Array<keyof RewardSummary>) {
    if (key !== 'items') result[key] = Math.max(0, total[key] - previous[key]);
  }
  result.items = {};
  for (const [id, amount] of Object.entries(total.items)) if (amount > (previous.items[Number(id)] ?? 0)) result.items[Number(id)] = amount - (previous.items[Number(id)] ?? 0);
  return result;
}
function recordContact(state: GameState, result: GameState, now: number): GameState {
  if (now - state.lastSeenAt >= OFFLINE_SUMMARY_THRESHOLD_MS) {
    const summary = difference(result.totals, state.contactTotals);
    if (result.offlineSummary) {
      for (const key of Object.keys(summary) as Array<keyof RewardSummary>) if (key !== 'items') result.offlineSummary[key] += summary[key];
      for (const [id, amount] of Object.entries(summary.items)) result.offlineSummary.items[Number(id)] = (result.offlineSummary.items[Number(id)] ?? 0) + amount;
    } else result.offlineSummary = summary;
  }
  result.lastSeenAt = Math.max(state.lastSeenAt, now);
  result.contactTotals = structuredClone(result.totals);
  return result;
}
function contact(state: GameState, catalog: Catalog, now: number): GameState {
  return recordContact(state, advanceState(state, catalog, now), now);
}
async function contactCooperatively(state: GameState, catalog: Catalog, now: number): Promise<GameState> {
  return recordContact(state, await advanceStateCooperatively(state, catalog, now), now);
}
export async function registerGameRoutes(app: FastifyInstance, { auth, profiles, catalog, now }: { auth: AuthService; profiles: GameProfiles; catalog: Catalog; now: () => number }): Promise<void> {
  app.post('/api/session', async request => {
    const repository = await resolveGameRepository(request, auth, profiles);
    const at = now();
    const current = await repository.read();
    // Keep persisted heartbeats below the offline-summary threshold so an
    // active browser session is never mistaken for a player returning later.
    if (at - current.lastSeenAt < SESSION_CONTACT_INTERVAL_MS)
      return getSnapshot(advanceState(current, catalog, at), catalog, at);
    const state = repository.transactCooperatively
      ? await repository.transactCooperatively(null, old => contactCooperatively(old, catalog, at))
      : await repository.transact(null, old => contact(old, catalog, at));
    return getSnapshot(state, catalog, at);
  });
  app.post('/api/command', async request => {
    const repository = await resolveGameRepository(request, auth, profiles);
    const body = request.body;
    // A supplied profile selector has no authority. Validate remaining fields.
    const input = parseCommandRequest(body && typeof body === 'object' && !Array.isArray(body)
      ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'profileId')) : body);
    const at = now();
    const fingerprint = createHash('sha256').update(JSON.stringify(input.command)).digest('hex');
    const state = repository.transactCooperatively
      ? await repository.transactCooperatively(input.requestId, async old => applyCommand(await contactCooperatively(old, catalog, at), catalog, input.command, at), fingerprint)
      : await repository.transact(input.requestId, old => applyCommand(contact(old, catalog, at), catalog, input.command, at), fingerprint);
    return getSnapshot(state, catalog, at);
  });
}
