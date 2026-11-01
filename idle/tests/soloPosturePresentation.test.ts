import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState, getSnapshot } from '../engine';
import catalogData from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import Build from '../web/panels/Build';

function setup() {
  const catalog = structuredClone(catalogData) as unknown as Catalog;
  // Candidate UI contract; content promotion is checked separately after runtime gates.
  Object.assign(catalog.skills.nv_trickdead, { implementation: 'supported', manualUse: 'toggle', toggle: true });
  catalog.skills.sa_freecast.implementation = 'supported';
  const state = createInitialState(catalog, 0, 'private posture UI fixture');
  state.status = 'hunting'; state.areaId = 'prontera_south'; state.sp = 20;
  state.learnedSkills.nv_trickdead = 1;
  return { catalog, state };
}
function skillRow(state: GameState, catalog: Catalog, id: string) {
  const html = renderToStaticMarkup(createElement(Build, {
    catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, command: async () => true, mode: 'skills',
  }));
  return html.match(/<article\b[\s\S]*?<\/article>/g)?.find(row => row.includes(catalog.skills[id].name)) ?? '';
}

describe('manual Trick Dead and cast-only Free Cast UI', () => {
  it('offers a clear manual posture action in the field without automatic rotation', () => {
    const { state, catalog } = setup(); const row = skillRow(state, catalog, 'nv_trickdead');
    expect(row).toContain('Fingir de morto</button>');
    expect(row).not.toMatch(/disabled=""[^>]*>Fingir de morto/);
    expect(row).not.toContain('Usar na rotação');
  });
  it.each(['town', 'dead', 'insufficient-sp'] as const)('disables posture activation for %s', reason => {
    const { state, catalog } = setup();
    if (reason === 'town') state.status = 'town';
    if (reason === 'dead') state.hp = 0;
    if (reason === 'insufficient-sp') state.sp = 4;
    expect(skillRow(state, catalog, 'nv_trickdead')).toMatch(/disabled=""[^>]*>Fingir de morto/);
  });
  it('uses modified SP cost and lets an active posture stand up with zero SP', () => {
    const { state, catalog } = setup();
    state.sp = 3; state.buffs.cost_fixture = { expiresAt: 10000, effects: { spCostReductionPct: 40 } };
    expect(skillRow(state, catalog, 'nv_trickdead')).not.toMatch(/disabled=""[^>]*>Fingir de morto/);
    state.sp = 0; state.buffs.nv_trickdead = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    const row = skillRow(state, catalog, 'nv_trickdead');
    expect(row).toContain('Levantar</button>');
    expect(row).not.toMatch(/disabled=""[^>]*>Levantar/);
    expect(row).toContain('aria-pressed="true"');
  });
  it('explains that learned Free Cast applies during casting', () => {
    const { state, catalog } = setup(); state.job = 'sage'; state.learnedSkills.sa_freecast = 1;
    const row = skillRow(state, catalog, 'sa_freecast');
    expect(row).toContain('Passiva · aplicada durante a conjuração');
    expect(row).not.toContain('Passiva · sempre aplicada');
    expect(row).not.toContain('Usar na rotação');
  });
});
