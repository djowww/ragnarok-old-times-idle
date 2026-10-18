/** Canvas composition of Gravity ACT layers, based on roBrowserLegacy layouts.
 * GPL-3.0-or-later. Keeps extracted client pixels in memory only. */
import type { Appearance, SpriteAsset } from '../../shared/types';
import { decodeSPR, type DecodedSprite, type SpriteFrame } from './sprite';
import { decodeACT, type DecodedACT, type ActionLayer, type ActionFrame } from './action';
import { assetUrl } from './items';
import { weaponAssetPath, weaponTrailAssetPath, weaponAttackAction, type WeaponAppearance } from './weapon';
export type { WeaponAppearance } from './weapon';
/** Visual size of game characters; effects and loot keep their native scale. */
export const GAME_ACTOR_SCALE = 1.1;
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
    weaponTrail?: ActorPart;
    weaponVisual?: WeaponAppearance;
    identity?: { job: string; gender: 'male' | 'female' };
}
export interface PosedLayer extends ActionLayer {
    image: SpriteFrame;
}
const actorCache = new Map<string, Promise<DecodedActor>>();
const ACTOR_CACHE_LIMIT = 64;
const paletteCache = new Map<string, Promise<Uint8Array | undefined>>();
class ActorResourceError extends Error {
    constructor(readonly status: number, path: string) {
        super(`Recurso indisponível (${status}): ${path}`);
    }
}
async function binary(path: string): Promise<ArrayBuffer> {
    // Recover a transient resource before publishing a partially equipped actor.
    // Permanent missing files still reach the existing actor fallback immediately.
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await fetch(assetUrl(path), { signal: AbortSignal.timeout(15000) });
            if (!response.ok) {
                await response.body?.cancel();
                throw new ActorResourceError(response.status, path);
            }
            return await response.arrayBuffer();
        } catch (error) {
            const retryable = error instanceof ActorResourceError
                ? error.status === 408 || error.status === 429 || error.status >= 500
                : error instanceof TypeError || error instanceof DOMException && error.name === 'TimeoutError';
            if (attempt > 0 || !retryable) throw error;
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }
}
async function loadPart(spr: string, act: string): Promise<ActorPart> { const [s, a] = await Promise.all([binary(spr), binary(act)]); return { sprite: decodeSPR(s), action: decodeACT(a) }; }
function assetWithAppearance(asset: SpriteAsset, appearance?: Appearance): SpriteAsset {
    if (!appearance || !asset.headSpr) return asset;
    const selectedStyle = appearance.hairStyle + 1;
    const styledHead = asset.headSpr.replace(/(\/)\d+_(남|여)(\.spr)$/u, (_, separator: string, sex: string, extension: string) => `${separator}${selectedStyle}_${sex}${extension}`);
    const styledHeadAct = asset.headAct?.replace(/(\/)\d+_(남|여)(\.act)$/u, (_, separator: string, sex: string, extension: string) => `${separator}${selectedStyle}_${sex}${extension}`);
    if (styledHead === asset.headSpr && styledHeadAct === asset.headAct) return asset;
    return { ...asset, headSpr: styledHead, ...(styledHeadAct ? { headAct: styledHeadAct } : {}) };
}
function paletteAssetPaths(asset: SpriteAsset, appearance?: Appearance): { body?: string; head?: string } {
    if (!appearance) return {};
    const body = appearance.clothesColor > 0
        ? asset.spr.replace(/\\/g, '/').match(/^(.*\/몸통\/(?:남|여)\/)([^/]+)_(남|여)\.spr$/u)
        : null;
    const head = appearance.hairColor > 0 && asset.headSpr
        ? asset.headSpr.replace(/\\/g, '/').match(/\/머리통\/(?:남|여)\/(\d+)_(남|여)\.spr$/u)
        : null;
    return {
        ...(body ? { body: `data/palette/몸/${body[2]}_${body[3]}_${appearance.clothesColor}.pal` } : {}),
        ...(head ? { head: `data/palette/머리/머리${appearance.hairStyle + 1}_${head[2]}_${appearance.hairColor}.pal` } : {}),
    };
}
function loadPalette(path?: string): Promise<Uint8Array | undefined> {
    if (!path) return Promise.resolve(undefined);
    const existing = paletteCache.get(path);
    if (existing) return existing;
    const promise = binary(path).then(bytes => bytes.byteLength >= 1024
        ? new Uint8Array(bytes.slice(0, 1024)) : undefined).catch(() => undefined);
    paletteCache.set(path, promise);
    return promise;
}
function applyPalette(sprite: DecodedSprite, palette?: Uint8Array): DecodedSprite {
    if (!palette || palette.length < 1024 || !sprite.indexedCount) return sprite;
    const frames = sprite.frames.map(frame => {
        if (frame.type !== 0 || !frame.indexedPixels) return frame;
        const rgba = new Uint8ClampedArray(frame.rgba.length);
        for (let pixel = 0; pixel < frame.indexedPixels.length; pixel++) {
            const index = frame.indexedPixels[pixel], target = pixel * 4;
            if (index === 0) continue;
            const source = index * 4;
            rgba[target] = palette[source];
            rgba[target + 1] = palette[source + 1];
            rgba[target + 2] = palette[source + 2];
            rgba[target + 3] = 255;
        }
        return { ...frame, rgba };
    });
    return { ...sprite, palette: new Uint8Array(palette), frames };
}
async function loadOptionalPart(spr?: string, act?: string, allowMissing = false): Promise<{ value?: ActorPart; error?: unknown }> {
    if (!spr || !act) return {};
    try { return { value: await loadPart(spr, act) }; }
    catch (error) {
        if (allowMissing && error instanceof ActorResourceError && error.status === 404) return {};
        return { error };
    }
}
export function loadActor(asset: SpriteAsset, weaponVisual?: WeaponAppearance, appearance?: Appearance, identity?: DecodedActor['identity']): Promise<DecodedActor> {
    const actorAsset = assetWithAppearance(asset, appearance);
    const kind: DecodedActor['kind'] = actorAsset.headSpr || actorAsset.headAct || actorAsset.spr.replace(/\\/g, '/').includes('인간족/몸통/') ? 'character' : 'monster';
    const key = JSON.stringify({ asset: actorAsset, weaponVisual, appearance, identity });
    const cached = actorCache.get(key);
    if (cached) {
        actorCache.delete(key);
        actorCache.set(key, cached);
        return cached;
    }
    const promise = (async () => {
        try {
            const body = await loadPart(actorAsset.spr, actorAsset.act);
            const weaponFiles = weaponVisual ? weaponAssetPath(actorAsset, weaponVisual) : null;
            const trailFiles = weaponVisual ? weaponTrailAssetPath(actorAsset, weaponVisual) : null;
            const palettes = paletteAssetPaths(actorAsset, appearance);
            const [headResult, weaponResult, trailResult, bodyPalette, headPalette] = await Promise.all([
                loadOptionalPart(actorAsset.headSpr, actorAsset.headAct),
                loadOptionalPart(weaponFiles?.spr, weaponFiles?.act),
                // Some original weapon types have no trail resource. Its absence
                // leaves the equipped weapon usable without retrying the actor.
                loadOptionalPart(trailFiles?.spr, trailFiles?.act, true),
                loadPalette(palettes.body),
                loadPalette(palettes.head),
            ]);
            body.sprite = applyPalette(body.sprite, bodyPalette);
            if (headResult.value) headResult.value.sprite = applyPalette(headResult.value.sprite, headPalette);
            const errors = [headResult.error, weaponResult.error, trailResult.error]
                .filter(error => error !== undefined)
                .map(error => error instanceof Error ? error.message : String(error));
            return {
                kind, fallback: false, body,
                head: headResult.value,
                weapon: weaponResult.value,
                weaponTrail: trailResult.value,
                weaponVisual,
                identity: identity ?? weaponVisual,
                error: errors.length ? errors.join('; ') : undefined,
            };
        }
        catch (e) {
            return { kind, fallback: true, error: e instanceof Error ? e.message : String(e) };
        }
    })();
    actorCache.set(key, promise);
    while (actorCache.size > ACTOR_CACHE_LIMIT) {
        const oldest = actorCache.keys().next().value;
        if (oldest === undefined) break;
        actorCache.delete(oldest);
    }
    void promise.then((actor) => {
        if ((actor.fallback || actor.error) && actorCache.get(key) === promise)
            actorCache.delete(key);
    });
    return promise;
}
export function getAttackAction(actor: DecodedActor): number {
    const candidate = actor.kind === 'character' ? weaponAttackAction(actor.weaponVisual) : 16;
    // Some classic GRFs put the dancer dagger in group 80 while the pinned
    // WeaponAction table selects group 40 (entirely hidden -1 layers).
    // Switch body and equipment together, only when all eight replacement
    // directions exist. Other weapons and drawable table entries stay intact.
    const visual = actor.weaponVisual;
    if (actor.kind === 'character' && visual?.type === 'dagger' && ['dancer', 'gypsy'].includes(visual.job)
        && actor.weapon && actor.body) {
        const drawable = (part: ActorPart, index: number) =>
            part.action.actions[index]?.frames.some(frame => frame.layers.some(layer => {
                const image = layer.index < 0 ? undefined : part.sprite.frames[
                    layer.index + (layer.type === 1 ? part.sprite.indexedCount : 0)];
                return image && image.width > 0 && image.height > 0
                    && layer.scaleX !== 0 && layer.scaleY !== 0 && layer.color[3] > 0;
            })) ?? false;
        const directions = Array.from({ length: 8 }, (_, direction) => direction);
        if (directions.every(direction => !drawable(actor.weapon!, candidate + direction))
            && directions.every(direction => drawable(actor.body!, 80 + direction)
                && drawable(actor.weapon!, 80 + direction))) return 80;
    }
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

// Numeric groups keep legacy looping poses; named skill groups are one-shots.
export type ActorAction = number | 'idle' | 'attack' | 'attack1' | 'attack2' | 'attack3' | 'pickup' | 'comboTriple' | 'comboChain' | 'comboFinish' | 'comboCrush' | 'cast' | 'skill' | 'hurt' | 'dead';

// roBrowserLegacy d88a3cd4, src/DB/Skills/SkillAction.js: the two regular
// makeAttackSkillAction('ATTACK') chains for imported pre-renewal skills.
// https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/DB/Skills/SkillAction.js
// Dedicated throwing, combo-slice and fixed-speed handlers are distinct actions.
const WEAPON_SKILL_ACTIONS = new Set([
    'SM_BASH', 'SM_MAGNUM', 'KN_PIERCE', 'KN_BRANDISHSPEAR', 'KN_SPEARSTAB',
    'KN_BOWLINGBASH', 'BS_HAMMERFALL', 'AC_CHARGEARROW', 'RG_BACKSTAP', 'RG_RAID',
    'RG_INTIMIDATE', 'CR_SHIELDCHARGE', 'CR_HOLYCROSS', 'BA_MUSICALSTRIKE',
    'DC_THROWARROW', 'LK_SPIRALPIERCE', 'LK_HEADCRUSH', 'LK_JOINTBEAT', 'HW_MAGICPOWER',
    'PA_SACRIFICE', 'ASC_METEORASSAULT', 'CR_ACIDDEMONSTRATION', 'AC_DOUBLE',
    'HT_PHANTASMIC', 'SN_SHARPSHOOTING',
]);

// Fixed ACT groups in the same pinned SkillAction.js. They bypass the
// equipped-weapon selector; equipment visibility comes from the matching ACT.
const FIXED_SKILL_ACTIONS = new Map<string, ActorAction>([
    ...['KN_SPEARBOOMERANG', 'CR_SHIELDBOOMERANG', 'AM_DEMONSTRATION', 'AM_ACIDTERROR',
        'AM_POTIONPITCHER', 'TF_SPRINKLESAND', 'TF_THROWSTONE', 'AS_VENOMKNIFE',
        'PA_SHIELDCHAIN'].map(source => [source, 'attack1'] as const),
    ...['TF_POISON', 'MC_MAMMONITE', 'MC_CARTREVOLUTION'].map(source => [source, 'attack2'] as const),
    ['ASC_BREAKER', 'attack3'],
    ...['HT_LANDMINE', 'HT_ANKLESNARE', 'HT_SHOCKWAVE', 'HT_SANDMAN', 'HT_FLASHER',
        'HT_FREEZINGTRAP', 'HT_BLASTMINE', 'HT_CLAYMORETRAP', 'TF_PICKSTONE']
        .map(source => [source, 'pickup'] as const),
]);

// SkillAction.js d88a3cd4 slice ranges; DBManager.getAttackSlice gates
// these ranges to Monk-family unarmed sheets in the supported weapon model.
const COMBO_SLICES = {
    comboTriple: [5, 4], comboChain: [9, 4], comboFinish: [13, 2], comboCrush: [5, 8],
} as const;
const COMBO_SKILL_ACTIONS = new Map<string, keyof typeof COMBO_SLICES>([
    ['MO_TRIPLEATTACK', 'comboTriple'], ['MO_CHAINCOMBO', 'comboChain'],
    ['MO_COMBOFINISH', 'comboFinish'], ['CH_PALMSTRIKE', 'comboFinish'],
    ['CH_TIGERFIST', 'comboChain'], ['CH_CHAINCRUSH', 'comboCrush'],
    ['MO_EXTREMITYFIST', 'comboFinish'],
]);
function comboSlice(action: ActorAction): readonly [number, number] | undefined {
    return typeof action === 'string' && Object.hasOwn(COMBO_SLICES, action)
        ? COMBO_SLICES[action as keyof typeof COMBO_SLICES] : undefined;
}

/** Attack-driven skills share contact timing with their visible weapon ACT. */
export function isWeaponAttackActorAction(action: ActorAction): boolean {
    return action === 'attack' || comboSlice(action) !== undefined;
}

export function getCombatActorAction(actorAction: 'attack' | 'skill' | 'none', skillSourceName?: string): ActorAction {
    if (actorAction === 'none') return 'idle';
    const combo = COMBO_SKILL_ACTIONS.get(skillSourceName ?? '');
    if (combo) return combo;
    if (actorAction === 'attack' || skillSourceName !== undefined && WEAPON_SKILL_ACTIONS.has(skillSourceName)) return 'attack';
    return FIXED_SKILL_ACTIONS.get(skillSourceName ?? '') ?? 'skill';
}

function actorBodyAction(actor: DecodedActor, action: ActorAction, direction: number) {
    if (!actor.body || actor.fallback)
        return undefined;
    // EntityAction.js: each ACT group has eight directions. SKILL is group 12
    // (96..103) for PCs. Monsters do not share the PC skill action layout.
    const actions = actor.kind === 'character'
        ? { idle: 0, attack: getAttackAction(actor), attack1: 40, attack2: 80, attack3: 88, pickup: 24, cast: 96, skill: 96, hurt: 48, dead: 64 }
        : { idle: 0, attack: 16, attack1: 16, attack2: 16, attack3: 16, pickup: 0, cast: 0, skill: 0, hurt: 24, dead: 32 };
    const base = typeof action === 'number' ? action
        : comboSlice(action) ? actions.attack : actions[action as keyof typeof actions];
    const dir = Number.isFinite(direction) ? Math.max(0, Math.min(7, Math.trunc(direction))) : 0;
    // Keep the requested body direction whenever its ACT provides it. Optional
    // head and weapon layers independently choose a same-facing fallback.
    const candidates = [...new Set([base + dir, base, dir, 0])];
    const index = candidates.find((candidate) => actionFrames(actor.body!, candidate));
    if (index === undefined) return undefined;
    const bodyFrames = actionFrames(actor.body, index);
    if (!bodyFrames)
        return undefined;
    const delay = Math.max(25, actor.body.action.actions[index]?.delayMs ?? actor.body.action.actions[0]?.delayMs ?? 150);
    return { index, bodyFrames, delay, fallbackAction: Math.floor(index / 8) !== Math.floor(base / 8) };
}

export function getActorActionDuration(actor: DecodedActor, action: ActorAction, direction = 0, fallback = 500): number {
    const selected = actorBodyAction(actor, action, direction);
    return selected ? actorPlayback(actor, action, selected).duration : fallback;
}

/** roBrowser d88a3cd4 DBManager1472..1517/2237..2259 and Entity632..642.
 * amotion is a divisor input, not the duration of an arbitrary ACT sheet. */
function actorPlayback(actor: DecodedActor, action: ActorAction, selected: NonNullable<ReturnType<typeof actorBodyAction>>, motionMs?: number) {
    const identity = actor.identity ?? actor.weaponVisual;
    const type = actor.weaponVisual?.type;
    const attack = actor.kind === 'character' && action === 'attack' && !selected.fallbackAction;
    const job = identity?.job;
    const monkSlice = attack && ['monk', 'champion'].includes(job ?? '') && !type;
    const requestedSlice = comboSlice(action);
    const slice = actor.kind === 'character' && !selected.fallbackAction
        && ['monk', 'champion'].includes(job ?? '') && !type && requestedSlice
        && selected.bodyFrames.length >= requestedSlice[0] + requestedSlice[1] ? requestedSlice : undefined;
    const startFrame = slice?.[0] ?? 0;
    const frames = slice?.[1] ?? (monkSlice ? Math.min(5, selected.bodyFrames.length) : selected.bodyFrames.length);
    const divisor = attack && ['novice', 'high_novice', 'super_novice', 'baby_novice', 'baby_super_novice'].includes(job ?? '') && identity?.gender === 'male' ? 5.85
        : attack && ['assassin', 'assassin_cross', 'baby_assassin'].includes(job ?? '') && type === 'katar' ? 3 : 6;
    const looping = typeof action === 'number' || action === 'idle' || action === 'cast';
    // Short ACT sheets should use the whole server contact window, not freeze on the final frame.
    const delay = !looping && Number.isFinite(motionMs) && motionMs! > 0
        ? Math.max(1, motionMs! / (attack ? Math.min(divisor, frames) : frames)) : selected.delay;
    return { frames, startFrame, delay, duration: frames * delay };
}
export function getActorPlaybackDuration(actor: DecodedActor, action: ActorAction, motionMs: number, direction = 0): number {
    const selected = actorBodyAction(actor, action, direction);
    return selected ? actorPlayback(actor, action, selected, motionMs).duration : motionMs;
}

export function getActorPose(actor: DecodedActor, action: ActorAction, elapsed: number, direction = 0, motionMs?: number): PosedLayer[] {
    const selected = actorBodyAction(actor, action, direction);
    if (!selected || !actor.body) return [];
    const { index, bodyFrames, delay, fallbackAction } = selected;
    // PC idle's three ACT frames are head-direction/doridori variants. The
    // original renderer holds the first direction until a head turn is asked for.
    const staticIdle = actor.kind === 'character' && index < 8;
    const staticFallbackDeath = action === 'dead' && fallbackAction;
    const looping = typeof action === 'number' || action === 'idle' || action === 'cast';
    // The server movement controls a one-shot's pace; every optional layer
    // follows the body's frame index instead of advancing on a separate clock.
    const playback = actorPlayback(actor, action, selected, motionMs);
    const playbackDelay = playback.delay;
    const elapsedFrame = Math.floor(Math.max(0, elapsed) / playbackDelay);
    const frameIndex = staticIdle || staticFallbackDeath ? 0 : looping
        ? elapsedFrame % playback.frames
        : playback.startFrame + Math.min(elapsedFrame, playback.frames - 1);
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
        // EntityRender draws weapon then weapon_trail as main parts: ACT
        // coordinates use the body origin and ignore attachment anchors.
        for (const part of [actor.weapon, actor.weaponTrail]) {
            if (!part) continue;
            const selected = facingFrames(part, index);
            const weaponFrame = selected?.frames[selected.index < 8 ? 0 : Math.min(frameIndex, selected.frames.length - 1)];
            if (weaponFrame) append(part, weaponFrame);
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
export function drawActor(ctx: CanvasRenderingContext2D, actor: DecodedActor, action: ActorAction, elapsed: number, x: number, y: number, scale = 1, direction = 0, motionMs?: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    const pose = getActorPose(actor, action, elapsed, direction, motionMs);
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
