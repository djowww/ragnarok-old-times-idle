import { describe, expect, it } from 'vitest';
import { parseMapSpawnScript, validateMapSpawnSelections } from '../tools/mapSpawns.mjs';
describe('pinned map spawn validation', () => {
  const source = '// ignored,0,0\tmonster\tWrong\t9999,1\norc01,0,0,0,0\tmonster\tOrc Zombie\t1153,20,0,0,0\norc01,0,0,0,0\tboss_monster\tBoss\t1002,1,3600000,0,0\n';
  it('reads native tab-separated entries without importing comments', () => {
    const maps = parseMapSpawnScript(source);
    expect([...maps.get('orc01')!]).toEqual([1153,1002]); expect(maps.has('ignored')).toBe(false);
  });
  it('rejects every selected map without an audited source', () => {
    expect(() => validateMapSpawnSelections([{id:'unknown',map:'missing',monsters:[1153]}],parseMapSpawnScript(source))).toThrow(/no pinned spawn script/);
  });
  it('rejects cross-map monsters and accepts the native selection', () => {
    expect(() => validateMapSpawnSelections([{id:'orc',map:'orc01',monsters:[1023]}],parseMapSpawnScript(source))).toThrow(/not spawned/);
    expect(() => validateMapSpawnSelections([{id:'orc',map:'orc01',monsters:[1153]}],parseMapSpawnScript(source))).not.toThrow();
  });
});
