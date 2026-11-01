import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { weaponAssetPath, weaponTrailAssetPath, weaponAttackAction, type WeaponAppearance } from '../web/assets/weapon';
import { getCombatActorAction } from '../web/assets/renderer';
import Build from '../web/panels/Build';
import { createInitialState, getSnapshot } from '../engine/index';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types';

const catalog = rawCatalog as unknown as Catalog;
const character = { spr: 'body.spr', act: 'body.act', headSpr: 'head.spr', headAct: 'head.act' };

describe('mounted original client visuals', () => {
  // Literal expected paths come from pinned JobNameTable/WeaponJobTable and
  // the audited local GRF entries, not from the production path builder.
  it.each([
    ['knight', 'male', 'data/sprite/인간족/페코페코_기사/페코페코_기사_남_창'],
    ['knight', 'female', 'data/sprite/인간족/페코페코_기사/페코페코_기사_여_창'],
    ['lord_knight', 'male', 'data/sprite/인간족/페코페코_기사/페코페코_기사_남_창'],
    ['lord_knight', 'female', 'data/sprite/인간족/페코페코_기사/페코페코_기사_여_창'],
    ['crusader', 'male', 'data/sprite/인간족/신페코크루세이더/신페코크루세이더_남_창'],
    ['crusader', 'female', 'data/sprite/인간족/신페코크루세이더/신페코크루세이더_여_창'],
    ['paladin', 'male', 'data/sprite/인간족/신페코크루세이더/신페코크루세이더_남_창'],
    ['paladin', 'female', 'data/sprite/인간족/신페코크루세이더/신페코크루세이더_여_창'],
  ])('uses mounted matching spear and trail for %s %s', (job, gender, base) => {
    const visual = { job, gender, type: 'spear', mounted: true } as WeaponAppearance;
    expect(weaponAssetPath(character, visual)).toEqual({ spr: base + '.spr', act: base + '.act' });
    expect(weaponTrailAssetPath(character, visual)).toEqual({ spr: base + '_검광.spr', act: base + '_검광.act' });
    expect(weaponAttackAction(visual)).toBe(88);
  });

  it('dismounting restores the unmounted rebirth weapon family', () => {
    expect(weaponAssetPath(character, { job: 'lord_knight', gender: 'male', type: 'sword' })).toEqual({
      spr: 'data/sprite/인간족/기사/기사_남_검.spr', act: 'data/sprite/인간족/기사/기사_남_검.act',
    });
    expect(weaponAssetPath(character, { job: 'paladin', gender: 'female', type: 'sword' })).toEqual({
      spr: 'data/sprite/인간족/크루세이더/크루세이더_여_검.spr', act: 'data/sprite/인간족/크루세이더/크루세이더_여_검.act',
    });
    expect(weaponAssetPath({ spr: 'monster.spr', act: 'monster.act' }, { job: 'knight', gender: 'male', type: 'spear' })).toBeNull();
  });

  it('Brandish uses the visible spear attack instead of the empty skill weapon group', () => {
    expect(getCombatActorAction('skill', 'KN_BRANDISHSPEAR')).toBe('attack');
    expect(getCombatActorAction('skill', 'AL_BLESSING')).toBe('skill');
  });

  it('Riding exposes a manual mount button while remaining outside rotation', () => {
    const c = structuredClone(catalog);
    const riding = Object.values(c.skills).find(s => s.sourceName === 'KN_RIDING')!;
    riding.implementation = 'supported';
    riding.kind = 'passive';
    (riding as typeof riding & { manualUse: string }).manualUse = 'mount';
    const state = createInitialState(c, 0);
    state.job = 'knight'; state.learnedSkills[riding.id] = 1;
    const props = { catalog: c, snapshot: getSnapshot(state, c, 0), busy: false, command: async () => true, mode: 'skills' as const };
    const html = renderToStaticMarkup(createElement(Build, props));
    expect(html).toContain('Montar Peco Peco');
    expect(html).toContain('Montaria manual');
    expect(riding.kind).toBe('passive');
  });

  it('exports the complete mounted packet with manual Riding and source Brandish restrictions', () => {
    const riding = catalog.skills.kn_riding;
    const cavalier = catalog.skills.kn_cavaliermastery;
    const brandish = catalog.skills.brandish_spear;
    expect(riding).toMatchObject({ sourceName: 'KN_RIDING', kind: 'passive', manualUse: 'mount', implementation: 'supported', maxLevel: 1 });
    expect(cavalier).toMatchObject({ sourceName: 'KN_CAVALIERMASTERY', kind: 'passive', implementation: 'supported', maxLevel: 5 });
    expect(brandish).toMatchObject({ sourceName: 'KN_BRANDISHSPEAR', damageType: 'weapon', kind: 'physical', implementation: 'supported', requiredState: 'Riding', requiredWeapon: ['spear'] });
    expect(brandish.spCost).toEqual([12,12,12,12,12,12,12,12,12,12]);
    expect(brandish.castTimeMs).toEqual([700,700,700,700,700,700,700,700,700,700]);
    expect(Object.keys(brandish.prerequisitesByClass ?? {}).sort()).toEqual(['knight', 'lord_knight']);
  });

  it.each([
    ['knight', '페코페코_기사'], ['lord_knight', '로드페코'],
    ['crusader', '신페코크루세이더'], ['paladin', '페코팔라딘'],
  ])('exports male and female original mounted bodies for %s', (job, resource) => {
    const mounted = (catalog.classes[job] as typeof catalog.classes[string] & { mountedSprite?: unknown }).mountedSprite;
    expect(mounted).toEqual({
      male: { spr: `data/sprite/인간족/몸통/남/${resource}_남.spr`, act: `data/sprite/인간족/몸통/남/${resource}_남.act`, headSpr: 'data/sprite/인간족/머리통/남/1_남.spr', headAct: 'data/sprite/인간족/머리통/남/1_남.act' },
      female: { spr: `data/sprite/인간족/몸통/여/${resource}_여.spr`, act: `data/sprite/인간족/몸통/여/${resource}_여.act`, headSpr: 'data/sprite/인간족/머리통/여/1_여.spr', headAct: 'data/sprite/인간족/머리통/여/1_여.act' },
    });
  });
});
