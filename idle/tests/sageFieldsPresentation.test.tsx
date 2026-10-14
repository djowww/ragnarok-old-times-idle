import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, getSnapshot } from '../engine';
import { derivedStats } from '../engine/stats';
import Build from '../web/panels/Build';
afterEach(() => vi.unstubAllGlobals());
function render(id: string, silenced = false, casting = false) {
  vi.stubGlobal('window', { innerWidth: 1200 });
  const c = structuredClone(raw) as unknown as Catalog, s = createInitialState(c, 0);
  s.job = 'sage'; s.baseLevel = 70; s.jobLevel = 50; s.rotation = []; s.learnedSkills[id] = 5;
  const d = derivedStats(s, c); s.hp = d.maxHp; s.sp = d.maxSp;
  if (silenced) s.playerStatuses = { SC_SILENCE: { level: 1, startsAt: 0, expiresAt: 1000 } };
  if (casting) s.supportCast = { skillId: id, level: 5, startedAt: 0, endsAt: 5000, actionId: 'qa-field-cast' };
  return renderToStaticMarkup(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, 100),
    busy: false, command: async () => true, mode: 'skills' }))
    .match(/<article\b[\s\S]*?<\/article>/g)?.find(row => row.includes(`<h4>${c.skills[id].name} `)) ?? '';
}
describe('usable Sage field controls', () => {
  it.each(['sa_volcano', 'sa_deluge', 'sa_violentgale'])('offers manual and AFK use for %s', id => {
    const html = render(id);
    expect(html).toContain('Conjurar campo');
    expect(html).not.toMatch(/disabled=""[^>]*>Conjurar campo/);
    expect(html).toContain('Usar na rotação');
  });
  it.each(['sa_volcano', 'sa_deluge', 'sa_violentgale'])('blocks manual %s while Silenced', id => {
    expect(render(id, true)).toMatch(/disabled=""[^>]*>Conjurar campo/);
  });
  it('shows actual cast progress and prevents overlapping casts', () => {
    const html = render('sa_deluge', false, true);
    expect(html).toContain('Conjurando…');
    expect(html).toContain('Conjuração de Dilúvio');
  });
});
