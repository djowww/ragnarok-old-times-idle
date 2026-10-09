import { useState } from "react";
import type { AreaActivityBucket, Catalog, HuntFocus } from "../../shared/types";
import { ActorPreview } from "../components/Scene";
import {
  Empty,
  Meter,
  number,
  RewardLine,
  type PanelProps,
} from "../components/common";

const elementNames: Record<string, string> = {
  neutral: "Neutro", water: "Água", earth: "Terra", fire: "Fogo",
  wind: "Vento", poison: "Veneno", holy: "Sagrado", dark: "Sombrio",
  ghost: "Fantasma", undead: "Morto-vivo",
};

export function huntFocusLabel(focus: HuntFocus | undefined, catalog: Catalog): string {
  if (!focus || focus === "any") return "Qualquer monstro";
  if (focus.startsWith("monster:"))
    return catalog.monsters[Number(focus.slice(8))]?.name ?? "Qualquer monstro";
  const element = focus.slice(8);
  return `Elemento ${elementNames[element] ?? element}`;
}

function recentActivity(buckets: AreaActivityBucket[] | undefined, now: number) {
  const currentMinute = Math.floor(now / 60_000) * 60_000;
  const recent = (buckets ?? []).filter((bucket) =>
    bucket.minute >= currentMinute - 14 * 60_000 && bucket.minute <= currentMinute,
  );
  return recent.reduce((total, bucket) => ({
    elapsedMs: total.elapsedMs + bucket.elapsedMs,
    baseExp: total.baseExp + bucket.baseExp,
    jobExp: total.jobExp + bucket.jobExp,
    lootZeny: total.lootZeny + bucket.lootZeny,
    deaths: total.deaths + bucket.deaths,
    potions: total.potions + bucket.potions,
    damageTaken: total.damageTaken + bucket.damageTaken,
  }), { elapsedMs: 0, baseExp: 0, jobExp: 0, lootZeny: 0, deaths: 0, potions: 0, damageTaken: 0 });
}

