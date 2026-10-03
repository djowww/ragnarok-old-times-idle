import type { Catalog, GameState, Monster, Skill } from '../shared/types.js';
import { addItem, consume, event, random } from './state.js';
import { derivedStats, healFull } from './stats.js';
import { gainExp, grantReward, updateQuests } from './progression.js';
export function beginBattle(s: GameState, c: Catalog, monsterId: number, at: number, challengeId?: string) {
  const monster = c.monsters[monsterId];
  s.battle = { monsterId, hp: monster.hp, maxHp: monster.hp, startedAt: at, playerNextAttackAt: at + 1000, enemyNextAttackAt: at + Math.max(1000, monster.attackDelay) };
  if (challengeId) {
    const ch = c.challenges.find(ch => ch.id === challengeId)!;
    s.battle.challengeId = ch.id; s.battle.attemptId = `${s.id}-attempt-${++s.challengeAttempts}`; s.battle.deadlineAt = at + ch.timeoutMs;
  }
  event(s, at, 'encounter', monster.name);
}
function autoPotion(s: GameState, c: Catalog, at: number) {
  if (at < s.potionReadyAt || s.hp <= 0) return; const d = derivedStats(s, c);
  const hpNeeded = s.autoPotion.hpThreshold > 0 && s.hp < d.maxHp && s.hp * 100 <= d.maxHp * s.autoPotion.hpThreshold;
  const spNeeded = s.autoPotion.spThreshold > 0 && s.sp < d.maxSp && s.sp * 100 <= d.maxSp * s.autoPotion.spThreshold;
  const entry = s.inventory.find(e => { const i = c.items[e.itemId]; return i.type === 'consumable' && (hpNeeded ? (i.healHP ?? 0) > 0 : spNeeded && (i.healSP ?? 0) > 0); });
  if (!entry) return; const item = c.items[entry.itemId]; consume(s, entry, 1);
  s.hp = Math.min(d.maxHp, s.hp + (item.healHP ?? 0)); s.sp = Math.min(d.maxSp, s.sp + (item.healSP ?? 0));
  s.potionReadyAt = at + 2000; s.totals.potions++; event(s, at, 'potion', item.name);
}
function elementMultiplier(c: Catalog, element: string, monster: Monster): number {
  const row = c.elementModifiers?.[element.toLowerCase()] ?? c.elementModifiers?.[element];
  const levels = row?.[monster.element.toLowerCase()] ?? row?.[monster.element];
  return (levels?.[monster.elementLevel - 1] ?? 100) / 100;
}
function useSkill(s: GameState, c: Catalog, at: number): Skill | undefined {
  const d = derivedStats(s, c); const weapon = s.inventory.find(e => e.uid === s.equipment.weapon); const weaponType = weapon ? c.items[weapon.itemId].weaponType : undefined;
  for (const id of s.rotation) {
    const skill = c.skills[id]; const level = s.learnedSkills[id]; if (!skill || !level || skill.kind === 'passive' || (s.skillReadyAt[id] ?? 0) > at) continue;
    const index = level - 1; const cost = skill.spCost[index] ?? skill.spCost.at(-1) ?? 0; const zeny = skill.zenyCost?.[index] ?? skill.zenyCost?.at(-1) ?? 0;
    if (s.sp < cost || s.zeny < zeny || (skill.requiredWeapon?.length && (!weaponType || !skill.requiredWeapon.includes(weaponType)))) continue;
    if (skill.requiredSlot && !s.equipment[skill.requiredSlot]) continue;
    if (skill.kind === 'heal' && s.hp > d.maxHp * 0.7) continue;
    if (skill.kind === 'buff' && s.buffs[id]?.expiresAt > at) continue;
    const reagent = skill.itemCost ? s.inventory.find(e => e.itemId === skill.itemCost!.itemId && e.quantity >= skill.itemCost!.quantity) : undefined;
    if (skill.itemCost && !reagent) continue;
    s.sp -= cost; s.zeny -= zeny; if (reagent) consume(s, reagent, skill.itemCost!.quantity);
    s.skillReadyAt[id] = at + Math.max(1000, skill.cooldownMs);
    const power = skill.power[index] ?? skill.power.at(-1) ?? 100;
    if (skill.kind === 'heal') s.hp = Math.min(d.maxHp, s.hp + power);
    if (skill.kind === 'buff') s.buffs[id] = { expiresAt: at + (skill.durationMs ?? 30000), effects: Object.fromEntries(Object.entries(skill.effects ?? {}).map(([k, v]) => [k, v * level])) };
    if (skill.kind === 'steal') { const amount = Math.max(1, Math.floor(power)); s.zeny += amount; s.totals.zeny += amount; }
    event(s, at, 'skill', skill.name); return skill;
  }
  return undefined;
}
function victory(s: GameState, c: Catalog, at: number) {
  const b = s.battle!; const monster = c.monsters[b.monsterId];
  if (b.attemptId && s.rewardedAttempts.includes(b.attemptId)) { s.battle = null; s.status = 'town'; return; }
  if (b.attemptId) s.rewardedAttempts.push(b.attemptId);
  s.bestiary[monster.id] = (s.bestiary[monster.id] ?? 0) + 1; s.totals.kills++;
  gainExp(s, c, monster.baseExp * c.rates.baseExp, monster.jobExp * c.rates.jobExp, at);
  for (const drop of monster.drops) if (random(s) * 10000 < Math.min(10000, drop.chance * c.rates.drop)) { addItem(s, c, drop.itemId, 1, true); event(s, at, 'loot', c.items[drop.itemId].name); }
  event(s, at, 'kill', `${monster.name} derrotado.`);
  if (b.challengeId) {
    const ch = c.challenges.find(ch => ch.id === b.challengeId)!; const previous = s.challengeWins[ch.id] ?? 0;
    s.challengeWins[ch.id] = previous + 1; s.challengeCooldowns[ch.id] = at + ch.cooldownMs;
    if (!previous) grantReward(s, c, ch.firstReward, at);
    s.status = 'town'; s.autoResume = false;
  }
  s.battle = null; s.nextEncounterAt = at + 2000; updateQuests(s, c);
}
export function tick(s: GameState, c: Catalog, at: number) {
  for (const [id, buff] of Object.entries(s.buffs)) if (buff.expiresAt <= at) delete s.buffs[id];
  const d = derivedStats(s, c);
  s.hp = Math.min(s.hp, d.maxHp); s.sp = Math.min(s.sp, d.maxSp);
  if (s.status === 'resting' || s.status === 'town') {
    s.hp = Math.min(d.maxHp, s.hp + Math.max(1, Math.ceil(d.maxHp / 30))); s.sp = Math.min(d.maxSp, s.sp + Math.max(1, Math.ceil(d.maxSp / 30)));
    if (s.status === 'resting' && at >= s.restUntil) { healFull(s, c); s.status = 'town'; if (s.autoResume && s.areaId) { s.status = 'hunting'; s.nextEncounterAt = at + 1000; } }
    return;
  }
  if (s.status !== 'hunting' && s.status !== 'challenge') return;
  autoPotion(s, c, at);
  if (!s.battle) {
    if (s.status === 'challenge') { s.status = 'town'; return; }
    if (at < s.nextEncounterAt) return;
    const area = c.areas.find(a => a.id === s.areaId); if (!area || !area.monsters.length) { s.status = 'town'; return; }
    beginBattle(s, c, area.monsters[Math.floor(random(s) * area.monsters.length)], at);
  }
  const b = s.battle!; const monster = c.monsters[b.monsterId];
  if (b.deadlineAt !== undefined && at >= b.deadlineAt) { s.battle = null; s.status = 'town'; s.autoResume = false; event(s, at, 'challenge', 'Tempo do desafio esgotado.'); return; }
  if (at >= b.playerNextAttackAt) {
    const skill = useSkill(s, c, at); const stats = derivedStats(s, c);
    if (!skill || skill.kind === 'physical' || skill.kind === 'magical') {
      const magical = skill?.kind === 'magical'; const crit = !magical && random(s) * 100 < Math.min(100, stats.crit);
      const accuracy = Math.min(0.95, Math.max(0.05, (80 + stats.hit - monster.level - monster.stats.agi) / 100));
      if (magical || crit || random(s) < accuracy) {
        const weapon = s.inventory.find(e => e.uid === s.equipment.weapon); const weaponType = weapon ? c.items[weapon.itemId].weaponType : undefined;
        const raw = magical ? stats.magicAttack[0] + Math.floor(random(s) * (stats.magicAttack[1] - stats.magicAttack[0] + 1)) : stats.attack;
        const power = skill ? (skill.power[s.learnedSkills[skill.id] - 1] ?? skill.power.at(-1) ?? 100) / 100 : 1;
        const defense = magical ? monster.mdef : monster.def; const softDefense = magical ? monster.stats.int : monster.stats.vit;
        const size = magical ? 1 : (weaponType ? (c.sizeModifiers?.[weaponType]?.[monster.size.toLowerCase()] ?? c.sizeModifiers?.[weaponType]?.[monster.size] ?? 100) / 100 : 1);
        const element = elementMultiplier(c, skill?.element ?? 'Neutral', monster);
        const damage = Math.max(1, Math.floor((raw * (1 - Math.min(80, defense) / 100) - softDefense / 2) * power * (crit ? 1.4 : 1) * size * element * (1 + (stats.effects.damagePct ?? 0) / 100)));
        b.hp = Math.max(0, b.hp - damage); event(s, at, 'damage', magical ? 'Dano mágico' : 'Ataque', damage, 'enemy');
      } else event(s, at, 'miss', 'Ataque errou.');
    }
    b.playerNextAttackAt = at + stats.attackIntervalMs;
    if (b.hp <= 0) { victory(s, c, at); return; }
  }
  if (at >= b.enemyNextAttackAt) {
    const dodge = Math.min(0.95, Math.max(0.05, (80 + monster.level + monster.stats.dex - d.flee) / 100));
    if (random(s) * 100 >= (d.effects.perfectDodge ?? 0) && random(s) < dodge) {
      const raw = monster.attack[0] + Math.floor(random(s) * (monster.attack[1] - monster.attack[0] + 1));
      const damage = Math.max(1, Math.floor((raw * (1 - d.def / 100) - (s.stats.vit + (d.effects.vit ?? 0)) / 2) * (1 - Math.min(100, d.effects.neutralResist ?? 0) / 100)));
      s.hp = Math.max(0, s.hp - damage); event(s, at, 'damage', monster.name, damage, 'player');
    } else event(s, at, 'dodge', 'Esquiva!');
    b.enemyNextAttackAt = at + Math.max(1000, monster.attackDelay);
    if (s.hp <= 0) { s.totals.deaths++; s.battle = null; s.status = 'resting'; s.restUntil = at + 30000; if (b.challengeId) s.autoResume = false; event(s, at, 'death', 'Derrota. Recuperando na cidade.'); }
  }
  if (s.totals.elapsedMs % 5000 === 0 && s.hp > 0) { s.sp = Math.min(d.maxSp, s.sp + Math.max(1, Math.floor((s.stats.int + 1) / 6))); }
}
