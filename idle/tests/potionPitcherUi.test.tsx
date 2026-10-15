// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, getSnapshot } from '../engine';
import { skillReadiness } from '../web/App';
import Build from '../web/panels/Build';
import ChatJournal from '../web/components/ChatJournal';
import { combatPopupText, drawDamagePopup } from '../web/assets/sceneEffects';

const catalog = structuredClone(raw) as unknown as Catalog;
for (const sourceName of ['WS_MELTDOWN', 'AM_POTIONPITCHER']) {
  const skill = Object.values(catalog.skills).find(row => row.sourceName === sourceName)!;
  skill.implementation = 'supported'; delete skill.unsupportedReason;
}
function rowFor(host: HTMLElement, skillName: string) {
  return [...host.querySelectorAll<HTMLElement>('.skill-row')]
    .find(row => row.querySelector('h4')?.textContent?.includes(skillName));
}
async function renderBuild(state: ReturnType<typeof createInitialState>, commands: unknown[]) {
  const host = document.createElement('div'), root = createRoot(host);
  await act(async () => root.render(createElement(Build, {
    catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, mode: 'skills',
    command: async command => { commands.push(command); return true; },
  })));
  return { host, root };
}

describe('Potion Pitcher and Meltdown use-level controls', () => {
  it('offers learned level choices, potion names, manual use, and rotation for Potion Pitcher', async () => {
    const state = createInitialState(catalog, 0);
    state.job = 'alchemist'; state.learnedSkills = { am_pharmacy: 3, potion_pitcher: 5 };
    state.rotation = []; state.sp = 200; state.skillUseLevels = {};
    const commands: unknown[] = [], { host, root } = await renderBuild(state, commands);
    try {
      const skill = catalog.skills.potion_pitcher;
      const row = rowFor(host, skill.name)!;
      const select = row.querySelector<HTMLSelectElement>(`select[aria-label="Nível de uso de ${skill.name}"]`)!;
      expect(select.value).toBe('max');
      expect([...select.options].map(option => option.textContent)).toContain(`Nv. 1 · ${catalog.items[501].name}`);
      expect([...select.options].map(option => option.textContent)).toContain(`Nv. 5 · ${catalog.items[505].name}`);
      expect(row.querySelector('select[aria-label="Nível de uso de Pharmacy"]')).toBeNull();
      expect(row.querySelector('h4')?.textContent).toContain('5 / 5');

      await act(async () => { select.value = '1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(commands).toContainEqual({ type: 'setSkillUseLevel', skillId: skill.id, level: 1 });

      state.skillUseLevels = { potion_pitcher: 1 };
      const updated = await renderBuild(state, commands);
      try {
        const selectedRow = rowFor(updated.host, skill.name)!;
        expect(selectedRow.textContent).toContain(`1 ${catalog.items[501].name}`);
        expect(selectedRow.textContent).toContain(`${skill.spCost[0]} SP`);
        expect(selectedRow.querySelector('h4')?.textContent).toContain('5 / 5');
        const use = [...selectedRow.querySelectorAll('button')].find(button => button.textContent?.includes('Usar Nv. 1'))!;
        const rotation = [...selectedRow.querySelectorAll('button')].find(button => button.textContent?.includes('Usar na rotação'))!;
        expect(use.disabled).toBe(false); expect(rotation.disabled).toBe(false);
        await act(async () => use.click());
        await act(async () => rotation.click());
        expect(commands).toContainEqual({ type: 'useSkill', skillId: skill.id });
        expect(commands).toContainEqual({ type: 'setRotation', skillIds: [skill.id] });
      } finally { await act(async () => updated.root.unmount()); }
    } finally { await act(async () => root.unmount()); }
  });

  it('uses the selected Meltdown level for displayed SP, cast, and duration while keeping learned level', async () => {
    const state = createInitialState(catalog, 0);
    state.job = 'whitesmith';
    state.learnedSkills = { ws_meltdown: 10, bs_skintemper: 3, bs_hiltbinding: 1, bs_weaponresearch: 5, bs_overthrust: 3 };
    state.rotation = [];
    state.skillUseLevels = { ws_meltdown: 1 }; state.sp = 500;
    const commands: unknown[] = [], { host, root } = await renderBuild(state, commands);
    try {
      const skill = catalog.skills.ws_meltdown;
      const row = rowFor(host, skill.name)!;
      const select = row.querySelector<HTMLSelectElement>(`select[aria-label="Nível de uso de ${skill.name}"]`)!;
      expect(select.value).toBe('1'); expect(select.options).toHaveLength(11);
      expect(row.querySelector('h4')?.textContent).toContain('10 / 10');
      expect(row.textContent).toContain(`${skill.spCost[0]} SP`);
      expect(row.textContent).toContain(`${((skill.castTimeMs?.[0] ?? 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}s de conjuração`);
      const duration = skill.statusDurationMs?.[0];
      if (duration) expect(row.textContent).toContain(`${duration / 1000}s de duração`);
      const use = [...row.querySelectorAll('button')].find(button => button.textContent?.includes('Usar Nv. 1'))!;
      const rotation = [...row.querySelectorAll('button')].find(button => button.textContent?.includes('Usar na rotação'))!;
      expect(use.disabled).toBe(false); expect(rotation.disabled).toBe(false);
      await act(async () => use.click()); await act(async () => rotation.click());
      expect(commands).toContainEqual({ type: 'useSkill', skillId: skill.id });
      expect(commands).toContainEqual({ type: 'setRotation', skillIds: [skill.id] });
    } finally { await act(async () => root.unmount()); }
  });

  it('uses the selected Pitcher level for shortcut readiness, resource, cost, and ingredient', () => {
    const state = createInitialState(catalog, 0);
    state.job = 'alchemist'; state.learnedSkills = { am_pharmacy: 3, potion_pitcher: 5 };
    const skill = catalog.skills.potion_pitcher;
    const stats = getSnapshot(state, catalog, 0).stats;
    state.hp = stats.maxHp; state.sp = Math.max(1, stats.maxSp); state.skillUseLevels = { potion_pitcher: 1 };
    const red = skillReadiness(skill, state, stats, catalog, 0);
    expect(red.label).toContain(`${skill.spCost[0]} SP`);
    expect(red.label).toContain(catalog.items[501].name);
    expect(red.label).toContain('aguardando HP abaixo de 40%');

    state.skillUseLevels.potion_pitcher = 5;
    const blue = skillReadiness(skill, state, stats, catalog, 0);
    expect(blue.label).toContain(`${skill.spCost[4]} SP`);
    expect(blue.label).toContain(catalog.items[505].name);
    expect(blue.label).toContain('aguardando SP abaixo de 20%');
    expect(blue.label).not.toContain('aguardando HP abaixo de 40%');

    state.autoPotion.hpThreshold = 0; state.skillUseLevels.potion_pitcher = 1;
    const hpAutoDisabled = skillReadiness(skill, state, stats, catalog, 0);
    expect(hpAutoDisabled.label).toContain('cura automática de HP desativada');
    state.autoPotion.hpThreshold = 90;
    const capped = skillReadiness(skill, state, stats, catalog, 0);
    expect(capped.label).toContain('aguardando HP abaixo de 70%');
  });

  it('labels SP restoration in the scene popup and combat log without treating it as HP', async () => {
    const spEvent = { id: 1, at: 0, kind: 'heal', text: 'Recovery', amount: 42, resource: 'sp' as const, target: 'player' as const };
    expect(combatPopupText(spEvent)).toBe('SP +42');
    expect(combatPopupText({ ...spEvent, resource: 'hp' })).toBe('+42');
    expect(combatPopupText({ ...spEvent, resource: undefined })).toBe('+42');

    const ctx = { save() {}, restore() {}, strokeText() {}, fillText() {}, globalAlpha: 1, lineWidth: 0, strokeStyle: '', fillStyle: '', font: '', textAlign: 'left' } as unknown as CanvasRenderingContext2D;
    drawDamagePopup(ctx, null, { text: 'SP +42', target: 'player', resource: 'sp', x: 0, y: 0, elapsedMs: 0 });
    expect(ctx.strokeStyle).toBe('#3979a5'); expect(ctx.fillStyle).toBe('#80caff');

    const state = createInitialState(catalog, 0); state.events = [spEvent];
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    const host = document.createElement('div'), root = createRoot(host);
    try {
      await act(async () => root.render(createElement(ChatJournal, {
        catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, command: async () => true,
        identity: {} as never, onAuthRequired: () => {}, isOpen: true,
      })));
      const row = host.querySelector('.chat-combat-event.event-resource-sp');
      expect(row?.textContent).toContain('Recuperação de SP');
      expect(row?.textContent).toContain('42');
    } finally { await act(async () => root.unmount()); globalThis.ResizeObserver = originalResizeObserver; }
  });
});