export function World({ catalog, snapshot, busy, command }: PanelProps) {
  const { state, serverTime } = snapshot;
  const recovering = state.status === "resting" && (state.restMode !== "field" || state.restUntil > serverTime);
  const sitting = state.status === "resting" && state.restMode === "field" && !recovering;
  return (
    <div className="world-layout">
      <div className="atlas">
        <div className="atlas-label">
          <span>Rune-Midgard</span>
          <small>Diário de viagem</small>
        </div>
        <div className="route-map" aria-label="Áreas de exploração">
          {catalog.areas.map((area, index) => (
            <div
              className={`map-stop ${state.areaId === area.id ? "current" : ""} ${state.pendingAreaId === area.id ? "pending" : ""} ${state.baseLevel < area.minLevel ? "locked" : ""}`}
              key={area.id}
            >
              <span className="map-stop-marker">{index + 1}</span>
              <span>
                {area.name}
                <small>
                  Base {area.minLevel}
                  {state.pendingAreaId === area.id ? " · próxima área" : state.visitedAreas.includes(area.id) ? " · explorada" : ""}
                </small>
              </span>
            </div>
          ))}
        </div>
        <p>
          De Prontera às ruínas de Glast Heim.
          <br />
          Cada caçada escreve um novo capítulo.
        </p>
      </div>
      <div className="area-list">
        {catalog.areas.map((area) => {
          const unlocked = state.baseLevel >= area.minLevel;
          const current = state.areaId === area.id;
          const pending = state.pendingAreaId === area.id;
          const cancellingPendingArea = !!state.pendingAreaId && current && state.status === "hunting";
          const focus = state.huntFocus?.[area.id] ?? "any";
          const elements = [...new Set(area.monsters.map((id) => catalog.monsters[id]?.element.toLowerCase()).filter((value): value is string => !!value))];
          const activity = recentActivity(state.areaActivity?.[area.id], snapshot.serverTime);
          const enoughActivity = activity.elapsedMs >= 60_000;
          const hourly = (value: number) => number(value * 3_600_000 / activity.elapsedMs);
          const risk = activity.deaths > 0 || activity.potions >= 5
            ? "alto" : activity.potions > 0 || activity.damageTaken >= snapshot.stats.maxHp
              ? "moderado" : "baixo";
          return (
            <article
              className={`area-row ${current ? "current" : ""} ${pending ? "pending" : ""}`}
              key={area.id}
            >
              <div className="area-details">
                <h3>
                  {area.name} <span>Base {area.minLevel}+</span>
                  {pending && <span className="area-pending-label">Próxima área</span>}
                </h3>
                <p>{area.description}</p>
                <div className="area-monsters">
                  {area.monsters.map((id) => (
                    <span key={id}>{catalog.monsters[id].name}</span>
                  ))}
                </div>
                <div className="area-activity" aria-label={`Resultados recentes em ${area.name}`}>
                  <small className="area-activity-window">Últimos 15 min de caça</small>
                  {enoughActivity ? (
                    <>
                      <span><b>Base</b> {hourly(activity.baseExp)} EXP/h <em>estimativa</em></span>
                      <span><b>Job</b> {hourly(activity.jobExp)} EXP/h <em>estimativa</em></span>
                      <span><b>Zeny potencial</b> {hourly(activity.lootZeny)}/h <em>estimativa</em></span>
                    </>
                  ) : (
                    <span className="area-collecting">Coletando dados para estimativas · disponível após 1 min nesta área</span>
                  )}
                  {activity.elapsedMs > 0 && (
                    <span className={`area-risk risk-${risk}`} title="Risco alto com derrotas ou 5 poções; moderado com poções ou dano igual ao HP máximo; baixo nos demais casos."><b>Risco {risk}</b> · {activity.deaths} derrotas · {activity.potions} poções</span>
                  )}
                </div>
              </div>
              <div className="area-actions">
                <label className="area-focus">
                  Preferência de caça
                  <select
                    value={focus}
                    disabled={busy || !unlocked}
                    onChange={(event) => void command({
                      type: "setHuntFocus", areaId: area.id, focus: event.target.value as HuntFocus,
                    })}
                  >
                    <option value="any">Qualquer monstro</option>
                    <optgroup label="Monstro">
                      {area.monsters.map((id) => (
                        <option key={id} value={`monster:${id}`}>{catalog.monsters[id].name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Elemento">
                      {elements.map((element) => (
                        <option key={element} value={`element:${element}`}>
                          {elementNames[element] ?? element}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <button
                  className={(current && state.status === "hunting" && !cancellingPendingArea) || pending ? "" : "primary"}
                  disabled={busy || !unlocked || pending || recovering || state.status === "challenge" || (current && state.status === "hunting" && !cancellingPendingArea)}
                  onClick={() => void command({ type: "startHunt", areaId: area.id })}
                >
                  {!unlocked ? `Base ${area.minLevel}`
                    : cancellingPendingArea ? "Cancelar troca"
                    : pending ? "Troca agendada"
                    : recovering ? "Recuperando"
                    : state.status === "challenge" ? "Desafio em curso"
                    : current && state.status === "hunting" ? "Caçando aqui"
                    : state.status === "hunting" && state.battle ? "Trocar após este alvo"
                    : current && (state.status === "paused" || sitting) ? "Retomar caça"
                    : "Caçar"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function Quests({ catalog, snapshot, busy, command }: PanelProps) {
  const { state } = snapshot;
  const claimed = catalog.quests.filter(
    (q) => state.quests[q.id]?.claimed,
  ).length;
  return (
    <div className="quests-panel">
      <div className="section-title">
        <h3>Uma aventura de cada vez</h3>
        <span>
          {claimed} / {catalog.quests.length} concluídas
        </span>
      </div>
      <div className="quest-list">
        {catalog.quests.map((quest) => {
          const progress = state.quests[quest.id]?.progress ?? 0;
          const done = state.quests[quest.id]?.claimed;
          const ready = progress >= quest.amount;
          return (
            <article
              className={`quest-row ${done ? "claimed" : ""}`}
              key={quest.id}
            >
              <div className="quest-seal" aria-hidden="true">
                {done ? "✓" : ready ? "!" : "◇"}
              </div>
              <div>
                <h3>{quest.name}</h3>
                <p>{quest.description}</p>
                <RewardLine reward={quest.reward} catalog={catalog} />
                <Meter
                  label="Progresso"
                  value={Math.min(progress, quest.amount)}
                  max={quest.amount}
                  kind="quest"
                />
              </div>
              <button
                className={ready && !done ? "primary" : ""}
                disabled={busy || done || !ready}
                onClick={() =>
                  void command({ type: "claimQuest", questId: quest.id })
                }
              >
                {done ? "Concluída" : ready ? "Resgatar" : "Em andamento"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function Bestiary({ catalog, snapshot }: PanelProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const monsters = Object.values(catalog.monsters);
  const monster = monsters.find((m) => m.id === selected) ?? monsters[0];
  const kills = snapshot.state.bestiary;
  return (
    <div className="bestiary-layout">
      <div>
        <div className="section-title">
          <h3>Bestiário de Rune-Midgard</h3>
          <span>
            {monsters.filter((m) => (kills[m.id] ?? 0) > 0).length} /{" "}
            {monsters.length} encontrados
          </span>
        </div>
        <div className="bestiary-grid">
          {monsters.map((m) => (
            <button
              className={`monster-entry ${monster?.id === m.id ? "selected" : ""}`}
              key={m.id}
              aria-pressed={monster?.id === m.id}
              onClick={() => setSelected(m.id)}
            >
              <ActorPreview asset={m.sprite} name={m.name} />
              <b>{m.name}</b>
              <small>{number(kills[m.id] ?? 0)} abates</small>
            </button>
          ))}
        </div>
      </div>
      <aside className="item-detail">
        {monster ? (
          <>
            <ActorPreview asset={monster.sprite} name={monster.name} large />
            <h3>{monster.name}</h3>
            <p className="muted">
              Nv. {monster.level} · {monster.race} · {monster.size}
            </p>
            <dl className="combat-stats">
              <div>
                <dt>HP</dt>
                <dd>{number(monster.hp)}</dd>
              </div>
              <div>
                <dt>ATQ</dt>
                <dd>{monster.attack.join("–")}</dd>
              </div>
              <div>
                <dt>DEF / DEFM</dt>
                <dd>
                  {monster.def} / {monster.mdef}
                </dd>
              </div>
              <div>
                <dt>Elemento</dt>
                <dd>
                  {monster.element} {monster.elementLevel}
                </dd>
              </div>
            </dl>
            <h4 className="detail-heading">Drops</h4>
            <div className="drop-list">
              {monster.drops.map((drop, index) => (
                <div key={`${drop.itemId}:${index}`}>
                  <span>
                    {catalog.items[drop.itemId]?.name ?? `Item ${drop.itemId}`}
                  </span>
                  <b>{(drop.chance / 100).toLocaleString("pt-BR")}%</b>
                </div>
              ))}
            </div>
            <p className="note">
              Chance original de drop · {catalog.rates.drop}×.
            </p>
            <h4 className="detail-heading">Coleção de cartas</h4>
            {monster.drops
              .filter((d) => catalog.items[d.itemId]?.type === "card")
              .map((d) => {
                const count =
                  snapshot.state.inventory
                    .filter((e) => e.itemId === d.itemId)
                    .reduce((n, e) => n + e.quantity, 0) +
                  snapshot.state.inventory.reduce(
                    (n, e) =>
                      n + e.cards.filter((id) => id === d.itemId).length,
                    0,
                  );
                return (
                  <p key={d.itemId}>
                    {catalog.items[d.itemId].name} ·{" "}
                    {count ? `${count} na coleção` : "Ainda não encontrada"}
                  </p>
                );
              })}
            {!monster.drops.some(
              (d) => catalog.items[d.itemId]?.type === "card",
            ) && (
              <p className="muted">
                Esta criatura não oferece uma carta nesta coleção.
              </p>
            )}
          </>
        ) : (
          <Empty>Não há criaturas no catálogo.</Empty>
        )}
      </aside>
    </div>
  );
}
