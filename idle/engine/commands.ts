import {openArrowCraft,answerArrowCraft,cancelArrowCraft,reconcileArrowCraft} from './arrowCraft.js';
import { startHolyWaterCast } from './holyWater.js';
import { removeHunterTrap, removeTrapCanStart } from './trapRemoval.js';
import { springTrapCanStart, springHunterTrap } from './springTrap.js';
import {openWeaponRefine,answerWeaponRefine,cancelWeaponRefine,reconcileWeaponRefine} from './weaponRefine.js';
import {useDetecting} from './falconDetect.js';
import {canEquipFalcon,isFalconEquipped,reconcileFalcon,FALCON_RENTAL_ZENY} from './falcon.js';
import type { Catalog, GameCommand, GameState, Item } from "../shared/types.js";
import { configurableSkillUseLevel, skillUseLevel } from '../shared/skillUseLevels.js';
import { soloAlchemyCanStart, startSoloAlchemyCast } from './soloAlchemy.js';
import { effectiveSkillLevel } from '../shared/copiedSkills.js';
import { clearCopiedSpell } from './plagiarism.js';
import {
  addItem,
  consume,
  event,
  GameError,
  isProtected,
  owned,
  random,
  requireRule,
  spend,
} from "./state.js";
import {
  availableClasses,
  clampResources,
  classSkills,
  healFull,
  MAX_BASE_STAT,
  statNames,
  statPointCost,
} from "./stats.js";
import { grantReward, updateQuests } from "./progression.js";
import { beginBattle } from "./combat.js";
import type { SimulationContext } from './fieldNavigation.js';
import { encounterDelay, focusMatches } from "../shared/hunt.js";
import { merchantPrice, itemPurchasePrice } from "../shared/prices.js";
import { isItemIdentified, MAGNIFIER_ITEM_ID, rarityBonusText, rarityNames } from "../shared/loot.js";
import { battleHeroAt, stopHeroMovement } from "../shared/battleSpatial.js";
import { classicBuffActive, toggleClassicBuff, clearClassicGrounds, classicGroundSceneKey } from "./classicBuffs.js";
import { clearSageField, sageFieldSource } from './sageFields.js';
import { sageFieldCanStart, startSageFieldCast } from './sageFieldCasting.js';
import { automaticSpellChoices } from "./sageCasting.js";
import { inventoryLoad } from './stats.js';
import { paySkillResources } from './skillResources.js';
import { applyBacksliding } from './backsliding.js';
import { isFieldSitting, sitInField, endFieldRest, startTensionRelax } from './recovery.js';
import { consumeItem, discardAloeveraUnderAutoBerserk } from "./consumables.js";
import { craftPharmacy } from "./pharmacyCraft.js";
import { craftWeapon } from "./weaponCraft.js";
import { craftMetal } from "./metalCraft.js";
import { craftConverter } from "./converterCraft.js";
import { cancelActorCast, useCastCancel } from './castControl.js';
import { canPecoMount } from './mountedPeco.js';
import { applyGuardianStatus, clearShieldDependentStatuses, guardianShieldEquipped, guardianSkillEligible } from './guardianSacrifice.js';
import { applyTrickDead, clearTrickDead, trickDeadActive } from './trickDead.js';
import { makeSenseInspection, senseEncounterIdentity, senseManualTarget } from './senseInspection.js';
import { clearCloseConfine } from './rgCloseConfine.js';
import { bladeStopRules, clearBladeStop, startBladeStopWait } from './bladeStop.js';
import { magicRodWindow } from './monsterMagic.js';
import { activePlayerStatus } from './playerStatuses.js';
import { collectPendingLoot } from './lootPickup.js';
import { canReceiveItem, overweightForCombat } from './itemCapacity.js';
import { returnForCarry } from './carryReturn.js';
import { isEquipmentBroken } from './equipmentCondition.js';
import { sageEnchantCanStart, startSageEnchantCast } from './sageEnchantments.js';
import { chasewalkCanStart, startChasewalkCast } from './chasewalk.js';
import { applyTeleport } from './teleport.js';
import { cancelSageEnchantCast } from './sageEnchantments.js';
import { resolveSuffragiumCast, suffragiumCanStart, startSuffragiumCast } from './suffragium.js';
import { providenceCanStart, resolveProvidenceCast, startProvidenceCast } from './providence.js';
function town(s: GameState) {
  requireRule(
    s.status === "town",
    "TOWN_REQUIRED",
    "Volte à cidade para esta ação.",
  );
}
function equipAllowed(s: GameState, c: Catalog, i: Item) {
  return (
    i.type === "equipment" &&
    i.equipSupported !== false &&
    i.slot &&
    s.baseLevel >= i.minLevel &&
    (!i.allowedClasses.length || i.allowedClasses.includes(s.job)) &&
    (!i.weaponType || c.classes[s.job].weapons.includes(i.weaponType))
  );
}
function offhandWeaponAllowed(s: GameState, c: Catalog, item: Item) {
  const mastery = classSkills(c, s.job).map(id => c.skills[id])
    .find(skill => skill?.sourceName === 'AS_RIGHT');
  const mainEntry = s.inventory.find(entry => entry.uid === s.equipment.weapon);
  const main = mainEntry && c.items[mainEntry.itemId];
  return item.slot === 'weapon' && item.twoHanded !== true &&
    ['dagger', 'sword', 'axe'].includes(item.weaponType ?? '') &&
    !!mastery && (s.learnedSkills[mastery.id] ?? 0) > 0 &&
    !!main && main.twoHanded !== true;
}
export function removeIneligible(s: GameState, c: Catalog) {
  for (const [slot, uid] of Object.entries(s.equipment)) {
    const e = s.inventory.find((e) => e.uid === uid);
    const item = e && c.items[e.itemId];
    const valid = slot === 'shield' && item?.slot === 'weapon'
      ? !!e && !e.broken && isItemIdentified(e) && offhandWeaponAllowed(s, c, item)
      : !!item && item.slot === slot && !!e && !e.broken && isItemIdentified(e) && equipAllowed(s, c, item);
    if (!valid) delete s.equipment[slot as keyof typeof s.equipment];
  }
  const mainEntry = s.inventory.find(entry => entry.uid === s.equipment.weapon);
  if (mainEntry && c.items[mainEntry.itemId]?.twoHanded === true) delete s.equipment.shield;
}
export function executeCommand(
  s: GameState,
  c: Catalog,
  command: GameCommand,
  now: number,
  context?: SimulationContext,
) {
  const previousScene = classicGroundSceneKey(s);
  const trickDead = trickDeadActive(s, c, now);
  if (trickDead) {
    const cancelsPosture = command.type === 'rest' || command.type === 'startHunt';
    const usesItem = command.type === 'identify' || command.type === 'consumeItem';
    const usesOtherSkill = command.type === 'useSkill' || command.type === 'cancelBuff' ||
      command.type === 'toggleBuff' && c.skills[command.skillId]?.sourceName !== 'NV_TRICKDEAD';
    requireRule(!cancelsPosture && !usesItem && !usesOtherSkill, 'TRICK_DEAD_ACTION_BLOCKED',
      'Trick Dead impede movimento, itens e outras habilidades.');
  }
  if (classicBuffActive(s, c, 'ST_CHASEWALK', now)) {
    const ownToggle = command.type === 'useSkill' && c.skills[command.skillId]?.sourceName === 'ST_CHASEWALK';
    const otherSkill = command.type === 'useSkill' || command.type === 'toggleBuff' || command.type === 'cancelBuff' || command.type === 'identify' && command.method === 'skill';
    requireRule(!otherSkill || ownToggle, 'CHASEWALK_ACTION_BLOCKED', 'Desative Furtividade antes de usar outras habilidades.');
  }
  switch (command.type) {
    case 'craftArrows': answerArrowCraft(s,c,command.menuId,command.uid,now);break;
    case 'cancelArrowCraft': cancelArrowCraft(s,command.menuId);break;
    case 'weaponRefine': answerWeaponRefine(s,c,command.menuId,command.uid,now);break;
    case 'cancelWeaponRefine': cancelWeaponRefine(s,c,command.menuId,now);break;
    case 'consumeItem': {
      consumeItem(s,c,command.uid,now);
      break;
    }
    case 'teleport': {
      applyTeleport(s, c, command.destination, now, context);
      break;
    }
    case 'collectPendingLoot': {
      town(s);
      collectPendingLoot(s, c, now);
      break;
    }
    case 'rentFalcon': {
      town(s);
      requireRule(s.hp > 0, 'RECOVERING', 'Recupere seu HP antes de alugar um falcão.');
      requireRule(canEquipFalcon(s,c), 'FALCON_UNAVAILABLE', 'Aprenda Falcoaria como Caçador ou Atirador de Elite.');
      requireRule(!isFalconEquipped(s,c), 'FALCON_ALREADY_EQUIPPED', 'Você já está acompanhado por um falcão.');
      spend(s,FALCON_RENTAL_ZENY);
      s.falconEquipped = true;
      event(s,now,'falcon','Falcão equipado.');
      break;
    }
    case 'dismissFalcon': {
      if(s.falconEquipped === true)event(s,now,'falcon','Falcão dispensado.');
      s.falconEquipped = false;
      break;
    }
    case 'setMount': {
      requireRule(typeof command.mounted === 'boolean', 'INVALID_MOUNT', 'Escolha montar ou desmontar.');
      requireRule(!command.mounted || canPecoMount(s, c), 'MOUNT_UNAVAILABLE',
        'Aprenda Montaria em uma classe que pode montar Peco Peco.');
      if ((s.mounted === true) === command.mounted) {
        s.mounted = command.mounted;
        break;
      }
      s.mounted = command.mounted;
      event(s, now, 'mount', command.mounted ? 'Montou no Peco Peco.' : 'Desmontou do Peco Peco.');
      break;
    }
    case 'useSkill': {
      if(c.skills[command.skillId]?.sourceName==='AC_MAKINGARROW'){openArrowCraft(s,c,now);break;}
      if (c.skills[command.skillId]?.sourceName === 'AL_HOLYWATER') {
        const skill = c.skills[command.skillId], level = s.learnedSkills[command.skillId] ?? 0;
        startHolyWaterCast(s, c, skill, level, now, context);
        break;
      }
      if(c.skills[command.skillId]?.sourceName==='WS_WEAPONREFINE'){openWeaponRefine(s,c,now);break;}
      const skill = c.skills[command.skillId], level = skillUseLevel(s, c, command.skillId);
      if (skill?.sourceName === 'HT_REMOVETRAP') {
        requireRule(removeTrapCanStart(s, c, skill, level, now), 'TRAP_UNAVAILABLE',
          'Aprenda Remover Armadilha, tenha 5 SP e uma armadilha própria ativa a até duas células.');
        removeHunterTrap(s, c, skill, level, now);
        break;
      }
      if (skill?.sourceName === 'HT_SPRINGTRAP') {
        requireRule(springTrapCanStart(s, c, skill, level, now), 'TRAP_UNAVAILABLE',
          'Aprenda Spring Trap, equipe seu falcão e tenha SP suficiente e uma armadilha ativa em alcance.');
        springHunterTrap(s, c, skill, level, now);
        break;
      }
      if (skill?.sourceName === 'HT_DETECTING') {
        requireRule(useDetecting(s,c,skill,level,now),'SKILL_UNAVAILABLE',
          'Aprenda Detectar, equipe seu falcão, tenha 8 SP e esteja livre para usar a habilidade.');
        break;
      }
      if (configurableSkillUseLevel(skill)) {
        requireRule(soloAlchemyCanStart(s, c, skill, level, now), 'SKILL_UNAVAILABLE',
          'Aprenda a habilidade, tenha SP e a poção correta, e esteja livre para usá-la.');
        requireRule(startSoloAlchemyCast(s, c, skill, level, now), 'SKILL_UNAVAILABLE',
          'Não foi possível iniciar a habilidade.');
        break;
      }
      if (skill?.sourceName === 'ST_CHASEWALK') {
        requireRule(chasewalkCanStart(s, c, skill, level, now), 'CHASEWALK_UNAVAILABLE', 'Tenha 10 SP, esteja vivo e livre para conjurar Furtividade.');
        requireRule(startChasewalkCast(s, c, skill, level, now), 'CHASEWALK_UNAVAILABLE', 'Não foi possível iniciar Furtividade.');
        break;
      }
      if (skill?.sourceName === 'TF_BACKSLIDING') {
        applyBacksliding(s, c, skill, level, now, context);
        break;
      }
      requireRule(!overweightForCombat(s, c), 'WEIGHT_LIMIT', 'Libere peso na mochila antes de usar habilidades.');
      if (skill?.sourceName === 'CR_PROVIDENCE') {
        requireRule(providenceCanStart(s, c, skill, level, now), 'PROVIDENCE_UNAVAILABLE',
          'Aprenda Providência, tenha 30 SP e esteja vivo e livre para conjurar.');
        requireRule(startProvidenceCast(s, c, skill, level, now), 'PROVIDENCE_UNAVAILABLE',
          'Não foi possível iniciar Providência em si mesmo.');
        if (s.supportCast && s.supportCast.endsAt <= now) resolveProvidenceCast(s, c, now);
        break;
      }
      if (skill?.sourceName === 'PR_SUFFRAGIUM') {
        requireRule(suffragiumCanStart(s, c, skill, level, now), 'SUFFRAGIUM_UNAVAILABLE',
          'Aprenda Suffragium, tenha SP e esteja vivo e livre para conjurar.');
        requireRule(startSuffragiumCast(s, c, skill, level, now), 'SUFFRAGIUM_UNAVAILABLE',
          'Não foi possível iniciar Suffragium em si mesmo.');
        if (s.supportCast && s.supportCast.endsAt <= now) resolveSuffragiumCast(s, c, now);
        break;
      }
      if (sageFieldSource(skill?.sourceName)) {
        requireRule(sageFieldCanStart(s, c, skill, level, now), 'SAGE_FIELD_UNAVAILABLE', 'Tenha SP suficiente e esteja livre para conjurar o campo.');
        requireRule(startSageFieldCast(s, c, skill, level, now, context), 'SAGE_FIELD_UNAVAILABLE', 'Não foi possível iniciar o campo elemental.');
        break;
      }
      if (skill?.sourceName && ['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON'].includes(skill.sourceName)) {
        requireRule(sageEnchantCanStart(s, c, skill, level, now), 'SAGE_ENCHANT_UNAVAILABLE',
          'Equipe uma arma intacta, tenha 40 SP e o reagente correto; uma propriedade incompatível impede o encantamento.');
        requireRule(startSageEnchantCast(s, c, skill, level, now), 'SAGE_ENCHANT_UNAVAILABLE',
          'Não foi possível iniciar a conjuração do encantamento.');
        break;
      }
      if (skill?.sourceName === 'MO_BLADESTOP' && skill.manualUse === 'activate') {
        requireRule(skill.implementation === 'supported' && level > 0 && classSkills(c, s.job).includes(skill.id),
          'SKILL_UNAVAILABLE', 'Esta habilidade manual não está disponível.');
        requireRule((s.status === 'hunting' || s.status === 'challenge') && !!s.battle && !s.battle.cast,
          'FIELD_REQUIRED', 'Use Parada da Lâmina durante a caça no campo.');
        requireRule(!activePlayerStatus(s, 'SC_SILENCE', now), 'SKILL_STATUS_BLOCKED',
          'Silêncio impede ativar Parada da Lâmina.');
        requireRule(!s.combatEffects?.bladeStopWait && !s.combatEffects?.bladeStopLink,
          'SKILL_STATUS_BLOCKED', 'Você já está em uma postura de Parada da Lâmina.');
        bladeStopRules(level);
        requireRule(paySkillResources(s, c, skill, level, now), 'SP_REQUIRED',
          'Tenha 10 SP e uma esfera espiritual para usar Parada da Lâmina.');
        startBladeStopWait(s, level, now);
        random(s); // status_start's 100% application consumes the source status roll.
        event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
          statusName: 'SC_BLADESTOP_WAIT', sourceActorId: s.id, targetActorId: s.id,
          actorAction: 'none', actionMotionMs: 0, castMs: 0 });
        event(s, now, 'status-start', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
          statusName: 'SC_BLADESTOP_WAIT', sourceActorId: s.id, targetActorId: s.id });
        break;
      }
      if (skill?.sourceName === 'SA_MAGICROD' && skill.manualUse === 'activate') {
        requireRule(skill.implementation === 'supported' && level > 0 && level <= skill.maxLevel &&
          classSkills(c, s.job).includes(skill.id), 'SKILL_UNAVAILABLE', 'Esta habilidade manual não está disponível.');
        requireRule(['hunting', 'challenge'].includes(s.status) && !!s.battle && !s.battle.cast && s.hp > 0,
          'FIELD_REQUIRED', 'Use Magic Rod durante uma luta no campo.');
        requireRule(!activePlayerStatus(s, 'SC_SILENCE', now), 'SKILL_STATUS_BLOCKED',
          'Silêncio impede ativar Magic Rod.');
        requireRule(!['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'NV_TRICKDEAD']
          .some(source => classicBuffActive(s, c, source, now)), 'SKILL_STATUS_BLOCKED', 'Seu estado atual impede usar Magic Rod.');
        requireRule(paySkillResources(s, c, skill, level, now), 'SP_REQUIRED', 'Tenha 2 SP para usar Magic Rod.');
        const duration = skill.statusDurationMs?.[level - 1] ?? magicRodWindow(level);
        s.buffs[skill.id] = { expiresAt: now + duration, effects: {} };
        (s.combatEffects ??= {}).buffLevels ??= {};
        s.combatEffects.buffLevels[skill.id] = level;
        random(s); // status_start's guaranteed source roll.
        event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
          statusName: 'SC_MAGICROD', sourceActorId: s.id, targetActorId: s.id, actorAction: 'none', actionMotionMs: 0 });
        event(s, now, 'status-start', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
          statusName: 'SC_MAGICROD', sourceActorId: s.id, targetActorId: s.id });
        break;
      }
      if (skill?.sourceName === 'WZ_ESTIMATION') {
        requireRule(skill.id === 'sense' && skill.manualUse === 'inspect' &&
          skill.implementation === 'supported' && skill.maxLevel === 1 && level === 1 &&
          classSkills(c, s.job).includes(skill.id), 'SKILL_UNAVAILABLE',
        'Esta habilidade manual não está disponível.');
        requireRule(typeof command.expectedEnemyId === 'string' &&
          command.expectedEnemyId === s.battle?.targetId, 'SENSE_TARGET_INVALID',
        'Selecione o mesmo inimigo vivo antes de usar Sentido Sobrenatural.');
        const target = senseManualTarget(s, c, now);
        requireRule(target?.id === command.expectedEnemyId, 'SENSE_TARGET_INVALID',
          'O inimigo selecionado não está disponível para inspeção.');
        requireRule(paySkillResources(s, c, skill, 1, now), 'SP_REQUIRED',
          'Tenha SP suficiente para usar Sentido Sobrenatural.');
        s.senseInspection = makeSenseInspection(c, target, now, senseEncounterIdentity(s));
        event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: 1,
          sourceActorId: s.id, targetActorId: target.id, actorAction: 'none' });
        break;
      }
      if (skill?.sourceName === 'PA_SACRIFICE' && skill.manualUse === 'activate') {
        requireRule(skill.implementation === 'supported' && level > 0 &&
          classSkills(c, s.job).includes(skill.id) && guardianSkillEligible(s, c, skill),
        'SKILL_UNAVAILABLE', 'Esta habilidade manual não está disponível.');
        requireRule(!activePlayerStatus(s, 'SC_SILENCE', now), 'SKILL_STATUS_BLOCKED',
          'Silêncio impede ativar Sacrifício.');
        requireRule(!s.battle?.cast && !['MO_STEELBODY', 'LK_BERSERK', 'KN_AUTOCOUNTER', 'TF_HIDING', 'AS_CLOAKING']
          .some(source => classicBuffActive(s, c, source, now)),
        'SKILL_STATUS_BLOCKED', 'Seu estado atual impede ativar Sacrifício.');
        requireRule(s.hp > 0 && paySkillResources(s, c, skill, level, now),
          'SP_REQUIRED', 'Tenha HP e SP suficientes para ativar Sacrifício.');
        applyGuardianStatus(s, skill, level, now);
        random(s); // status_start's 100% application still draws RNG.
        event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
          sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
        break;
      }
      if (skill?.sourceName === 'SA_CASTCANCEL' && skill.manualUse === 'castCancel') {
        useCastCancel(s,c,skill,level,now,command.expectedCastActionId);
        break;
      }
      requireRule(skill?.sourceName === 'LK_TENSIONRELAX' && skill.manualUse === 'rest' &&
        skill.implementation === 'supported' && level > 0 && classSkills(c, s.job).includes(skill.id),
        'SKILL_UNAVAILABLE', 'Esta habilidade manual não está disponível.');
      requireRule(s.status === 'hunting' || isFieldSitting(s), 'FIELD_REQUIRED', 'Use esta habilidade durante a caça ou o descanso na área.');
      requireRule(!s.battle?.cast && !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'RG_CHASEWALK', 'ST_INVISIBILITY', 'NV_TRICKDEAD']
        .some(source => classicBuffActive(s, c, source, now)), 'SKILL_STATUS_BLOCKED', 'Seu estado atual impede usar esta habilidade.');
      const load = inventoryLoad(s, c);
      requireRule(load.weight * 10 < load.maxWeight * 9, 'SKILL_WEIGHT_BLOCKED', 'Alivie o peso para ficar abaixo de 90% antes de usar a habilidade.');
      requireRule(s.hp > 0 && paySkillResources(s, c, skill, Math.min(skill.maxLevel, level), now), 'SP_REQUIRED', 'Recupere seu HP e tenha SP suficiente para usar a habilidade.');
      startTensionRelax(s, skill, now);
      event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: 1,
        sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
      break;
    }
    case 'toggleBuff': {
      const skill = c.skills[command.skillId];
      if (skill?.sourceName === 'NV_TRICKDEAD') {
        const level = s.learnedSkills[skill.id] ?? 0;
        requireRule(skill.manualUse === 'toggle' && skill.implementation === 'supported' &&
          level > 0 && classSkills(c, s.job).includes(skill.id) &&
          ['novice', 'high_novice'].includes(s.job), 'BUFF_UNAVAILABLE',
        'Esta habilidade manual não está disponível.');
        if (toggleClassicBuff(s, c, skill, level, now)) {
          if (s.battle) {
            s.battle.playerNextAttackAt = now;
            s.battle.playerNextSkillAt = now;
            s.battle.playerActionReadyAt = now;
          }
          if (s.fieldHero?.areaId === s.areaId && s.status === 'hunting') {
            s.fieldHero.phase = s.battle ? 'fighting' : 'seeking';
          }
          event(s, now, 'posture-ended', skill.name, undefined, 'player', { skillId: skill.id, statusName: 'NV_TRICKDEAD',
            sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
          event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
            sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
          break;
        }
        requireRule(!overweightForCombat(s, c), 'WEIGHT_LIMIT', 'Libere peso na mochila antes de ativar habilidades.');
        const inField = !!s.areaId && (s.status === 'hunting' || isFieldSitting(s)) ||
          s.status === 'challenge' && !!s.battle;
        requireRule(inField && s.hp > 0, 'FIELD_REQUIRED',
        'Use esta habilidade manual na área, enquanto estiver vivo.');
        requireRule(skill.implementation === 'supported' && level > 0 &&
          classSkills(c, s.job).includes(skill.id), 'BUFF_UNAVAILABLE',
        'Esta habilidade manual não está disponível.');
        requireRule(paySkillResources(s, c, skill, level, now), 'SP_REQUIRED',
          'Tenha SP suficiente para ativar Trick Dead.');
        const cast = s.battle?.cast;
        if (cast) cancelActorCast(s, c, { kind: 'player', actorId: s.id }, now, 'manual');
        if (s.fieldHero?.areaId === s.areaId) {
          const position = battleHeroAt(s, now);
          stopHeroMovement(s.fieldHero, position, now); s.fieldHero.phase = 'waiting';
          delete s.fieldHero.moveBlockedUntil;
        }
        // The scheduler skips own offense while this status is active. Keep
        // finite deadlines so NoSave removal can resume this same encounter.
        applyTrickDead(s, c, skill, level, now);
        random(s); // The source status application draws once even at normalized 100%.
        event(s, now, 'posture', skill.name, undefined, 'player', { skillId: skill.id,
          statusName: 'NV_TRICKDEAD', sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
        event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
          sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
        break;
      }
      const shrink = skill?.sourceName === 'CR_SHRINK';
      requireRule((shrink || skill?.sourceName === 'SM_AUTOBERSERK' && skill.manualUse === 'toggle') &&
        skill.implementation === 'supported' && guardianSkillEligible(s, c, skill) &&
        (s.learnedSkills[skill.id] ?? 0) > 0, 'BUFF_UNAVAILABLE', 'Esta habilidade manual não está disponível.');
      requireRule(shrink || !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'KN_AUTOCOUNTER'].some(source => classicBuffActive(s, c, source, now)),
        'SKILL_STATUS_BLOCKED', 'Seu estado atual impede usar esta habilidade.');
      if (toggleClassicBuff(s, c, skill, s.learnedSkills[skill.id], now)) break;
      requireRule(!overweightForCombat(s, c), 'WEIGHT_LIMIT', 'Libere peso na mochila antes de ativar habilidades.');
      if (shrink) {
        requireRule(guardianShieldEquipped(s, c), 'SHIELD_REQUIRED', 'Equipe um escudo para ativar Shrink.');
        requireRule(s.hp > 0 && paySkillResources(s, c, skill, s.learnedSkills[skill.id], now),
          'SP_REQUIRED', 'Recupere seu HP e tenha SP suficiente para ativar a habilidade.');
        applyGuardianStatus(s, skill, s.learnedSkills[skill.id], now);
        random(s); // status_start's 100% application still draws RNG.
        event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: 1,
          sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
        break;
      }
      const cost = skill.spCost[0] ?? 1;
      requireRule(s.hp > 0 && s.sp >= cost, 'SP_REQUIRED', 'Recupere seu HP e tenha SP suficiente para ativar a habilidade.');
      s.sp -= cost;
      s.buffs[skill.id] = { expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
      (s.combatEffects ??= {}).buffLevels ??= {};
      s.combatEffects.buffLevels![skill.id] = 1;
      event(s, now, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: 1,
        sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
      break;
    }
    case "cancelBuff": {
      const skill = c.skills[command.skillId];
      requireRule(skill && skill.implementation !== "unsupported" &&
        classSkills(c, s.job).includes(skill.id) && (s.learnedSkills[skill.id] ?? 0) > 0,
        "BUFF_UNAVAILABLE", "Esta habilidade não está disponível para desativar.");
      requireRule(toggleClassicBuff(s, c, skill, s.learnedSkills[skill.id], now),
        "BUFF_NOT_CANCELABLE", "Esta habilidade não possui um efeito ativo que possa ser desativado.");
      break;
    }
    case "setAutospell": {
      const tree = new Set(classSkills(c, s.job));
      requireRule(
        Object.values(c.skills).some(skill => skill.sourceName === "SA_AUTOSPELL" &&
          tree.has(skill.id) && (s.learnedSkills[skill.id] ?? 0) > 0 && skill.implementation !== "unsupported"),
        "AUTOSPELL_UNAVAILABLE",
        "Aprenda Desejo Arcano para escolher sua magia automática.",
      );
      requireRule(
        command.skillId === null || automaticSpellChoices(s, c).some(choice => choice.skillId === command.skillId),
        "INVALID_AUTOSPELL",
        "Escolha uma magia aprendida e disponível para Desejo Arcano.",
      );
      if (command.skillId === null) delete s.autospellSkillId;
      else s.autospellSkillId = command.skillId;
      break;
    }
    case "startHunt": {
      const area = c.areas.find((a) => a.id === command.areaId);
      requireRule(
        area && area.minLevel <= s.baseLevel,
        "AREA_LOCKED",
        "Área indisponível para seu nível.",
      );
      requireRule(
        s.status !== "resting" || s.restMode === "field",
        "RECOVERING",
        "Aguarde o fim da recuperação.",
      );
      requireRule(
        s.status !== "challenge",
        "CHALLENGE_ACTIVE",
        "Encerre o desafio antes de caçar.",
      );
      requireRule(s.hp > 0, "RECOVERING", "Recupere seu HP na cidade.");
      requireRule(!overweightForCombat(s, c), 'WEIGHT_LIMIT', 'Libere peso na mochila antes de iniciar uma caça.');
      if (s.status === "hunting" && s.areaId === area.id) {
        s.pendingAreaId = null;
        break;
      }
      if (s.status === "hunting" && s.battle?.targetId) {
        s.pendingAreaId = area.id;
        event(s, now, "hunt", `Próxima área: ${area.name}.`);
        break;
      }
      const alreadyHunting = s.status === "hunting";
      cancelSageEnchantCast(s, c, now, 'Conjuração encerrada pela mudança de atividade.');
      clearBladeStop(s, now);
      if (isFieldSitting(s)) endFieldRest(s, c);
      clearCloseConfine(s, now);
      s.battle = null;
      s.status = "hunting";
      s.areaId = area.id;
      s.pendingAreaId = null;
      s.nextEncounterAt = alreadyHunting
        ? Math.max(s.nextEncounterAt, now + encounterDelay(s, area.id, 1000))
        : now + encounterDelay(s, area.id, 1000);
      s.restUntil = 0;
      delete s.restMode;
      if (!s.visitedAreas.includes(area.id)) s.visitedAreas.push(area.id);
      event(s, now, "hunt", `Caçando em ${area.name}.`);
      break;
    }
    case "setHuntFocus": {
      const area = c.areas.find((a) => a.id === command.areaId);
      requireRule(
        area && focusMatches(c, area, command.focus),
        "INVALID_HUNT_FOCUS",
        "Alvo indisponível nesta área.",
      );
      (s.huntFocus ??= {})[area.id] = command.focus;
      break;
    }
    case "stop": {
      cancelSageEnchantCast(s, c, now, 'Conjuração encerrada pela mudança de atividade.');
      clearBladeStop(s, now);
      clearTrickDead(s, c, now); // Leaving the field is a source warp boundary.
      clearCloseConfine(s, now);
      if (isFieldSitting(s)) endFieldRest(s, c);
      s.autoResume = false;
      s.pendingAreaId = null;
      if (s.fieldHero?.areaId === s.areaId) {
        const position = battleHeroAt(s, now);
        stopHeroMovement(s.fieldHero, position, now); s.fieldHero.phase = 'waiting';
        delete s.fieldHero.targetId;
        delete s.fieldHero.moveBlockedUntil;
      }
      if (s.status === "resting" && s.restMode !== "field") break;
      if (s.status === "resting" && s.restMode === "field") {
        s.status = "town";
        s.areaId = null;
        s.battle = null;
        s.restUntil = 0;
        delete s.restMode;
        break;
      }
      if (s.status === "hunting" && s.battle) {
        s.status = "resting";
        s.restMode = "recovery";
        s.battle = null;
        s.restUntil = now + 10000;
        event(s, now, "retreat", "Retirada do combate. Recuperando na cidade.");
        break;
      }
      s.status = "town";
      s.battle = null;
      s.restUntil = 0;
      delete s.restMode;
      break;
    }
    case "rest": {
      requireRule(
        s.status !== "challenge",
        "CHALLENGE_ACTIVE",
        "Não é possível descansar durante o desafio.",
      );
      cancelSageEnchantCast(s, c, now, 'Conjuração encerrada pela mudança de atividade.');
      const fieldRest = s.areaId !== null && s.status !== "town" &&
        (s.status !== "resting" || s.restMode === "field");
      if (s.status === "town") s.areaId = null;
      if (fieldRest) {
        sitInField(s, now);
        event(s, now, 'rest', 'Sentou para descansar na área.');
        break;
      }
      s.status = "resting";
      s.restMode = "recovery";
      s.battle = null;
      s.pendingAreaId = null;
      s.restUntil = now + 30000;
      s.nextEncounterAt = s.restUntil;
      event(s, now, "rest", "Sentou para descansar por 30 segundos.");
      break;
    }
    case "setGender":
      requireRule(
        command.gender === "male" || command.gender === "female",
        "INVALID_GENDER",
        "Avatar inválido.",
      );
      requireRule(
        c.classes[s.job].tier === 0 && !s.branch && !s.reborn,
        "GENDER_LOCKED",
        "Escolha o avatar antes da evolução de classe.",
      );
      s.gender = command.gender;
      break;
    case "changeAppearance":
      town(s);
      requireRule(
        Number.isSafeInteger(command.hairStyle) && command.hairStyle >= 0 && command.hairStyle <= 27 &&
          Number.isSafeInteger(command.hairColor) && command.hairColor >= 0 && command.hairColor <= 8 &&
          Number.isSafeInteger(command.clothesColor) && command.clothesColor >= 0 && command.clothesColor <= 4,
        "INVALID_APPEARANCE",
        "Escolha um penteado ou uma cor disponíveis no estilista.",
      );
      s.appearance = {
        hairStyle: command.hairStyle,
        hairColor: command.hairColor,
        clothesColor: command.clothesColor,
      };
      event(s, now, "appearance", "A aparência foi atualizada no estilista de Prontera.");
      break;
    case "allocate": {
      requireRule(
        statNames.includes(command.stat) &&
          Number.isSafeInteger(command.amount) &&
          command.amount > 0 &&
          s.stats[command.stat] + command.amount <= MAX_BASE_STAT,
        "INVALID_ALLOCATION",
        "Distribuição de atributo inválida (máximo 99).",
      );
      const cost = statPointCost(s.stats[command.stat], command.amount);
      requireRule(
        s.statPoints >= cost,
        "INSUFFICIENT_POINTS",
        "Pontos de atributo insuficientes.",
      );
      s.statPoints -= cost;
      s.stats[command.stat] += command.amount;
      break;
    }
    case "learnSkill": {
      const skill = c.skills[command.skillId];
      requireRule(
        skill && classSkills(c, s.job).includes(skill.id),
        "SKILL_UNAVAILABLE",
        "Habilidade indisponível para sua classe.",
      );
      requireRule(
        s.jobLevel >= (skill.minimumJobLevel ?? 0),
        "SKILL_REQUIREMENTS",
        "Nível de classe insuficiente.",
      );
      const requirements =
        skill.prerequisitesByClass?.[s.job] ?? skill.prerequisites ?? [];
      requireRule(
        requirements.every((p) => (s.learnedSkills[p.skillId] ?? 0) >= p.level),
        "SKILL_REQUIREMENTS",
        "Aprenda as habilidades anteriores da árvore primeiro.",
      );
      requireRule(
        s.skillPoints > 0,
        "INSUFFICIENT_POINTS",
        "Pontos de habilidade insuficientes.",
      );
      const level = s.learnedSkills[skill.id] ?? 0;
      requireRule(
        level < skill.maxLevel,
        "SKILL_MAXED",
        "Habilidade já está no nível máximo.",
      );
      s.learnedSkills[skill.id] = level + 1;
      s.skillPoints--;
      break;
    }
    case 'setSkillUseLevel': {
      const skill = c.skills[command.skillId], learned = s.learnedSkills[command.skillId] ?? 0;
      requireRule(configurableSkillUseLevel(skill) && skill.implementation === 'supported' &&
        classSkills(c, s.job).includes(skill.id) && Number.isSafeInteger(learned) && learned > 0,
        'SKILL_UNAVAILABLE', 'Aprenda uma habilidade disponível com seleção de nível.');
      requireRule(command.level === null || Number.isSafeInteger(command.level) && command.level >= 1 &&
        command.level <= Math.min(learned, skill.maxLevel), 'INVALID_SKILL_LEVEL', 'Escolha um nível aprendido.');
      if (command.level === null) {
        if (s.skillUseLevels) { delete s.skillUseLevels[skill.id]; if (!Object.keys(s.skillUseLevels).length) delete s.skillUseLevels; }
      } else (s.skillUseLevels ??= {})[skill.id] = command.level;
      break;
    }
    case "setRotation": {
      requireRule(
        Array.isArray(command.skillIds) &&
          command.skillIds.length <= 9 &&
          new Set(command.skillIds).size === command.skillIds.length,
        "INVALID_ROTATION",
        "Use até nove habilidades distintas.",
      );
      if (command.areaId !== undefined)
        requireRule(c.areas.some(area => area.id === command.areaId), "INVALID_ROTATION_AREA", "Escolha uma área válida para esta rotação.");
      for (const id of command.skillIds)
        requireRule(
          effectiveSkillLevel(s, c, id) &&
            c.skills[id] &&
            c.skills[id].kind !== "passive" &&
            (!c.skills[id].manualUse || configurableSkillUseLevel(c.skills[id]) ||
              c.skills[id].sourceName === 'CR_SHRINK' && c.skills[id].manualUse === 'toggle' ||
            c.skills[id].sourceName === 'PA_SACRIFICE' && c.skills[id].manualUse === 'activate' ||
            c.skills[id].sourceName === 'MO_BLADESTOP' && c.skills[id].manualUse === 'activate' ||
            c.skills[id].sourceName === 'HT_DETECTING' && c.skills[id].manualUse === 'activate' ||
            c.skills[id].sourceName === 'SA_MAGICROD' && c.skills[id].manualUse === 'activate' ||
            c.skills[id].sourceName === 'PR_SUFFRAGIUM' && c.skills[id].manualUse === 'activate' ||
            c.skills[id].sourceName === 'CR_PROVIDENCE' && c.skills[id].manualUse === 'activate' ||
            ['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON', 'WS_MELTDOWN', 'AM_POTIONPITCHER'].includes(c.skills[id].sourceName ?? '')) &&
            c.skills[id].implementation !== "unsupported",
          "INVALID_ROTATION",
          "A rotação exige habilidades ativas disponíveis e aprendidas.",
        );
      if (command.areaId === undefined) s.rotation = [...command.skillIds];
      else (s.rotationByArea ??= {})[command.areaId] = [...command.skillIds];
      break;
    }
    case "craftPharmacy": {
      craftPharmacy(s,c,command.itemId,command.quantity,now);
      break;
    }
    case "craftConverter": {
      craftConverter(s,c,command.itemId,command.quantity,now);
      break;
    }
    case "craftWeapon": {
      craftWeapon(s,c,command.itemId,now);
      break;
    }
    case "craftMetal": {
      craftMetal(s,c,command.itemId,now);
      break;
    }
    case "buy": {
      town(s);
      const item = c.items[command.itemId];
      requireRule(
        item?.shop && (item.shopPrice ?? item.buyPrice) > 0,
        "NOT_FOR_SALE",
        "Item indisponível na loja.",
      );
      requireRule(
        Number.isSafeInteger(command.quantity) &&
          command.quantity > 0 &&
          command.quantity <= 1000,
        "INVALID_QUANTITY",
        "Quantidade inválida.",
      );
      requireRule(canReceiveItem(s, c, item.id, command.quantity), 'WEIGHT_LIMIT', 'A compra excede a capacidade da mochila.');
      spend(s, itemPurchasePrice(s, c, item) * command.quantity);
      addItem(s, c, item.id, command.quantity);
      break;
    }
    case "sell": {
      town(s);
      const e = owned(s, command.uid);
      requireRule(
        !isProtected(s, e),
        "PROTECTED_ITEM",
        "Item equipado, favorito, refinado ou com cartas está protegido.",
      );
      const quantity = command.quantity;
      requireRule(
        Number.isSafeInteger(quantity) &&
          quantity > 0 &&
          quantity <= e.quantity,
        "INVALID_QUANTITY",
        "Quantidade inválida.",
      );
      const zeny =
        merchantPrice(s, c, c.items[e.itemId].sellPrice, "sell") * quantity;
      consume(s, e, quantity);
      s.zeny += zeny;
      s.totals.zeny += zeny;
      break;
    }
    case "sellLoot": {
      town(s);
      let zeny = 0;
      for (const e of [...s.inventory])
        if (c.items[e.itemId].type === "loot" && !isProtected(s, e)) {
          zeny +=
            merchantPrice(s, c, c.items[e.itemId].sellPrice, "sell") *
            e.quantity;
          consume(s, e, e.quantity);
        }
      s.zeny += zeny;
      s.totals.zeny += zeny;
      event(s, now, "sell", `Saque vendido por ${zeny} zeny.`);
      break;
    }
    case "repairAll": {
      town(s);
      const broken = s.inventory.filter(entry => isEquipmentBroken(entry) && c.items[entry.itemId]?.type === 'equipment');
      requireRule(broken.length > 0, 'NO_BROKEN_EQUIPMENT', 'Não há equipamentos quebrados para reparar.');
      const price = broken.length * 5000;
      spend(s, price);
      for (const entry of broken) delete entry.broken;
      event(s, now, 'repair', `${broken.length} equipamento(s) reparado(s) por ${price} zeny.`, undefined, undefined,
        { quantity: broken.length });
      break;
    }
    case "identify": {
      requireRule(!classicBuffActive(s, c, 'LK_BERSERK', now), 'ITEM_STATUS_BLOCKED', 'Frenesi impede usar itens e habilidades.');
      const e = owned(s, command.uid);
      const item = c.items[e.itemId];
      requireRule(item.type === "equipment", "INVALID_IDENTIFICATION", "Somente equipamentos precisam de identificação.");
      requireRule(!isItemIdentified(e), "ALREADY_IDENTIFIED", "Este equipamento já foi identificado.");
      requireRule(command.method === undefined || command.method === "magnifier" || command.method === "skill", "INVALID_IDENTIFICATION", "Método de identificação inválido.");
      if (command.method === "skill") {
        const skill = classSkills(c, s.job).map(id => c.skills[id]).find(skill => skill?.sourceName === "MC_IDENTIFY" && skill.implementation === "supported");
        const level = skill ? s.learnedSkills[skill.id] ?? 0 : 0;
        requireRule(skill && Number.isSafeInteger(level) && level > 0 && level <= skill.maxLevel, "IDENTIFY_SKILL_REQUIRED", "Aprenda Identificar para usar esta habilidade.");
        requireRule(s.hp > 0, "RECOVERING", "Recupere seu HP antes de usar esta habilidade.");
        // Hercules status_check_skilluse blocks normal casts under these statuses.
        requireRule(!["TF_HIDING", "MO_STEELBODY", "LK_BERSERK", "KN_AUTOCOUNTER"].some(source => classicBuffActive(s, c, source, now)), "SKILL_STATUS_BLOCKED", "Seu estado atual impede Identificar por habilidade.");
        const cost = skill.spCost[level - 1] ?? skill.spCost.at(-1);
        requireRule(cost !== undefined && Number.isFinite(cost) && cost >= 0 && s.sp >= cost, "SP_REQUIRED", "SP insuficiente para Identificar.");
        s.sp -= cost;
      } else {
        const magnifier = s.inventory.find((i) => i.itemId === MAGNIFIER_ITEM_ID && i.quantity > 0);
        requireRule(magnifier, "MAGNIFIER_REQUIRED", "É necessário uma Lupa para identificar este equipamento.");
        consume(s, magnifier, 1);
      }
      e.identified = true;
      const bonus = rarityBonusText(e);
      event(s, now, "identify", `${item.name} identificado · ${rarityNames[e.rarity ?? "common"]}${bonus ? ` · ${bonus}` : ""}.`, undefined, undefined, { itemId: item.id });
      break;
    }
    case "equip": {
      requireRule(!classicBuffActive(s, c, 'LK_BERSERK', now), 'EQUIP_STATUS_BLOCKED', 'Frenesi impede trocar equipamentos.');
      const e = owned(s, command.uid);
      const item = c.items[e.itemId];
      requireRule(isItemIdentified(e), "IDENTIFICATION_REQUIRED", "Identifique este equipamento com uma Lupa antes de equipar.");
      requireRule(item.equipSupported !== false, "UNSUPPORTED_EQUIPMENT", "A posição ou o tipo deste equipamento ainda não está disponível no modo idle.");
      requireRule(
        !e.broken && equipAllowed(s, c, item),
        "EQUIPMENT_REQUIREMENTS",
        "Classe, nível ou posição não permite equipar este item.",
      );
      const targetSlot = command.slot ?? item.slot!;
      requireRule(targetSlot === item.slot ||
        targetSlot === 'shield' && offhandWeaponAllowed(s, c, item),
        "EQUIPMENT_REQUIREMENTS",
        "Classe, nível ou posição não permite equipar este item.",
      );
      if (targetSlot === "weapon" && item.twoHanded) delete s.equipment.shield;
      if (targetSlot === "shield" && item.slot === "shield") {
        const weapon = s.inventory.find((e) => e.uid === s.equipment.weapon);
        if (weapon && c.items[weapon.itemId].twoHanded)
          delete s.equipment.weapon;
      }
      if (targetSlot === "shield" && item.slot === "weapon") {
        const main = s.inventory.find((entry) => entry.uid === s.equipment.weapon);
        requireRule(!main || c.items[main.itemId].twoHanded !== true,
          "EQUIPMENT_REQUIREMENTS", "Uma arma de duas mãos ocupa as duas mãos.");
      }
      s.equipment[targetSlot] = e.uid;
      clearShieldDependentStatuses(s, c);
      break;
    }
    case "unequip":
      requireRule(!classicBuffActive(s, c, 'LK_BERSERK', now), 'EQUIP_STATUS_BLOCKED', 'Frenesi impede trocar equipamentos.');
      requireRule(
        [
          "weapon",
          "armor",
          "shield",
          "head",
          "garment",
          "shoes",
          "accessory",
        ].includes(command.slot),
        "INVALID_SLOT",
        "Posição inválida.",
      );
      delete s.equipment[command.slot];
      if (command.slot === "weapon") {
        const left = s.inventory.find((entry) => entry.uid === s.equipment.shield);
        if (left && c.items[left.itemId]?.slot === "weapon")
          delete s.equipment.shield;
      }
      clearShieldDependentStatuses(s, c);
      break;
    case "favorite": {
      const e = owned(s, command.uid);
      e.favorite = !e.favorite;
      break;
    }
    case "socket": {
      town(s);
      const e = owned(s, command.uid);
      requireRule(isItemIdentified(e), "IDENTIFICATION_REQUIRED", "Identifique este equipamento com uma Lupa antes de inserir cartas.");
      const card = owned(s, command.cardUid);
      const item = c.items[e.itemId];
      const cardItem = c.items[card.itemId];
      requireRule(
        item.type === "equipment" &&
          item.equipSupported !== false &&
          item.slot &&
          cardItem.type === "card" &&
          cardItem.cardSlots?.includes(item.slot) &&
          e.cards.length < item.slots &&
          e !== card,
        "INVALID_SOCKET",
        "Carta incompatível ou equipamento sem slot livre.",
      );
      e.cards.push(card.itemId);
      consume(s, card, 1);
      event(s, now, "socket", `${cardItem.name} inserida em ${item.name}.`);
      break;
    }
    case "refine": {
      town(s);
      const e = owned(s, command.uid);
      requireRule(isItemIdentified(e), "IDENTIFICATION_REQUIRED", "Identifique este equipamento com uma Lupa antes de refinar.");
      requireRule(!e.broken, "BROKEN_EQUIPMENT", "Repare este equipamento antes de refinar.");
      const item = c.items[e.itemId];
      requireRule(
        item.type === "equipment" &&
          item.equipSupported !== false &&
          item.slot &&
          item.refinable !== false &&
          item.slot !== "accessory" &&
          e.refine < 7,
        "INVALID_REFINE",
        "Este item não pode ser refinado (máximo +7).",
      );
      const ore = s.inventory.find(
        (i) => i.itemId === (item.slot === "weapon" ? 984 : 985),
      );
      requireRule(
        ore,
        "MATERIAL_REQUIRED",
        item.slot === "weapon"
          ? "É necessário Oridecon."
          : "É necessário Elunium.",
      );
      const target = e.refine + 1;
      spend(s, target * 500);
      consume(s, ore, 1);
      const chance = target <= 4 ? 1 : [0.6, 0.4, 0.2][target - 5];
      const success = target <= 4 || random(s) < chance;
      if (success) {
        e.refine = target;
        s.highestRefine = Math.max(s.highestRefine, target);
      }
      event(
        s,
        now,
        "refine",
        success
          ? `${item.name} +${target}`
          : `Refino falhou. ${item.name} continua +${e.refine}.`,
      );
      break;
    }
    case "changeClass": {
      town(s);
      requireRule(
        availableClasses(s, c).includes(command.classId),
        "CLASS_REQUIREMENTS",
        "Requisitos de classe, Job, avatar ou ramo não atendidos.",
      );
      cancelSageEnchantCast(s, c, now, 'Conjuração encerrada pela mudança de atividade.');
      const next = c.classes[command.classId];
      if (s.job !== next.id) clearCopiedSpell(s, c);
      s.job = next.id;
      if (!canPecoMount(s, c)) s.mounted = false;
      reconcileFalcon(s,c);
      if (next.tier === 1 && !s.family) s.family = next.family;
      if (next.tier === 2 && !s.reborn) s.branch = next.id;
      s.jobLevel = 1;
      s.jobExp = 0;
      s.buffs = {};
      s.combatEffects = {};
      s.recovery = { hpMs: 0, spMs: 0, skillMs: 0 };
      removeIneligible(s, c);
      healFull(s, c);
      event(s, now, "class", `Agora você é ${next.name}.`);
      break;
    }
    case "rebirth": {
      town(s);
      requireRule(
        !s.reborn &&
          c.classes[s.job].tier === 2 &&
          s.baseLevel === 99 &&
          s.jobLevel >= 50,
        "REBIRTH_REQUIREMENTS",
        "Renascimento exige segunda classe Base 99 / Job 50.",
      );
      requireRule(
        c.classes.high_novice,
        "REBIRTH_UNAVAILABLE",
        "Alto Aprendiz indisponível.",
      );
      spend(s, 50000);
      cancelSageEnchantCast(s, c, now, 'Conjuração encerrada pela mudança de atividade.');
      s.branch ??= s.job;
      s.family ??= c.classes[s.job].family;
      s.reborn = true;
      clearCopiedSpell(s, c);
      s.job = "high_novice";
      s.mounted = false;
      s.falconEquipped = false;
      s.baseLevel = 1;
      s.jobLevel = 1;
      s.baseExp = 0;
      s.jobExp = 0;
      s.stats = { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 };
      s.statPoints = 20;
      s.skillPoints = 0;
      const firstAid = c.classes.high_novice.skills.find(
        (id) => c.skills[id]?.kind === "heal",
      );
      s.learnedSkills = firstAid ? { [firstAid]: 1 } : {};
      delete s.skillUseLevels;
      s.rotation = firstAid ? [firstAid] : [];
      delete s.rotationByArea;
      s.skillReadyAt = {};
      s.buffs = {};
      s.combatEffects = {};
      s.recovery = { hpMs: 0, spMs: 0, skillMs: 0 };
      s.equipment = {};
      s.battle = null;
      s.autoResume = false;
      healFull(s, c);
      event(s, now, "rebirth", "Renascimento: Alto Aprendiz!");
      break;
    }
    case "setPotions":
      requireRule(
        [command.hpThreshold, command.spThreshold].every(
          (v) => Number.isFinite(v) && v >= 0 && v <= 100,
        ),
        "INVALID_THRESHOLD",
        "Limites de poção devem estar entre 0 e 100%.",
      );
      s.autoPotion = {
        hpThreshold: command.hpThreshold,
        spThreshold: command.spThreshold,
      };
      break;
    case "setAutoResume":
      requireRule(
        typeof command.enabled === "boolean",
        "INVALID_SETTING",
        "Configuração inválida.",
      );
      s.autoResume = command.enabled;
      break;
    case "claimQuest": {
      const q = c.quests.find((q) => q.id === command.questId);
      requireRule(q, "UNKNOWN_QUEST", "Missão desconhecida.");
      updateQuests(s, c);
      const saved = s.quests[q.id];
      requireRule(
        !saved.claimed && saved.progress >= q.amount,
        "QUEST_NOT_READY",
        "Missão incompleta ou recompensa já resgatada.",
      );
      saved.claimed = true;
      grantReward(s, c, q.reward, now, { source: 'quest', questId: q.id, areaId: s.areaId ?? undefined });
      event(s, now, "quest", `Missão concluída: ${q.name}.`);
      break;
    }
    case "challenge": {
      town(s);
      const ch = c.challenges.find((ch) => ch.id === command.challengeId);
      requireRule(
        ch && s.baseLevel >= ch.minLevel,
        "CHALLENGE_LOCKED",
        "Desafio indisponível para seu nível.",
      );
      requireRule(
        (s.challengeCooldowns[ch.id] ?? 0) <= now,
        "CHALLENGE_COOLDOWN",
        "Aguarde o intervalo de uma hora do desafio.",
      );
      requireRule(s.hp > 0, "RECOVERING", "Recupere seu HP primeiro.");
      requireRule(!overweightForCombat(s, c), 'WEIGHT_LIMIT', 'Libere peso na mochila antes de iniciar um desafio.');
      cancelSageEnchantCast(s, c, now, 'Conjuração encerrada pela mudança de atividade.');
      s.status = "challenge";
      beginBattle(s, c, ch.monsterId, now, ch.id, context);
      break;
    }
    case "dismissOffline":
      s.offlineSummary = null;
      break;
    default:
      throw new GameError("UNKNOWN_COMMAND", "Comando desconhecido.");
  }
  if(command.type==='teleport'&&s.weaponRefineMenu){const id=s.weaponRefineMenu.id;cancelWeaponRefine(s,c,id,now);}
  reconcileWeaponRefine(s,c,now);
  reconcileArrowCraft(s,c,now);
  reconcileFalcon(s,c);
  discardAloeveraUnderAutoBerserk(s,c,now);
  if (s.carryReturnRequestedAt !== undefined && s.carryReturnRequestedAt <= now)
    returnForCarry(s, c, now);
  if (classicGroundSceneKey(s) !== previousScene) { clearClassicGrounds(s, c); clearSageField(s); }
  clampResources(s, c);
  updateQuests(s, c);
}
