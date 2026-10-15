import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it.each(['compose.yaml'])('forwards the explicit trusted proxy allowlist in %s', async name => {
  const compose = await readFile(new URL(`../../${name}`, import.meta.url), 'utf8');
  const game = compose.split('  idle-game:')[1].split(/^  [a-z]/m)[0];
  expect(game).toContain('RAGIDLE_TRUSTED_PROXY_ADDRESSES: ${RAGIDLE_TRUSTED_PROXY_ADDRESSES:-}');
});

