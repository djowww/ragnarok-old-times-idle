import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import manifestJson from '../content/source-manifest.json';
import type { Catalog } from '../shared/types';
import { weaponAssetPath, weaponAttackAction } from '../web/assets/weapon';
import { decodeACT } from '../web/assets/action';
import { addItem } from '../engine/state';
import { applyCommand, createInitialState } from '../engine';
import { derivedStats } from '../engine/stats';

const catalog = catalogJson as unknown as Catalog;

describe('Sage book weapon foundation', () => {
  it('exports source Book with legal classes, size, and class attack delay', () => {
    const book = catalog.items[1550];
    expect(book).toMatchObject({ type: 'equipment', slot: 'weapon', weaponType: 'book', attack: 85,
      allowedClasses: expect.arrayContaining(['sage', 'professor', 'priest', 'high_priest']) });
    expect(book.allowedClasses).not.toContain('mage');
    expect(catalog.sizeModifiers?.book).toEqual({ small: 100, medium: 100, large: 50 });
    expect(catalog.classes.sage.weaponAspd?.book).toBeGreaterThan(0);
    expect(catalog.classes.priest.weaponAspd?.book).toBeGreaterThan(0);
    expect(catalog.skills.sa_advancedbook).toMatchObject({
      name: 'Perícia com Livro', implementation: 'supported',
      description: expect.stringContaining('Não concede HIT.'),
    });
    expect(manifestJson.bookWeapon).toMatchObject({
      advancedBook: { masteryAttackPerLevel: 3, aspdRatePerLevel: -5, aspdRateScale: 1000, hitBonus: false },
      shopItem: { id: 1550, sourceBuyPrice: 30000 },
      attackActionSource: expect.stringContaining('offset 8*11=88'),
    });
    const state = createInitialState(catalog, 0);
    state.baseLevel = 40;
    state.job = 'sage';
    state.jobLevel = 40;
    state.learnedSkills.sa_advancedbook = 10;
    const bookEntry = addItem(state, catalog, 1550, 1);
    const equipped = applyCommand(state, catalog, { type: 'equip', uid: bookEntry.uid }, 0);
    expect(equipped.equipment.weapon).toBe(bookEntry.uid);
    state.job = 'mage';
    expect(() => applyCommand(state, catalog, { type: 'equip', uid: bookEntry.uid }, 0)).toThrow();
    state.job = 'sage';
    state.equipment.weapon = bookEntry.uid;
    const advancedBookMotion = derivedStats(state, catalog);
    expect(advancedBookMotion.effects.aspd).toBe(5);
    state.job = 'mage';
    expect(derivedStats(state, catalog).effects.aspd).toBeUndefined();
    expect(manifestJson.sources.some(source => source.path === 'npc/merchants/shops.txt')).toBe(true);
    expect(book.shop).toBe(true);
  });

  it('uses the pinned book sprite suffix and actor action group for Sage', () => {
    const actor = { spr: 'body.spr', act: 'body.act', headSpr: 'body.spr', headAct: 'body.act' };
    const visual = { type: 'book' as const, gender: 'male' as const, job: 'sage' };
    expect(weaponAssetPath(actor, visual)).toEqual({
      spr: 'data/sprite/인간족/세이지/세이지_남_책.spr',
      act: 'data/sprite/인간족/세이지/세이지_남_책.act',
    });
    expect(weaponAttackAction(visual)).toBe(88);
    expect(weaponAttackAction({ ...visual, job: 'priest' })).toBe(88);
  });

  it.skipIf(!process.env.IDLE_ASSET_ORIGIN)('has the Book attack action for both Sage genders and all eight directions', async () => {
    const origin = process.env.IDLE_ASSET_ORIGIN!;
    for (const gender of ['male', 'female'] as const) {
      const actor = catalog.classes.sage.sprite[gender];
      const visual = { type: 'book' as const, gender, job: 'sage' };
      const book = weaponAssetPath(actor, visual)!;
      for (const path of [actor.act, book.act]) {
        const response = await fetch(origin + '/' + path.split('/').map(encodeURIComponent).join('/'));
        expect(response.status, path).toBe(200);
        const act = decodeACT(await response.arrayBuffer());
        expect(act.actions.length, path).toBeGreaterThan(95);
        expect(act.actions.slice(88, 96).every(action =>
          action.frames.some(frame => frame.layers.length > 0)), path).toBe(true);
      }
    }
  });
});
