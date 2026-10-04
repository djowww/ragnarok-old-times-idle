/** Cosmetic combat effects drawn over the local RO map. Client pixels stay in
 * memory and are fetched through the existing local asset proxy. */
import type { Skill } from '../../shared/types';
import { decodeSPR, type SpriteFrame } from './sprite';
import { decodeBMP, assetUrl } from './items';
import { drawActor, loadActor, type DecodedActor } from './renderer';

export const DAMAGE_POPUP_MS = 1500;
export const EMOTE_MS = 1500;
export const SKILL_EFFECT_MS = 1200;
/** Scene cues use a 1100 ms magical action: release at 420 ms, first impact at 700 ms. */
export const SKILL_CAST_MS = 420;
export const SKILL_IMPACT_MS = 700;
const BOLT_FALL_MS = SKILL_IMPACT_MS - SKILL_CAST_MS;
const BOLT_STAGGER_MS = 60;
const BOLT_IMPACT_GLOW_MS = 160;
const MAX_VISIBLE_BOLTS = 5;
export const EMOTE_ACTIONS = [0, 1, 2, 3, 18, 21, 33] as const;

type Tint = 'enemy' | 'player' | 'heal' | 'critical';
type Digits = Record<Tint, HTMLCanvasElement[]>;

export interface SceneEffects {
  digits: Digits | null;
  miss: HTMLCanvasElement | null;
  emotion: DecodedActor | null;
  blessing: DecodedActor | null;
  firstAid: HTMLCanvasElement | null;
  fireBolt: HTMLCanvasElement[];
  coldBolt: HTMLCanvasElement | null;
  healRing: HTMLCanvasElement | null;
  healParticle: HTMLCanvasElement | null;
  jupitelCenter: HTMLCanvasElement | null;
  jupitelBall: HTMLCanvasElement[];
  jupitelImpact: HTMLCanvasElement[];
}

export interface DamagePopup {
  text: string;
  target: 'enemy' | 'player';
  critical?: boolean;
  x: number;
  y: number;
  elapsedMs: number;
  reducedMotion?: boolean;
}

export interface EmotionBubble {
  action: number;
  x: number;
  y: number;
  elapsedMs: number;
  reducedMotion?: boolean;
}

export interface SkillFlash {
  skillId?: string;
  name: string;
  kind?: Skill['kind'];
  element?: string;
  /** Skill level at the event, used only for the number of visible bolts. */
  level?: number;
  /** Duration of the stationary cast phase. Defaults to SKILL_CAST_MS. */
  castMs?: number;
  /** Caster's feet on the canvas; target x/y continue to locate the impact. */
  casterX?: number;
  casterY?: number;
  x: number;
  y: number;
  elapsedMs: number;
  reducedMotion?: boolean;
}

const EFFECT_FOLDER = 'data/sprite/이팩트/';
const TEXTURE_FOLDER = 'data/texture/effect/';
let effectsPromise: Promise<SceneEffects> | null = null;

