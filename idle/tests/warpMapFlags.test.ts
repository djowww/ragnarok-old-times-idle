import { describe, expect, it } from 'vitest';
import { parseWarpMapFlags } from '../tools/warp-mapflags.mjs';

describe('Hercules Warp Portal map flags', () => {
  it('imports only the requested map restriction and ignores comments', () => {
    expect(parseWarpMapFlags('// note\nprt_in mapflag nowarp\nque_qsch01 mapflag nowarp\n', 'nowarp'))
      .toEqual(['prt_in', 'que_qsch01']);
    expect(parseWarpMapFlags('prt_in mapflag nomemo\n', 'nomemo')).toEqual(['prt_in']);
    expect(parseWarpMapFlags('prt_in mapflag nowarpto\n', 'nowarpto')).toEqual(['prt_in']);
  });
  it('rejects unknown or mixed map directives instead of silently weakening checks', () => {
    expect(() => parseWarpMapFlags('prt_in mapflag unknown\n', 'nowarp')).toThrow();
    expect(() => parseWarpMapFlags('prt_in mapflag nomemo\n', 'nowarp')).toThrow();
  });
});
