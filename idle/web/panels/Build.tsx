import { useRef, useState } from 'react';
import {detectingCanStart} from '../../engine/falconDetect';
import {canEquipFalcon,isFalconEquipped,FALCON_RENTAL_ZENY} from '../../engine/falcon';
import { chasewalkCanStart } from '../../engine/chasewalk';
import { providenceCanStart } from '../../engine/providence';
import { suffragiumCanStart } from '../../engine/suffragium';
import { teleportAvailable } from '../../engine/teleport';
import { warpMemoAvailable, warpPortalAvailable } from '../../engine/warpPortal';
import { number, type PanelProps } from "../components/common";
import ClassicStatus from "../components/ClassicStatus";
import SkillIcon from "../components/SkillIcon";
import SkillWheel, { SKILL_ROTATION_LIMIT } from "../components/SkillWheel";
import { classSkills } from "../../engine/stats";
import { skillRotationForArea } from "../../shared/skillRotation";
import { classicCastTime } from "../../engine/classic";
import { automaticSpellChoices } from "../../engine/sageCasting";
import { classicBuffActive } from "../../engine/classicBuffs";
import { canPaySkillResources, skillResourceCosts } from '../../engine/skillResources';
import { castCancelEligible } from '../../engine/castControl';
import { castCancelAdditionalSp } from '../../engine/castControlRules';
import { currentPlayerCast } from '../../engine/playerCast';
import { isPecoMounted } from '../../engine/mountedPeco';
import { senseManualTarget } from '../../engine/senseInspection';
import { sageEnchantCanStart } from '../../engine/sageEnchantments';
import { sageFieldCanStart } from '../../engine/sageFieldCasting';
import { sageFieldSource } from '../../engine/sageFields';
import { backslidingStatusBlocked } from '../../engine/backsliding';
import { activePlayerStatus } from '../../engine/playerStatuses';
import type { GameCommand } from '../../shared/types';
import { copiedSpell, effectiveSkillLevel } from '../../shared/copiedSkills';
import { configurableSkillUseLevel, skillUseLevel } from '../../shared/skillUseLevels';
import '../styles/sage-enchant.css';
import '../styles/rogue-copy.css';

export function senseInspectCommand(skillId: string, expectedEnemyId: string): GameCommand {
  return { type: 'useSkill', skillId, expectedEnemyId };
}

