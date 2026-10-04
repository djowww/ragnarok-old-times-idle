#!/usr/bin/env node
/** Explicit local idle wipe. Original RO accounts/characters and volumes are preserved. */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const backupIndex = args.indexOf('--backup');
const backupFile = backupIndex >= 0 ? args[backupIndex + 1] : undefined;
if (!args.includes('--execute') || !backupFile) {
  console.error('Usage: node idle/tools/wipe-profiles.mjs --execute --backup <absolute-private-path.sql>');
  process.exit(2);
}
if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(backupFile)) throw new Error('Backup path must be absolute.');

const compose = (...command) => execFileSync('docker', ['compose', '-p', 'ragidle', ...command], {
  cwd: workspace, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
const database = (program, programArgs) => compose('exec', '-T', 'database', 'sh', '-c',
  'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"\nidle_program=$1\nshift\nexec "$idle_program" --user=root "$MARIADB_DATABASE" "$@"',
  'idle-wipe', program, ...programArgs);
const query = sql => database('mariadb', ['--batch', '--skip-column-names', '-e', sql]);

// Stop all idle writers before taking the recoverable snapshot.
compose('stop', 'idle-game');
const before = Number(query('SELECT COUNT(*) FROM idle_profiles;').trim());
if (!Number.isSafeInteger(before) || before < 0) throw new Error('Invalid profile count.');
const snapshot = database('mariadb-dump', ['--single-transaction', '--hex-blob',
  'idle_profiles', 'idle_commands', 'idle_chat_messages']);
if (!snapshot.includes('CREATE TABLE') || !snapshot.includes('idle_profiles'))
  throw new Error('Backup is not a valid idle SQL snapshot; wipe cancelled.');
const target = resolve(backupFile);
await mkdir(dirname(target), { recursive: true });
// Refuse to replace an earlier recovery file.
await writeFile(target, snapshot, { encoding: 'utf8', flag: 'wx' });
query('START TRANSACTION; DELETE FROM idle_profiles; COMMIT;');
const after = query('SELECT COUNT(*) FROM idle_profiles; SELECT COUNT(*) FROM idle_commands; SELECT COUNT(*) FROM idle_chat_messages;')
  .trim().split(/\s+/).map(Number);
if (after.length !== 3 || after.some(count => count !== 0)) throw new Error('Wipe did not clear every dependent idle table.');
console.log(JSON.stringify({ wipedProfiles: before, remaining: { profiles: after[0], commands: after[1], chat: after[2] }, backup: target }));
console.log('Idle service remains stopped; restart it with the new image.');
