import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, SpriteAsset, WeaponType } from '../shared/types';
import type { DecodedAction } from '../web/assets/action';
import type { DecodedSprite } from '../web/assets/sprite';
import { getActorPose, getAttackAction, getCombatActorAction, loadActor } from '../web/assets/renderer';
import type { WeaponAppearance } from '../web/assets/weapon';

const catalog = rawCatalog as unknown as Catalog;

// Independent expected groups transcribed from Hercules 410b9738 SkillAction /
// Job weapon motions and roBrowserLegacy d88a3cd4 action group definitions.
// These literals intentionally do not call the renderer's attack selector.
const familyByJob: Record<string, string> = {
  novice: 'novice', high_novice: 'novice',
  swordsman: 'swordsman', high_swordsman: 'swordsman',
  knight: 'swordsman', lord_knight: 'swordsman', crusader: 'swordsman', paladin: 'swordsman',
  mage: 'mage', high_mage: 'mage', wizard: 'wizard', high_wizard: 'wizard',
  archer: 'archer', high_archer: 'archer', hunter: 'hunter', sniper: 'hunter',
  acolyte: 'acolyte', high_acolyte: 'acolyte', priest: 'acolyte', high_priest: 'acolyte', monk: 'acolyte', champion: 'acolyte',
  merchant: 'merchant', high_merchant: 'merchant', blacksmith: 'blacksmith', whitesmith: 'blacksmith', alchemist: 'alchemist', creator: 'alchemist',
  thief: 'thief', high_thief: 'thief', rogue: 'thief', stalker: 'thief', assassin: 'assassin', assassin_cross: 'assassin',
  sage: 'sage', professor: 'sage', bard: 'bard', clown: 'bard', dancer: 'dancer', gypsy: 'dancer',
};
const pinnedGroups: Record<string, Partial<Record<WeaponType, number>>> = {
  novice: { dagger: 80, sword: 88, axe: 88, mace: 88, staff: 88 },
  noviceFemale: { dagger: 88, sword: 80, axe: 80, mace: 80, staff: 80 },
  swordsman: { dagger: 80, sword: 80, spear: 88, mace: 80 },
  mage: { dagger: 88, staff: 80 },
  wizard: { dagger: 88, staff: 80 },
  wizardFemale: { dagger: 80, staff: 88 },
  archer: { dagger: 88, bow: 80 },
  hunter: { dagger: 80, bow: 88 },
  acolyte: { mace: 80, staff: 80, book: 88 },
  merchant: { dagger: 88, axe: 80, mace: 80, sword: 80 },
  thief: { dagger: 80, bow: 88, sword: 80 },
  blacksmith: { dagger: 80, axe: 88, mace: 88, sword: 88 },
  alchemist: { dagger: 80, axe: 88, mace: 88, sword: 88 },
  assassin: { dagger: 80, katar: 88, sword: 80, axe: 80 },
  sage: { dagger: 80, staff: 88, book: 88 },
  bard: { dagger: 80, bow: 88, instrument: 80 },
  // Local classic dagger ACT: table group 40 is hidden; drawable body/weapon group is 80.
  dancer: { dagger: 80, bow: 88, whip: 80 },
};

