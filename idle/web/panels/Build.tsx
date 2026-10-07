import { number, type PanelProps } from "../components/common";
import ClassicStatus from "../components/ClassicStatus";
import SkillIcon from "../components/SkillIcon";
import SkillWheel, { SKILL_ROTATION_LIMIT } from "../components/SkillWheel";
import { classSkills } from "../../engine/stats";
import { classicCastTime } from "../../engine/classic";

export default function Build({
  catalog,
  snapshot,
  busy,
  command,
  mode = "all",
}: PanelProps & { mode?: "all" | "stats" | "skills" }) {
  const { state, stats } = snapshot;
  const ids = new Set(classSkills(catalog, state.job));
  const skills = [...ids].map((id) => catalog.skills[id]).filter(Boolean);
  const rotation = state.rotation;
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
            const prerequisites = skill.prerequisitesByClass?.[state.job] ?? skill.prerequisites ?? [];
            const missingPrerequisites = prerequisites.some(
              (required) => (state.learnedSkills[required.skillId] ?? 0) < required.level,
            );
            const missingJobLevel = state.jobLevel < (skill.minimumJobLevel ?? 0);
            const baseCast = skill.castTimeMs?.[costAt] ?? 0;
            const castTime = (skill.ignoresDex ? baseCast : classicCastTime(baseCast, stats.attributes?.dex ?? state.stats.dex)) *
              (1 - Math.min(100, stats.effects.castReductionPct ?? 0) / 100);
            const afterCast = (skill.afterCastDelayMs?.[costAt] ?? 0) *
              (1 - Math.min(100, stats.effects.afterCastReductionPct ?? 0) / 100);
            const spCost = Math.max(0, Math.floor((skill.spCost[costAt] ?? 0) *
              (1 - Math.min(100, stats.effects.spCostReductionPct ?? 0) / 100)));
            const itemCosts = skill.itemCostByLevel?.[costAt] ?? (skill.itemCost ? [skill.itemCost] : []);
            const hits = skill.hitCount?.[costAt] ?? 1;
            const area = skill.aoeRadius?.[costAt] ?? 0;
            const range = skill.range?.[costAt] ?? 0;
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
                  <small>
                    {skill.kind === "passive"
                      ? unsupported ? "Passiva · efeito indisponível" : level > 0 ? "Passiva · sempre aplicada" : "Passiva · aplicada ao aprender"
                      : `${spCost} SP${skill.cooldownMs > 0 && !skill.afterCastDelayMs ? ` · recarga ${(skill.cooldownMs / 1000).toFixed(1)}s` : ""}`}
                    {skill.zenyCost
                      ? ` · ${number(skill.zenyCost[costAt] ?? 0)} z`
                      : ""}
                    {itemCosts.map(cost => ` · ${cost.quantity} ${catalog.items[cost.itemId]?.name ?? `item ${cost.itemId}`}`).join("")}
                  </small>
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
                    {skill.kind !== "passive" && (
                      <button
                        disabled={
                          busy ||
                          (!active && unsupported) ||
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
