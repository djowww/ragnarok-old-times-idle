// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getSnapshot } from '../engine';
import Build from '../web/panels/Build';
import { skillReadiness } from '../web/App';
import { rogueSetup } from './rogue-copy-fixture';

function setup() {
  const x = rogueSetup(); x.s.job = 'stalker'; x.s.skillPoints = 10;
  x.s.copiedSkill = { skillId: 'fire_bolt', level: 4 };
  x.s.learnedSkills.st_preserve = 1; x.s.rotation = []; return x;
}
describe('copied spell in the actual skill panel', () => {
  it('uses the copied level for the actual shortcut SP and cooldown tooltip', () => {
    const { s, c } = setup(); s.sp = c.skills.fire_bolt.spCost[3] - 1; s.skillReadyAt.fire_bolt = 5100;
    const snapshot = getSnapshot(s, c, 100);
    const readiness = skillReadiness(c.skills.fire_bolt, s, snapshot.stats, c, 100);
    expect(readiness.label).toContain('Nv. 4'); expect(readiness.label).toContain(`${c.skills.fire_bolt.spCost[3]} SP`);
    expect(readiness.label).toContain('SP insuficiente'); expect(readiness.cooldownRemaining).toBe(5000); expect(readiness.ready).toBe(false);
  });
  it('explains why the automatic Preserve waits before acquiring a copy', () => {
    const { s, c } = setup(); delete s.copiedSkill;
    const readiness = skillReadiness(c.skills.st_preserve, s, getSnapshot(s, c, 100).stats, c, 100);
    expect(readiness.label).toContain('aguardando magia copiada'); expect(readiness.ready).toBe(false);
  });
  it('shows original icon and copied level without a learning button or permanent points', () => {
    const { s, c } = setup();
    const html = renderToStaticMarkup(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, 100),
      busy: false, command: async () => true, mode: 'skills' }));
    const doc = document.createElement('div'); doc.innerHTML = html;
    const row = [...doc.querySelectorAll('.skill-row')].find(row => row.textContent!.includes(c.skills.fire_bolt.name))!;
    expect(row).toBeDefined(); expect(row.textContent).toContain('Copiada'); expect(row.textContent).toContain('4 / 10');
    expect(row.querySelector('.skill-icon')).not.toBeNull();
    expect(row.textContent).not.toContain('1 pt'); expect(row.textContent).not.toContain('Aprender'); expect(row.textContent).not.toContain('Melhorar');
    expect(row.textContent).toContain(`${c.skills.fire_bolt.spCost[3]} SP`);
    expect(s.learnedSkills.fire_bolt).toBeUndefined(); expect(s.skillPoints).toBe(10);
  });
  it('sends only the chosen rotation command from the copied row', async () => {
    const { s, c } = setup(), commands: unknown[] = [];
    const host = document.createElement('div'), root = createRoot(host); document.body.append(host);
    try {
      await act(async () => root.render(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, 100), busy: false,
        command: async value => { commands.push(value); return true; }, mode: 'skills' })));
      const row = [...host.querySelectorAll('.skill-row')].find(row => row.textContent!.includes(c.skills.fire_bolt.name))!;
      const button = [...row.querySelectorAll('button')].find(button => button.textContent === 'Usar na rotação')!;
      expect(button.disabled).toBe(false); await act(async () => button.click());
      expect(commands).toEqual([{ type: 'setRotation', skillIds: ['fire_bolt'] }]);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it('does not duplicate an own tree row when the temporary level overlays a paid skill', () => {
    const { s, c } = setup(); c.classes.stalker.skills.push('fire_bolt'); s.learnedSkills.fire_bolt = 1;
    const html = renderToStaticMarkup(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, 100), busy: false,
      command: async () => true, mode: 'skills' }));
    const doc = document.createElement('div'); doc.innerHTML = html;
    const rows = [...doc.querySelectorAll('.skill-row')].filter(row => row.querySelector('h4')!.textContent!.includes(c.skills.fire_bolt.name));
    expect(rows).toHaveLength(1); expect(rows[0].textContent).toContain('Copiada');
    expect(rows[0].textContent).toContain('4 / 10'); expect(s.learnedSkills.fire_bolt).toBe(1);
  });
  it('shows the active Preserve duration and omits invalid copied slots', () => {
    const { s, c } = setup(); s.buffs.st_preserve = { startsAt: 0, expiresAt: 120100, effects: {} };
    const render = () => renderToStaticMarkup(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, 100),
      busy: false, command: async () => true, mode: 'skills' }));
    expect(render()).toContain('Preservar ativo · 120 s');
    s.copiedSkill!.level = 0; expect(render()).not.toContain('Copiada');
  });
});
