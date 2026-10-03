/** ACT decoder adapted from roBrowserLegacy Loaders/Action.js.
 * Copyright Vincent Thibault and contributors. GPL-3.0-or-later. */
import { AssetDecodeError, BinaryReader } from './sprite';
export interface ActionLayer {
    x: number;
    y: number;
    index: number;
    mirror: boolean;
    color: [
        number,
        number,
        number,
        number
    ];
    scaleX: number;
    scaleY: number;
    rotation: number;
    type: number;
    width: number;
    height: number;
}
export interface ActionFrame {
    layers: ActionLayer[];
    anchors: Array<{
        x: number;
        y: number;
    }>;
    sound: number;
}
export interface DecodedAction {
    frames: ActionFrame[];
    delayMs: number;
}
export interface DecodedACT {
    version: number;
    actions: DecodedAction[];
    sounds: string[];
}
export function decodeACT(data: ArrayBuffer): DecodedACT {
    const r = new BinaryReader(data);
    if (r.u8() !== 65 || r.u8() !== 67)
        throw new AssetDecodeError('Invalid ACT header');
    const version = r.u8() / 10 + r.u8();
    if (version < 1 || version > 2.5)
        throw new AssetDecodeError('Unsupported ACT version ' + version);
    const count = r.count(r.u16(), 2000);
    r.skip(10);
    const actions: DecodedAction[] = [];
    for (let a = 0; a < count; a++) {
        const frames: ActionFrame[] = [];
        const frameCount = r.count(r.u32(), 10000);
        for (let f = 0; f < frameCount; f++) {
            r.skip(32);
            const layerCount = r.count(r.u32(), 10000);
            const layers: ActionLayer[] = [];
            for (let l = 0; l < layerCount; l++) {
                const layer: ActionLayer = { x: r.i32(), y: r.i32(), index: r.i32(), mirror: !!r.i32(), color: [255, 255, 255, 255], scaleX: 1, scaleY: 1, rotation: 0, type: 0, width: 0, height: 0 };
                if (version >= 2) {
                    layer.color = [r.u8(), r.u8(), r.u8(), r.u8()];
                    layer.scaleX = r.f32();
                    layer.scaleY = version <= 2.3 ? layer.scaleX : r.f32();
                    layer.rotation = r.i32();
                    layer.type = r.i32();
                    if (version >= 2.5) {
                        layer.width = r.i32();
                        layer.height = r.i32();
                    }
                }
                layers.push(layer);
            }
            const sound = version >= 2 ? r.i32() : -1;
            const anchors: Array<{
                x: number;
                y: number;
            }> = [];
            if (version >= 2.3) {
                const n = r.count(r.i32(), 1000);
                for (let p = 0; p < n; p++) {
                    r.skip(4);
                    anchors.push({ x: r.i32(), y: r.i32() });
                    r.skip(4);
                }
            }
            frames.push({ layers, anchors, sound });
        }
        actions.push({ frames, delayMs: 150 });
    }
    const sounds: string[] = [];
    if (version >= 2.1) {
        const n = r.count(r.i32(), 10000);
        for (let i = 0; i < n; i++)
            sounds.push(new TextDecoder('euc-kr').decode(r.bytes(40)).replace(/\0.*$/s, ''));
        if (version >= 2.2)
            for (const action of actions)
                action.delayMs = Math.max(25, r.f32() * 25);
    }
    return { version, actions, sounds };
}
