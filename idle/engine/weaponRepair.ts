import type { Catalog, GameState, InventoryEntry, Item, Skill, WeaponRepairMenu, WeaponRepairResult } from '../shared/types.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classSkills } from './stats.js';
import { canBeginSkillResources, paySkillResources } from './skillResources.js';
import { classicBuffActive, classicGroundSceneKey } from './classicBuffs.js';
import { event, requireRule } from './state.js';
import { startOwnCast, clearOwnCast } from './ownCast.js';
import { resolveOwnSkillAction } from './skillActionClock.js';
import { overweightForCombat } from './itemCapacity.js';

const REPAIR_MATERIALS = [1003, 998, 999, 756] as const;
const ARMOR_REPAIR_MATERIAL = 999;
const BLOCKING_POSTURES = ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING',
  'KN_AUTOCOUNTER', 'NV_TRICKDEAD', 'ST_CHASEWALK'] as const;

export function weaponRepairMaterial(item: Item): number | undefined {
  if (item.type !== 'equipment') return undefined;
  if (item.slot !== 'weapon') return ARMOR_REPAIR_MATERIAL;
  const level = item.weaponLevel;
  return Number.isSafeInteger(level) && level! >= 1 && level! <= REPAIR_MATERIALS.length
    ? REPAIR_MATERIALS[level! - 1] : undefined;
}

function repairSkill(s: GameState, c: Catalog): Skill | undefined {
  return Object.values(c.skills).find(skill => skill.sourceName === 'BS_REPAIRWEAPON');
}
function learnedLevel(s: GameState, c: Catalog): number {
  const skill = repairSkill(s, c), level = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
  return skill?.implementation === 'supported' && skill.manualUse === 'weaponRepair' &&
    Number.isSafeInteger(level) && level === 1 && classSkills(c, s.job).includes(skill.id) ? level : 0;
}
function signature(entry: InventoryEntry): string {
  return JSON.stringify([entry.uid, entry.itemId, entry.quantity, entry.refine, entry.cards,
    entry.favorite, entry.identified ?? true, entry.rarity ?? 'common',
    entry.rarityBonus ? [entry.rarityBonus.stat, entry.rarityBonus.value] : null, entry.broken === true]);
}
function catalogIdentity(c: Catalog): string { return `${c.version}|${c.source.hash}`; }
function scene(s: GameState): string {
  return classicGroundSceneKey(s.status === 'paused' ? { ...s, status: s.pausedStatus ?? 'town' } : s);
}
function menuShape(value: unknown): value is WeaponRepairMenu {
  if (!value || typeof value !== 'object') return false;
  const menu = value as WeaponRepairMenu;
  return typeof menu.id === 'string' && /^[A-Za-z0-9_:\-]{1,80}$/.test(menu.id) &&
    Number.isFinite(menu.openedAt) && menu.openedAt >= 0 && typeof menu.catalogVersion === 'string' &&
    typeof menu.sceneKey === 'string' && Number.isSafeInteger(menu.deaths) && menu.deaths >= 0 &&
    menu.level === 1 && Array.isArray(menu.offeredItems) && menu.offeredItems.length > 0 &&
    menu.offeredItems.length <= 1000 && menu.offeredItems.every(item => item && typeof item.uid === 'string' &&
      /^[A-Za-z0-9_:\-]{1,80}$/.test(item.uid) && Number.isSafeInteger(item.itemId) && item.itemId > 0 &&
      typeof item.signature === 'string' && item.signature.length <= 4096) &&
    new Set(menu.offeredItems.map(item => item.uid)).size === menu.offeredItems.length;
}
function finish(s: GameState, now: number, result: WeaponRepairResult): void {
  delete s.weaponRepairMenu;
  s.weaponRepairResult = result;
  event(s, now, result.outcome === 'success' ? 'repair' : 'skill', result.message ?? 'Reparo de Arma encerrado.');
}
function reconcile(s: GameState, c: Catalog, now = s.lastSimulatedAt): void {
  if (s.weaponRepairMenu === undefined) return;
  const menu = s.weaponRepairMenu;
  if (!menuShape(menu)) { delete s.weaponRepairMenu; return; }
  if (s.hp <= 0 || s.totals.deaths !== menu.deaths || scene(s) !== menu.sceneKey ||
      catalogIdentity(c) !== menu.catalogVersion || learnedLevel(s, c) < menu.level) {
    finish(s, now, { menuId: menu.id, outcome: 'rejected', reasonCode: 'MENU_INVALIDATED',
      message: 'Seleção de reparo encerrada por mudança de mapa, derrota, classe ou habilidade.' });
  }
}

export function weaponRepairCanStart(s: GameState, c: Catalog, now: number): boolean {
  const skill = repairSkill(s, c), level = learnedLevel(s, c);
  return !!skill && level === 1 && s.hp > 0 && ['town', 'hunting', 'challenge'].includes(s.status) &&
    !s.supportCast && !s.battle?.cast && !s.weaponRepairMenu && !s.weaponRefineMenu &&
    (s.playerCanActAt ?? 0) <= now && (s.skillReadyAt[skill.id] ?? 0) <= now &&
    !activePlayerStatus(s, 'SC_SILENCE', now) && !overweightForCombat(s, c) &&
    !BLOCKING_POSTURES.some(source => classicBuffActive(s, c, source, now)) &&
    canBeginSkillResources(s, c, skill, level, now);
}

export function startWeaponRepairCast(s: GameState, c: Catalog, now: number): void {
  const skill = repairSkill(s, c);
  requireRule(weaponRepairCanStart(s, c, now), 'WEAPON_REPAIR_UNAVAILABLE',
    'Aprenda Weapon Repair, tenha 30 SP e esteja livre para conjurar.');
  startOwnCast(s, c, skill!, 1, now);
}

