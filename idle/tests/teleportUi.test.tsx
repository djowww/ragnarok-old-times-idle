// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, getSnapshot } from '../engine';
import Build from '../web/panels/Build';
import { BATTLE_HERO } from '../shared/battleSpatial';
const c = raw as unknown as Catalog;
describe('manual Teleport controls', () => {
  it.each([1, 2])('offers explicit learned-level%s choices and no AFK rotation', async level => {
    const s = createInitialState(c, 0); s.job = 'acolyte'; s.baseLevel = 50; s.stats.int = 50;
    s.learnedSkills = { al_teleport: level, al_ruwach: 1 }; s.sp = 100;
    s.status = 'hunting'; s.areaId = 'prontera_south';
    s.fieldHero = { areaId: s.areaId, from: BATTLE_HERO, position: BATTLE_HERO,
      startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'seeking' };
    const commands: unknown[] = [], host = document.createElement('div'), root = createRoot(host);
    try {
      await act(async () => root.render(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, 0), busy: false,
        mode: 'skills', command: async command => { commands.push(command); return true; } })));
      const row = [...host.querySelectorAll('.skill-row')].find(row => row.querySelector('h4')?.textContent?.includes('Teleporte'))!;
      expect(row).toBeDefined(); expect(row.querySelector('.skill-icon')).not.toBeNull();
      expect(row.textContent).not.toContain('Usar na rotação');
      const buttons = [...row.querySelectorAll('button')];
      const random = buttons.find(button => button.textContent?.includes('Teleportar no mapa'))!;
      expect(random).toBeDefined(); expect(random.disabled).toBe(false);
      expect(row.textContent).toContain(`${level === 1 ? 10 : 9} SP`);
      await act(async () => random.click()); expect(commands).toEqual([{ type: 'teleport', destination: 'random' }]);
      const save = buttons.find(button => button.textContent?.includes('Voltar a Prontera'));
      if (level === 1) expect(save).toBeUndefined();
      else { expect(save?.disabled).toBe(false); await act(async () => save!.click());
        expect(commands.at(-1)).toEqual({ type: 'teleport', destination: 'save' }); }
    } finally { await act(async () => root.unmount()); }
  });
  it.each(['town', 'sp', 'cast', 'silence', 'busy', 'sourceDelay'])('disables teleport for %s', async mode => {
    const s = createInitialState(c, 0); s.job = 'acolyte'; s.learnedSkills = { al_teleport: 2, al_ruwach: 1 };
    s.status = 'hunting'; s.areaId = 'prontera_south'; s.sp = mode === 'sp' ? 0 : 10;
    s.fieldHero = { areaId: s.areaId, from: BATTLE_HERO, position: BATTLE_HERO, startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'seeking' };
    if (mode === 'town') s.status = 'town';
    if (mode === 'cast') s.supportCast = { skillId: 'al_heal', level: 1, startedAt: 0, endsAt: 500, actionId: 'cast' };
    if (mode === 'sourceDelay') Object.assign(s, { playerCanActAt: 500 });
    if (mode === 'silence') s.playerStatuses = { SC_SILENCE: { startsAt: 0, expiresAt: 500, level: 1, sourceActorId: 'mob' } };
    const host = document.createElement('div'), root = createRoot(host);
    try {
      await act(async () => root.render(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, 0), busy: mode === 'busy',
        mode: 'skills', command: async () => true })));
      const row = [...host.querySelectorAll('.skill-row')].find(row => row.querySelector('h4')?.textContent?.includes('Teleporte'))!;
      const buttons = [...row.querySelectorAll('button')].filter(button => /Teleportar no mapa|Voltar a Prontera/.test(button.textContent ?? ''));
      expect(buttons).toHaveLength(2); expect(buttons.every(button => button.disabled)).toBe(true);
    } finally { await act(async () => root.unmount()); }
  });
});
