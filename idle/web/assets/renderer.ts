/** Canvas composition of Gravity ACT layers, based on roBrowserLegacy layouts.
 * GPL-3.0-or-later. Keeps extracted client pixels in memory only. */
import type { SpriteAsset } from '../../shared/types';
import { decodeSPR, type DecodedSprite, type SpriteFrame } from './sprite';
import { decodeACT, type DecodedACT, type ActionLayer, type ActionFrame } from './action';
import { assetUrl } from './items';
import { weaponAssetPath, weaponAttackAction, type WeaponAppearance } from './weapon';
export type { WeaponAppearance } from './weapon';
export interface ActorPart {
    sprite: DecodedSprite;
    action: DecodedACT;
}
export interface DecodedActor {
    kind: 'character' | 'monster';
    fallback: boolean;
    error?: string;
    body?: ActorPart;
    head?: ActorPart;
    weapon?: ActorPart;
    weaponVisual?: WeaponAppearance;
}
export interface PosedLayer extends ActionLayer {
    image: SpriteFrame;
}
const actorCache = new Map<string, Promise<DecodedActor>>();
async function binary(path: string) { const response = await fetch(assetUrl(path), { signal: AbortSignal.timeout(15000) }); if (!response.ok)
    throw new Error(`Recurso indisponível (${response.status}): ${path}`); return response.arrayBuffer(); }
async function loadPart(spr: string, act: string): Promise<ActorPart> { const [s, a] = await Promise.all([binary(spr), binary(act)]); return { sprite: decodeSPR(s), action: decodeACT(a) }; }
async function loadOptionalPart(spr?: string, act?: string): Promise<{ value?: ActorPart; error?: unknown }> {
    if (!spr || !act) return {};
    try { return { value: await loadPart(spr, act) }; }
    catch (error) { return { error }; }
}
export function loadActor(asset: SpriteAsset, weaponVisual?: WeaponAppearance): Promise<DecodedActor> {
    const kind: DecodedActor['kind'] = asset.headSpr || asset.headAct || asset.spr.replace(/\\/g, '/').includes('인간족/몸통/') ? 'character' : 'monster';
    const key = JSON.stringify({ asset, weaponVisual });
    const cached = actorCache.get(key);
    if (cached)
        return cached;
    const promise = (async () => {
        try {
            const body = await loadPart(asset.spr, asset.act);
            const weaponFiles = weaponVisual ? weaponAssetPath(asset, weaponVisual) : null;
            const [headResult, weaponResult] = await Promise.all([
                loadOptionalPart(asset.headSpr, asset.headAct),
                loadOptionalPart(weaponFiles?.spr, weaponFiles?.act),
            ]);
            const errors = [headResult.error, weaponResult.error]
                .filter(error => error !== undefined)
                .map(error => error instanceof Error ? error.message : String(error));
            return {
                kind, fallback: false, body,
                head: headResult.value,
                weapon: weaponResult.value,
                weaponVisual,
                error: errors.length ? errors.join('; ') : undefined,
            };
        }
        catch (e) {
            return { kind, fallback: true, error: e instanceof Error ? e.message : String(e) };
        }
    })();
    actorCache.set(key, promise);
    return promise;
}
export function getAttackAction(actor: DecodedActor): number {
    const candidate = actor.kind === 'character' ? weaponAttackAction(actor.weaponVisual) : 16;
    return actor.body?.action.actions[candidate]?.frames.length ? candidate : actor.kind === 'character' ? 40 : 16;
}

function actionFrames(part: ActorPart, action: number): ActionFrame[] | undefined {
    const frames = part.action.actions[action]?.frames;
    return frames?.length ? frames : undefined;
}

function facingFrames(part: ActorPart, preferred: number): { index: number; frames: ActionFrame[] } | undefined {
    const direction = preferred % 8;
    // If this optional part lacks the current combat action, its idle pose in
    // the same direction is safer than borrowing the cast/attack from front.
    const sameFacing = Array.from({ length: Math.ceil(part.action.actions.length / 8) }, (_, group) => group * 8 + direction);
    const candidates = [...new Set([preferred, direction, ...sameFacing, preferred - direction, 0])];
    for (const index of candidates) {
        const frames = actionFrames(part, index);
        if (frames) return { index, frames };
    }
    return undefined;
}

export type ActorAction = number | 'idle' | 'attack' | 'cast' | 'hurt' | 'dead';

export function getActorPose(actor: DecodedActor, action: ActorAction, elapsed: number, direction = 0): PosedLayer[] {
    if (!actor.body || actor.fallback)
        return [];
    // EntityAction.js: each ACT group has eight directions. SKILL is group 12
    // (96..103) for PCs. Monsters do not share the PC skill action layout.
    const actions = actor.kind === 'character'
        ? { idle: 0, attack: getAttackAction(actor), cast: 96, hurt: 48, dead: 64 }
        : { idle: 0, attack: 16, cast: 0, hurt: 24, dead: 32 };
    const base = typeof action === 'number' ? action : actions[action];
    const dir = Number.isFinite(direction) ? Math.max(0, Math.min(7, Math.trunc(direction))) : 0;
    // Keep the requested body direction whenever its ACT provides it. Optional
    // head and weapon layers independently choose a same-facing fallback.
    const candidates = [...new Set([base + dir, base, dir, 0])];
    const index = candidates.find((candidate) => actionFrames(actor.body!, candidate));
    if (index === undefined) return [];
    const bodyFrames = actionFrames(actor.body, index);
    if (!bodyFrames)
        return [];
    // PC idle's three ACT frames are head-direction/doridori variants. The
    // original renderer holds the first direction until a head turn is asked for.
    const staticIdle = actor.kind === 'character' && index < 8;
    const delay = actor.body.action.actions[index]?.delayMs ?? actor.body.action.actions[0]?.delayMs ?? 150;
    const elapsedFrame = Math.floor(Math.max(0, elapsed) / Math.max(25, delay));
    const looping = typeof action === 'number' || action === 'idle' || action === 'cast';
    const frameIndex = staticIdle ? 0 : looping
        ? elapsedFrame % bodyFrames.length
        : Math.min(elapsedFrame, bodyFrames.length - 1);
    const bodyFrame = bodyFrames[frameIndex];
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
        const selected = facingFrames(actor.head, index);
        const headFrame = selected?.frames[selected.index < 8 ? 0 : Math.min(frameIndex, selected.frames.length - 1)];
        if (headFrame) {
            const b = bodyFrame.anchors[0] ?? { x: 0, y: 0 }, h = headFrame.anchors[0] ?? { x: 0, y: 0 };
            append(actor.head, headFrame, b.x - h.x, b.y - h.y);
        }
    }
    if (actor.weapon) {
        // Weapon ACT coordinates are already relative to the body origin.
        const selected = facingFrames(actor.weapon, index);
        const weaponFrame = selected?.frames[selected.index < 8 ? 0 : Math.min(frameIndex, selected.frames.length - 1)];
        if (weaponFrame) append(actor.weapon, weaponFrame);
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
export function drawActor(ctx: CanvasRenderingContext2D, actor: DecodedActor, action: ActorAction, elapsed: number, x: number, y: number, scale = 1, direction = 0): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    const pose = getActorPose(actor, action, elapsed, direction);
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
