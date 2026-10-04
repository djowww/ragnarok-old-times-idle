/** Weapon view paths and attack variants from the pinned roBrowserLegacy client.
 * Client SPR/ACT bytes are fetched from the user's local GRF at runtime. */
import type { SpriteAsset, WeaponType } from '../../shared/types';

export interface WeaponAppearance {
    type: WeaponType;
    gender: 'male' | 'female';
    job: string;
}

// DB/Jobs/WeaponJobTable.js reuses the base job's weapon sprites after rebirth.
const baseJob: Record<string, string> = {
    high_novice: 'novice',
    high_swordsman: 'swordsman', high_mage: 'mage', high_archer: 'archer',
    high_acolyte: 'acolyte', high_merchant: 'merchant', high_thief: 'thief',
    lord_knight: 'knight', paladin: 'crusader', high_wizard: 'wizard',
    professor: 'sage', sniper: 'hunter', clown: 'bard', gypsy: 'dancer',
    high_priest: 'priest', champion: 'monk', whitesmith: 'blacksmith',
    creator: 'alchemist', assassin_cross: 'assassin', stalker: 'rogue',
};

const baseJobResource: Record<string, string> = {
    novice: '초보자', swordsman: '검사', mage: '마법사', archer: '궁수',
    acolyte: '성직자', merchant: '상인', thief: '도둑',
    knight: '기사', crusader: '크루세이더', wizard: '위저드', sage: '세이지',
    hunter: '헌터', bard: '바드', dancer: '무희', priest: '프리스트',
    monk: '몽크', blacksmith: '제철공', alchemist: '연금술사',
    assassin: '어세신', rogue: '로그',
};

// DB/Items/WeaponTable.js; the spellings are CP949-decoded client names.
const weaponSuffix: Record<WeaponType, string> = {
    dagger: '단검', sword: '검', spear: '창', bow: '활', staff: '롯드',
    mace: '클럽', axe: '도끼', katar: '카타르_카타르',
    instrument: '악기', whip: '채찍',
};

export function weaponAssetPath(asset: SpriteAsset, visual: WeaponAppearance): { spr: string; act: string } | null {
    // An explicit job table prevents a monster or an unrelated sprite from
    // accidentally resolving to a character's equipment resource.
    if (!asset.headSpr || !asset.headAct) return null;
    const job = baseJob[visual.job] ?? visual.job;
    const name = baseJobResource[job];
    const suffix = weaponSuffix[visual.type];
    if (!name || !suffix) return null;
    const sex = visual.gender === 'female' ? '여' : '남';
    const base = `data/sprite/인간족/${name}/${name}_${sex}_${suffix}`;
    return { spr: `${base}.spr`, act: `${base}.act` };
}

/** ATTACK1/2/3 correspond to ACT direction groups 5/10/11. */
export function weaponAttackAction(visual?: WeaponAppearance): number {
    if (!visual) return 40;
    const job = baseJob[visual.job] ?? visual.job;
    const type = visual.type;
    let variant = 0;
    switch (job) {
        case 'novice':
            variant = visual.gender === 'male'
                ? type === 'dagger' ? 1 : ['staff', 'sword', 'axe', 'mace'].includes(type) ? 2 : 0
                : type === 'dagger' ? 2 : ['staff', 'sword', 'axe', 'mace'].includes(type) ? 1 : 0;
            break;
        case 'swordsman': case 'knight': case 'crusader':
            variant = type === 'spear' ? 2 : ['dagger', 'sword', 'axe', 'mace'].includes(type) ? 1 : 0;
            break;
        case 'mage':
            variant = type === 'staff' ? 1 : type === 'dagger' ? 2 : 0;
            break;
        case 'archer':
            variant = type === 'bow' ? 1 : type === 'dagger' ? 2 : 0;
            break;
        case 'acolyte': case 'priest': case 'monk':
            variant = ['staff', 'mace'].includes(type) ? 1 : 0;
            break;
        case 'merchant':
            variant = type === 'dagger' ? 2 : ['mace', 'axe', 'sword'].includes(type) ? 1 : 0;
            break;
        case 'thief': case 'rogue':
            variant = type === 'bow' ? 2 : ['sword', 'dagger'].includes(type) ? 1 : 0;
            break;
        case 'wizard':
            variant = visual.gender === 'male'
                ? type === 'staff' ? 1 : type === 'dagger' ? 2 : 0
                : type === 'dagger' ? 1 : type === 'staff' ? 2 : 0;
            break;
        case 'blacksmith':
            variant = type === 'dagger' ? 1 : ['sword', 'axe', 'mace'].includes(type) ? 2 : 0;
            break;
        case 'hunter':
            variant = type === 'dagger' ? 1 : type === 'bow' ? 2 : 0;
            break;
        case 'assassin':
            variant = type === 'katar' ? 2 : ['axe', 'sword', 'dagger'].includes(type) ? 1 : 0;
            break;
        case 'sage':
            variant = type === 'dagger' ? 1 : type === 'staff' ? 2 : 0;
            break;
        case 'alchemist':
            variant = type === 'dagger' ? 1 : ['sword', 'axe', 'mace'].includes(type) ? 2 : 0;
            break;
        case 'bard':
            variant = type === 'bow' ? 2 : ['dagger', 'instrument'].includes(type) ? 1 : 0;
            break;
        case 'dancer':
            variant = type === 'bow' ? 2 : type === 'whip' ? 1 : 0;
            break;
    }
    return [40, 80, 88][variant];
}