function expectedGroup(job: string, gender: 'male' | 'female', weapon?: WeaponType) {
  if (!weapon) return 40;
  const family = familyByJob[job];
  const genderFamily = family === 'novice' && gender === 'female' ? 'noviceFemale' : family === 'wizard' && gender === 'female' ? 'wizardFemale' : family;
  const table = pinnedGroups[genderFamily];
  return table?.[weapon] ?? 40;
}
function validGenders(job: Catalog['classes'][string]): Array<'male' | 'female'> {
  return job.gender ? [job.gender] : ['male', 'female'];
}
function ensureReferences(part: { action: { actions: DecodedAction[] }; sprite: DecodedSprite }, actionIndex: number, label: string) {
  const action = part.action.actions[actionIndex];
  expect(action?.frames.length, `${label} ACT action ${actionIndex}`).toBeGreaterThan(0);
  for (const [frameIndex, frame] of action!.frames.entries()) {
    for (const layer of frame.layers) {
      if (layer.index < 0) continue; // Negative indices hide ACT layers.
      const index = layer.index + (layer.type === 1 ? part.sprite.indexedCount : 0);
      const image = part.sprite.frames[index];
      expect(image && image.width > 0 && image.height > 0, `${label} ${actionIndex}/${frameIndex} SPR ref ${index}`).toBeTruthy();
    }
  }
  // Empty/fully hidden frames occur in pinned equipment ACTs and are valid.
  return action!;
}
function selectedFacingAction(actions: DecodedAction[], preferred: number) {
  const direction = preferred % 8;
  const sameFacing = Array.from({ length: Math.ceil(actions.length / 8) }, (_, group) => group * 8 + direction);
  const candidates = [...new Set([preferred, direction, ...sameFacing, preferred - direction, 0])];
  return candidates.find(index => actions[index]?.frames.length) as number | undefined;
}
function sampleFrame(frameCount: number, sample: number) {
  return sample === 0 ? 0 : sample === 1 ? Math.floor((frameCount - 1) / 2) : frameCount - 1;
}

afterEach(() => vi.unstubAllGlobals());

