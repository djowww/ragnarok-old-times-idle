#!/usr/bin/env node
/** Export only original client map/BGM metadata. Never copies audio or the source table. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  const name = args[i];
  if (!['--table', '--asset-origin'].includes(name) || !args[i + 1]) {
    throw new Error('Usage: node tools/export-map-bgm.mjs [--table FILE] [--asset-origin URL]');
  }
  options[name] = args[i + 1];
}

const sourcePath = 'data/mp3nametable.txt';
let buffer;
if (options['--table']) {
  buffer = await readFile(resolve(options['--table']));
} else {
  const origin = options['--asset-origin'] ?? 'http://127.0.0.1:8080';
  const response = await fetch(new URL('/' + sourcePath, origin), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Original BGM table unavailable: HTTP ${response.status}`);
  buffer = Buffer.from(await response.arrayBuffer());
}

const tracks = {};
const lines = new TextDecoder('euc-kr').decode(buffer).split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].split('//')[0].trim();
  if (!line) continue;
  const match = line.match(/^([^/\\\s#]+)\.rsw\s*#\s*bgm[\\/]+([^/\\\s#]+\.mp3)\s*#\s*$/i);
  if (!match) throw new Error(`Invalid BGM entry at ${sourcePath}:${i + 1}`);
  // The original client table applies entries in order: the last active row wins.
  tracks[match[1]] = match[2];
}
if (!Object.keys(tracks).length) throw new Error('Original BGM table contains no map entries.');

const metadata = {
  source: { path: sourcePath, sha256: createHash('sha256').update(buffer).digest('hex') },
  tracks: Object.fromEntries(Object.entries(tracks).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
};
await writeFile(resolve(root, 'content/map-bgm.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(`Exported ${Object.keys(tracks).length} maps / ${new Set(Object.values(tracks)).size} tracks to content/map-bgm.json`);
console.log(`${sourcePath} SHA256 ${metadata.source.sha256}`);
