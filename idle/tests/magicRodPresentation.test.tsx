import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Catalog } from '../shared/types';
import { getSnapshot } from '../engine';
import Build from '../web/panels/Build';
import { castSetup } from './cast-control-fixture';

afterEach(() => vi.unstubAllGlobals());

function renderMagicRod(blockedSource?: string) {
  vi.stubGlobal('window', { innerWidth: 1200 });
  const { s, c, e } = castSetup();
  const source = (awaitlessCatalog(c));
  s.learnedSkills.sa_advancedbook = 4;
  s.learnedSkills.sa_magicrod = 1;
  delete e.npcCombat!.cast;
  if (blockedSource) {
    s.buffs[blockedSource.toLowerCase()] = { expiresAt: 10000, effects: {} };
  }
  const html = renderToStaticMarkup(createElement(Build, { catalog: c,
    snapshot: getSnapshot(s, c, 100), busy: false, command: async () => true, mode: 'skills' }));
  return html.match(/<article\b[\s\S]*?<\/article>/g)?.find(row => row.includes('Magic Rod')) ?? '';
}

function awaitlessCatalog(c: Catalog) {
  return c.monsters[1175];
}

describe('Magic Rod build controls', () => {
  it('allows pre-arming the manual window before an NPC begins casting', () => {
    const row = renderMagicRod();
    expect(row).toContain('Ativar Magic Rod');
    expect(row).not.toMatch(/disabled=""[^>]*>Ativar Magic Rod/);
    expect(row).toContain('Usar na rotação');
  });

  it.each(['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'NV_TRICKDEAD'])(
    'blocks manual activation while %s is active', source => {
      expect(renderMagicRod(source)).toMatch(/disabled=""[^>]*>Ativar Magic Rod/);
    });
});
