import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it.each(['compose.yaml', 'compose.production.yaml'])('forwards the explicit trusted proxy allowlist in %s', async name => {
  const compose = await readFile(new URL(`../../${name}`, import.meta.url), 'utf8');
  const game = compose.split('  idle-game:')[1].split(/^  [a-z]/m)[0];
  expect(game).toContain('RAGIDLE_TRUSTED_PROXY_ADDRESSES: ${RAGIDLE_TRUSTED_PROXY_ADDRESSES:-}');
});

it('documents a public portal origin for the production entrypoint', async () => {
  const compose = await readFile(new URL('../../compose.production.yaml', import.meta.url), 'utf8');
  const example = await readFile(new URL('../../.env.production.example', import.meta.url), 'utf8');
  expect(compose).toContain('PUBLIC_ORIGIN: ${PUBLIC_ORIGIN:?Defina PUBLIC_ORIGIN}');
  expect(example).toContain('PUBLIC_ORIGIN=https://tibia74.tech:8443');
});