export default function Build({
  catalog,
  snapshot,
  busy,
  command,
  mode = "all",
  onOpenConverters,
  onOpenPharmacy,
  onOpenArrows,
  onOpenWeaponRefine,
  onOpenWeaponCraft,
  onOpenMetalCraft,
}: PanelProps & { mode?: "all" | "stats" | "skills"; onOpenConverters?: () => void; onOpenArrows?: (trigger:HTMLElement) => void; onOpenPharmacy?: (trigger: HTMLElement) => void; onOpenWeaponRefine?: (trigger: HTMLElement) => void; onOpenWeaponCraft?: (trigger: HTMLElement) => void; onOpenMetalCraft?: (trigger: HTMLElement) => void }) {
  const { state, stats } = snapshot;
  const openingRefine = useRef(false);
  const [refineOpening, setRefineOpening] = useState(false);
  const manualSilenced = activePlayerStatus(state, 'SC_SILENCE', snapshot.serverTime);
  const ids = new Set(classSkills(catalog, state.job));
  const copy = copiedSpell(state, catalog);
  const skills = [...ids].map((id) => catalog.skills[id]).filter(Boolean);
  if (copy && !ids.has(copy.skill.id)) skills.unshift(copy.skill);
  const [rotationAreaId, setRotationAreaId] = useState(() =>
    state.status === "hunting" ? state.areaId ?? "" : "",
  );
  const selectedRotationAreaId = catalog.areas.some(area => area.id === rotationAreaId) ? rotationAreaId : "";
  const rotation = selectedRotationAreaId
    ? skillRotationForArea(state, selectedRotationAreaId)
    : state.rotation;
  const changeRotation = (skillIds: string[]) => void command({
    type: "setRotation",
    ...(selectedRotationAreaId ? { areaId: selectedRotationAreaId } : {}),
    skillIds,
  });
  const hasAreaRotation = selectedRotationAreaId && Object.hasOwn(state.rotationByArea ?? {}, selectedRotationAreaId);
  const autospellChoices = automaticSpellChoices(state, catalog);
  const mounted = isPecoMounted(state, catalog);
  const falconEquipped = isFalconEquipped(state,catalog);
  return (
    <div className={`build-layout build-layout-${mode}`}>
      {mode !== "skills" && <ClassicStatus catalog={catalog} snapshot={snapshot} busy={busy} command={command} />}
      {mode !== "stats" && <section className="skills-section">
        <div className="section-title">
          <h3>Habilidades</h3>
          <b className="point-count">{number(state.skillPoints)} pontos</b>
        </div>
        <div className="rotation-profile-control">
          <label htmlFor="auto-skill-rotation-area">Perfil de caça</label>
          <select id="auto-skill-rotation-area" aria-label="Área da rotação automática"
            value={selectedRotationAreaId}
            onChange={event => setRotationAreaId(event.currentTarget.value)}>
            <option value="">Geral · todos os mapas</option>
            {catalog.areas.map(area => <option value={area.id} key={area.id}>{area.name}</option>)}
          </select>
          <p>{selectedRotationAreaId
            ? hasAreaRotation ? "Rotação exclusiva deste mapa." : "Herdando a rotação geral; a primeira alteração cria um perfil próprio."
            : "Usada nos mapas sem perfil próprio e nos desafios."}</p>
        </div>
        <SkillWheel skills={catalog.skills} rotation={rotation} busy={busy}
          onChange={changeRotation} />
        <div className="skill-list">
          {skills.map((skill) => {
            const isCopy = copy?.skill.id === skill.id;
            const level = effectiveSkillLevel(state, catalog, skill.id);
            const configurableUseLevel = configurableSkillUseLevel(skill);
            const useLevel = skillUseLevel(state, catalog, skill.id);
            const preferredUseLevel = state.skillUseLevels?.[skill.id];
            const useLevelValue = preferredUseLevel == null ? 'max' : String(useLevel);
            const costAt = Math.max(0, useLevel - 1);
            const active = rotation.includes(skill.id);
            const unsupported = skill.implementation === "unsupported";
            const ownCast=currentPlayerCast(state,snapshot.serverTime);
            const cancelAvailable=!!ownCast&&ownCast.startedAt<=snapshot.serverTime&&snapshot.serverTime<ownCast.endsAt&&
              castCancelEligible(state,catalog,skill,level,snapshot.serverTime)&&canPaySkillResources(state,catalog,skill,level,snapshot.serverTime);
            const canceledSkill=ownCast?catalog.skills[ownCast.skillId]:undefined;
            const cancelExtra=ownCast?castCancelAdditionalSp(canceledSkill?.spCost[ownCast.level-1]??canceledSkill?.spCost.at(-1)??0,level):0;
            const prerequisites = skill.prerequisitesByClass?.[state.job] ?? skill.prerequisites ?? [];
            const missingPrerequisites = prerequisites.some(
              (required) => (state.learnedSkills[required.skillId] ?? 0) < required.level,
            );
            const missingJobLevel = state.jobLevel < (skill.minimumJobLevel ?? 0);
            const baseCast = skill.castTimeMs?.[costAt] ?? 0;
            const reducedCast = (skill.ignoresDex ? baseCast : classicCastTime(baseCast, stats.attributes?.dex ?? state.stats.dex)) *
              (skill.ignoresStatusEffects ? 1 : 1 - Math.min(100, stats.effects.castReductionPct ?? 0) / 100);
            const castTime = reducedCast * (!skill.ignoresStatusEffects && classicBuffActive(state, catalog, "PF_MEMORIZE", state.lastSimulatedAt)
              && (state.combatEffects?.memorizeCharges ?? 0) > 0 ? 0.5 : 1);
            const afterCast = (skill.afterCastDelayMs?.[costAt] ?? 0) *
              (1 - Math.min(100, stats.effects.afterCastReductionPct ?? 0) / 100);
            const spCost = Math.max(0, Math.floor((skill.spCost[costAt] ?? 0) *
              (1 - Math.min(100, stats.effects.spCostReductionPct ?? 0) / 100)));
            const toggleActive = (state.buffs[skill.id]?.expiresAt ?? 0) > snapshot.serverTime;
            const trickDeadSkill = skill.sourceName === 'NV_TRICKDEAD';
            const chasewalkSkill = skill.sourceName === 'ST_CHASEWALK';
            const toggleAvailable = chasewalkSkill ? chasewalkCanStart(state, catalog, skill, level, snapshot.serverTime) : toggleActive ||
              (!trickDeadSkill || state.hp > 0 &&
                (state.status === 'hunting' || state.status === 'resting' && state.restMode === 'field')) &&
              canPaySkillResources(state, catalog, skill, useLevel, snapshot.serverTime);
            const magicRodActivationBlocked = manualSilenced || !!state.battle?.cast ||
              ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'NV_TRICKDEAD']
                .some(source => classicBuffActive(state, catalog, source, snapshot.serverTime));
            const itemCosts = skill.itemCostByLevel?.[costAt] ?? (skill.itemCost ? [skill.itemCost] : []);
            const sacrificeActive = skill.sourceName === 'PA_SACRIFICE' &&
              (state.combatEffects?.sacrifice?.charges ?? 0) > 0 && classicBuffActive(state, catalog, 'PA_SACRIFICE', snapshot.serverTime);
              const sacrificeActivationBlocked = manualSilenced || !!state.battle?.cast ||
              ['MO_STEELBODY', 'LK_BERSERK', 'KN_AUTOCOUNTER', 'TF_HIDING', 'AS_CLOAKING']
                .some(source => classicBuffActive(state, catalog, source, snapshot.serverTime));
            const hits = skill.hitCount?.[costAt] ?? 1;
            const area = skill.aoeRadius?.[costAt] ?? 0;
            const range = skill.range?.[costAt] ?? 0;
            const senseTarget = skill.manualUse === 'inspect'
              ? senseManualTarget(state, catalog, snapshot.serverTime)
              : undefined;
            const senseCanInspect = !!senseTarget && ids.has(skill.id) && level === 1 &&
              !unsupported && canPaySkillResources(state, catalog, skill, level, snapshot.serverTime);
            const backslidingAvailable = skill.sourceName === 'TF_BACKSLIDING' && ids.has(skill.id) && level === 1 &&
              !unsupported && state.hp > 0 && state.status === 'hunting' && !!state.areaId &&
              state.fieldHero?.areaId === state.areaId &&
              !!catalog.areas.find(area => area.id === state.areaId)?.fieldNavigation &&
              !backslidingStatusBlocked(state, catalog, snapshot.serverTime) &&
              canPaySkillResources(state, catalog, skill, level, snapshot.serverTime);
            const sageEnchantSkill = ['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON'].includes(skill.sourceName ?? '');
            const sageGroundSkill = !!sageFieldSource(skill.sourceName);
            const sageManualCast = (sageEnchantSkill || sageGroundSkill) && state.supportCast?.skillId === skill.id ? state.supportCast : undefined;
            const sageManualReady = level > 0 && !unsupported && (sageGroundSkill
              ? sageFieldCanStart(state, catalog, skill, level, snapshot.serverTime)
              : sageEnchantSkill && sageEnchantCanStart(state, catalog, skill, level, snapshot.serverTime));
            const mechanics = [
              castTime > 0 ? `${(castTime / 1000).toLocaleString("pt-BR", {maximumFractionDigits: 1})}s de conjuração` : "",
              afterCast > 0 ? `${(afterCast / 1000).toLocaleString("pt-BR", {maximumFractionDigits: 1})}s após conjurar` : "",
              hits > 1 ? `${hits} golpes` : "",
              area > 0 ? `Área ${area} células` : "",
              range > 1 ? `Alcance ${range} células` : "",
              configurableUseLevel && skill.sourceName === 'WS_MELTDOWN' && skill.statusDurationMs?.[costAt]
                ? `${(skill.statusDurationMs[costAt] / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}s de duração` : "",
            ].filter(Boolean);
            return (
              <article className="skill-row" key={skill.id}>
                <div className="skill-symbol" aria-hidden="true">
                  <SkillIcon skill={skill} />
                </div>
                <div className="skill-description">
                  <h4>
                    {skill.name}{" "}
                    {isCopy && <b className="copied-skill-badge">Copiada</b>}{" "}
                    <span>
                      {level} / {skill.maxLevel}
                    </span>
                  </h4>
                  <p>{skill.description}</p>
                  {configurableUseLevel && level > 0 && <label className="skill-use-level">
                    <span>Nível de uso</span>
                    <select aria-label={`Nível de uso de ${skill.name}`} disabled={busy || unsupported}
                      value={useLevelValue}
                      onChange={event => void command({ type: 'setSkillUseLevel', skillId: skill.id,
                        level: event.currentTarget.value === 'max' ? null : Number(event.currentTarget.value) })}>
                      <option value="max">Máximo (Nv. {level})</option>
                      {Array.from({ length: level }, (_, index) => {
                        const item = ['AM_POTIONPITCHER','CR_SLIMPITCHER'].includes(skill.sourceName ?? '')
                          ? skill.itemCostByLevel?.[index]?.[0] : undefined;
                        const itemName = item ? catalog.items[item.itemId]?.name : undefined;
                        return <option key={index + 1} value={index + 1}>
                          {`Nv. ${index + 1}${itemName ? ` · ${itemName}` : ''}`}
                        </option>;
                      })}
                    </select>
                  </label>}
                  {isCopy && <small className="copied-skill-note">Obtida por Plágio. Não consome pontos; uma nova magia recebida pode substituí-la.</small>}
                  {skill.sourceName === 'ST_PRESERVE' && toggleActive && <small role="status">
                    Preservar ativo · {Math.ceil((state.buffs[skill.id].expiresAt - snapshot.serverTime) / 1000)} s
                  </small>}
                  {skill.sourceName === "SA_AUTOSPELL" && <div>
                    <label htmlFor="autospell-choice">Magia automática</label>{" "}
                    <select id="autospell-choice" disabled={busy || unsupported || level === 0}
                      value={autospellChoices.some(choice => choice.skillId === state.autospellSkillId) ? state.autospellSkillId : ""}
                      onChange={event => void command({ type: "setAutospell", skillId: event.target.value || null })}>
                      <option value="">Escolha uma magia</option>
                      {autospellChoices.map(choice => <option key={choice.skillId} value={choice.skillId}>
                        {catalog.skills[choice.skillId]?.name ?? choice.sourceName} · até Nv. {choice.maxLevel}
                      </option>)}
                    </select>
                    <small>Selecione uma magia aprendida para ativar Desejo Arcano. Alterações valem na próxima conjuração.</small>
                    {level > 0 && autospellChoices.length === 0 && <small>Aprenda uma magia compatível para selecionar.</small>}
                  </div>}
                  <small>
                    {skill.manualUse === "mount" ? "Montaria manual · use para montar ou desmontar"
                      : skill.sourceName === 'HT_FALCON' ? falconEquipped ? 'Falcoaria aprendida · Falcão equipado' : 'Falcão ausente · alugue na cidade após aprender Falcoaria'
                      : skill.kind === "passive"
                      ? unsupported ? "Passiva · efeito indisponível" : level > 0
                        ? skill.sourceName === 'SA_FREECAST' ? 'Passiva · aplicada durante a conjuração' : "Passiva · sempre aplicada"
                        : "Passiva · aplicada ao aprender"
                      : `${spCost} SP${skill.cooldownMs > 0 && !skill.afterCastDelayMs ? ` · recarga ${(skill.cooldownMs / 1000).toFixed(1)}s` : ""}`}
                    {skill.zenyCost
                      ? ` · ${number(skill.zenyCost[costAt] ?? 0)} z`
                      : ""}
                    {itemCosts.map(cost => ` · ${cost.quantity} ${catalog.items[cost.itemId]?.name ?? `item ${cost.itemId}`}`).join("")}
                  </small>
                  {skill.sourceName === 'PA_SACRIFICE' && state.combatEffects?.sacrifice &&
                    <small>Cargas de Sacrifício: {state.combatEffects.sacrifice.charges} / 5</small>}
                  {skill.sourceName === 'MO_BLADESTOP' && (() => {
                    const wait = state.combatEffects?.bladeStopWait;
                    const link = state.combatEffects?.bladeStopLink;
                    const remaining = wait?.expiresAt && wait.expiresAt > snapshot.serverTime
                      ? Math.ceil((wait.expiresAt - snapshot.serverTime) / 1000)
                      : link?.expiresAt && link.expiresAt > snapshot.serverTime
                        ? Math.ceil((link.expiresAt - snapshot.serverTime) / 1000) : 0;
                    return remaining > 0 && <small>{wait?.expiresAt && wait.expiresAt > snapshot.serverTime
                      ? `Aguardando ataque · ${remaining}s` : `Vínculo ativo · ${remaining}s`}</small>;
                  })()}
                  {mechanics.length > 0 && <small className="skill-mechanics">{mechanics.join(" · ")}</small>}
                  {!isCopy && prerequisites.length > 0 && (
                    <p className={`skill-prerequisites ${missingPrerequisites ? "missing" : "met"}`}>
                      Requer {prerequisites.map((required) =>
                        `${catalog.skills[required.skillId]?.name ?? required.skillId} Nv. ${required.level}`,
                      ).join(" · ")}
                      {!missingPrerequisites && <span> ✓</span>}
                    </p>
                  )}
                  {!isCopy && (skill.minimumJobLevel ?? 0) > 0 && (
                    <p className={`skill-prerequisites ${missingJobLevel ? "missing" : "met"}`}>
                      Requer nível de classe {skill.minimumJobLevel}{!missingJobLevel && " ✓"}
                    </p>
                  )}
                  {unsupported && <p className="skill-unavailable">
                    Efeito indisponível: {skill.unsupportedReason ?? "A mecânica desta habilidade ainda não foi implementada."}
                    {" "}Estudar esta habilidade permite cumprir os pré-requisitos da árvore.
                  </p>}
                  <div className="action-row">
                    {!isCopy && <button
                      disabled={
                        busy || missingPrerequisites || missingJobLevel || state.skillPoints < 1 || level >= skill.maxLevel
                      }
                      onClick={() =>
                        void command({ type: "learnSkill", skillId: skill.id })
                      }
                    >
                      {level === skill.maxLevel
                        ? "Nível máximo"
                        : unsupported
                          ? "Estudar"
                          : level === 0
                            ? "Aprender"
                            : "Melhorar"}{" "}
                      · 1 pt
                    </button>}
                    {skill.manualUse === "converterCraft" && <button disabled={busy || unsupported || level === 0 || state.status !== "town" || !onOpenConverters} onClick={onOpenConverters}>Produzir conversores</button>}
                    {skill.manualUse === "arrowCraft" && <button type="button" disabled={busy || unsupported || level === 0 || !onOpenArrows} onClick={event => onOpenArrows?.(event.currentTarget)}>Criar flechas</button>}
                    {skill.manualUse === "holyWaterCraft" && <button type="button" disabled={busy || unsupported || level === 0 || state.status !== "hunting"} onClick={() => void command({ type: "useSkill", skillId: skill.id })}>Produzir Água Benta</button>}
                    {skill.manualUse === "removeTrap" && <button type="button" disabled={busy || unsupported || level === 0 || state.hp <= 0 || (state.status !== "hunting" && state.status !== "challenge") || !state.battle?.traps?.length} onClick={() => void command({ type: "useSkill", skillId: skill.id })}>Remover armadilha</button>}
                    {skill.manualUse === "springTrap" && <button type="button"
                      disabled={busy || unsupported || level === 0 || !falconEquipped || state.hp <= 0 ||
                        (state.status !== 'hunting' && state.status !== 'challenge') ||
                        !state.battle?.traps?.some(trap => trap.expiresAt > snapshot.serverTime && trap.triggeredAt === undefined) ||
                        manualSilenced || !canPaySkillResources(state, catalog, skill, level, snapshot.serverTime)}
                      onClick={() => void command({ type: "useSkill", skillId: skill.id })}>
                      Spring Trap · {skillResourceCosts(state, catalog, skill, level, snapshot.serverTime)?.sp ?? 10} SP
                    </button>}
                    {skill.manualUse === "pharmacyCraft" && <button type="button" disabled={busy || unsupported || level === 0 || state.status !== "town" || !onOpenPharmacy} onClick={event => onOpenPharmacy?.(event.currentTarget)}>Preparar poções</button>}
                    {skill.manualUse === "weaponCraft" && <button type="button" disabled={busy || unsupported || level === 0 || !onOpenWeaponCraft || state.hp <= 0 || state.status === "resting"} onClick={event => onOpenWeaponCraft?.(event.currentTarget)}>Forjar armas</button>}
                    {skill.manualUse === "metalCraft" && <button type="button" disabled={busy || unsupported || level === 0 || !onOpenMetalCraft || state.hp <= 0 || state.status === "resting"} onClick={event => onOpenMetalCraft?.(event.currentTarget)}>Produzir metais</button>}
                    {skill.manualUse === "weaponRefine" && <div className="weapon-refine-launch">
                      <button type="button" disabled={busy || refineOpening || unsupported || level === 0 || !onOpenWeaponRefine ||
                        (!state.weaponRefineMenu && (state.status === 'resting' || state.hp <= 0 || manualSilenced ||
                          !canPaySkillResources(state, catalog, skill, level, snapshot.serverTime)))}
                        onClick={async event => {
                          if (openingRefine.current || busy || !onOpenWeaponRefine) return;
                          const trigger = event.currentTarget;
                          if (state.weaponRefineMenu) { onOpenWeaponRefine(trigger); return; }
                          if (state.status === 'resting') return;
                          openingRefine.current = true; setRefineOpening(true);
                          try {
                            if (await command({type: 'useSkill', skillId: skill.id})) onOpenWeaponRefine(trigger);
                          } finally { openingRefine.current = false; setRefineOpening(false); }
                        }}>
                        {refineOpening ? 'Abrindo…' : state.weaponRefineMenu ? 'Retomar refino' : 'Refinar arma'}
                      </button>
                      <small>{state.weaponRefineMenu ? 'SP já pago. Retome a seleção sem novo custo.' :
                        `${skillResourceCosts(state, catalog, skill, Math.max(1, level), snapshot.serverTime)?.sp ?? spCost} SP para abrir o menu`}</small>
                    </div>}
                    {skill.manualUse === "inventory" && <small>Use na mochila para identificar equipamentos.</small>}
                    {skill.sourceName === 'HT_DETECTING' && <button type="button"
                      disabled={busy || !detectingCanStart(state,catalog,skill,level,snapshot.serverTime)}
                      onClick={() => void command({type:'useSkill',skillId:skill.id})}>Detectar ao redor</button>}
                    {configurableUseLevel && <button type="button"
                      disabled={busy || unsupported || level === 0 || missingPrerequisites || missingJobLevel || !ids.has(skill.id)}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>
                      Usar Nv. {useLevel}
                    </button>}
                    {skill.sourceName === 'HT_FALCON' && (falconEquipped ?
                      <button type="button" disabled={busy} onClick={() => void command({type:'dismissFalcon'})}>Dispensar falcão</button> :
                      <button type="button" disabled={busy || !canEquipFalcon(state,catalog) || state.status !== 'town' || state.hp <= 0 || state.zeny < FALCON_RENTAL_ZENY}
                        onClick={() => void command({type:'rentFalcon'})}>Alugar falcão · {number(FALCON_RENTAL_ZENY)} z</button>)}
                    {skill.manualUse === "mount" && <button disabled={busy || unsupported || level === 0}
                      aria-pressed={mounted}
                      onClick={() => void command({ type: 'setMount', mounted: !mounted })}>
                      {mounted ? 'Desmontar Peco Peco' : 'Montar Peco Peco'}
                    </button>}
                    {skill.manualUse === 'castCancel' && <>
                      <button disabled={busy || !cancelAvailable}
                        onClick={() => void command({type:'useSkill',skillId:skill.id,expectedCastActionId:ownCast?.actionId})}>Cancelar conjuração</button>
                      {ownCast && <small>{canceledSkill?.name ?? ownCast.skillId} · {cancelExtra} SP adicionais</small>}
                    </>}
                  {(sageEnchantSkill || sageGroundSkill) && <>
                    <button disabled={busy || !sageManualReady || !!state.supportCast || !!state.battle?.cast}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>
                      {sageManualCast ? 'Conjurando…' : sageGroundSkill ? 'Conjurar campo' : 'Encantar arma'}
                    </button>
                    {sageManualCast && <div className="support-cast-progress" role="status" aria-live="polite">
                      <span>{skill.name} · {((Math.max(0, sageManualCast.endsAt - snapshot.serverTime)) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s restantes</span>
                      <progress aria-label={`Conjuração de ${skill.name}`} max={Math.max(1, sageManualCast.endsAt - sageManualCast.startedAt)}
                        value={Math.max(0, Math.min(sageManualCast.endsAt - sageManualCast.startedAt,
                          snapshot.serverTime - sageManualCast.startedAt))} />
                    </div>}
                  </>}
                    {skill.manualUse === 'teleport' && level > 0 && <>
                      <button type="button" disabled={busy || !teleportAvailable(state, catalog, 'random', snapshot.serverTime)}
                        onClick={() => void command({ type: 'teleport', destination: 'random' })}>Teleportar no mapa</button>
                      {level >= 2 && <button type="button" disabled={busy || !teleportAvailable(state, catalog, 'save', snapshot.serverTime)}
                        onClick={() => void command({ type: 'teleport', destination: 'save' })}>Voltar a Prontera</button>}
                    </>}
                    {skill.manualUse === 'warpPortal' && level >= 2 && <>
                      <button type="button" disabled={busy || !warpMemoAvailable(state, catalog, snapshot.serverTime)}
                        onClick={() => void command({ type: 'memoWarp' })}>Memorizar este mapa</button>
                      {(['memo1', 'memo2', 'memo3'] as const).slice(0, Math.min(3, level - 1)).map((destination, index) => {
                        const memo = state.warpMemos?.[index];
                        if (!memo) return null;
                        const area = catalog.areas.find(entry => entry.id === memo.areaId);
                        return <button key={`${memo.areaId}-${index}`} type="button"
                          disabled={busy || !warpPortalAvailable(state, catalog, destination, snapshot.serverTime)}
                          onClick={() => void command({ type: 'warpPortal', destination })}>
                          Portal para {area?.name ?? memo.map}
                        </button>;
                      })}
                    </>}
                    {skill.manualUse === 'inspect' && <button type="button"
                      disabled={busy || !senseCanInspect}
                      onClick={() => senseTarget && void command(senseInspectCommand(skill.id, senseTarget.id))}>
                      Examinar
                    </button>}
                    {skill.manualUse === 'rest' && <button disabled={busy || unsupported || level === 0 ||
                      (state.status !== 'hunting' && !(state.status === 'resting' && state.restMode === 'field')) ||
                      !canPaySkillResources(state, catalog, skill, level, snapshot.serverTime)}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>Sentar e relaxar</button>}
                    {skill.manualUse === 'activate' && ['CR_PROVIDENCE', 'PR_SUFFRAGIUM'].includes(skill.sourceName ?? '') && <button
                      disabled={busy || !(skill.sourceName === 'CR_PROVIDENCE'
                        ? providenceCanStart(state, catalog, skill, level, snapshot.serverTime)
                        : suffragiumCanStart(state, catalog, skill, level, snapshot.serverTime))}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>
                      {classicBuffActive(state, catalog, skill.sourceName!, snapshot.serverTime) ? 'Efeito ativo'
                        : state.supportCast?.skillId === skill.id ? 'Conjurando…' : `Conjurar ${skill.name}`}
                    </button>}
                    {skill.manualUse === 'activate' && skill.sourceName === 'PA_SACRIFICE' && <button
                      disabled={busy || unsupported || level === 0 || !ids.has(skill.id) || missingPrerequisites || missingJobLevel ||
                        sacrificeActivationBlocked || !canPaySkillResources(state, catalog, skill, level, snapshot.serverTime)}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>
                      {sacrificeActive ? 'Repor cargas' : 'Ativar Sacrifício'}
                    </button>}
                    {skill.manualUse === 'activate' && skill.sourceName === 'MO_BLADESTOP' && <button
                      disabled={busy || unsupported || level === 0 || !ids.has(skill.id) || missingPrerequisites || missingJobLevel ||
                        state.hp <= 0 || (state.status !== 'hunting' && state.status !== 'challenge') || !state.battle?.enemies?.length ||
                        manualSilenced || !!state.battle?.cast || !!state.combatEffects?.bladeStopWait || !!state.combatEffects?.bladeStopLink ||
                        !canPaySkillResources(state, catalog, skill, level, snapshot.serverTime)}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>
                      Ativar Parada da Lâmina
                    </button>}
                    {skill.manualUse === 'activate' && skill.sourceName === 'SA_MAGICROD' && <button
                      disabled={busy || unsupported || level === 0 || !ids.has(skill.id) || missingPrerequisites || missingJobLevel ||
                        state.hp <= 0 || (state.status !== 'hunting' && state.status !== 'challenge') || !state.battle?.enemies?.length ||
                        magicRodActivationBlocked ||
                        !canPaySkillResources(state, catalog, skill, level, snapshot.serverTime)}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>
                      Ativar Magic Rod
                    </button>}
                    {skill.manualUse === 'activate' && skill.sourceName === 'TF_BACKSLIDING' && <button
                      disabled={busy || !backslidingAvailable}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>
                      Usar Back Slide · 7 SP
                    </button>}
                    {chasewalkSkill && level > 0 && <small>Manutenção: {10 + 2 * level} SP / 10 s · uso manual</small>}
                    {skill.manualUse === "toggle" && <button disabled={busy || unsupported || level === 0 ||
                      !toggleAvailable}
                      aria-pressed={toggleActive}
                      onClick={() => void command({ type: chasewalkSkill ? 'useSkill' : 'toggleBuff', skillId: skill.id })}>
                      {trickDeadSkill ? toggleActive ? 'Levantar' : 'Fingir de morto' : toggleActive ? 'Desativar' : 'Ativar'}
                    </button>}
                    {skill.kind !== "passive" && (configurableUseLevel || skill.manualUse !== 'inspect' && (!skill.manualUse || skill.sourceName === 'CR_SHRINK' ||
                      sageGroundSkill ||
                      skill.sourceName === 'HT_DETECTING' && skill.manualUse === 'activate' ||
                      skill.sourceName === 'PA_SACRIFICE' && skill.manualUse === 'activate' ||
                      skill.sourceName === 'SA_MAGICROD' && skill.manualUse === 'activate' ||
                      ['CR_PROVIDENCE', 'PR_SUFFRAGIUM'].includes(skill.sourceName ?? '') && skill.manualUse === 'activate')) && (
                      <button
                        disabled={
                          busy ||
                          (!active && unsupported) ||
                          (!active && skill.sourceName === "SA_AUTOSPELL" && !autospellChoices.some(choice => choice.skillId === state.autospellSkillId)) ||
                          level === 0 ||
                          (!active && rotation.length >= SKILL_ROTATION_LIMIT)
                        }
                        aria-pressed={active}
                        onClick={() =>
                          changeRotation(active
                            ? rotation.filter((s) => s !== skill.id)
                            : [...rotation, skill.id])
                        }
                      >
                        {active ? "Remover da rotação" : "Usar na rotação"}
                      </button>
                    )}
                  {skill.sourceName === "CR_DEFENDER" && (state.buffs[skill.id]?.expiresAt ?? 0) > snapshot.serverTime &&
                    <button disabled={busy || unsupported || level === 0} onClick={() => void command({ type: "cancelBuff", skillId: skill.id })}>Desativar</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>}
    </div>
  );
}