async function binary(path: string): Promise<ArrayBuffer> {
  const response = await fetch(assetUrl(path), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${path}`);
  return response.arrayBuffer();
}

function canvasFromPixels(width: number, height: number, rgba: Uint8ClampedArray): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  const image = ctx.createImageData(width, height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function tintFrame(frame: SpriteFrame, [red, green, blue]: readonly number[]): HTMLCanvasElement {
  const pixels = new Uint8ClampedArray(frame.rgba);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round(pixels[i] * red);
    pixels[i + 1] = Math.round(pixels[i + 1] * green);
    pixels[i + 2] = Math.round(pixels[i + 2] * blue);
  }
  return canvasFromPixels(frame.width, frame.height, pixels);
}

async function loadDigits(): Promise<Digits> {
  const sprite = decodeSPR(await binary(EFFECT_FOLDER + '숫자.spr'));
  if (sprite.frames.length < 10) throw new Error('Dígitos do cliente incompletos');
  return {
    enemy: sprite.frames.map((frame) => tintFrame(frame, [1, 1, 1])),
    player: sprite.frames.map((frame) => tintFrame(frame, [1, 0.08, 0.08])),
    heal: sprite.frames.map((frame) => tintFrame(frame, [0.08, 1, 0.08])),
    critical: sprite.frames.map((frame) => tintFrame(frame, [0.9, 0.9, 0.15])),
  };
}

async function loadMiss(): Promise<HTMLCanvasElement> {
  const frame = decodeSPR(await binary(EFFECT_FOLDER + 'msg.spr')).frames[0];
  if (!frame) throw new Error('MISS do cliente indisponível');
  return canvasFromPixels(frame.width, frame.height, frame.rgba);
}

async function loadBmp(path: string): Promise<HTMLCanvasElement> {
  const bitmap = decodeBMP(await binary(path));
  return canvasFromPixels(bitmap.width, bitmap.height, bitmap.rgba);
}

/** The original bolt and Heal textures in this bRO GRF are uncompressed, 32-bit TGA.
 * Reject unsupported variants instead of interpreting arbitrary bytes as pixels. */
function decodeSimpleTga(data: ArrayBuffer): HTMLCanvasElement {
  const bytes = new Uint8Array(data);
  if (bytes.length < 18 || bytes[1] !== 0 || bytes[2] !== 2 || bytes[16] !== 32)
    throw new Error('Formato TGA não suportado');
  const view = new DataView(data);
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const start = 18 + bytes[0];
  if (!width || !height || width * height > 16_777_216 || start + width * height * 4 > bytes.length)
    throw new Error('Dimensões TGA inválidas');
  const pixels = new Uint8ClampedArray(width * height * 4);
  const topOrigin = !!(bytes[17] & 0x20);
  const rightOrigin = !!(bytes[17] & 0x10);
  for (let row = 0; row < height; row++) {
    const y = topOrigin ? row : height - row - 1;
    for (let col = 0; col < width; col++) {
      const x = rightOrigin ? width - col - 1 : col;
      const src = start + (row * width + col) * 4;
      const dst = (y * width + x) * 4;
      pixels[dst] = bytes[src + 2];
      pixels[dst + 1] = bytes[src + 1];
      pixels[dst + 2] = bytes[src];
      pixels[dst + 3] = bytes[src + 3];
    }
  }
  return canvasFromPixels(width, height, pixels);
}

async function loadTga(path: string): Promise<HTMLCanvasElement> {
  return decodeSimpleTga(await binary(path));
}

function optional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

async function loadBmpSequence(names: string[]): Promise<HTMLCanvasElement[]> {
  const frames = await Promise.all(names.map((name) => optional(loadBmp(TEXTURE_FOLDER + name), null)));
  return frames.filter((frame): frame is HTMLCanvasElement => !!frame);
}

/** No extracted GRF resource is bundled in the app or persisted by this loader. */
export function loadSceneEffects(): Promise<SceneEffects> {
  if (effectsPromise) return effectsPromise;
  effectsPromise = (async () => {
    const [digits, miss, emotion, blessing, firstAid, fireBolt, coldBolt,
      healRing, healParticle, jupitelCenter, jupitelBall, jupitelImpact] = await Promise.all([
      optional(loadDigits(), null),
      optional(loadMiss(), null),
      optional(loadActor({ spr: EFFECT_FOLDER + 'emotion.spr', act: EFFECT_FOLDER + 'emotion.act' }).then((actor) => actor.fallback ? null : actor), null),
      optional(loadActor({ spr: EFFECT_FOLDER + '축복.spr', act: EFFECT_FOLDER + '축복.act' }).then((actor) => actor.fallback ? null : actor), null),
      optional(loadBmp(TEXTURE_FOLDER + 'pikapika2.bmp'), null),
      Promise.all(Array.from({ length: 6 }, (_, i) => optional(loadTga(TEXTURE_FOLDER + `불화살${i + 1}.tga`), null)))
        .then((frames) => frames.filter((frame): frame is HTMLCanvasElement => !!frame)),
      optional(loadTga(TEXTURE_FOLDER + 'icearrow.tga'), null),
      optional(loadTga(TEXTURE_FOLDER + 'ring_white.tga'), null),
      optional(loadTga(TEXTURE_FOLDER + 'pok3.tga'), null),
      optional(loadBmp(TEXTURE_FOLDER + 'thunder_center.bmp'), null),
      loadBmpSequence(['thunder_ball_a.bmp', 'thunder_ball_b.bmp', 'thunder_ball_c.bmp',
        'thunder_ball_d.bmp', 'thunder_ball_e.bmp', 'thunder_ball_f.bmp']),
      loadBmpSequence(['thunder_pang.bmp', 'thunder_plazma_blast_a.bmp',
        'thunder_plazma_blast_b.bmp', 'thunder_ball_d.bmp', 'thunder_ball_e.bmp',
        'thunder_ball_f.bmp']),
    ]);
    return { digits, miss, emotion, blessing, firstAid, fireBolt, coldBolt,
      healRing, healParticle, jupitelCenter, jupitelBall, jupitelImpact };
  })();
  return effectsPromise;
}

function visible(elapsedMs: number, duration: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < duration;
}

export function drawDamagePopup(ctx: CanvasRenderingContext2D, assets: SceneEffects | null, cue: DamagePopup): void {
  const { text, x, y, elapsedMs, reducedMotion = false } = cue;
  if (!visible(elapsedMs, DAMAGE_POPUP_MS)) return;
  const progress = elapsedMs / DAMAGE_POPUP_MS;
  const rise = reducedMotion ? 0 : Math.sin(progress * Math.PI) * 18 + progress * 10;
  const drift = reducedMotion ? 0 : progress * 12;
  const alpha = reducedMotion ? 1 : 1 - progress;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (text.toUpperCase() === 'MISS' && assets?.miss) {
    const frame = assets.miss;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, x + drift - frame.width / 2, y - rise - frame.height / 2);
  } else {
    const heal = text.startsWith('+');
    const tint: Tint = heal ? 'heal' : cue.critical ? 'critical' : cue.target;
    const digitFrames = assets?.digits?.[tint];
    const numeric = text.replace(/[^0-9]/g, '');
    if (digitFrames && numeric) {
      const frames = [...numeric].map((value) => digitFrames[Number(value)]).filter(Boolean);
      const scale = 1.8;
      const gap = 2;
      const width = frames.reduce((sum, frame) => sum + frame.width * scale + gap, -gap);
      let left = x + drift - width / 2;
      const height = Math.max(...frames.map((frame) => frame.height));
      ctx.imageSmoothingEnabled = false;
      for (const frame of frames) {
        ctx.drawImage(frame, left, y - rise - height * scale / 2 + (height - frame.height) * scale / 2, frame.width * scale, frame.height * scale);
        left += frame.width * scale + gap;
      }
    } else {
      ctx.font = 'bold 20px Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#25302b';
      ctx.fillStyle = heal ? '#77f173' : cue.critical ? '#ffe653' : cue.target === 'player' ? '#ff8171' : '#fff7d9';
      ctx.strokeText(text, x + drift, y - rise);
      ctx.fillText(text, x + drift, y - rise);
    }
  }
  ctx.restore();
}

export function drawEmotion(ctx: CanvasRenderingContext2D, assets: SceneEffects | null, cue: EmotionBubble): void {
  if (!visible(cue.elapsedMs, EMOTE_MS)) return;
  ctx.save();
  ctx.globalAlpha *= cue.reducedMotion ? 1 : Math.min(1, (EMOTE_MS - cue.elapsedMs) / 250);
  if (assets?.emotion) {
    drawActor(ctx, assets.emotion, cue.action, cue.reducedMotion ? 0 : cue.elapsedMs, cue.x, cue.y, 1.5);
  } else {
    ctx.fillStyle = '#fff5d8';
    ctx.strokeStyle = '#38473a';
    ctx.lineWidth = 3;
    ctx.font = 'bold 21px Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeText('!', cue.x, cue.y);
    ctx.fillText('!', cue.x, cue.y);
  }
  ctx.restore();
}

const elementColors: Record<string, string> = {
  fire: '#ff893e', water: '#89daff', wind: '#e9df8b', holy: '#ffedaa',
  earth: '#c0d477', poison: '#b6da7c', neutral: '#e6e4d1',
};

/** A flat presentation of Heal's original ring and particle textures. */
function drawHealEffect(ctx: CanvasRenderingContext2D, assets: SceneEffects, cue: SkillFlash): boolean {
  if (!assets.healRing && !assets.healParticle) return false;
  const { x, y, elapsedMs, reducedMotion = false } = cue;
  const time = reducedMotion ? 420 : elapsedMs;
  const baseAlpha = ctx.globalAlpha;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (assets.healRing) {
    for (let i = 0; i < 2; i++) {
      const delay = i * 160;
      if (time < delay) continue;
      const phase = Math.min(1, (time - delay) / 850);
      const width = 76 + phase * 20;
      const height = 24 + phase * 6;
      const rise = reducedMotion ? 23 + i * 16 : phase * 56;
      ctx.globalAlpha = baseAlpha * (reducedMotion ? 0.38 : 0.42 * (1 - phase));
      ctx.drawImage(assets.healRing, x - width / 2, y + 26 - rise, width, height);
    }
  }
  if (assets.healParticle) {
    for (let i = 0; i < 14; i++) {
      const delay = (i * 83) % 480;
      if (time < delay) continue;
      const phase = Math.min(1, (time - delay) / 690);
      const size = 9 + (i % 3) * 3;
      const offset = Math.sin(i * 12.7) * (17 + (i % 4) * 4);
      const rise = reducedMotion ? 28 + (i % 5) * 10 : phase * 77;
      ctx.globalAlpha = baseAlpha * (reducedMotion ? 0.48 : 0.6 * (1 - phase));
      ctx.drawImage(assets.healParticle, x + offset - size / 2, y + 26 - rise, size, size);
    }
  }
  ctx.restore();
  return true;
}

/** Jupitel's original BMP frames are presented as flat light overlays. */
function drawJupitelEffect(ctx: CanvasRenderingContext2D, assets: SceneEffects, cue: SkillFlash): boolean {
  if (!assets.jupitelCenter && !assets.jupitelBall.length && !assets.jupitelImpact.length) return false;
  const { x, y, elapsedMs, reducedMotion = false } = cue;
  const time = reducedMotion ? 320 : elapsedMs;
  const baseAlpha = ctx.globalAlpha;
  let drewFrame = false;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  if (assets.jupitelCenter && time < 580) {
    ctx.globalAlpha = baseAlpha * 0.66;
    ctx.drawImage(assets.jupitelCenter, x - 39, y - 47, 78, 78);
    drewFrame = true;
  }
  if (assets.jupitelBall.length && time < 640) {
    const frame = assets.jupitelBall[Math.min(assets.jupitelBall.length - 1, Math.floor(time / 75) % assets.jupitelBall.length)];
    ctx.globalAlpha = baseAlpha * 0.88;
    ctx.drawImage(frame, x - 43, y - 51, 86, 86);
    drewFrame = true;
  }
  if (assets.jupitelImpact.length && time >= 180) {
    const impactTime = time - 180;
    const frame = assets.jupitelImpact[Math.min(assets.jupitelImpact.length - 1, Math.floor(impactTime / 90))];
    const size = 82 + Math.min(1, impactTime / 550) * 32;
    ctx.globalAlpha = baseAlpha * (reducedMotion ? 0.65 : 0.8 * Math.max(0, 1 - impactTime / 850));
    ctx.drawImage(frame, x - size / 2, y - size / 2 - 9, size, size);
    drewFrame = true;
  }
  ctx.restore();
  return drewFrame;
}

function drawCastSigil(ctx: CanvasRenderingContext2D, assets: SceneEffects | null, cue: SkillFlash, fire: boolean): void {
  const castMs = Number.isFinite(cue.castMs) ? Math.max(0, cue.castMs!) : SKILL_CAST_MS;
  if (cue.elapsedMs >= castMs) return;
  const x = cue.casterX ?? cue.x;
  const y = cue.casterY ?? cue.y + 50;
  const phase = castMs > 0 ? cue.elapsedMs / castMs : 1;
  ctx.save();
  ctx.globalAlpha *= 0.36 + phase * 0.4;
  ctx.globalCompositeOperation = 'lighter';
  if (assets?.healRing) {
    const ring = assets.healRing;
    ctx.drawImage(ring, x - 34, y - 12, 68, 24);
  }
  ctx.strokeStyle = fire ? '#ffcb76' : '#a9e8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, 30, 11, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (!cue.reducedMotion) {
    const orbit = phase * Math.PI * 1.5;
    for (let i = 0; i < 4; i++) {
      const angle = orbit + i * Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * 28, y + Math.sin(angle) * 10, 2, 0, Math.PI * 2);
      ctx.fillStyle = fire ? '#fff0b4' : '#e6f8ff';
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBoltEffect(ctx: CanvasRenderingContext2D, assets: SceneEffects | null, cue: SkillFlash, fire: boolean): void {
  const castMs = Number.isFinite(cue.castMs) ? Math.max(0, cue.castMs!) : SKILL_CAST_MS;
  drawCastSigil(ctx, assets, cue, fire);
  const count = cue.reducedMotion ? 1 : Math.min(MAX_VISIBLE_BOLTS,
    Number.isFinite(cue.level) ? Math.max(1, Math.floor(cue.level!)) : 1);
  const frames = fire ? assets?.fireBolt ?? [] : assets?.coldBolt ? [assets.coldBolt] : [];
  const color = fire ? '#ffad52' : '#b9ecff';
  const offsets = [0, -12, 12, -22, 22];
  for (let i = 0; i < count; i++) {
    const offset = offsets[i];
    const releasedAt = castMs + (cue.reducedMotion ? 0 : i * BOLT_STAGGER_MS);
    const local = cue.elapsedMs - releasedAt;
    if (local < 0) continue;
    const fall = Math.min(1, local / BOLT_FALL_MS);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (local <= BOLT_FALL_MS && frames.length) {
      const frame = frames[cue.reducedMotion ? 0 : Math.min(frames.length - 1,
        Math.floor(fall * frames.length))];
      // The client's TGA is a horizontal 3D-effect texture. Rotate its long
      // axis into a narrow descending bolt, with the small RO isometric lean.
      const centerX = cue.x + offset + (cue.reducedMotion ? 0 : (1 - fall) * 16);
      const centerY = cue.y - 20 - (cue.reducedMotion ? 0 : (1 - fall) * 145);
      ctx.translate(centerX, centerY);
      ctx.rotate(Math.PI / 2 + 0.12);
      ctx.globalAlpha *= cue.reducedMotion ? 0.72 : Math.min(1, local / 45, (BOLT_FALL_MS - local) / 35);
      ctx.drawImage(frame, -52, -13, 104, 26);
    } else if (local <= BOLT_FALL_MS && !frames.length) {
      const centerX = cue.x + offset + (cue.reducedMotion ? 0 : (1 - fall) * 16);
      const centerY = cue.y - 20 - (cue.reducedMotion ? 0 : (1 - fall) * 145);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(centerX + 5, centerY - 46);
      ctx.lineTo(centerX - 5, centerY + 46);
      ctx.stroke();
    }
    const impactTime = local - BOLT_FALL_MS;
    if (impactTime >= 0 && impactTime < BOLT_IMPACT_GLOW_MS) {
      const phase = cue.reducedMotion ? 0.45 : impactTime / BOLT_IMPACT_GLOW_MS;
      ctx.globalAlpha *= cue.reducedMotion ? 0.55 : 0.75 * (1 - phase);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cue.x + offset, cue.y + 22, 9 + phase * 12, 4 + phase * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Draws original 2D art where supported. Heal and Jupitel reuse original
 * textures in a flat approximation; STR/3D choreography is not reproduced. */
export function drawSkillEffect(ctx: CanvasRenderingContext2D, assets: SceneEffects | null, cue: SkillFlash): void {
  const { skillId, name, x, y, elapsedMs, reducedMotion = false } = cue;
  if (!visible(elapsedMs, SKILL_EFFECT_MS)) return;
  const progress = elapsedMs / SKILL_EFFECT_MS;
  const bolt = skillId === 'fire_bolt' || skillId === 'cold_bolt';
  const alpha = bolt ? 1 : reducedMotion ? 0.9 : 1 - progress;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = false;
  let original = false;
  if (bolt) {
    drawBoltEffect(ctx, assets, cue, skillId === 'fire_bolt');
    original = true;
  } else if (skillId === 'first_aid' && assets?.firstAid) {
    const frame = assets.firstAid;
    const size = Math.min(100, Math.max(frame.width, frame.height));
    // The client's BMP uses a dark ground and RO blends it as light.
    ctx.globalCompositeOperation = 'screen';
    const baseAlpha = ctx.globalAlpha;
    ctx.globalAlpha = baseAlpha * 0.5;
    ctx.drawImage(frame, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = baseAlpha;
    original = true;
  } else if (skillId === 'blessing' && assets?.blessing) {
    drawActor(ctx, assets.blessing, 0, reducedMotion ? 0 : elapsedMs, x, y, 1.8);
    original = true;
  } else if (skillId === 'heal' && assets) {
    original = drawHealEffect(ctx, assets, cue);
  } else if (skillId === 'jupitel_thunder' && assets) {
    const releaseAt = SKILL_IMPACT_MS - 180;
    if (elapsedMs < (cue.castMs ?? SKILL_CAST_MS)) {
      drawCastSigil(ctx, assets, cue, false);
      original = true;
    } else if (elapsedMs >= releaseAt) {
      original = drawJupitelEffect(ctx, assets, { ...cue, elapsedMs: elapsedMs - releaseAt });
    }
  }
  if (!original) {
    const color = elementColors[cue.element?.toLowerCase() ?? ''] ??
      (cue.kind === 'heal' ? '#77ec96' : cue.kind === 'buff' ? '#f8da88' : '#f0e5cf');
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    const radius = reducedMotion ? 26 : 16 + progress * 22;
    ctx.beginPath();
    ctx.ellipse(x, y - 13, radius, radius * 0.38, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = 'bold 12px Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1c2730';
  ctx.fillStyle = '#fff4ca';
  if (!bolt || elapsedMs < (cue.castMs ?? SKILL_CAST_MS)) {
    const nameX = bolt ? cue.casterX ?? x : x;
    const nameY = bolt ? (cue.casterY ?? y + 50) - 70 : y - 70;
    ctx.strokeText(name, nameX, nameY);
    ctx.fillText(name, nameX, nameY);
  }
  ctx.restore();
}
