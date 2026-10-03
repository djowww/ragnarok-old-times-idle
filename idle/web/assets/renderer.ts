/** Canvas composition of Gravity ACT layers, based on roBrowserLegacy layouts.
 * GPL-3.0-or-later. Keeps extracted client pixels in memory only. */
import type { SpriteAsset } from '../../shared/types';
import { decodeSPR, type DecodedSprite, type SpriteFrame } from './sprite';
import { decodeACT, type DecodedACT, type ActionLayer, type ActionFrame } from './action';
import { assetUrl } from './items';
export interface ActorPart {
    sprite: DecodedSprite;
    action: DecodedACT;
}
export interface DecodedActor {
    fallback: boolean;
    error?: string;
    body?: ActorPart;
    head?: ActorPart;
}
export interface PosedLayer extends ActionLayer {
    image: SpriteFrame;
}
const actorCache = new Map<string, Promise<DecodedActor>>();
async function binary(path: string) { const response = await fetch(assetUrl(path), { signal: AbortSignal.timeout(15000) }); if (!response.ok)
    throw new Error(`Recurso indisponível (${response.status}): ${path}`); return response.arrayBuffer(); }
async function loadPart(spr: string, act: string): Promise<ActorPart> { const [s, a] = await Promise.all([binary(spr), binary(act)]); return { sprite: decodeSPR(s), action: decodeACT(a) }; }
export function loadActor(asset: SpriteAsset): Promise<DecodedActor> {
    const key = JSON.stringify(asset);
    const cached = actorCache.get(key);
    if (cached)
        return cached;
    const promise = (async () => {
        try {
            const body = await loadPart(asset.spr, asset.act);
            let head: ActorPart | undefined, error: string | undefined;
            if (asset.headSpr && asset.headAct) {
                try {
                    head = await loadPart(asset.headSpr, asset.headAct);
                }
                catch (e) {
                    error = e instanceof Error ? e.message : String(e);
                }
            }
            return { fallback: false, body, head, error };
        }
        catch (e) {
            return { fallback: true, error: e instanceof Error ? e.message : String(e) };
        }
    })();
    actorCache.set(key, promise);
    return promise;
}
function frameAt(part: ActorPart, action: number, elapsed: number): ActionFrame | undefined { const a = part.action.actions[action] ?? part.action.actions[0]; if (!a?.frames.length)
    return; return a.frames[Math.floor(Math.max(0, elapsed) / Math.max(25, a.delayMs)) % a.frames.length]; }
export function getActorPose(actor: DecodedActor, action: number | 'idle' | 'attack' | 'hurt' | 'dead', elapsed: number): PosedLayer[] {
    if (!actor.body || actor.fallback)
        return [];
    const index = typeof action === 'number' ? action : ({ idle: 0, attack: 16, hurt: 24, dead: 32 }[action]);
    const bodyFrame = frameAt(actor.body, index, elapsed);
    if (!bodyFrame)
        return [];
    const result: PosedLayer[] = [];
    const append = (part: ActorPart, frame: ActionFrame, dx = 0, dy = 0) => { for (const layer of frame.layers) {
        if (layer.index < 0)
            continue;
        const image = part.sprite.frames[layer.index + (layer.type === 1 ? part.sprite.indexedCount : 0)];
        if (image && image.width > 0 && image.height > 0)
            result.push({ ...layer, x: layer.x + dx, y: layer.y + dy, image });
    } };
    append(actor.body, bodyFrame);
    if (actor.head) {
        const headFrame = frameAt(actor.head, index, elapsed);
        if (headFrame) {
            const b = bodyFrame.anchors[0] ?? { x: 0, y: 0 }, h = headFrame.anchors[0] ?? { x: 0, y: 0 };
            append(actor.head, headFrame, b.x - h.x, b.y - h.y);
        }
    }
    return result;
}
const imageCache = new WeakMap<SpriteFrame, Map<string, HTMLCanvasElement>>();
function imageCanvas(image: SpriteFrame, color: ActionLayer['color']): HTMLCanvasElement {
    let variants = imageCache.get(image);
    if (!variants) {
        variants = new Map();
        imageCache.set(image, variants);
    }
    const key = color.join(',');
    const cached = variants.get(key);
    if (cached)
        return cached;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        throw new Error('Canvas indisponível');
    const pixels = ctx.createImageData(image.width, image.height);
    for (let i = 0; i < image.rgba.length; i++)
        pixels.data[i] = Math.round(image.rgba[i] * color[i % 4] / 255);
    ctx.putImageData(pixels, 0, 0);
    variants.set(key, canvas);
    return canvas;
}
export function drawActor(ctx: CanvasRenderingContext2D, actor: DecodedActor, action: number | 'idle' | 'attack' | 'hurt' | 'dead', elapsed: number, x: number, y: number, scale = 1): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    const pose = getActorPose(actor, action, elapsed);
    if (!pose.length) {
        ctx.fillStyle = '#d9caab';
        ctx.strokeStyle = '#746648';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -20, 14, 19, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#746648';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', 0, -14);
    }
    else
        for (const layer of pose) {
            ctx.save();
            ctx.translate(layer.x, layer.y);
            ctx.rotate(layer.rotation * Math.PI / 180);
            ctx.scale(layer.scaleX * (layer.mirror ? -1 : 1), layer.scaleY);
            ctx.drawImage(imageCanvas(layer.image, layer.color), -layer.image.width / 2, -layer.image.height / 2);
            ctx.restore();
        }
    ctx.restore();
}
