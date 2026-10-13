import { number, type PanelProps } from "../components/common";
import ClassicStatus from "../components/ClassicStatus";
import SkillIcon from "../components/SkillIcon";
import SkillWheel, { SKILL_ROTATION_LIMIT } from "../components/SkillWheel";
import { classSkills } from "../../engine/stats";
import { classicCastTime } from "../../engine/classic";
import { automaticSpellChoices } from "../../engine/sageCasting";
import { classicBuffActive } from "../../engine/classicBuffs";
import { canPaySkillResources } from '../../engine/skillResources';
import { castControlEligible } from '../../engine/castControl';
import { castCancelAdditionalSp } from '../../engine/castControlRules';
import { isPecoMounted } from '../../engine/mountedPeco';
import { senseManualTarget } from '../../engine/senseInspection';
import type { GameCommand } from '../../shared/types';

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
}: PanelProps & { mode?: "all" | "stats" | "skills"; onOpenConverters?: () => void }) {
  const { state, stats } = snapshot;
  const ids = new Set(classSkills(catalog, state.job));
  const skills = [...ids].map((id) => catalog.skills[id]).filter(Boolean);
  const rotation = state.rotation;
  const autospellChoices = automaticSpellChoices(state, catalog);
  const mounted = isPecoMounted(state, catalog);
  return (
    <div className={`build-layout build-layout-${mode}`}>
      {mode !== "skills" && <ClassicStatus catalog={catalog} snapshot={snapshot} busy={busy} command={command} />}
      {mode !== "stats" && <section className="skills-section">
        <div className="section-title">
          <h3>Habilidades</h3>
          <b className="point-count">{number(state.skillPoints)} pontos</b>
        </div>
        <SkillWheel skills={catalog.skills} rotation={rotation} busy={busy}
          onChange={(skillIds) => void command({ type: "setRotation", skillIds })} />
        <div className="skill-list">
          {skills.map((skill) => {
            const level = state.learnedSkills[skill.id] ?? 0;
            const costAt = Math.max(0, level - 1);
            const active = rotation.includes(skill.id);
            const unsupported = skill.implementation === "unsupported";
            const ownCast=state.battle?.cast;
            const cancelAvailable=!!ownCast&&ownCast.startedAt<=snapshot.serverTime&&snapshot.serverTime<ownCast.endsAt&&
              castControlEligible(state,catalog,skill,level,snapshot.serverTime)&&canPaySkillResources(state,catalog,skill,level,snapshot.serverTime);
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
            const toggleAvailable = toggleActive ||
              (!trickDeadSkill || state.hp > 0 &&
                (state.status === 'hunting' || state.status === 'resting' && state.restMode === 'field')) &&
              canPaySkillResources(state, catalog, skill, level, snapshot.serverTime);
            const magicRodActivationBlocked = !!state.battle?.cast ||
              ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'NV_TRICKDEAD']
                .some(source => classicBuffActive(state, catalog, source, snapshot.serverTime));
            const itemCosts = skill.itemCostByLevel?.[costAt] ?? (skill.itemCost ? [skill.itemCost] : []);
            const sacrificeActive = skill.sourceName === 'PA_SACRIFICE' &&
              (state.combatEffects?.sacrifice?.charges ?? 0) > 0 && classicBuffActive(state, catalog, 'PA_SACRIFICE', snapshot.serverTime);
              const sacrificeActivationBlocked = !!state.battle?.cast ||
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
            const mechanics = [
              castTime > 0 ? `${(castTime / 1000).toLocaleString("pt-BR", {maximumFractionDigits: 1})}s de conjuração` : "",
              afterCast > 0 ? `${(afterCast / 1000).toLocaleString("pt-BR", {maximumFractionDigits: 1})}s após conjurar` : "",
              hits > 1 ? `${hits} golpes` : "",
              area > 0 ? `Área ${area} células` : "",
              range > 1 ? `Alcance ${range} células` : "",
            ].filter(Boolean);
            return (
              <article className="skill-row" key={skill.id}>
                <div className="skill-symbol" aria-hidden="true">
                  <SkillIcon skill={skill} />
                </div>
                <div className="skill-description">
                  <h4>
                    {skill.name}{" "}
                    <span>
                      {level} / {skill.maxLevel}
                    </span>
                  </h4>
                  <p>{skill.description}</p>
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
                  {prerequisites.length > 0 && (
                    <p className={`skill-prerequisites ${missingPrerequisites ? "missing" : "met"}`}>
                      Requer {prerequisites.map((required) =>
                        `${catalog.skills[required.skillId]?.name ?? required.skillId} Nv. ${required.level}`,
                      ).join(" · ")}
                      {!missingPrerequisites && <span> ✓</span>}
                    </p>
                  )}
                  {(skill.minimumJobLevel ?? 0) > 0 && (
                    <p className={`skill-prerequisites ${missingJobLevel ? "missing" : "met"}`}>
                      Requer nível de classe {skill.minimumJobLevel}{!missingJobLevel && " ✓"}
                    </p>
                  )}
                  {unsupported && <p className="skill-unavailable">
                    Efeito indisponível: {skill.unsupportedReason ?? "A mecânica desta habilidade ainda não foi implementada."}
                    {" "}Estudar esta habilidade permite cumprir os pré-requisitos da árvore.
                  </p>}
                  <div className="action-row">
                    <button
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
                    </button>
                    {skill.manualUse === "converterCraft" && <button disabled={busy || unsupported || level === 0 || state.status !== "town" || !onOpenConverters} onClick={onOpenConverters}>Produzir conversores</button>}
                    {skill.manualUse === "inventory" && <small>Use na mochila para identificar equipamentos.</small>}
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
                    {skill.manualUse === 'inspect' && <button type="button"
                      disabled={busy || !senseCanInspect}
                      onClick={() => senseTarget && void command(senseInspectCommand(skill.id, senseTarget.id))}>
                      Examinar
                    </button>}
                    {skill.manualUse === 'rest' && <button disabled={busy || unsupported || level === 0 ||
                      (state.status !== 'hunting' && !(state.status === 'resting' && state.restMode === 'field')) ||
                      !canPaySkillResources(state, catalog, skill, level, snapshot.serverTime)}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>Sentar e relaxar</button>}
                    {skill.manualUse === 'activate' && skill.sourceName === 'PA_SACRIFICE' && <button
                      disabled={busy || unsupported || level === 0 || !ids.has(skill.id) || missingPrerequisites || missingJobLevel ||
                        sacrificeActivationBlocked || !canPaySkillResources(state, catalog, skill, level, snapshot.serverTime)}
                      onClick={() => void command({ type: 'useSkill', skillId: skill.id })}>
                      {sacrificeActive ? 'Repor cargas' : 'Ativar Sacrifício'}
                    </button>}
                    {skill.manualUse === 'activate' && skill.sourceName === 'MO_BLADESTOP' && <button
                      disabled={busy || unsupported || level === 0 || !ids.has(skill.id) || missingPrerequisites || missingJobLevel ||
                        state.hp <= 0 || (state.status !== 'hunting' && state.status !== 'challenge') || !state.battle?.enemies?.length ||
                        !!state.battle?.cast || !!state.combatEffects?.bladeStopWait || !!state.combatEffects?.bladeStopLink ||
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
                    {skill.manualUse === "toggle" && <button disabled={busy || unsupported || level === 0 ||
                      !toggleAvailable}
                      aria-pressed={toggleActive}
                      onClick={() => void command({ type: 'toggleBuff', skillId: skill.id })}>
                      {trickDeadSkill ? toggleActive ? 'Levantar' : 'Fingir de morto' : toggleActive ? 'Desativar' : 'Ativar'}
                    </button>}
                    {skill.kind !== "passive" && skill.manualUse !== 'inspect' && (!skill.manualUse || skill.sourceName === 'CR_SHRINK' ||
                      skill.sourceName === 'PA_SACRIFICE' && skill.manualUse === 'activate' ||
                      skill.sourceName === 'SA_MAGICROD' && skill.manualUse === 'activate') && (
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
                          void command({
                            type: "setRotation",
                            skillIds: active
                              ? rotation.filter((s) => s !== skill.id)
                              : [...rotation, skill.id],
                          })
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
