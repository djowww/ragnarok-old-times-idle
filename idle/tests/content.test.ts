import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { orderedConfigEntries, parseConfig, resolveInheritance } from '../tools/libconfig.mjs';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import rules from '../content/rules.json';
import fieldNavigation from '../content/field-navigation.json';
import type { Catalog } from '../shared/types';
import { bgmForMap } from '../web/components/mapBgm';
describe('Hercules import', () => {
    it('retains both Elder Willow Fire Bolt source rows in order', () => {
        const parsed: any = parseConfig(`ELDER_WILOW: { MG_FIREBOLT: { SkillState: "MSS_BERSERK" SkillLevel: 3 Rate: 500 CastTime: 1500 Delay: 5000 Cancelable: true SkillTarget: "MST_TARGET" CastCondition: "MSC_ALWAYS" } MG_FIREBOLT: { SkillState: "MSS_RUSH" SkillLevel: 3 Rate: 500 CastTime: 1500 Delay: 5000 Cancelable: true SkillTarget: "MST_TARGET" CastCondition: "MSC_ALWAYS" } }`);
        expect(orderedConfigEntries(parsed.ELDER_WILOW)).toEqual([
            ['MG_FIREBOLT', expect.objectContaining({ SkillState: 'MSS_BERSERK', SkillLevel: 3, Rate: 500, CastTime: 1500, Delay: 5000 })],
            ['MG_FIREBOLT', expect.objectContaining({ SkillState: 'MSS_RUSH', SkillLevel: 3, Rate: 500, CastTime: 1500, Delay: 5000 })],
        ]);
    });
    it('enables executed Venom Dust and Spider Web with purchasable source reagents', () => {
        const data = catalog as unknown as Catalog;
        for (const source of ['AS_VENOMDUST', 'PF_SPIDERWEB']) {
            const skill = Object.values(data.skills).find(candidate => candidate.sourceName === source)!;
            expect(skill.implementation, source).toBe('supported');
            expect(skill.unsupportedReason, source).toBeUndefined();
        }
        expect(data.items[716]).toMatchObject({ shop: true, type: 'material', buyPrice: 600 });
        expect(data.items[1025]).toMatchObject({ shop: true, type: 'material', buyPrice: 184 });
    });
    it('enables executed control traps with exact reagents and a purchasable trap supply', () => {
        const data = catalog as unknown as Catalog;
        for (const source of ['HT_SKIDTRAP', 'HT_ANKLESNARE', 'HT_SANDMAN', 'HT_FLASHER']) {
            const skill = Object.values(data.skills).find(candidate => candidate.sourceName === source)!;
            expect(skill.implementation, source).toBe('supported');
            expect(skill.groundIntervalMs, source).toBe(1000);
            expect(skill.itemCostByLevel?.[4], source).toEqual([{ itemId: 1065, quantity: source === 'HT_FLASHER' ? 2 : 1 }]);
        }
        expect(data.items[1065]).toMatchObject({ shop: true, buyPrice: 100 });
    });
    it('reads comments, repeated drops and inert script blocks', () => {
        const parsed: any = parseConfig('/* ignored */ mob_db: ({Id:1002 Hp:50 Exp:2 JExp:1 Drops:{ Jellopy:7000 Apple:1000 Apple:150 } Script:<" globalThis.executed=true; ">})');
        expect(parsed.mob_db[0]).toMatchObject({ Id: 1002, Hp: 50, Exp: 2, JExp: 1 });
        expect(parsed.mob_db[0].Drops.Jellopy).toBe(7000);
        expect(parsed.mob_db[0].Drops.Apple).toEqual([1000, 150]);
        expect((globalThis as any).executed).toBeUndefined();
    });
    it('inherits independent HP and SP and rejects cyclic inheritance', () => {
        expect(resolveInheritance({ A: { HPTable: [40], SPTable: [11] }, B: { Inherit: ['A'], SPTable: [20] } }, 'B')).toMatchObject({ HPTable: [40], SPTable: [20] });
        expect(() => resolveInheritance({ A: { Inherit: ['B'] }, B: { Inherit: ['A'] } }, 'A')).toThrow(/cycle/i);
    });
});
describe('playable source catalog', () => {
    const data = catalog as unknown as Catalog;
    it('exports executable casting and defense skills with pinned selection and cast flags', () => {
        for (const source of ['SA_AUTOSPELL', 'PF_DOUBLECASTING', 'PF_MEMORIZE', 'AL_PNEUMA', 'SM_ENDURE', 'CR_DEFENDER']) {
            expect(Object.values(data.skills).find(skill => skill.sourceName === source)?.implementation, source).toBe('supported');
        }
        expect(data.autospellChoices?.MG_FIREBOLT).toEqual([0, 1, 2, 3, 3, 3, 3, 3, 3, 3]);
        expect(data.autospellChoices?.MG_FROSTDIVER).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
        expect(Object.values(data.skills).find(skill => skill.sourceName === 'PF_MEMORIZE')).toMatchObject({ ignoresDex: true, ignoresStatusEffects: true });
        expect(Object.values(data.skills).find(skill => skill.sourceName === 'SM_ENDURE')?.statusDurationMs?.[2]).toBe(16000);
        expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'db/pre-re/autospell_db.conf', sha256: rules.sourceHashes['autospell_db.conf'] }));
    });
    it('enables the implemented solo steal, shield strip, poison and inventory identification mechanics', () => {
        for (const source of ['RG_SNATCHER', 'RG_STRIPSHIELD', 'AS_ENCHANTPOISON', 'MC_IDENTIFY']) {
            const skill = Object.values(data.skills).find(candidate => candidate.sourceName === source)!;
            expect(skill.implementation, source).toBe('supported');
            expect(skill.unsupportedReason, source).toBeUndefined();
            expect(manifest.skillSources[skill.id as keyof typeof manifest.skillSources].implementation).toBe('supported');
        }
        expect(Object.values(data.skills).find(skill => skill.sourceName === 'MC_IDENTIFY')?.manualUse).toBe('inventory');
        expect(Object.values(data.skills).find(skill => skill.sourceName === 'RG_SNATCHER')?.kind).toBe('passive');
        expect(Object.values(data.skills).find(skill => skill.sourceName === 'RG_STRIPSHIELD')?.statusEffect).toBe('SC_NOEQUIPSHIELD');
    });
    it('exports Golpe das Juntas as an executable spear skill with its source adaptation', () => {
        const skill = Object.values(data.skills).find(candidate => candidate.sourceName === 'LK_JOINTBEAT')!;
        expect(skill).toMatchObject({
            name: 'Golpe das Juntas', implementation: 'supported', requiredWeapon: ['spear'],
            statusEffect: 'SC_JOINTBEAT', statusDurationMs: Array(10).fill(30000),
        });
        expect(skill.unsupportedReason).toBeUndefined();
        expect(manifest.skillSources[skill.id as keyof typeof manifest.skillSources]).toMatchObject({
            implementation: 'supported', adaptation: expect.stringContaining('SC_BLOODING'),
        });
        expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 256, unsupported: 92 });
        expect(manifest.skillCoverage.byClass.professor).toMatchObject({ sourceTree: 49, supported: 41, unsupported: 8 });
        expect(manifest.skillCoverage.combatExpansion).toContain('PF_MINDBREAKER');
        expect(manifest.skillCoverage.combatExpansion).toContain('PF_FOGWALL');
    });
    it('exports Quebra-Mente with Hercules combat values and a declared solo adaptation', () => {
        const skill = Object.values(data.skills).find(candidate => candidate.sourceName === 'PF_MINDBREAKER')!;
        expect(skill).toMatchObject({ name: 'Quebra-Mente', implementation: 'supported', statusChance: [60, 65, 70, 75, 80],
            spCost: [12, 15, 18, 21, 24], range: [9, 9, 9, 9, 9], statusDurationMs: Array(5).fill(30000),
            afterCastDelayMs: [800, 900, 1000, 1100, 1200] });
        expect(skill.unsupportedReason).toBeUndefined();
        expect(manifest.skillSources[skill.id as keyof typeof manifest.skillSources]).toMatchObject({
            implementation: 'supported', adaptation: expect.stringContaining('soft-MDEF'),
        });
    });
    it('exports Nevoeiro Ofuscante with the source defensive field and adaptation limits', () => {
        const skill = Object.values(data.skills).find(candidate => candidate.sourceName === 'PF_FOGWALL')!;
        expect(skill).toMatchObject({ name: 'Nevoeiro Ofuscante', implementation: 'supported', targetType: 'ground',
            statusEffect: 'SC_FOGWALL', spCost: [25], range: [9], groundDurationMs: [20000] });
        expect(skill.unsupportedReason).toBeUndefined();
        const exporter = readFileSync(new URL('../tools/export-content.mjs', import.meta.url), 'utf8');
        const unsupportedMap = exporter.match(/const unsupported = \{([\s\S]*?)\n\};/)?.[1];
        expect(unsupportedMap).toBeTruthy();
        expect(unsupportedMap).not.toMatch(/\bPF_FOGWALL\s*:/);
        expect(manifest.skillSources[skill.id as keyof typeof manifest.skillSources]).toMatchObject({
            implementation: 'supported', adaptation: expect.stringContaining('self-centered'),
        });
    });
    it('exports Snap as a supported field-hunt approach skill with source resource costs', () => {
        const skill = Object.values(data.skills).find(candidate => candidate.sourceName === 'MO_BODYRELOCATION')!;
        expect(skill).toMatchObject({ implementation: 'supported', kind: 'buff', targetType: 'ground',
            spCost: [14], range: [18], sphereCost: [1] });
        expect(skill.unsupportedReason).toBeUndefined();
        expect(manifest.skillSources[skill.id as keyof typeof manifest.skillSources]).toMatchObject({
            implementation: 'supported', adaptation: expect.stringContaining('one-cell offset'),
        });
        expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 256, unsupported: 92 });
        expect(manifest.skillCoverage.byClass.monk).toMatchObject({ sourceTree: 34, supported: 29, unsupported: 5 });
        expect(manifest.skillCoverage.byClass.champion).toMatchObject({ sourceTree: 38, supported: 33, unsupported: 5 });
        expect(manifest.skillCoverage.combatExpansion).toContain('MO_BODYRELOCATION');
    });
    it('exports Graça Lenta with its Hercules field, pulse, duration, and weapon requirements', () => {
        const skill = Object.values(data.skills).find(candidate => candidate.sourceName === 'DC_DONTFORGETME')!;
        expect(skill).toMatchObject({ name: 'Graça Lenta', implementation: 'supported', targetType: 'self',
            statusEffect: 'SC_DONTFORGETME', statusDurationMs: Array(10).fill(20000),
            groundDurationMs: Array(10).fill(180000), groundIntervalMs: 3000, requiredWeapon: ['instrument', 'whip'] });
        expect(skill.unsupportedReason).toBeUndefined();
        expect(manifest.skillSources[skill.id as keyof typeof manifest.skillSources]).toMatchObject({
            implementation: 'supported', adaptation: expect.stringContaining('7x7 enemy field'),
        });
        expect(manifest.skillCoverage.combatExpansion).toContain('DC_DONTFORGETME');
        expect(manifest.skillCoverage.combatExpansion).toContain('BA_PANGVOICE');
    });
    it('preserves Poring source rewards and sprite aliases', () => {
        expect(data.monsters[1002]).toMatchObject({ hp: 50, baseExp: 2, jobExp: 1 });
        expect(data.monsters[1002].drops).toContainEqual({ itemId: 909, chance: 7000 });
        expect(data.monsters[1028].sprite.spr).toContain('skel_soldier.spr');
        expect(data.monsters[1016].sprite.spr).toContain('skel_archer.spr');
    });
    it('imports repeated NPC spell rows in source order with exact source metadata', () => {
        expect(data.monsters[1120].npcStatusSkills).toEqual([expect.objectContaining({
            sourceName: 'MG_SOULSTRIKE', level: 9, rate: 2000, castTimeMs: 500, delayMs: 5000,
            cancelable: true, range: 9, baseSp: 42, hitCount: 5, state: 'MSS_RUSH', condition: 'MSC_ALWAYS',
        })]);
        const moonlight = data.monsters[1150].npcStatusSkills!;
        expect(moonlight.filter(row => row.damageType === 'magic').map(row => row.sourceName)).toEqual([
            'MG_COLDBOLT', 'MG_COLDBOLT', 'MG_FIREBOLT', 'MG_FIREBOLT', 'MG_LIGHTNINGBOLT', 'MG_LIGHTNINGBOLT',
        ]);
        for (const id of [1190, 1708]) expect(data.monsters[id].npcStatusSkills?.some(row => row.damageType === 'magic')).toBe(true);
        expect(data.monsters[1033]).toBeUndefined();
        expect(manifest.npcMagicProduction).toMatchObject({ runtimeMonsterIds: [1120, 1150, 1190, 1708],
            sourceFixtureMonsterIds: [1033], sourceFixtureRows: [
                { sourceName: 'MG_FIREBOLT', state: 'MSS_BERSERK', level: 3, rate: 500, castTimeMs: 1500 },
                { sourceName: 'MG_FIREBOLT', state: 'MSS_RUSH', level: 3, rate: 500, castTimeMs: 1500 },
            ], exclusionPolicy: expect.stringContaining('ConditionData') });
        expect(manifest.npcMagicProduction.runtimeRows).toHaveLength(11);
        expect(manifest.npcMagicProduction.runtimeRows.every(row => ['MSC_ALWAYS', 'MSC_SKILLUSED'].includes(row.condition))).toBe(true);
        expect(Object.values(data.skills).find(skill => skill.sourceName === 'SA_MAGICROD')).toMatchObject({
            implementation: 'supported', manualUse: 'activate', spCost: Array(5).fill(2),
            castTimeMs: Array(5).fill(0), afterCastDelayMs: Array(5).fill(0), cooldownMs: 0,
        });
    });
    it('offers valid drops, all areas, supported cards and a useful weapon for every branch', () => {
        expect(data.areas).toHaveLength(29);
        expect(data.areas.flatMap(a => a.monsters)).toHaveLength(101);
        expect(data.challenges).toHaveLength(81);
        expect(Object.values(data.items).filter(i => i.type === 'card' && i.cardSlots?.length && !i.unsupportedEffect)).toHaveLength(8);
        for (const mob of Object.values(data.monsters))
            for (const drop of mob.drops)
                expect(data.items[drop.itemId], `drop ${drop.itemId}`).toBeDefined();
        for (const job of Object.values(data.classes)) {
            expect(job.hp.length).toBeGreaterThanOrEqual(99);
            expect(job.sp.length).toBeGreaterThanOrEqual(99);
            expect(data.exp.job[job.expGroup].slice(1, job.jobCap).every(n => n > 0)).toBe(true);
            for (const skill of job.skills)
                expect(data.skills[skill], skill).toBeDefined();
            expect(Object.values(data.items).some(i => i.shop && i.attack > 0 && i.slot === 'weapon' && i.allowedClasses.includes(job.id)), job.id).toBe(true);
            if (job.parent)
                expect(data.classes[job.parent], job.parent).toBeDefined();
        }
        expect(data.exp.base[1]).toBe(9);
        expect(data.classes.novice.hp[0]).toBe(40);
        expect(data.items[501].healHP).toBe(55);
        expect(data.items[505].healSP).toBe(50);
        expect(data.items[984].shop).toBe(true);
        expect(data.items[985].shop).toBe(true);
    });
    it('keeps the expanded classic fields aligned with Hercules spawns, scenery and BGM', () => {
        const fields: Record<string, number[]> = {
            prt_fild00: [1018, 1007, 1008, 1063, 1002, 1004],
            prt_fild01: [1051, 1007, 1008, 1063, 1002],
            prt_fild02: [1020, 1007, 1008, 1063, 1002],
            prt_fild05: [1002, 1048, 1063, 1008, 1051],
            prt_fild06: [1063, 1048, 1051, 1008, 1002],
            prt_fild07: [1052, 1031],
            prt_fild09: [1167, 1107, 1047, 1049, 1009],
            prt_fild10: [1166, 1167, 1031, 1051],
            prt_fild11: [1122, 1123, 1124, 1125, 1126, 1258, 1280],
            gef_fild00: [1002, 1007, 1008, 1031],
            gef_fild02: [1057, 1023, 1104, 1056],
            gef_fild09: [1094, 1031, 1077],
            pay_fild01: [1010, 1031, 1002, 1014],
            pay_fild04: [1002, 1113, 1031, 1242],
            pay_fild09: [1031, 1056, 1060],
        };
        const originalMap = readFileSync(new URL('../web/components/OriginalMap.tsx', import.meta.url), 'utf8');
        const mapViewerPatch = readFileSync(new URL('../../docker/web-client/mapviewer-idle.patch', import.meta.url), 'utf8');
        for (const [map, monsterIds] of Object.entries(fields)) {
            const area = data.areas.find(candidate => candidate.map === map);
            const sourceArea = (rules as any).areas.find((candidate: any) => candidate.map === map);
            expect(area?.monsters, map).toEqual(monsterIds);
            expect(area?.scene, map).toBe(sourceArea?.scene);
            expect(bgmForMap(map), map).toMatch(/^\d+\.mp3$/);
            expect(originalMap, map).toContain(`"${map}"`);
            expect(mapViewerPatch, map).toContain(`${map}: true`);
            expect(fieldNavigation.areas.find(layout => layout.areaId === area?.id)?.map, map).toBe(map);
        }
        for (const sourcePath of (rules as any).mapSpawnSources as string[])
            expect(manifest.sources, sourcePath).toContainEqual(expect.objectContaining({
                path: sourcePath,
                sha256: (rules as any).sourceHashes[sourcePath],
            }));
    });
    it('opens Prontera Field 09 at the intended classic progression level', () => {
        expect(data.areas.find(area => area.map === 'prt_fild09')?.minLevel).toBe(7);
    });
    it('connects every playable area to its original BGM and MapViewer route', () => {
        const originalMap = readFileSync(new URL('../web/components/OriginalMap.tsx', import.meta.url), 'utf8');
        const mapViewerPatch = readFileSync(new URL('../../docker/web-client/mapviewer-idle.patch', import.meta.url), 'utf8');
        expect(fieldNavigation.version).toBe(1);
        expect(fieldNavigation.areas).toHaveLength(data.areas.length);
        expect(new Set(fieldNavigation.areas.map(layout => layout.areaId)).size).toBe(data.areas.length);
        for (const area of data.areas) {
            expect(bgmForMap(area.map), area.map).toMatch(/^\d+\.mp3$/);
            expect(originalMap, area.map).toContain(`"${area.map}"`);
            expect(mapViewerPatch, area.map).toContain(`${area.map}: true`);
            expect(mapViewerPatch, area.map).not.toContain(`${area.map}: [`);
            const layout = fieldNavigation.areas.find(candidate => candidate.areaId === area.id);
            expect(layout?.map, area.id).toBe(area.map);
            expect(Number.isSafeInteger(layout?.origin.x) && Number.isSafeInteger(layout?.origin.y), area.id).toBe(true);
            expect(layout?.homeOffsets, area.id).toHaveLength(4);
            expect(new Set(layout?.homeOffsets.map(point => `${point.x},${point.y}`)).size, area.id).toBe(4);
        }
    });
});
describe('source effect translation', () => {
    const data = catalog as unknown as Catalog;
    it('uses healing midpoints and excludes status cure scripts without a supported effect', () => {
        expect(data.items[512].healHP).toBe(19);
        expect(data.items[514].healSP).toBe(12);
        expect(data.items[509].healHP).toBe(95);
        expect(data.items[511]).toMatchObject({ type: 'loot', shop: false, unsupportedEffect: true });
        expect(data.items[2607].effects.sp).toBe(10);
    });
    it('retains the distinct reborn curve and correct inherited upper HP/SP', () => {
        expect(data.exp.baseTrans?.[1]).toBe(10);
        expect(data.exp.baseTrans?.[98]).toBe(343210000);
        expect(data.classes.high_novice.hp[0]).toBe(50);
        expect(data.classes.high_novice.sp[0]).toBe(13);
    });
});

