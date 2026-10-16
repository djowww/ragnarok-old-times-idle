// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import data from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, getSnapshot } from '../engine';
import Build from '../web/panels/Build';

const catalog = data as unknown as Catalog;

async function renderBuild(state: ReturnType<typeof createInitialState>) {
  const commands: unknown[] = [];
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(createElement(Build, {
    catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, mode: 'skills',
    command: async command => { commands.push(command); return true; },
  })));
  return { host, root, commands };
}

function setup() {
  const state = createInitialState(catalog, 0);
  state.job = 'mage'; state.jobLevel = 10;
  state.learnedSkills = { fire_bolt: 1, cold_bolt: 1 };
  state.rotation = ['fire_bolt'];
  state.status = 'hunting'; state.areaId = catalog.areas[0].id;
  state.rotationByArea = { [catalog.areas[0].id]: ['cold_bolt'] };
  return state;
}

describe('skill rotation map profile selector', () => {
  it('preselects the active map, displays the right order and saves edits in the selected scope', async () => {
    const state = setup();
    const view = await renderBuild(state);
    try {
      const select = view.host.querySelector<HTMLSelectElement>('[aria-label="Área da rotação automática"]')!;
      const coldBolt = view.host.querySelector<HTMLButtonElement>('.skill-wheel-icon[aria-label^="1: Lanças de Gelo"]')!;
      expect(select.value).toBe(catalog.areas[0].id);
      expect(coldBolt.getAttribute('aria-pressed')).toBe('true');

      await act(async () => {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const fireBolt = view.host.querySelector<HTMLButtonElement>('.skill-wheel-icon[aria-label^="1: Lanças de Fogo"]')!;
      expect(fireBolt.getAttribute('aria-pressed')).toBe('true');

      await act(async () => {
        select.value = catalog.areas[1].id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const coldRow = [...view.host.querySelectorAll('.skill-row')]
        .find(row => row.querySelector('h4')?.textContent?.includes(catalog.skills.cold_bolt.name))!;
      const addColdBolt = [...coldRow.querySelectorAll('button')]
        .find(button => button.textContent === 'Usar na rotação')!;
      await act(async () => addColdBolt.click());

      expect(view.commands.at(-1)).toEqual({
        type: 'setRotation', areaId: catalog.areas[1].id, skillIds: ['fire_bolt', 'cold_bolt'],
      });
      expect(state.rotation).toEqual(['fire_bolt']);
      expect(state.rotationByArea?.[catalog.areas[0].id]).toEqual(['cold_bolt']);
    } finally {
      await act(async () => view.root.unmount());
    }
  });
});
