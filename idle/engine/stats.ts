import type { Catalog, DerivedStats, Effects, GameState, JobClass, Stat } from '../shared/types.js';
export const statNames: Stat[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
function merge(target: Effects, source: Effects, multiplier = 1) {
  for (const key of Object.keys(source) as (keyof Effects)[]) target[key] = (target[key] ?? 0) + (source[key] ?? 0) * multiplier;
}
export function classSkills(c: Catalog, jobId: string): string[] {
  const seen = new Set<string>(); const result = new Set<string>();
  function visit(id?: string) {
    if (!id || seen.has(id)) return; seen.add(id); const job = c.classes[id]; if (!job) return;
    for (const skill of job.skills) result.add(skill); visit(job.parent); visit(job.rebirthOf);
  }
  visit(jobId); return [...result];
}
export function derivedStats(s: GameState, c: Catalog): DerivedStats {
  const effects: Effects = {}; let weaponAttack = 0; let armorDef = 0; let weaponType: string | undefined;
  for (const uid of Object.values(s.equipment)) {
    const e = s.inventory.find(i => i.uid === uid); if (!e) continue; const item = c.items[e.itemId]; if (!item) continue;
    merge(effects, item.effects); for (const cardId of e.cards) if (c.items[cardId]) merge(effects, c.items[cardId].effects);
    if (item.slot === 'weapon') { weaponAttack += item.attack + e.refine * 3; weaponType = item.weaponType; }
    else armorDef += item.def + e.refine;
  }
  for (const [id, level] of Object.entries(s.learnedSkills)) { const skill = c.skills[id]; if (skill?.kind === 'passive' && skill.effects) merge(effects, skill.effects, level); }
  for (const buff of Object.values(s.buffs)) if (buff.expiresAt > s.lastSimulatedAt) merge(effects, buff.effects);
  const a = Object.fromEntries(statNames.map(stat => [stat, s.stats[stat] + (effects[stat] ?? 0)])) as Record<Stat, number>;
  const job = c.classes[s.job]; const hpBase = job.hp[Math.min(s.baseLevel - 1, job.hp.length - 1)] ?? 40; const spBase = job.sp[Math.min(s.baseLevel - 1, job.sp.length - 1)] ?? 10;
  const ranged = ['bow', 'instrument', 'whip'].includes(weaponType ?? ''); const main = ranged ? a.dex : a.str; const secondary = ranged ? a.str : a.dex;
  return {
    maxHp: Math.max(1, Math.floor(hpBase * (1 + a.vit / 100)) + (effects.hp ?? 0)),
    maxSp: Math.max(1, Math.floor(spBase * (1 + a.int / 100)) + (effects.sp ?? 0)),
    attack: Math.max(1, main + Math.floor(main / 10) ** 2 + Math.floor(secondary / 5) + Math.floor(a.luk / 5) + weaponAttack + (effects.atk ?? 0)),
    magicAttack: [a.int + Math.floor(a.int / 7) ** 2 + (effects.matk ?? 0), a.int + Math.floor(a.int / 5) ** 2 + (effects.matk ?? 0)],
    def: Math.min(80, armorDef + (effects.def ?? 0)), mdef: a.int + Math.floor(a.vit / 5) + (effects.mdef ?? 0),
    hit: s.baseLevel + a.dex + (effects.hit ?? 0), flee: s.baseLevel + a.agi + (effects.flee ?? 0), crit: 1 + a.luk * 0.3 + (effects.crit ?? 0),
    attackIntervalMs: Math.max(1000, Math.round(2000 * (1 - Math.min(0.5, a.agi * 0.004 + a.dex * 0.001 + (effects.aspd ?? 0) / 100)))), effects,
  };
}
export function clampResources(s: GameState, c: Catalog) { const d = derivedStats(s, c); s.hp = Math.max(0, Math.min(s.hp, d.maxHp)); s.sp = Math.max(0, Math.min(s.sp, d.maxSp)); }
export function healFull(s: GameState, c: Catalog) { const d = derivedStats(s, c); s.hp = d.maxHp; s.sp = d.maxSp; }
export function availableClasses(s: GameState, c: Catalog): string[] {
  if (s.status !== 'town') return [];
  const current = c.classes[s.job];
  return Object.values(c.classes).filter((next: JobClass) => {
    if (next.tier === 0 || next.id === s.job || (next.gender && next.gender !== s.gender) || s.jobLevel < next.minJobLevel) return false;
    if (current.tier === 0) return next.tier === 1 && next.trans === s.reborn && (!s.reborn || next.family === s.family) && (next.parent === current.id || (s.reborn && next.rebirthOf && c.classes[next.rebirthOf]?.tier === 1));
    if (current.tier !== 1 || next.tier !== 2 || next.trans !== s.reborn || next.family !== current.family) return false;
    if (next.parent !== current.id && !(s.reborn && next.rebirthOf && c.classes[next.rebirthOf]?.parent === current.rebirthOf)) return false;
    return !s.reborn || next.rebirthOf === s.branch || (!next.rebirthOf && next.id === s.branch);
  }).map(j => j.id);
}