describe('source job exclusions',()=>{
    it('honors an explicit Novice exclusion even when the equipment enables All jobs',()=>{
        const data=catalog as unknown as Catalog;
        expect(data.items[2320].allowedClasses).not.toContain('novice');
        expect(data.items[2320].allowedClasses).not.toContain('high_novice');
        expect(data.items[2320].allowedClasses).toContain('mage');
        expect(data.items[2320].allowedClasses).toContain('high_mage');
    });
});

describe('generated source manifest', () => {
    it('preserves the pinned catalog scope and hashes the new balance deterministically', () => {
        const data = catalog as unknown as Catalog;
        const extraSpellSources = new Set(['PR_TURNUNDEAD', 'CR_GRANDCROSS', 'HW_GRAVITATION', 'HW_MAGICCRASHER']);
        const offensiveSpells = Object.values(data.skills).filter(skill =>
            (skill.damageType === 'magic' || extraSpellSources.has(skill.sourceName ?? '')) &&
            skill.implementation === 'supported',
        );
        expect(data.source.commit).toBe('410b9738c049ab1825d67b36b072d837c1d0b33a');
        expect(Object.keys(data.classes)).toHaveLength(40);
        expect(Object.keys(data.skills)).toHaveLength(348);
        expect(Object.keys(data.items)).toHaveLength(707);
        expect(data.areas).toHaveLength(29);
        expect(manifest.skillCoverage).toMatchObject({ supported: 256, unsupported: 92 });
        expect(manifest.sources).toHaveLength(28);
        expect(manifest.sources).toContainEqual(expect.objectContaining({
            path: 'npc/merchants/refine.txt', sha256: '3b0cf6c2b711115780acfd7d8c41ad1bd2a2f6582baec44a605cf889b747eac1',
        }));
        expect(offensiveSpells).toHaveLength(29);
        for (const spell of offensiveSpells)
            expect(manifest.skillSources[spell.id as keyof typeof manifest.skillSources])
                .toMatchObject({ idleDamageMultiplierPct: spell.idleDamageMultiplierPct });

        const catalogWithoutHash = structuredClone(data);
        catalogWithoutHash.source.hash = '';
        expect(createHash('sha256').update(JSON.stringify(catalogWithoutHash)).digest('hex'))
            .toBe(data.source.hash);
    });

    it('tracks the exact emitted rules and catalog bytes', () => {
        const sha256 = (file: URL) => createHash('sha256').update(readFileSync(file)).digest('hex');
        expect(sha256(new URL('../content/rules.json', import.meta.url))).toBe(manifest.rulesSha256);
        expect(sha256(new URL('../content/catalog.json', import.meta.url))).toBe(manifest.catalogSha256);
    });
});
