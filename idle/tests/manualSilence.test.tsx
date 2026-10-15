import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { createInitialState, getSnapshot } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { executeCommand } from '../engine/commands.js';
import { derivedStats } from '../engine/stats.js';
import Build from '../web/panels/Build';

const manualSkills = [
  ['MO_BLADESTOP', 'monk', 'Ativar Parada da Lâmina'],
  ['SA_MAGICROD', 'sage', 'Ativar Magic Rod'],
  ['PA_SACRIFICE', 'paladin', 'Ativar Sacrifício'],
] as const;

function setup(source: string, job: string) {
  const catalog = structuredClone(rawCatalog) as unknown as Catalog;
  const state = createInitialState(catalog, 0, 'manual-silence-fixture');
  state.job = job; state.baseLevel = 70; state.jobLevel = 50; state.status = 'challenge';
  state.rotation = [];
  state.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  const skill = Object.values(catalog.skills).find(row => row.sourceName === source)!;
  state.learnedSkills[skill.id] = 1;
  for (const requirement of skill.prerequisitesByClass?.[job] ?? skill.prerequisites ?? [])
    state.learnedSkills[requirement.skillId] = requirement.level;
  state.combatEffects = { spiritSpheres: 1 };
  const stats = derivedStats(state, catalog);
  state.hp = stats.maxHp; state.sp = stats.maxSp;
  beginBattle(state, catalog, 1002, 0, 'mastering');
  return { state, catalog, skill };
}

afterEach(() => vi.unstubAllGlobals());

describe('source status_check_skilluse: explicit manual Silence gate', () => {
  for (const [source, job, button] of manualSkills) {
    it(`${source} rejects active Silence before any state mutation`, () => {
      const { state, catalog, skill } = setup(source, job);
      state.playerStatuses = { SC_SILENCE: { level: 1, startsAt: 50, expiresAt: 200 } };
      const before = structuredClone(state);
      expect(() => executeCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 100))
        .toThrowError(expect.objectContaining({ code: 'SKILL_STATUS_BLOCKED' }));
      expect(state).toEqual(before);
    });

    it(`${source} keeps a valid use available before Silence starts and at its expiry`, () => {
      for (const [startsAt, expiresAt] of [[101, 200], [50, 100]]) {
        const { state, catalog, skill } = setup(source, job);
        state.playerStatuses = { SC_SILENCE: { level: 1, startsAt, expiresAt } };
        const beforeSp = state.sp;
        expect(() => executeCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 100)).not.toThrow();
        expect(state.sp).toBe(beforeSp - skill.spCost[0]);
        expect(state.events.at(-1)?.skillId).toBe(skill.id);
      }
    });

    it(`${source} leaves Blind outside the Silence gate`, () => {
      const { state, catalog, skill } = setup(source, job);
      state.playerStatuses = { SC_BLIND: { level: 1, startsAt: 50, expiresAt: 200 } };
      expect(() => executeCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 100)).not.toThrow();
    });

    it(`${source} disables its manual button only during active Silence`, () => {
      vi.stubGlobal('window', { innerWidth: 1200 });
      for (const [startsAt, expiresAt, blocked] of [[50, 200, true], [101, 200, false], [50, 100, false]] as const) {
        const { state, catalog } = setup(source, job);
        state.playerStatuses = { SC_SILENCE: { level: 1, startsAt, expiresAt } };
        const markup = renderToStaticMarkup(createElement(Build, { catalog,
          snapshot: getSnapshot(state, catalog, 100), busy: false, mode: 'skills', command: async () => true }));
        const tag = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
          .find(match => match[2].includes(button));
        expect(tag, button).toBeDefined();
        expect(/\bdisabled=/.test(tag![1])).toBe(blocked);
      }
    });
  }
});
