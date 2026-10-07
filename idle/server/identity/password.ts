import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ScryptQueue } from './limits.js';

const derive = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const queue = new ScryptQueue();
const prefix = 'scrypt$v1$32768$8$3';

export async function hashPassword(password: string): Promise<string> {
  return queue.run(async () => {
    const salt = randomBytes(16);
    const key = await derive(password, salt, 64, parameters);
    return `${prefix}$${salt.toString('hex')}$${key.toString('hex')}`;
  });
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  // Only the version/cost supported by this server may request expensive work.
  const match = /^scrypt\$v1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  return queue.run(async () => {
    const key = await derive(password, Buffer.from(match[1], 'hex'), 64, parameters);
    return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
  });
}
