// @vitest-environment jsdom
import { act } from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import { createInitialState, getSnapshot } from '../engine';
import type { Catalog, GameState } from '../shared/types';
import Inventory from '../web/panels/Inventory';

const catalog = catalogJson as unknown as Catalog;

function render(state: GameState, commands: unknown[] = []) {
  return renderToStaticMarkup(createElement(Inventory, {
    catalog,
    snapshot: getSnapshot(state, catalog, 100),
    busy: false,
    command: async (value) => { commands.push(value); return true; },
  }));
}

describe('mochila e itens aguardando espaço', () => {
  it('mostra peso atual, limite e a razão do retorno automático', () => {
    const state = createInitialState(catalog, 0);
    state.carryReturnAt = 90;
    const html = render(state);

    expect(html).toContain('Peso 265 / 2.030');
    expect(html).toContain('Prontera');
    expect(html).toContain('limite de peso');
  });

  it('mostra pendências com ícone, quantidade e origem, e recolhe em Prontera', () => {
    const state = createInitialState(catalog, 0);
    state.pendingLoot = [{
      entry: { uid: 'pending-1', itemId: 501, quantity: 3, refine: 0, cards: [], favorite: false },
      acquiredAt: 10,
      source: 'monster',
      areaId: 'prontera-field',
      monsterId: 1002,
    }];
    const commands: unknown[] = [];
    const html = render(state, commands);

    expect(html).toContain('Aguardando espaço');
    expect(html).toContain('3 un.');
    expect(html).toContain('item-icon');
    expect(html).toContain('Monstro');
    expect(html).toContain('Recolher itens');
  });

  it('mostra equipamento não identificado sem revelar nome nem raridade', () => {
    const state = createInitialState(catalog, 0);
    state.inventory = [];
    state.equipment = {};
    state.pendingLoot = [{
      entry: { uid: 'pending-gear', itemId: 1201, quantity: 1, refine: 0, cards: [], favorite: false,
        identified: false, rarity: 'legendary', rarityBonus: { stat: 'dex', value: 5 } },
      acquiredAt: 10,
      source: 'reward',
    }];
    const html = render(state);

    expect(html).toContain('Arma não identificada');
    expect(html).not.toContain(catalog.items[1201].name);
    expect(html).not.toContain('Lendário');
  });

  it('explica que itens pendentes só podem ser recolhidos na cidade', () => {
    const state = createInitialState(catalog, 0);
    state.status = 'hunting';
    state.pendingLoot = [{
      entry: { uid: 'pending-1', itemId: 501, quantity: 1, refine: 0, cards: [], favorite: false },
      acquiredAt: 10,
      source: 'quest',
    }];
    const html = render(state);

    expect(html).toContain('Prontera');
    expect(html).toContain('disabled');
  });

  it('envia apenas o comando sem argumentos ao tocar em recolher', async () => {
    const state = createInitialState(catalog, 0);
    state.pendingLoot = [{
      entry: { uid: 'pending-1', itemId: 501, quantity: 1, refine: 0, cards: [], favorite: false },
      acquiredAt: 10,
      source: 'monster',
    }];
    const commands: unknown[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Inventory, {
      catalog,
      snapshot: getSnapshot(state, catalog, 100),
      busy: false,
      command: async (value) => { commands.push(value); return true; },
    })));
    await act(async () => {
      host.querySelector<HTMLButtonElement>('.pending-loot-heading button')!.click();
    });

    expect(commands).toEqual([{ type: 'collectPendingLoot' }]);
    await act(async () => root.unmount());
    host.remove();
  });
});
