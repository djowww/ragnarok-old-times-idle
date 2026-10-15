import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Appearance, SpriteAsset } from '../shared/types';
import { loadActor, getActorPose } from '../web/assets/renderer';

// Independent SPR1.1 and ACT2.4 bytes: each hairstyle has distinct frames/anchors.
function sprite() {
    const bytes = new Uint8Array(1040), view = new DataView(bytes.buffer);
    bytes.set([83, 80, 1, 1]); view.setUint16(4, 2, true);
    for (let index = 0; index < 2; index++) {
        const offset = 6 + index * 5;
        view.setUint16(offset, 1, true); view.setUint16(offset + 2, 1, true);
        bytes[offset + 4] = index + 1;
    }
    bytes.set([200, 10, 20, 255], 20);
    bytes.set([20, 80, 30, 255], 24);
    return bytes.buffer;
}
function action(index: number, x: number, y: number, anchorX: number, anchorY: number) {
    const bytes = new Uint8Array(124), view = new DataView(bytes.buffer);
    bytes.set([65, 67, 4, 2]); view.setUint16(4, 1, true);
    view.setUint32(16, 1, true); view.setUint32(52, 1, true);
    view.setInt32(56, x, true); view.setInt32(60, y, true); view.setInt32(64, index, true);
    bytes.set([255, 255, 255, 255], 72);
    view.setFloat32(76, 1, true); view.setFloat32(80, 1, true);
    view.setInt32(92, -1, true); view.setInt32(96, 1, true);
    view.setInt32(104, anchorX, true); view.setInt32(108, anchorY, true);
    view.setFloat32(120, 4, true);
    return bytes.buffer;
}
const appearance = (hairStyle: number): Appearance => ({ hairStyle, hairColor: 0, clothesColor: 0 });
function transport(prefix: string, sex: string, selected: number, missingAct = false) {
    const paths: string[] = [];
    const fetch = vi.fn(async (url: string | URL | Request) => {
        const path = decodeURIComponent(String(url)).replace(/^\/assets\//, ''); paths.push(path);
        if (missingAct && path.endsWith(`/${selected}_${sex}.act`)) return new Response(null, { status: 404 });
        const bytes = path.endsWith('.spr') ? sprite() : path.endsWith('/body.act')
            ? action(0, 1, 2, 20, 30) : path.endsWith(`/${selected}_${sex}.act`)
            ? action(1, 8, 9, 3, 4) : action(0, 70, 80, 0, 0);
        return new Response(bytes);
    });
    vi.stubGlobal('fetch', fetch);
    const asset: SpriteAsset = { spr: `${prefix}/body.spr`, act: `${prefix}/body.act`, headSpr: `${prefix}/1_${sex}.spr`, headAct: `${prefix}/1_${sex}.act` };
    return { asset, paths };
}
afterEach(() => vi.unstubAllGlobals());

describe('selected hairstyle resources and pose', () => {
    it.each(['남', '여'])('pairs non-default %s SPR/ACT and uses that hairstyle frame and attachment', async sex => {
        const { asset, paths } = transport(`pair-${sex}`, sex, 6);
        const actor = await loadActor(asset, undefined, appearance(5));
        expect(actor).toMatchObject({ kind: 'character', fallback: false });
        expect(paths).toContain(`pair-${sex}/6_${sex}.spr`);
        expect(paths).toContain(`pair-${sex}/6_${sex}.act`);
        expect(paths).not.toContain(`pair-${sex}/1_${sex}.act`);
        const pose = getActorPose(actor, 'idle', 0);
        expect(pose).toHaveLength(2);
        expect(pose[1]).toMatchObject({ x: 25, y: 35, index: 1 });
        expect([...pose[1].image.rgba]).toEqual([20, 80, 30, 255]);
        expect(asset.headAct).toBe(`pair-${sex}/1_${sex}.act`);
    });
    it('preserves default/no-appearance paths and body-only or incomplete head assets', async () => {
        const { asset, paths } = transport('defaults', '남', 1);
        for (const style of [undefined, appearance(0)]) {
            const actor = await loadActor(asset, undefined, style);
            expect(actor.head).toBeDefined();
        }
        expect(paths.every(path => !/\/\d+_남\./.test(path) || /\/1_남\./.test(path))).toBe(true);
        for (const partial of [{ spr: 'data/sprite/인간족/몸통/body.spr', act: 'body-only/body.act' }, { ...asset, spr: 'incomplete/body.spr', headAct: undefined }]) {
            const actor = await loadActor(partial, undefined, appearance(5));
            expect(actor).toMatchObject({ kind: 'character', fallback: false });
            expect(actor.head).toBeUndefined();
            expect(getActorPose(actor, 'idle', 0)).toHaveLength(1);
        }
    });
    it('retains usable body pose and reports a missing selected ACT instead of borrowing default metadata', async () => {
        const { asset, paths } = transport('missing-selected-act', '여', 28, true);
        const actor = await loadActor(asset, undefined, appearance(27));
        expect(actor).toMatchObject({ fallback: false, error: expect.stringContaining('28_여.act') });
        expect(actor.head).toBeUndefined();
        expect(getActorPose(actor, 'idle', 0)).toHaveLength(1);
        expect(paths).not.toContain('missing-selected-act/1_여.act');
    });
});
