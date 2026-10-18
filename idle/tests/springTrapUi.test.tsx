// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import data from '../content/catalog.json';
import type { Battle, Catalog } from '../shared/types';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { createInitialState, getSnapshot } from '../engine';
import { beginBattle } from '../engine/encounters';
import Build from '../web/panels/Build';

const catalog = data as unknown as Catalog;
async function render(state: ReturnType<typeof createInitialState>) {
  const commands: unknown[] = [], host = document.createElement('div'), root = createRoot(host);
  await act(async () => root.render(createElement(Build, {
    catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, mode: 'skills',
    command: async command => { commands.push(command); return true; },
  })));
  const row = [...host.querySelectorAll('.skill-row')]
    .find(candidate => candidate.querySelector('h4')?.textContent?.includes(catalog.skills.ht_springtrap.name))!;
  return { commands, host, root, row };
}
function setup() {
  const state = createInitialState(catalog, 0);
  state.job = 'hunter'; state.status = 'challenge'; state.falconEquipped = true;
  state.learnedSkills = { ht_removetrap: 1, ht_falcon: 1, ht_landmine: 1, ht_springtrap: 1 };
  beginBattle(state, catalog, 1002, 0, 'mastering');
  state.battle!.playerNextAttackAt = state.battle!.playerNextSkillAt = 999999;
  state.battle!.traps = [{
    id: 'spring-ui-trap', skillId: 'ht_landmine', level: 1,
    position: { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y },
    placedAt: 0, nextTickAt: 999999, expiresAt: 30000,
  }];
  return state;
}
describe('Spring Trap skill control', () => {
  it('offers an enabled manual action for an equipped Falcon and active trap', async () => {
    const view = await render(setup());
    try {
      const button = [...view.row.querySelectorAll('button')].find(candidate => candidate.textContent?.includes('Spring Trap'))!;
      expect(button).toBeDefined();
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
      expect(view.commands).toContainEqual({ type: 'useSkill', skillId: 'ht_springtrap' });
    } finally {
      await act(async () => view.root.unmount());
    }
  });
});
