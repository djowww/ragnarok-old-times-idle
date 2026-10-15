import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Catalog, SenseInspectionResult } from '../shared/types';
import catalogData from '../content/catalog.json';
import Build from '../web/panels/Build';
import { senseInspectCommand } from '../web/panels/Build';
import SenseInspection, { senseInspectionDismissalMatches } from '../web/panels/SenseInspection';
import { castSetup } from './cast-control-fixture';

beforeEach(() => {
  vi.stubGlobal('window', { innerWidth: 1200 });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, get length() { return 0; } });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const { s, c } = castSetup();
  const real = catalogData as unknown as Catalog;
  const sense = structuredClone(real.skills.sense);
  sense.implementation = 'supported';
  sense.manualUse = 'inspect' as never;
  c.skills.sense = sense;
  if (!c.classes.sage.skills.includes('sense')) c.classes.sage.skills.push('sense');
  s.job = 'sage';
  s.learnedSkills.sense = 1;
  s.status = 'challenge';
  s.sp = 10;
  return { s, c };
}

function senseRow(s: ReturnType<typeof setup>['s'], c: Catalog) {
  const html = renderToStaticMarkup(createElement(Build, {
    catalog: c,
    snapshot: {
      state: s,
      stats: { maxHp: 1000, maxSp: 100, attack: 1, magicAttack: [1, 1], def: 0, mdef: 0,
        hit: 0, flee: 0, crit: 0, attackMotionMs: 1000, attackIntervalMs: 1000, effects: {} },
      serverTime: 0, catalogVersion: 'test', availableClasses: [], offlineSummary: null,
    },
    busy: false,
    command: async () => true,
    mode: 'skills',
  }));
  return html.match(/<article\b[\s\S]*?<\/article>/g)?.find(row => row.includes(c.skills.sense.name)) ?? '';
}

function capturedInspection(s: ReturnType<typeof setup>['s']) {
  const target = s.battle!.enemies![0];
  s.senseInspection = {
    sourceSkill: 'WZ_ESTIMATION', actorId: target.id, monsterId: target.monsterId,
    areaId: s.areaId, challengeId: s.battle!.challengeId, observedAt: 2000,
    classId: target.monsterId, level: 12, size: 'medium', currentHp: 1200,
    def: 21, race: 'Brute', mdef: 7, element: 'Fire', elementLevel: 2,
    elementRates: [100, 80, 125, 90, 100, 75, 100, 100, 100],
  } satisfies SenseInspectionResult;
}

function inspectionMarkup(s: ReturnType<typeof setup>['s'], c: Catalog) {
  return renderToStaticMarkup(createElement(SenseInspection, {
    catalog: c,
    snapshot: {
      state: s,
      stats: { maxHp: 1000, maxSp: 100, attack: 1, magicAttack: [1, 1], def: 0, mdef: 0,
        hit: 0, flee: 0, crit: 0, attackMotionMs: 1000, attackIntervalMs: 1000, effects: {} },
      serverTime: 2000, catalogVersion: 'test', availableClasses: [], offlineSummary: null,
    },
  }));
}

