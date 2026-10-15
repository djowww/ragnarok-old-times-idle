import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState, getSnapshot } from '../engine';
import catalogData from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import Build from '../web/panels/Build';

const catalog = catalogData as unknown as Catalog;

describe('Guardian and Sacrifice skill panel', () => {
  it('shows the Shrink toggle and Sacrifice charge count from current combat state', () => {
    const state = createInitialState(catalog, 0, 'private presentation fixture');
    state.job = 'paladin';
    state.learnedSkills.cr_autoguard = 10;
    state.learnedSkills.cr_shrink = 1;
    state.learnedSkills.pa_sacrifice = 5;
    state.combatEffects = { sacrifice: { level: 5, charges: 3 } };
    const html = renderToStaticMarkup(createElement(Build, {
      catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, command: async () => true, mode: 'skills',
    }));
    expect(html).toContain('Encolher');
    expect(html).toContain('Ativar');
    expect(html).toContain('Cargas de Sacrifício: 3 / 5');
    expect(html).toContain('Usar na rotação');
  });

  it('offers manual Sacrifice activation and refill without making the skill a toggle', () => {
    const candidate = structuredClone(catalog) as Catalog;
    candidate.skills.pa_sacrifice.manualUse = 'activate';
    const state = createInitialState(candidate, 0, 'private manual activation fixture');
    state.job = 'paladin'; state.status = 'challenge';
    state.status = 'town'; state.sp = 200; state.learnedSkills.pa_sacrifice = 5; state.learnedSkills.cr_devotion = 3;
    state.learnedSkills.cr_trust = 5; state.learnedSkills.sm_endure = 1;
    const render = () => renderToStaticMarkup(createElement(Build, {
      catalog: candidate, snapshot: getSnapshot(state, candidate, 0), busy: false, command: async () => true, mode: 'skills',
    }));

    expect(render()).toContain('Ativar Sacrifício');
    expect(render()).not.toMatch(/disabled="">Ativar Sacrifício/);
    state.buffs.pa_sacrifice = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    state.combatEffects = { sacrifice: { level: 5, charges: 2 } };
    expect(render()).toContain('Repor cargas');
    expect(render()).toContain('Cargas de Sacrifício: 2 / 5');
    expect(render()).not.toContain('Desativar</button>');
  });
});