describe('real Ragnarok actor attack asset matrix', () => {
  it.skipIf(!process.env.IDLE_ASSET_ORIGIN)('covers every legal class, gender, equipable weapon family, direction and mounted spear on pinned client assets', async () => {
    const origin = process.env.IDLE_ASSET_ORIGIN;
    expect(origin, 'IDLE_ASSET_ORIGIN must point to the authorized VPS asset origin').toBeTruthy();
    const base = origin!.replace(/\/+$/, '').replace(/\/assets$/i, '');
    const cache = new Map<string, Uint8Array>();
    let cacheBytes = 0;
    const MAX_CACHE_ENTRIES = 128, MAX_CACHE_BYTES = 24 * 1024 * 1024;
    const remoteFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const relative = String(input);
      if (!relative.startsWith('/assets/')) throw new Error(`Unexpected non-asset request: ${relative}`);
      const url = `${base}${relative}`;
      const prior = cache.get(url);
      if (prior) { cache.delete(url); cache.set(url, prior); return new Response(prior.slice()); }
      const response = await remoteFetch(url, init);
      if (!response.ok) return response;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength <= MAX_CACHE_BYTES) {
        cache.set(url, bytes); cacheBytes += bytes.byteLength;
        while (cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
          const oldest = cache.keys().next().value as string | undefined;
          if (!oldest) break;
          cacheBytes -= cache.get(oldest)!.byteLength; cache.delete(oldest);
        }
      }
      return new Response(bytes.slice(), { status: response.status, headers: response.headers });
    });

    expect(getCombatActorAction('attack')).toBe('attack');
    expect(getCombatActorAction('skill', 'SM_BASH')).toBe('attack');
    expect(getCombatActorAction('skill', 'KN_BRANDISHSPEAR')).toBe('attack');

    const cases: Array<{ job: string; gender: 'male' | 'female'; weapon?: WeaponType; mounted: boolean; asset: SpriteAsset }> = [];
    for (const [jobId, job] of Object.entries(catalog.classes)) {
      for (const gender of validGenders(job)) {
        const asset = job.sprite[gender];
        cases.push({ job: jobId, gender, mounted: false, asset });
        for (const weapon of job.weapons) cases.push({ job: jobId, gender, weapon, mounted: false, asset });
        if (job.mountedSprite) {
          const mountedAsset = job.mountedSprite[gender];
          cases.push({ job: jobId, gender, weapon: 'spear', mounted: true, asset: mountedAsset });
        }
      }
    }
    expect(Object.keys(catalog.classes)).toHaveLength(40);
    expect(new Set(cases.map(c => `${c.job}/${c.gender}`)).size).toBe(76);
    expect(cases.length, 'unarmed, every catalog weapon kind, and mounted spear cases').toBe(296);

    const failures: string[] = [];
    for (const c of cases) {
      const label = `${c.job}/${c.gender}/${c.weapon ?? 'unarmed'}${c.mounted ? '/mounted' : ''}`;
      const visual: WeaponAppearance | undefined = c.weapon ? { job: c.job, gender: c.gender, type: c.weapon, mounted: c.mounted } : undefined;
      const actor = await loadActor(c.asset, visual, undefined, { job: c.job, gender: c.gender });
      if (actor.fallback || actor.error || !actor.body || !actor.head) {
        failures.push(`${label}: actor fallback/resource error (${actor.error ?? 'missing body or head'})`);
        continue;
      }
      const expected = expectedGroup(c.job, c.gender, c.weapon);
      const selected = getAttackAction(actor);
      if (selected !== expected) failures.push(`${label}: expected pinned action group ${expected}, selected ${selected}`);
      if (c.weapon && !actor.weapon) failures.push(`${label}: equipped weapon resource missing`);
      for (let direction = 0; direction < 8; direction++) {
        const bodyIndex = expected + direction;
        try {
          const bodyAction = ensureReferences(actor.body, bodyIndex, `${label}/body/d${direction}`);
          const headIndex = selectedFacingAction(actor.head.action.actions, bodyIndex);
          if (headIndex === undefined) throw new Error(`${label}/head/d${direction}: no same-facing ACT action`);
          const headAction = ensureReferences(actor.head, headIndex, `${label}/head/d${direction}`);
          let weaponAction: DecodedAction | undefined;
          if (c.weapon) {
            if (!actor.weapon) throw new Error(`${label}/weapon/d${direction}: equipped weapon resource missing`);
            const weaponIndex = selectedFacingAction(actor.weapon.action.actions, bodyIndex);
            if (weaponIndex === undefined) throw new Error(`${label}/weapon/d${direction}: no same-facing ACT action`);
            weaponAction = ensureReferences(actor.weapon, weaponIndex, `${label}/weapon/d${direction}`);
          }
          let trailAction: DecodedAction | undefined;
          if (actor.weaponTrail) {
            const trailIndex = selectedFacingAction(actor.weaponTrail.action.actions, bodyIndex);
            if (trailIndex !== undefined) trailAction = ensureReferences(actor.weaponTrail, trailIndex, `${label}/trail/d${direction}`);
          }
          const frameLimit = ['monk', 'champion'].includes(c.job) && !c.weapon ? Math.min(5, bodyAction.frames.length) : bodyAction.frames.length;
          const samples = [0, 1, 2].map(n => sampleFrame(frameLimit, n));
          const sampledParts: Array<[string, DecodedAction]> = [['body', bodyAction], ['head', headAction]];
          if (weaponAction) sampledParts.push(['weapon', weaponAction]);
          if (trailAction) sampledParts.push(['weapon trail', trailAction]);
          for (const i of samples) {
            const actDelay = Math.max(25, bodyAction.delayMs);
            const elapsed = i * actDelay + 1;
            const pose = getActorPose(actor, 'attack', elapsed, direction);
            const expectedLayers = sampledParts.reduce((count, [name, action]) => {
              const partFrameIndex = name === 'head' && selectedFacingAction(actor.head!.action.actions, bodyIndex)! < 8
                ? 0 : Math.min(i, action.frames.length - 1);
              return count + action.frames[partFrameIndex].layers.filter(layer => {
                if (layer.index < 0) return false;
                const ref = layer.index + (layer.type === 1 ? (name === 'body' ? actor.body!.sprite.indexedCount : name === 'head' ? actor.head!.sprite.indexedCount : name === 'weapon' ? actor.weapon!.sprite.indexedCount : actor.weaponTrail!.sprite.indexedCount) : 0);
                const frames = name === 'body' ? actor.body!.sprite.frames : name === 'head' ? actor.head!.sprite.frames : name === 'weapon' ? actor.weapon!.sprite.frames : actor.weaponTrail!.sprite.frames;
                const image = frames[ref];
                return !!image && image.width > 0 && image.height > 0;
              }).length;
            }, 0);
            if (pose.length !== expectedLayers) failures.push(`${label}/d${direction}/pose${i}: composed ${pose.length} visible-index layers, expected ${expectedLayers}`);
          }
        } catch (error) { failures.push(`${label}/d${direction}: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
    expect(failures, `real actor matrix failures (${failures.length}):\n${failures.slice(0, 80).join('\n')}`).toEqual([]);
  }, 10 * 60 * 1000);
});
