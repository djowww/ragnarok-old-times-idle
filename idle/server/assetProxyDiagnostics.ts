export interface AssetProxyFailure {
  method: string;
  assetPath: string;
  kind: 'upstream' | 'transport' | 'timeout' | 'stream';
  elapsedMs: number;
  upstreamStatus?: number;
  code?: string;
}

/** Keep machine codes; error messages, stacks, headers and URLs are excluded. */
export function assetFailureCode(error: unknown): string | undefined {
  try {
    const failure = error as { code?: unknown; cause?: { code?: unknown } } | null;
    const code = failure?.code ?? failure?.cause?.code;
    return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : undefined;
  } catch { return undefined; }
}
export function assetFailureIsTimeout(error: unknown, signal: AbortSignal): boolean {
  try { return (error as { name?: string } | null)?.name === 'TimeoutError' ||
    (signal.aborted && signal.reason?.name === 'TimeoutError'); }
  catch { return false; }
}

/** stderr belongs to server operations; the public asset response stays generic. */
export function reportAssetProxyFailure(failure: AssetProxyFailure): void {
  console.warn(JSON.stringify({ event: 'asset-proxy-failure', ...failure }));
}
