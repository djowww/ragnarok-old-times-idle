import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync(new URL('../../docker/idle-game/Dockerfile', import.meta.url), 'utf8');

describe('non-root runtime image permissions', () => {
  it('makes copied artifacts readable and directories traversable before switching to node', () => {
    const runtime = dockerfile.split('AS runtime')[1]!;
    const normalize = runtime.indexOf('chmod -R a+rX /app');
    const user = runtime.indexOf('USER node');
    expect(normalize).toBeGreaterThanOrEqual(0);
    expect(user).toBeGreaterThan(normalize);
    expect(runtime.slice(normalize, user)).toContain('chown -R node:node /var/cache/ragidle');
  });
});
