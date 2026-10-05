import { describe, expect, it } from 'vitest';
import { scryptSync } from 'node:crypto';
import { hashPassword, verifyPassword } from '../server/identity/password.js';
import { ScryptQueue } from '../server/identity/limits.js';

describe('password derivation', () => {
  it('verifies exact passwords with independent salts and the specified work factor', async () => {
    const a = await hashPassword(' 1234567890 ');
    const b = await hashPassword(' 1234567890 ');
    expect(a).not.toBe(b);
    const parts = a.split('$');
    expect(parts.slice(0, 5)).toEqual(['scrypt', 'v1', '32768', '8', '3']);
    expect(Buffer.from(parts[5], 'hex')).toHaveLength(16);
    const independentlyDerived = scryptSync(' 1234567890 ', Buffer.from(parts[5], 'hex'), 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
    expect(Buffer.from(parts[6], 'hex')).toEqual(independentlyDerived);
    expect(await verifyPassword(' 1234567890 ', a)).toBe(true);
    expect(await verifyPassword('1234567890', a)).toBe(false);
  });
  it('rejects malformed hashes and unapproved cost parameters', async () => {
    for (const encoded of ['bad', 'scrypt$v1$1048576$8$3$00$00', 'scrypt$v2$32768$8$3$00$00']) {
      expect(await verifyPassword('1234567890', encoded)).toBe(false);
    }
  });
});

describe('bounded scrypt work', () => {
  it('runs two jobs, queues eight, rejects excess, and releases failed jobs', async () => {
    const queue = new ScryptQueue();
    let running = 0; let maximum = 0;
    const releases: Array<() => void> = [];
    const work = async () => {
      running++; maximum = Math.max(maximum, running);
      await new Promise<void>(resolve => releases.push(resolve));
      running--; return 'complete';
    };
    const jobs = Array.from({ length: 10 }, () => queue.run(work));
    const completion = Promise.all(jobs);
    void completion.catch(() => {});
    await expect(queue.run(work)).rejects.toMatchObject({ code: 'AUTH_BUSY', statusCode: 503, retryAfter: 1 });
    expect(running).toBe(2);
    for (let i = 0; i < 10; i++) { releases[i](); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
    expect(await completion).toEqual(Array(10).fill('complete'));
    expect(maximum).toBe(2);
    await expect(queue.run(async () => { throw new Error('derivation failed'); })).rejects.toThrow('derivation failed');
    expect(await queue.run(async () => 'recovered')).toBe('recovered');
  });
});
