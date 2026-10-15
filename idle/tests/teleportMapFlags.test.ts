import { expect, it } from 'vitest';
import { parseTeleportMapFlags } from '../tools/teleport-mapflags.mjs';
it('imports only player noteleport, excluding source monster_noteleport and commented directives', () => {
  expect(parseTeleportMapFlags('//prt_fild08 mapflag noteleport\nprt_in mapflag noteleport\nque_qsch01 mapflag monster_noteleport\nprt_in mapflag noteleport\ngefg_cas01 mapflag noteleport'))
    .toEqual(['gefg_cas01', 'prt_in']);
  expect(() => parseTeleportMapFlags('prt_in mapflag unknown')).toThrow();
});