describe('Sentido Sobrenatural presentation', () => {
  it('binds the manual request to the exact actor selected in the battle', () => {
    expect(senseInspectCommand('sense', 'actor-current')).toEqual({
      type: 'useSkill', skillId: 'sense', expectedEnemyId: 'actor-current',
    });
  });

  it('offers a manual inspect action for the exact selected live enemy and never adds it to AFK rotation', () => {
    const { s, c } = setup();
    expect(s.battle?.targetId).toBe(s.battle?.enemies?.[0]?.id);
    const row = senseRow(s, c);
    expect(row).toContain('Examinar');
    expect(row).not.toContain('Usar na rotação');
    expect(row).not.toMatch(/disabled=""[^>]*>Examinar/);
  });

  it.each(['missing-selection', 'insufficient-sp', 'unlearned', 'wrong-class', 'dead', 'out-of-range', 'silenced', 'active-cast', 'unsupported'] as const)('disables or omits inspection for %s', reason => {
    const { s, c } = setup();
    if (reason === 'missing-selection') s.battle!.targetId = 'missing-enemy';
    if (reason === 'insufficient-sp') s.sp = 9;
    if (reason === 'unlearned') delete s.learnedSkills.sense;
    if (reason === 'wrong-class') s.job = 'priest';
    if (reason === 'dead') s.battle!.enemies![0].hp = 0;
    if (reason === 'out-of-range') {
      const target = s.battle!.enemies![0];
      target.position.x += 1;
      target.approachFrom = { ...target.position };
      target.arrivedAt = target.startedAt;
    }
    if (reason === 'silenced') s.playerStatuses = { SC_SILENCE: { startsAt: 0, expiresAt: 1000, level: 1 } };
    if (reason === 'active-cast') s.battle!.cast = {
      skillId: 'fire_bolt', level: 1, targetId: s.battle!.targetId!, startedAt: 0, endsAt: 1000, actionId: 'active-cast',
    };
    if (reason === 'unsupported') c.skills.sense.implementation = 'unsupported';
    const row = senseRow(s, c);
    if (reason === 'wrong-class') expect(row).toBe('');
    else expect(row).toMatch(/disabled=""[^>]*>Examinar/);
  });

  it('uses modified SP for readiness', () => {
    const { s, c } = setup();
    s.sp = 6;
    s.buffs.cost_fixture = { expiresAt: 10000, effects: { spCostReductionPct: 40 } };
    expect(senseRow(s, c)).not.toMatch(/disabled=""[^>]*>Examinar/);
  });

  it('shows the captured instance reading in its own movable panel without inventing maximum HP', () => {
    const { s, c } = setup();
    capturedInspection(s);
    s.battle!.enemies![0].hp = 900;
    const html = inspectionMarkup(s, c);
    expect(html).toContain('role="dialog" aria-label="Inspeção:');
    expect(html).toContain('aria-label="Mover inspeção de monstro"');
    expect(html).toContain('aria-label="Fechar inspeção"');
    expect(html).toContain('HP atual');
    expect(html).toContain('1.200');
    expect(html).not.toContain('1.000');
    expect(html).toContain('Água: 100%');
    expect(html).toContain('Morto-vivo: 100%');
    expect(html).toContain('Bruto');
    expect(html).toContain('Médio');
    expect(html).toContain('Fogo Nv. 2');
  });

  it('dismisses only the captured actor reading and allows a later capture to reopen', () => {
    const { s } = setup();
    capturedInspection(s);
    const inspection = s.senseInspection!;
    const dismissed = `${inspection.actorId}:${inspection.observedAt}`;
    expect(senseInspectionDismissalMatches(inspection, dismissed)).toBe(true);
    expect(senseInspectionDismissalMatches({ ...inspection, observedAt: inspection.observedAt + 1 }, dismissed)).toBe(false);
    expect(senseInspectionDismissalMatches({ ...inspection, actorId: 'different-actor' }, dismissed)).toBe(false);
    expect(senseInspectionDismissalMatches(undefined, dismissed)).toBe(false);
  });

  it('keeps the captured actor reading while selection changes, then hides it when that actor dies', () => {
    const { s, c } = setup();
    capturedInspection(s);
    const original = s.battle!.enemies![0];
    c.monsters[1002] = { ...c.monsters[original.monsterId], id: 1002, name: 'Alvo selecionado' };
    s.battle!.enemies!.push({ ...structuredClone(original), id: 'second-actor', monsterId: 1002 });
    s.battle!.targetId = 'second-actor';
    let html = inspectionMarkup(s, c);
    expect(html).toContain(c.monsters[original.monsterId].name);
    expect(html).not.toContain('Alvo selecionado');
    original.hp = 0;
    html = inspectionMarkup(s, c);
    expect(html).toBe('');
  });
});
