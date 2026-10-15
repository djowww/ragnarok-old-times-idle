import type { GameSnapshot } from '../shared/types';
import type { AccountView } from '../shared/portal-types';
export class ApiFailure extends Error {
  status?: number; code?: string; fields?: Record<string, string>; snapshot?: GameSnapshot; uncertain: boolean;
  constructor(message: string, details: { status?: number; code?: string; fields?: Record<string, string>; snapshot?: GameSnapshot; uncertain: boolean }) { super(message); Object.assign(this, details); this.uncertain = details.uncertain; }
}
export async function request<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal; identity?: Pick<AccountView, 'accountId' | 'profileId'> } = {}): Promise<T> {
  // Only root-relative URLs can receive the browser's session cookie.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
    throw new ApiFailure('Endereço da API inválido.', { uncertain: false });
  options.signal?.throwIfAborted();
  const abort = new AbortController();
  const cancel = () => abort.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    const response = await fetch(path, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin', cache: 'no-store', headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.identity ? { 'X-Idle-Expected-Identity': JSON.stringify([options.identity.accountId, options.identity.profileId]) } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: abort.signal,
    });
    const value = await response.json();
    options.signal?.throwIfAborted();
    abort.signal.throwIfAborted();
    if (!response.ok) {
      throw new ApiFailure(value?.error?.message ?? 'Não foi possível completar esta ação.', {
        status: response.status, code: value?.error?.code, fields: value?.error?.fields, snapshot: value?.snapshot, uncertain: response.status >= 500,
      });
    }
    return value as T;
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure('A conexão com Rune-Midgard foi interrompida. Tente novamente.', { uncertain: true });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
