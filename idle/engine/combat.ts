import type { Catalog, GameState, Monster, Skill } from '../shared/types.js';
import { addItem, consume, event, random } from './state.js';
import { derivedStats, healFull } from './stats.js';
import { gainExp, grantReward, updateQuests } from './progression.js';
import { chooseAreaMonster, encounterDelay, recordAreaActivity } from '../shared/hunt.js';
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
  const choose = (resource: 'healHP' | 'healSP', missing: number) => {
    const available = s.inventory.filter(e => c.items[e.itemId].type === 'consumable' && (c.items[e.itemId][resource] ?? 0) > 0);
    const sufficient = available.filter(e => (c.items[e.itemId][resource] ?? 0) >= missing);
    const candidates = sufficient.length ? sufficient : available;
    candidates.sort((a, b) => {
      const difference = (c.items[a.itemId][resource] ?? 0) - (c.items[b.itemId][resource] ?? 0);
      return (sufficient.length ? difference : -difference) || a.itemId - b.itemId;
    });
    return candidates[0];
  };
  const hpPotion = hpNeeded ? choose('healHP', d.maxHp - s.hp) : undefined;
  const entry = hpPotion ?? (spNeeded ? choose('healSP', d.maxSp - s.sp) : undefined);
  if (!entry) return; const item = c.items[entry.itemId]; consume(s, entry, 1);
  s.hp = Math.min(d.maxHp, s.hp + (item.healHP ?? 0)); s.sp = Math.min(d.maxSp, s.sp + (item.healSP ?? 0));
  s.potionReadyAt = at + 2000; s.totals.potions++; event(s, at, 'potion', item.name);
  if (s.status === 'hunting' && s.areaId) recordAreaActivity(s, s.areaId, at, { potions: 1 });
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
    let healed: number | undefined;
    if (skill.kind === 'heal') { const before = s.hp; s.hp = Math.min(d.maxHp, s.hp + power); healed = s.hp - before; }
    if (skill.kind === 'buff') s.buffs[id] = { expiresAt: at + (skill.durationMs ?? 30000), effects: Object.fromEntries(Object.entries(skill.effects ?? {}).map(([k, v]) => [k, v * level])) };
    if (skill.kind === 'steal') {
      const amount = Math.max(1, Math.floor(power)); s.zeny += amount; s.totals.zeny += amount;
      if (s.status === 'hunting' && s.areaId) recordAreaActivity(s, s.areaId, at, { lootZeny: amount });
    }
    event(s, at, 'skill', skill.name, healed, skill.kind === 'heal' || skill.kind === 'buff' ? 'player' : 'enemy', { skillId: skill.id, skillLevel: level }); return skill;
  }
  return undefined;
}
function victory(s: GameState, c: Catalog, at: number) {
  const b = s.battle!; const monster = c.monsters[b.monsterId];
  if (b.attemptId && s.rewardedAttempts.includes(b.attemptId)) { s.battle = null; s.status = 'town'; s.pendingAreaId = null; return; }
  if (b.attemptId) s.rewardedAttempts.push(b.attemptId);
  s.bestiary[monster.id] = (s.bestiary[monster.id] ?? 0) + 1; s.totals.kills++;
  const previousBaseExp = s.totals.baseExp; const previousJobExp = s.totals.jobExp;
  gainExp(s, c, monster.baseExp * c.rates.baseExp, monster.jobExp * c.rates.jobExp, at);
  if (!b.challengeId && s.areaId) recordAreaActivity(s, s.areaId, at, {
    kills: 1, baseExp: s.totals.baseExp - previousBaseExp, jobExp: s.totals.jobExp - previousJobExp,
  });
  event(s, at, 'kill', `${monster.name} derrotado.`);
  for (const drop of [...monster.drops, ...(monster.mvpDrops ?? [])])
    if (random(s) * 10000 < Math.min(10000, drop.chance * c.rates.drop)) {
      addItem(s, c, drop.itemId, 1, true);
      if (!b.challengeId && s.areaId) recordAreaActivity(s, s.areaId, at, { lootZeny: c.items[drop.itemId].sellPrice });
      event(s, at, 'loot', c.items[drop.itemId].name, undefined, undefined, { itemId: drop.itemId, quantity: 1 });
    }
  if (b.challengeId) {
    const ch = c.challenges.find(ch => ch.id === b.challengeId)!; const previous = s.challengeWins[ch.id] ?? 0;
    s.challengeWins[ch.id] = previous + 1; s.challengeCooldowns[ch.id] = at + ch.cooldownMs;
    if (!previous) grantReward(s, c, ch.firstReward, at);
    s.status = 'town'; s.autoResume = false;
  }
  s.battle = null;
  if (!b.challengeId && s.pendingAreaId) {
    const destination = c.areas.find(area => area.id === s.pendingAreaId);
    if (destination) {
      s.areaId = destination.id;
      if (!s.visitedAreas.includes(destination.id)) s.visitedAreas.push(destination.id);
      event(s, at, 'hunt', `Caçando em ${destination.name}.`);
    }
  }
  s.pendingAreaId = null;
  if (s.status === 'hunting' && s.areaId) s.nextEncounterAt = at + encounterDelay(s, s.areaId, 2000);
  updateQuests(s, c);
}
export function tick(s: GameState, c: Catalog, at: number) {
  for (const [id, buff] of Object.entries(s.buffs)) if (buff.expiresAt <= at) delete s.buffs[id];
  const d = derivedStats(s, c);
  s.hp = Math.min(s.hp, d.maxHp); s.sp = Math.min(s.sp, d.maxSp);
  if (s.status === 'resting' || s.status === 'town') {
    s.hp = Math.min(d.maxHp, s.hp + Math.max(1, Math.ceil(d.maxHp / 30))); s.sp = Math.min(d.maxSp, s.sp + Math.max(1, Math.ceil(d.maxSp / 30)));
    if (s.status === 'resting' && at >= s.restUntil) { healFull(s, c); s.status = 'town'; if (s.autoResume && s.areaId) { s.status = 'hunting'; s.nextEncounterAt = at + encounterDelay(s, s.areaId, 1000); } }
    return;
  }
  if (s.status !== 'hunting' && s.status !== 'challenge') return;
  autoPotion(s, c, at);
  if (!s.battle) {
    if (s.status === 'challenge') { s.status = 'town'; return; }
    if (at < s.nextEncounterAt) return;
    const area = c.areas.find(a => a.id === s.areaId); if (!area || !area.monsters.length) { s.status = 'town'; return; }
    beginBattle(s, c, chooseAreaMonster(s, c, area, random(s)), at);
  }
  const b = s.battle!; const monster = c.monsters[b.monsterId];
  if (b.deadlineAt !== undefined && at >= b.deadlineAt) { s.battle = null; s.status = 'town'; s.autoResume = false; s.pendingAreaId = null; event(s, at, 'challenge', 'Tempo do desafio esgotado.'); return; }
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
        const mitigated = Math.max(0, raw * (1 - Math.min(80, defense) / 100) - softDefense / 2);
        // Idle rule: zero/negative source coefficients are immunity; they neither damage nor heal.
        const damage = element <= 0 ? 0 : Math.max(1, Math.floor(mitigated * power * (crit ? 1.4 : 1) * size * element * (1 + (stats.effects.damagePct ?? 0) / 100)));
        b.hp = Math.max(0, b.hp - damage); event(s, at, 'damage', magical ? 'Dano mágico' : 'Ataque', damage, 'enemy', { skillId: skill?.id, skillLevel: skill ? s.learnedSkills[skill.id] : undefined, critical: crit });
      } else event(s, at, 'miss', 'Ataque errou.', undefined, 'enemy', { skillId: skill?.id, skillLevel: skill ? s.learnedSkills[skill.id] : undefined });
    }
    // Advance the scheduled deadline so integer-second ticks keep the subsecond remainder.
    b.playerNextAttackAt += stats.attackIntervalMs;
    if (b.hp <= 0) { victory(s, c, at); return; }
  }
  if (at >= b.enemyNextAttackAt) {
    const dodge = Math.min(0.95, Math.max(0.05, (80 + monster.level + monster.stats.dex - d.flee) / 100));
    if (random(s) * 100 >= (d.effects.perfectDodge ?? 0) && random(s) < dodge) {
      const raw = monster.attack[0] + Math.floor(random(s) * (monster.attack[1] - monster.attack[0] + 1));
      const damage = Math.max(1, Math.floor((raw * (1 - d.def / 100) - (s.stats.vit + (d.effects.vit ?? 0)) / 2) * (1 - Math.min(100, d.effects.neutralResist ?? 0) / 100)));
      s.hp = Math.max(0, s.hp - damage); event(s, at, 'damage', monster.name, damage, 'player');
      if (!b.challengeId && s.areaId) recordAreaActivity(s, s.areaId, at, { damageTaken: damage });
    } else event(s, at, 'dodge', 'Esquiva!', undefined, 'player');
    b.enemyNextAttackAt += Math.max(1000, monster.attackDelay);
    if (s.hp <= 0) {
      s.totals.deaths++;
      if (!b.challengeId && s.areaId) recordAreaActivity(s, s.areaId, at, { deaths: 1 });
      s.battle = null; s.pendingAreaId = null; s.status = 'resting'; s.restUntil = at + 30000;
      if (b.challengeId) s.autoResume = false;
      event(s, at, 'death', 'Derrota. Recuperando na cidade.');
    }
  }
  if (s.totals.elapsedMs % 5000 === 0 && s.hp > 0) { s.sp = Math.min(d.maxSp, s.sp + Math.max(1, Math.floor((s.stats.int + 1) / 6))); }
}
