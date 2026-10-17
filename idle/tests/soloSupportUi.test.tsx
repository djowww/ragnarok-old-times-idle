// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, getSnapshot } from '../engine';
import Build from '../web/panels/Build';

const catalog = rawCatalog as unknown as Catalog;
const cases = [
  ['crusader', 'cr_providence', { al_dp: 5, heal: 5 }],
  ['priest', 'pr_suffragium', { pr_impositio: 2 }],
] as const;

describe('solo support skill controls', () => {
  it.each(cases)('offers manual and AFK controls for %s', async (job, skillId, prerequisites) => {
    const state = createInitialState(catalog, 0);
    state.job = job;
    state.baseLevel = 60;
    state.jobLevel = 50;
    state.sp = 300;
    state.learnedSkills = { ...prerequisites, [skillId]: 3 };
    const skill = catalog.skills[skillId];
    const commands: unknown[] = [];
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(createElement(Build, {
        catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, mode: 'skills',
        command: async command => { commands.push(command); return true; },
      })));
      const row = [...host.querySelectorAll('.skill-row')].find(row =>
        row.querySelector('h4')?.textContent?.includes(skill.name))!;
      const button = (text: string) => [...row.querySelectorAll('button')].find(button => button.textContent === text);
      const manual = button(`Conjurar ${skill.name}`);
      expect(manual).toBeDefined();
      expect(manual!.disabled).toBe(false);
      await act(async () => manual!.click());
      expect(commands).toContainEqual({ type: 'useSkill', skillId });
      const rotation = button('Usar na rotação');
      expect(rotation).toBeDefined();
      expect(rotation!.disabled).toBe(false);
      await act(async () => rotation!.click());
      expect(commands).toContainEqual({ type: 'setRotation', skillIds: [...state.rotation, skillId] });
    } finally {
      await act(async () => root.unmount());
    }
  });
});
