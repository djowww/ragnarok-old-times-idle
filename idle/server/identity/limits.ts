import { PortalError } from './types.js';

export class AuthLimitError extends PortalError {
  constructor(code: string, statusCode: number, message: string, readonly retryAfter: number) {
    super(code, statusCode, message);
  }
}

/** The shared password worker uses this queue across all accounts and routes. */
export class ScryptQueue {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= 2 && this.waiting.length >= 8) {
      return Promise.reject(new AuthLimitError('AUTH_BUSY', 503, 'Autenticação ocupada. Tente novamente.', 1));
    }
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        // Capture a synchronous throw too, without postponing the start/count.
        void (async () => {
          try { resolve(await work()); }
          catch (error) { reject(error); }
          finally { this.active--; this.waiting.shift()?.(); }
        })();
      };
      if (this.active < 2) start(); else this.waiting.push(start);
    });
  }
}

type Attempts = { times: number[]; windowMs: number };
export class AttemptLimiter {
  private readonly entries = new Map<string, Attempts>();
  private nextCleanupAt = 0;
  constructor(private readonly now: () => number) {}

  private cleanup(at: number): void {
    for (const [key, entry] of this.entries) {
      entry.times = entry.times.filter(time => time + entry.windowMs > at);
      if (!entry.times.length) this.entries.delete(key);
    }
    this.nextCleanupAt = at + 60_000;
  }

  consume(key: string, maximum: number, windowMs: number): void {
    const at = this.now();
    if (at >= this.nextCleanupAt) this.cleanup(at);
    let entry = this.entries.get(key);
    if (!entry && this.entries.size >= 10_000) {
      this.cleanup(at);
      if (this.entries.size >= 10_000) {
        const earliest = Math.min(...Array.from(this.entries.values(), item => item.times.at(-1)! + item.windowMs));
        throw new AuthLimitError('RATE_LIMITED', 429, 'Muitas tentativas. Aguarde para tentar novamente.', Math.max(1, Math.ceil((earliest - at) / 1000)));
      }
    }
    if (!entry) { entry = { times: [], windowMs }; this.entries.set(key, entry); }
    entry.times = entry.times.filter(time => time + windowMs > at);
    if (entry.times.length >= maximum) {
      throw new AuthLimitError('RATE_LIMITED', 429, 'Muitas tentativas. Aguarde para tentar novamente.', Math.max(1, Math.ceil((entry.times[0] + windowMs - at) / 1000)));
    }
    entry.times.push(at);
  }
}
