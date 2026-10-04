/**
 * Hercules pre-renewal pc.c:pc_steal_item / pc_steal_coin, pinned at
 * 410b9738c049ab1825d67b36b072d837c1d0b33a. GPL-3.0-or-later.
 */
import type { BattleEnemy, Catalog, GameState, Skill } from '../shared/types.js';
import { recordAreaActivity } from '../shared/hunt.js';
import { derivedStats } from './stats.js';
import { addItem, event, random } from './state.js';

const itemBlockingStatuses = new Set(['STONE', 'STONEWAIT', 'FREEZE', 'STUN', 'SLEEP', 'WHITEIMPRISON']);
const coinBlockingStatuses = new Set(['STONE', 'FREEZE']);
const legacySources: Record<string, string> = { steal: 'TF_STEAL', snatcher: 'RG_STEALCOIN' };
const sourceName = (skill: Skill) => skill.sourceName ?? skill.mechanic ?? legacySources[skill.id];

function canStealAt(s: GameState, c: Catalog, skill: Skill, target: BattleEnemy, at: number): boolean {
  const source = sourceName(skill);
  const monster = c.monsters[target.monsterId];
  if (!monster || s.hp <= 0 || target.hp <= 0 || skill.implementation === 'unsupported'
    || (source !== 'TF_STEAL' && source !== 'RG_STEALCOIN')) return false;
  // Source MD_BOSS takes precedence, including explicit false on mini-bosses.
  const boss = monster.boss ?? c.challenges.some(ch => ch.monsterId === monster.id && ch.category === 'mvp');
  const treasure = (monster.id >= 1324 && monster.id <= 1363) || (monster.id >= 1938 && monster.id <= 1946);
  if (boss || treasure) return false;
  if (source === 'TF_STEAL' ? target.stolenItem : target.stolenCoin) return false;
  const blocked = source === 'TF_STEAL' ? itemBlockingStatuses : coinBlockingStatuses;
  for (const [status, data] of Object.entries(target.statuses ?? {}))
    if (data.expiresAt > at && blocked.has(status.toUpperCase().replace(/^SC_/, ''))) return false;
  if (source === 'TF_STEAL')
    return monster.drops.some(drop => drop.chance > 0 && c.items[drop.itemId] && c.items[drop.itemId].type !== 'card');
  return true;
}

/** Eligibility only: no resource payment, random rolls or mutation. */
export function canSteal(s: GameState, c: Catalog, skill: Skill, target: BattleEnemy): boolean {
  return canStealAt(s, c, skill, target, s.lastSimulatedAt);
}

/** The combat caller owns skill costs, cooldowns and the generic skill event. */
export function attemptSteal(s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy, at: number): void {
  if (!Number.isSafeInteger(level) || level < 1 || level > skill.maxLevel || !canStealAt(s, c, skill, target, at)) return;
  const monster = c.monsters[target.monsterId];
  const stats = derivedStats(s, c);
  const dex = stats.attributes?.dex ?? s.stats.dex + (stats.effects.dex ?? 0);
  const luck = stats.attributes?.luk ?? s.stats.luk + (stats.effects.luk ?? 0);
  const record = (lootZeny: number) => {
    if (s.status === 'hunting' && s.areaId && !s.battle?.challengeId)
      recordAreaActivity(s, s.areaId, at, { lootZeny });
  };

  if (sourceName(skill) === 'TF_STEAL') {
    // C integer division truncates negative DEX differences toward zero.
    const rate = Math.trunc((dex - monster.stats.dex) / 2) + level * 6 + 4;
    if (rate < 1) return;
    // Pinned skill_steal_max_tries is 0: failures can be retried. A success
    // consumes this enemy's item steal independently of its coin steal.
    for (const drop of monster.drops) {
      const item = c.items[drop.itemId];
      if (!item || item.type === 'card' || drop.chance <= 0) continue;
      // Hercules stores server-rate-adjusted probabilities in dropitem[].p.
      const dropRate = Math.min(10000, Math.max(0, Math.floor(drop.chance * c.rates.drop)));
      if (Math.floor(random(s) * 10000) >= Math.floor(dropRate * rate / 100)) continue;
      target.stolenItem = true;
      addItem(s, c, item.id, 1, true);
      record(item.sellPrice);
      event(s, at, 'loot', item.type === 'equipment' ? 'Equipamento não identificado' : item.name, undefined, undefined, {
        itemId: item.id, quantity: 1, skillId: skill.id, skillLevel: level,
        enemyId: target.id, monsterId: monster.id,
      });
      return;
    }
    return;
  }

  const rate = level * 10 + (s.baseLevel - monster.level) * 2 + Math.trunc(dex / 2) + Math.trunc(luck / 2);
  if (Math.floor(random(s) * 1000) >= rate) return;
  const amount = Math.trunc(monster.level * level / 10) + monster.level * 8 + Math.floor(random(s) * (monster.level * 2 + 1));
  target.stolenCoin = true;
  s.zeny += amount;
  s.totals.zeny += amount;
  record(amount);
  event(s, at, 'loot', 'Moedas furtadas', amount, undefined, {
    skillId: skill.id, skillLevel: level, enemyId: target.id, monsterId: monster.id,
  });
}