export function resolveWeaponRepairCast(s: GameState, c: Catalog, now: number): boolean {
  const cast = s.supportCast, skill = cast && c.skills[cast.skillId];
  if (!cast || skill?.sourceName !== 'BS_REPAIRWEAPON' || cast.endsAt > now) return false;
  delete s.supportCast;
  return resolveOwnSkillAction(s, c, cast, now, () => {
    if (learnedLevel(s, c) < cast.level || s.hp <= 0 || activePlayerStatus(s, 'SC_SILENCE', now)) {
      event(s, now, 'cast-failed', 'Weapon Repair foi interrompida.', undefined, 'player',
        { skillId: cast.skillId, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
          actionId: cast.actionId, actorAction: 'none' });
      return false;
    }
    if (!paySkillResources(s, c, skill, cast.level, now)) {
      event(s, now, 'cast-failed', 'SP insuficiente ao concluir Weapon Repair.', undefined, 'player',
        { skillId: cast.skillId, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
          actionId: cast.actionId, actorAction: 'none' });
      return false;
    }
    const offeredItems = s.inventory.filter(entry => entry.broken === true && c.items[entry.itemId]?.type === 'equipment')
      .map(entry => ({ uid: entry.uid, itemId: entry.itemId, signature: signature(entry) }));
    const menuId = `wrp-${s.id}-${now}-${s.nextEventId}`;
    if (!offeredItems.length) {
      s.weaponRepairResult = { menuId, outcome: 'empty', message: 'Nenhum equipamento quebrado disponível; 30 SP foram consumidos.' };
      event(s, now, 'cast-failed', 'Nenhum equipamento quebrado disponível; 30 SP foram consumidos.', undefined, 'player',
        { skillId: cast.skillId, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
          actionId: cast.actionId, actorAction: 'none' });
      return false;
    }
    delete s.weaponRepairResult;
    s.weaponRepairMenu = { id: menuId, openedAt: now, catalogVersion: catalogIdentity(c),
      sceneKey: scene(s), deaths: s.totals.deaths, level: cast.level, offeredItems };
    event(s, now, 'skill', 'Menu de Weapon Repair aberto. 30 SP consumidos.', undefined, 'player',
      { skillId: cast.skillId, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
        actionId: cast.actionId, actorAction: 'none' });
    return true;
  });
}

function matchingMenu(s: GameState, c: Catalog, id: string, now: number): WeaponRepairMenu | undefined {
  reconcile(s, c, now);
  if (!s.weaponRepairMenu && s.weaponRepairResult?.menuId === id) return undefined;
  requireRule(s.weaponRepairMenu?.id === id, 'WEAPON_REPAIR_MENU_INVALID', 'Esta seleção de reparo não está disponível.');
  return s.weaponRepairMenu;
}

export function cancelWeaponRepair(s: GameState, c: Catalog, id: string, now: number): void {
  const menu = matchingMenu(s, c, id, now);
  if (!menu) return;
  finish(s, now, { menuId: id, outcome: 'cancelled', message: 'Reparo cancelado. Os 30 SP da conjuração não são devolvidos.' });
}

export function answerWeaponRepair(s: GameState, c: Catalog, id: string, uid: string, now: number): void {
  const menu = matchingMenu(s, c, id, now);
  if (!menu) return;
  const reject = (reasonCode: string, message: string) => finish(s, now, { menuId: id, outcome: 'rejected', reasonCode, message });
  const offered = menu.offeredItems.find(entry => entry.uid === uid);
  const entry = s.inventory.find(item => item.uid === uid), item = entry && c.items[entry.itemId];
  if (!offered || !entry || !item || entry.itemId !== offered.itemId || signature(entry) !== offered.signature) {
    reject('REPAIR_ITEM_CHANGED', 'O equipamento selecionado mudou ou não está mais na mochila.'); return;
  }
  const materialId = weaponRepairMaterial(item);
  if (entry.broken !== true || item.type !== 'equipment' || materialId === undefined) {
    reject('REPAIR_ITEM_UNAVAILABLE', 'Selecione um equipamento quebrado válido.'); return;
  }
  const materialEntry = s.inventory.find(candidate => candidate.itemId === materialId && candidate.quantity > 0);
  if (!materialEntry) {
    reject('MATERIAL_REQUIRED', `Falta o material de reparo ${c.items[materialId]?.name ?? `#${materialId}`}.`); return;
  }
  materialEntry.quantity--;
  if (materialEntry.quantity <= 0) s.inventory.splice(s.inventory.indexOf(materialEntry), 1);
  delete entry.broken;
  const skill = repairSkill(s, c);
  event(s, now, 'repair', `${item.name} reparado com ${c.items[materialId]?.name ?? 'material'}.`, undefined, 'player',
    { itemId: item.id, quantity: 1, skillId: skill?.id, skillLevel: menu.level, actorAction: 'none' });
  finish(s, now, { menuId: id, outcome: 'success', uid, itemId: item.id,
    materialItemId: materialId, message: `${item.name} foi reparado.` });
}

export function reconcileWeaponRepair(s: GameState, c: Catalog, now = s.lastSimulatedAt): void {
  reconcile(s, c, now);
}

export function interruptWeaponRepairCast(s: GameState, c: Catalog, now: number, reason: string): void {
  if (c.skills[s.supportCast?.skillId ?? '']?.sourceName === 'BS_REPAIRWEAPON') clearOwnCast(s, c, now, reason);
}
