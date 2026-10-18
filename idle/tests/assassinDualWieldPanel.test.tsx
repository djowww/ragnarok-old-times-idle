import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import raw from '../content/catalog.json';
import { createInitialState, getSnapshot } from '../engine/index';
import { classSkills, derivedStats } from '../engine/stats';
import type { Catalog, GameCommand, InventoryEntry } from '../shared/types';
import ClassicEquipment from '../web/components/ClassicEquipment';
import Inventory from '../web/panels/Inventory';

const catalog = raw as unknown as Catalog;
const dagger = Object.values(catalog.items).find(item => item.type === 'equipment' &&
  item.slot === 'weapon' && item.weaponType === 'dagger' && item.twoHanded !== true &&
  item.equipSupported !== false && (!item.allowedClasses.length || item.allowedClasses.includes('assassin')))!;
const entry: InventoryEntry = {
  uid: 'dual-wield-dagger', itemId: dagger.id, quantity: 1, refine: 0,
  cards: [], favorite: false, identified: true,
};
function setup(learned = true) {
  const state = createInitialState(catalog, 0);
  state.job = 'assassin'; state.baseLevel = 99;
  const main: InventoryEntry = { ...entry, uid: 'main-hand-dagger' };
  state.inventory = [{ ...entry }, main]; state.equipment = { weapon: main.uid };
  const right = classSkills(catalog, state.job).map(id => catalog.skills[id])
    .find(skill => skill?.sourceName === 'AS_RIGHT')!;
  if (learned) state.learnedSkills[right.id] = 1;
  return { state, right, snapshot: getSnapshot(state, catalog, 0) };
}
const command = async (_command: GameCommand) => true;

it('offers an explicit left-hand equip action only after Righthand Mastery is learned', () => {
  const { state, snapshot } = setup(true);
  const html = renderToStaticMarkup(createElement(Inventory, { catalog, snapshot, busy: false, command }));
  expect(html).toContain('Equipar na mão esquerda');
  const withoutMastery = setup(false);
  expect(renderToStaticMarkup(createElement(Inventory, {
    catalog, snapshot: withoutMastery.snapshot, busy: false, command,
  }))).not.toContain('Equipar na mão esquerda');
  const noMain = setup(true); noMain.state.equipment.weapon = undefined;
  expect(renderToStaticMarkup(createElement(Inventory, {
    catalog, snapshot: getSnapshot(noMain.state, catalog, 0), busy: false, command,
  }))).not.toContain('Equipar na mão esquerda');
  expect(state.job).toBe('assassin');
});

it('projects the left-hand weapon separately from the right weapon and shield defense', () => {
  const { state } = setup(true);
  const main: InventoryEntry = { ...entry, uid: 'right-dagger' };
  state.inventory = [main, { ...entry }];
  state.equipment = { weapon: main.uid, shield: entry.uid };
  const stats = derivedStats(state, catalog);
  expect(stats.weaponAttack).toBe(dagger.attack);
  expect(stats.leftWeaponAttack).toBe(dagger.attack);
  expect(stats.leftWeaponType).toBe('dagger');
});

it('labels a left-hand weapon as the left hand, not a shield', () => {
  const { state } = setup(true);
  state.equipment.shield = entry.uid;
  const html = renderToStaticMarkup(createElement(ClassicEquipment, {
    catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, command,
    onInventory: () => undefined,
  }));
  expect(html).toContain('Desequipar Mão esquerda:');
});
