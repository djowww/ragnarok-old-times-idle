import raw from '../content/catalog.json';
import type { Catalog, GameState, MonsterStatusSkill } from '../shared/types';
import { castSetup } from './cast-control-fixture';

const source = raw as unknown as Catalog;
export const copySpells = [
  ['MG_FIREBOLT', 'fire_bolt', 'fire', 19],
  ['MG_COLDBOLT', 'cold_bolt', 'water', 14],
  ['MG_LIGHTNINGBOLT', 'lightning_bolt', 'wind', 20],
  ['MG_SOULSTRIKE', 'soul_strike', 'ghost', 13],
] as const;
export function rogueSetup() {
  const x = castSetup(), { s, c, e } = x;
  for (const job of ['thief', 'rogue', 'stalker']) c.classes[job] = {
    ...structuredClone(source.classes[job]), hp: Array(99).fill(6000), sp: Array(99).fill(1000), jobBonuses: {},
  };
  for (const id of new Set([...source.classes.rogue.skills, ...source.classes.stalker.skills]))
    c.skills[id] = structuredClone(source.skills[id]);
  // Task1 fixtures explicitly enable future source metadata before the exporter task.
  c.skills.rg_plagiarism.implementation = 'supported';
  for (const [, id] of copySpells) (c.skills[id] as any).allowPlagiarism = true;
  s.job = 'rogue'; s.hp = 6000; s.sp = 1000;
  s.learnedSkills = { rg_plagiarism: 5 }; s.rotation = [];
  s.battle!.supportNeedsOffense = false;
  c.monsters[1175].stats.int = 30;
  c.monsters[1175].element = 'water';
  e.hp = e.maxHp = 100_000;
  e.enemyNextAttackAt = 999999;
  npcCopyCast(x, 0, 3, 250);
  return x;
}
export function npcCopyCast({ s, c, e }: ReturnType<typeof castSetup>, index: number, level: number, endsAt: number) {
  const [sourceName, id, element, herculesId] = copySpells[index];
  const row: MonsterStatusSkill = { skillId: herculesId, sourceName, damageType: 'magic', element,
    hitCount: Math.abs(c.skills[id].sourceHitCount?.[level - 1] ?? 1), baseSp: c.skills[id].spCost[level - 1],
    level, rate: 10000, castTimeMs: 250, delayMs: 999999, range: 9, cancelable: true,
    state: 'MSS_BERSERK', condition: 'MSC_ALWAYS', sourceRowIndex: index };
  c.monsters[1175].npcStatusSkills = [row];
  e.npcCombat = { firstAttackDone: false, readyAt: {}, cast: { skillId: herculesId, sourceRowIndex: index,
    baseSp: row.baseSp, level, targetActorId: s.id, startedAt: endsAt - 250, endsAt,
    areaId: s.areaId, actionId: `copy-${id}-${endsAt}` } };
}
export function slot(s: GameState) { return (s as any).copiedSkill as { skillId: string; level: number } | undefined; }
