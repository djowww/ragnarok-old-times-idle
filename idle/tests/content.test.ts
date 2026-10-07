import { describe, expect, it } from 'vitest';
import { parseConfig, resolveInheritance } from '../tools/libconfig.mjs';
import catalog from '../content/catalog.json';
import type { Catalog } from '../shared/types';
describe('Hercules import', () => {
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
    it('preserves Poring source rewards and sprite aliases', () => {
        expect(data.monsters[1002]).toMatchObject({ hp: 50, baseExp: 2, jobExp: 1 });
        expect(data.monsters[1002].drops).toContainEqual({ itemId: 909, chance: 7000 });
        expect(data.monsters[1028].sprite.spr).toContain('skel_soldier.spr');
        expect(data.monsters[1016].sprite.spr).toContain('skel_archer.spr');
    });
    it('offers valid drops, all areas, supported cards and a useful weapon for every branch', () => {
        expect(data.areas).toHaveLength(10);
        expect(data.areas.flatMap(a => a.monsters)).toHaveLength(25);
        expect(data.challenges).toHaveLength(81);
        const cards = Object.values(data.items).filter(i => i.type === 'card');
        expect(cards.filter(i => !i.unsupportedEffect)).toHaveLength(8);
        for (const card of cards.filter(i => i.unsupportedEffect)) {
            expect(card.effects).toEqual({});
            expect(card.cardSlots).toBeUndefined();
            expect(card.shop).toBe(false);
        }
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
});
describe('source effect translation', () => {
    const data = catalog as unknown as Catalog;
    it('uses healing midpoints and retains unsupported status cures as inert loot', () => {
        expect(data.items[512].healHP).toBe(19);
        expect(data.items[514].healSP).toBe(12);
        expect(data.items[509].healHP).toBe(95);
        expect(data.items[511]).toMatchObject({ type: 'loot', unsupportedEffect: true, effects: {}, shop: false });
        expect(data.items[511].healHP).toBeUndefined();
        expect(data.items[511].healSP).toBeUndefined();
        expect(data.monsters[1031].drops).toContainEqual({ itemId: 511, chance: 500 });
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
