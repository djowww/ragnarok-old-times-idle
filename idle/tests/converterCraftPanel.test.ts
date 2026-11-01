import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConverterCraft from '../web/panels/ConverterCraft';
import CityServices from '../web/panels/CityServices';
import { createInitialState, getSnapshot } from '../engine/index';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types';

function setup() {
  const c = structuredClone(catalogJson) as unknown as Catalog;
  // Presentation fixture only: exporter integration is checked on the actual commands later.
  c.skills.sa_createcon.implementation = 'supported';
  for (const [id, name] of [[7433, 'Pergaminho em Branco'], [904, 'Cauda de Escorpião'], [947, 'Chifre']] as const)
    c.items[id] = { ...c.items[946], id, name, type: 'material', weight: 1 };
  for (const [id, name] of [[12114, 'Conversor de Fogo'], [12115, 'Conversor de Água'], [12116, 'Conversor de Terra'], [12117, 'Conversor de Vento']] as const)
    c.items[id] = { ...c.items[id], name, type: 'material' };
  const s = createInitialState(c, 0); s.job = 'sage'; s.hp = 100; s.sp = 100; s.learnedSkills.sa_createcon = 1;
  s.inventory = [{ uid: 'scroll', itemId: 7433, quantity: 1, cards: [], refine: 0, favorite: false }]; s.equipment = {};
  const render = (busy = false) => renderToStaticMarkup(createElement(ConverterCraft, { catalog: c, snapshot: getSnapshot(s, c, 0), busy, command: async () => true }));
  return { c, s, render };
}
describe('manual converter recipe preview', () => {
  it('shows four elemental recipes, one activation cost, real owned and missing ingredients before producing', () => {
    const { render } = setup(); const html = render();
    for (const name of ['Conversor de Fogo', 'Conversor de Água', 'Conversor de Terra', 'Conversor de Vento', 'Pergaminho em Branco', 'Cauda de Escorpião']) expect(html).toContain(name);
    expect(html).toContain('30 SP'); expect(html).toContain('Faltam 3'); expect(html).toContain('Na mochila: 0');
    expect(html).toContain('disabled=""'); expect(html).toContain('Produzir 1');
  });
  it('offers production only after learning in a valid class with all resources and disables while busy', () => {
    const { s, render } = setup(); s.inventory.push({ uid: 'tail', itemId: 904, quantity: 3, cards: [], refine: 0, favorite: false });
    expect(render()).not.toContain('disabled=""'); expect(render(true)).toContain('disabled=""');
    delete s.learnedSkills.sa_createcon; expect(render()).not.toContain('Produzir 1');
    s.learnedSkills.sa_createcon = 1; s.job = 'mage'; expect(render()).not.toContain('Produzir 1');
  });
  it('shows the same town restriction before submitting a production', () => {
    const { s, render } = setup(); s.status = 'hunting'; expect(render()).toContain('Volte à cidade para produzir conversores.');
  });
  it('opens the converter service with the existing catalog item icon', () => {
    const { c } = setup(); const html = renderToStaticMarkup(createElement(CityServices, { catalog: c, onOpen: () => {} }));
    expect(html).toContain('Conversores elementais'); expect(html).toContain('Receitas do Sábio');
  });
});
