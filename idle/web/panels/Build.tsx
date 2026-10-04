import type { Stat } from "../../shared/types";
import { number, type PanelProps } from "../components/common";
import SkillIcon from "../components/SkillIcon";

const attributes: Array<{ stat: Stat; name: string; hint: string }> = [
  { stat: "str", name: "Força", hint: "Ataque corpo a corpo" },
  { stat: "agi", name: "Agilidade", hint: "Esquiva e velocidade" },
  { stat: "vit", name: "Vitalidade", hint: "HP e resistência" },
  { stat: "int", name: "Inteligência", hint: "Magia e SP" },
  { stat: "dex", name: "Destreza", hint: "Precisão e ataque à distância" },
  { stat: "luk", name: "Sorte", hint: "Crítico e esquiva perfeita" },
];
export default function Build({
  catalog,
  snapshot,
  busy,
  command,
  mode = "all",
}: PanelProps & { mode?: "all" | "stats" | "skills" }) {
  const { state, stats } = snapshot;
  const ids = new Set(Object.keys(state.learnedSkills));
  const visited = new Set<string>();
  function visit(jobId?: string) {
    if (!jobId || visited.has(jobId)) return;
    const job = catalog.classes[jobId];
    if (!job) return;
    visited.add(jobId);
    job.skills.forEach((id) => ids.add(id));
    visit(job.parent);
    visit(job.rebirthOf);
  }
  visit(state.job);
  const skills = [...ids].map((id) => catalog.skills[id]).filter(Boolean);
  const rotation = state.rotation;
  const move = (id: string, step: number) => {
    const next = [...rotation];
    const at = next.indexOf(id);
    const to = at + step;
    [next[at], next[to]] = [next[to], next[at]];
    void command({ type: "setRotation", skillIds: next });
  };
  return (
    <div className={`build-layout build-layout-${mode}`}>
      {mode !== "skills" && <section>
        <div className="section-title">
          <h3>Atributos</h3>
          <b className="point-count">{number(state.statPoints)} pontos</b>
        </div>
        <div className="attribute-list">
          {attributes.map((a) => {
            const value = state.stats[a.stat];
            const cost = 2 + Math.floor((value - 1) / 10);
            return (
              <div className="attribute-row" key={a.stat}>
                <span className="stat-code">{a.stat.toUpperCase()}</span>
                <span>
                  <b>{a.name}</b>
                  <small>{a.hint}</small>
                </span>
                <strong>{value}</strong>
                <button
                  aria-label={`Aumentar ${a.name}, custo ${cost} pontos`}
                  disabled={busy || state.statPoints < cost || value >= 99}
                  onClick={() =>
                    void command({ type: "allocate", stat: a.stat, amount: 1 })
                  }
                >
                  + <small>{cost} pt</small>
                </button>
              </div>
            );
          })}
        </div>
        <h4 className="detail-heading">Valores de combate</h4>
        <dl className="combat-stats">
          <div>
            <dt>ATQ</dt>
            <dd>{stats.attack}</dd>
          </div>
          <div>
            <dt>ATQM</dt>
            <dd>{stats.magicAttack.join("–")}</dd>
          </div>
          <div>
            <dt>DEF / DEFM</dt>
            <dd>
              {stats.def} / {stats.mdef}
            </dd>
          </div>
          <div>
            <dt>Precisão</dt>
            <dd>{stats.hit}</dd>
          </div>
          <div>
            <dt>Esquiva</dt>
            <dd>{stats.flee}</dd>
          </div>
          <div>
            <dt>Crítico</dt>
            <dd>{stats.crit}%</dd>
          </div>
          <div>
            <dt>Intervalo</dt>
            <dd>{(stats.attackIntervalMs / 1000).toFixed(1)}s</dd>
          </div>
        </dl>
        <p className="note">
          Os atributos distribuídos são permanentes até o renascimento.
        </p>
      </section>}
      {mode !== "stats" && <section className="skills-section">
        <div className="section-title">
          <h3>Habilidades</h3>
          <b className="point-count">{number(state.skillPoints)} pontos</b>
        </div>
        <div className="rotation-box">
          <h4>
            Prioridade automática <span>{rotation.length} / 3</span>
          </h4>
          {rotation.length ? (
            <ol>
              {rotation.map((id, index) => (
                <li key={id}>
                  <span>{catalog.skills[id].name}</span>
                  <div>
                    <button
                      title="Priorizar"
                      aria-label={`Priorizar ${catalog.skills[id].name}`}
                      disabled={busy || index === 0}
                      onClick={() => move(id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      title="Usar depois"
                      aria-label={`Usar ${catalog.skills[id].name} depois`}
                      disabled={busy || index === rotation.length - 1}
                      onClick={() => move(id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`Remover ${catalog.skills[id].name} da rotação`}
                      disabled={busy}
                      onClick={() =>
                        void command({
                          type: "setRotation",
                          skillIds: rotation.filter((s) => s !== id),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Aprenda uma habilidade ativa e adicione-a à rotação.
            </p>
          )}
          <p className="note">
            Até três habilidades. Sem recursos, seu personagem usa o ataque
            básico.
          </p>
        </div>
        <div className="skill-list">
          {skills.map((skill) => {
            const level = state.learnedSkills[skill.id] ?? 0;
            const costAt = Math.max(0, level - 1);
            const active = rotation.includes(skill.id);
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
                      ? "Passiva · sempre aplicada"
                      : `${skill.spCost[costAt] ?? 0} SP · ${(skill.cooldownMs / 1000).toFixed(0)}s`}
                    {skill.zenyCost
                      ? ` · ${number(skill.zenyCost[costAt] ?? 0)} z`
                      : ""}
                    {skill.itemCost
                      ? ` · ${skill.itemCost.quantity} ${catalog.items[skill.itemCost.itemId]?.name}`
                      : ""}
                  </small>
                  <div className="action-row">
                    <button
                      disabled={
                        busy || state.skillPoints < 1 || level >= skill.maxLevel
                      }
                      onClick={() =>
                        void command({ type: "learnSkill", skillId: skill.id })
                      }
                    >
                      {level === 0
                        ? "Aprender"
                        : level === skill.maxLevel
                          ? "Nível máximo"
                          : "Melhorar"}{" "}
                      · 1 pt
                    </button>
                    {skill.kind !== "passive" && (
                      <button
                        disabled={
                          busy ||
                          level === 0 ||
                          (!active && rotation.length >= 3)
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
