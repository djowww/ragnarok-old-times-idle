import type { Catalog, GameCommand, GameState, Item } from '../shared/types.js';
import { addItem, consume, event, GameError, isProtected, owned, random, requireRule, spend } from './state.js';
import { availableClasses, clampResources, classSkills, healFull, statNames } from './stats.js';
import { grantReward, updateQuests } from './progression.js';
import { beginBattle } from './combat.js';
import { encounterDelay, focusForArea, focusMatches } from '../shared/hunt.js';
function town(s: GameState) { requireRule(s.status === 'town', 'TOWN_REQUIRED', 'Volte à cidade para esta ação.'); }
function equipAllowed(s: GameState, c: Catalog, i: Item) { return i.type === 'equipment' && i.slot && s.baseLevel >= i.minLevel && (!i.allowedClasses.length || i.allowedClasses.includes(s.job)) && (!i.weaponType || c.classes[s.job].weapons.includes(i.weaponType)); }
function removeIneligible(s: GameState, c: Catalog) { for (const [slot, uid] of Object.entries(s.equipment)) { const e = s.inventory.find(e => e.uid === uid); if (!e || !equipAllowed(s, c, c.items[e.itemId])) delete s.equipment[slot as keyof typeof s.equipment]; } }
export function executeCommand(s: GameState, c: Catalog, command: GameCommand, now: number) {
  switch (command.type) {
    case 'startHunt': {
      const area = c.areas.find(a => a.id === command.areaId); requireRule(area && area.minLevel <= s.baseLevel, 'AREA_LOCKED', 'Área indisponível para seu nível.');
      requireRule(s.status !== 'resting', 'RECOVERING', 'Aguarde o fim da recuperação.');
      requireRule(s.status !== 'challenge', 'CHALLENGE_ACTIVE', 'Encerre o desafio antes de caçar.');
      requireRule(s.hp > 0, 'RECOVERING', 'Recupere seu HP na cidade.');
      if (s.status === 'hunting' && s.areaId === area.id) { s.pendingAreaId = null; break; }
      if (s.status === 'hunting' && s.battle) {
        s.pendingAreaId = area.id; event(s, now, 'hunt', `Próxima área: ${area.name}.`); break;
      }
      const alreadyHunting = s.status === 'hunting';
      s.status = 'hunting'; s.areaId = area.id; s.pendingAreaId = null;
      s.nextEncounterAt = alreadyHunting
        ? Math.max(s.nextEncounterAt, now + encounterDelay(s, area.id, 1000))
        : now + encounterDelay(s, area.id, 1000);
      s.restUntil = 0;
      if (!s.visitedAreas.includes(area.id)) s.visitedAreas.push(area.id); event(s, now, 'hunt', `Caçando em ${area.name}.`); break;
    }
    case 'setHuntFocus': {
      const area = c.areas.find(a => a.id === command.areaId);
      requireRule(area && focusMatches(c, area, command.focus), 'INVALID_HUNT_FOCUS', 'Alvo indisponível nesta área.');
      const previous = focusForArea(s, area.id);
      (s.huntFocus ??= {})[area.id] = command.focus;
      if (previous === 'any' && command.focus !== 'any' && s.status === 'hunting' && s.areaId === area.id && !s.battle)
        s.nextEncounterAt += 1000;
      break;
    }
    case 'stop': {
      s.autoResume = false; s.pendingAreaId = null;
      if (s.status === 'resting') break;
      if (s.status === 'hunting' && s.battle) {
        s.status = 'resting'; s.battle = null; s.restUntil = now + 10000;
        event(s, now, 'retreat', 'Retirada do combate. Recuperando na cidade.');
        break;
      }
      s.status = 'town'; s.battle = null; break;
    }
    case 'rest': {
      requireRule(s.status !== 'challenge', 'CHALLENGE_ACTIVE', 'Não é possível descansar durante o desafio.');
      s.status = 'resting'; s.battle = null; s.pendingAreaId = null; s.restUntil = now + 30000; break;
    }
    case 'setGender': requireRule(command.gender === 'male' || command.gender === 'female', 'INVALID_GENDER', 'Avatar inválido.'); requireRule(c.classes[s.job].tier === 0 && !s.branch && !s.reborn, 'GENDER_LOCKED', 'Escolha o avatar antes da evolução de classe.'); s.gender = command.gender; break;
    case 'allocate': {
      requireRule(statNames.includes(command.stat) && Number.isSafeInteger(command.amount) && command.amount > 0 && s.stats[command.stat] + command.amount <= 99, 'INVALID_ALLOCATION', 'Distribuição de atributo inválida (máximo 99).');
      let cost = 0; for (let n = s.stats[command.stat]; n < s.stats[command.stat] + command.amount; n++) cost += 2 + Math.floor((n - 1) / 10);
      requireRule(s.statPoints >= cost, 'INSUFFICIENT_POINTS', 'Pontos de atributo insuficientes.'); s.statPoints -= cost; s.stats[command.stat] += command.amount; break;
    }
    case 'learnSkill': {
      const skill = c.skills[command.skillId]; requireRule(skill && classSkills(c, s.job).includes(skill.id), 'SKILL_UNAVAILABLE', 'Habilidade indisponível para sua classe.');
      requireRule(s.skillPoints > 0, 'INSUFFICIENT_POINTS', 'Pontos de habilidade insuficientes.'); const level = s.learnedSkills[skill.id] ?? 0;
      requireRule(level < skill.maxLevel, 'SKILL_MAXED', 'Habilidade já está no nível máximo.'); s.learnedSkills[skill.id] = level + 1; s.skillPoints--; break;
    }
    case 'setRotation': {
      requireRule(Array.isArray(command.skillIds) && command.skillIds.length <= 3 && new Set(command.skillIds).size === command.skillIds.length, 'INVALID_ROTATION', 'Use até três habilidades distintas.');
      for (const id of command.skillIds) requireRule(s.learnedSkills[id] && c.skills[id] && c.skills[id].kind !== 'passive', 'INVALID_ROTATION', 'A rotação exige habilidades ativas aprendidas.');
      s.rotation = [...command.skillIds]; break;
    }
    case 'buy': {
      town(s); const item = c.items[command.itemId]; requireRule(item?.shop && item.buyPrice > 0, 'NOT_FOR_SALE', 'Item indisponível na loja.');
      requireRule(Number.isSafeInteger(command.quantity) && command.quantity > 0 && command.quantity <= 1000, 'INVALID_QUANTITY', 'Quantidade inválida.');
      spend(s, item.buyPrice * command.quantity); addItem(s, c, item.id, command.quantity); break;
    }
    case 'sell': {
      town(s); const e = owned(s, command.uid); requireRule(!isProtected(s, e), 'PROTECTED_ITEM', 'Item equipado, favorito, refinado ou com cartas está protegido.');
      const quantity = command.quantity; requireRule(Number.isSafeInteger(quantity) && quantity > 0 && quantity <= e.quantity, 'INVALID_QUANTITY', 'Quantidade inválida.');
      const zeny = c.items[e.itemId].sellPrice * quantity; consume(s, e, quantity); s.zeny += zeny; s.totals.zeny += zeny; break;
    }
    case 'sellLoot': {
      town(s); let zeny = 0; for (const e of [...s.inventory]) if (c.items[e.itemId].type === 'loot' && !isProtected(s, e)) { zeny += c.items[e.itemId].sellPrice * e.quantity; consume(s, e, e.quantity); }
      s.zeny += zeny; s.totals.zeny += zeny; event(s, now, 'sell', `Saque vendido por ${zeny} zeny.`); break;
    }
    case 'equip': {
      const e = owned(s, command.uid); const item = c.items[e.itemId]; requireRule(equipAllowed(s, c, item), 'EQUIPMENT_REQUIREMENTS', 'Classe, nível ou posição não permite equipar este item.');
      if (item.twoHanded) delete s.equipment.shield;
      if (item.slot === 'shield') { const weapon = s.inventory.find(e => e.uid === s.equipment.weapon); if (weapon && c.items[weapon.itemId].twoHanded) delete s.equipment.weapon; }
      s.equipment[item.slot!] = e.uid; break;
    }
    case 'unequip': requireRule(['weapon', 'armor', 'shield', 'head', 'garment', 'shoes', 'accessory'].includes(command.slot), 'INVALID_SLOT', 'Posição inválida.'); delete s.equipment[command.slot]; break;
    case 'favorite': { const e = owned(s, command.uid); e.favorite = !e.favorite; break; }
    case 'socket': {
      town(s); const e = owned(s, command.uid); const card = owned(s, command.cardUid); const item = c.items[e.itemId]; const cardItem = c.items[card.itemId];
      requireRule(item.type === 'equipment' && item.slot && cardItem.type === 'card' && cardItem.cardSlots?.includes(item.slot) && e.cards.length < item.slots && e !== card, 'INVALID_SOCKET', 'Carta incompatível ou equipamento sem slot livre.');
      e.cards.push(card.itemId); consume(s, card, 1); event(s, now, 'socket', `${cardItem.name} inserida em ${item.name}.`); break;
    }
    case 'refine': {
      town(s); const e = owned(s, command.uid); const item = c.items[e.itemId]; requireRule(item.type === 'equipment' && item.slot && item.refinable !== false && item.slot !== 'accessory' && e.refine < 7, 'INVALID_REFINE', 'Este item não pode ser refinado (máximo +7).');
      const ore = s.inventory.find(i => i.itemId === (item.slot === 'weapon' ? 984 : 985)); requireRule(ore, 'MATERIAL_REQUIRED', item.slot === 'weapon' ? 'É necessário Oridecon.' : 'É necessário Elunium.');
      const target = e.refine + 1; spend(s, target * 500); consume(s, ore, 1); const chance = target <= 4 ? 1 : [0.6, 0.4, 0.2][target - 5];
      const success = target <= 4 || random(s) < chance; if (success) { e.refine = target; s.highestRefine = Math.max(s.highestRefine, target); }
      event(s, now, 'refine', success ? `${item.name} +${target}` : `Refino falhou. ${item.name} continua +${e.refine}.`); break;
    }
    case 'changeClass': {
      town(s); requireRule(availableClasses(s, c).includes(command.classId), 'CLASS_REQUIREMENTS', 'Requisitos de classe, Job, avatar ou ramo não atendidos.');
      const next = c.classes[command.classId]; s.job = next.id; if (next.tier === 1 && !s.family) s.family = next.family; if (next.tier === 2 && !s.reborn) s.branch = next.id;
      s.jobLevel = 1; s.jobExp = 0; s.buffs = {}; removeIneligible(s, c); healFull(s, c); event(s, now, 'class', `Agora você é ${next.name}.`); break;
    }
    case 'rebirth': {
      town(s); requireRule(!s.reborn && c.classes[s.job].tier === 2 && s.baseLevel === 99 && s.jobLevel >= 50, 'REBIRTH_REQUIREMENTS', 'Renascimento exige segunda classe Base 99 / Job 50.');
      requireRule(c.classes.high_novice, 'REBIRTH_UNAVAILABLE', 'Alto Aprendiz indisponível.'); spend(s, 50000);
      s.branch ??= s.job; s.family ??= c.classes[s.job].family; s.reborn = true; s.job = 'high_novice'; s.baseLevel = 1; s.jobLevel = 1; s.baseExp = 0; s.jobExp = 0;
      s.stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }; s.statPoints = 20; s.skillPoints = 0; const firstAid = c.classes.high_novice.skills.find(id => c.skills[id]?.kind === 'heal');
      s.learnedSkills = firstAid ? { [firstAid]: 1 } : {}; s.rotation = firstAid ? [firstAid] : []; s.skillReadyAt = {}; s.buffs = {}; s.equipment = {}; s.battle = null; s.autoResume = false; healFull(s, c); event(s, now, 'rebirth', 'Renascimento: Alto Aprendiz!'); break;
    }
    case 'setPotions': requireRule([command.hpThreshold, command.spThreshold].every(v => Number.isFinite(v) && v >= 0 && v <= 100), 'INVALID_THRESHOLD', 'Limites de poção devem estar entre 0 e 100%.'); s.autoPotion = { hpThreshold: command.hpThreshold, spThreshold: command.spThreshold }; break;
    case 'setAutoResume': requireRule(typeof command.enabled === 'boolean', 'INVALID_SETTING', 'Configuração inválida.'); s.autoResume = command.enabled; break;
    case 'claimQuest': {
      const q = c.quests.find(q => q.id === command.questId); requireRule(q, 'UNKNOWN_QUEST', 'Missão desconhecida.'); updateQuests(s, c); const saved = s.quests[q.id];
      requireRule(!saved.claimed && saved.progress >= q.amount, 'QUEST_NOT_READY', 'Missão incompleta ou recompensa já resgatada.'); saved.claimed = true; grantReward(s, c, q.reward, now); event(s, now, 'quest', `Missão concluída: ${q.name}.`); break;
    }
    case 'challenge': {
      town(s); const ch = c.challenges.find(ch => ch.id === command.challengeId); requireRule(ch && s.baseLevel >= ch.minLevel, 'CHALLENGE_LOCKED', 'Desafio indisponível para seu nível.');
      requireRule((s.challengeCooldowns[ch.id] ?? 0) <= now, 'CHALLENGE_COOLDOWN', 'Aguarde o intervalo de uma hora do desafio.'); requireRule(s.hp > 0, 'RECOVERING', 'Recupere seu HP primeiro.');
      s.status = 'challenge'; beginBattle(s, c, ch.monsterId, now, ch.id); break;
    }
    case 'dismissOffline': s.offlineSummary = null; break;
    default: throw new GameError('UNKNOWN_COMMAND', 'Comando desconhecido.');
  }
  clampResources(s, c); updateQuests(s, c);
}
