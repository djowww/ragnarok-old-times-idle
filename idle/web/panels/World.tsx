import { useState } from "react";
import { ActorPreview } from "../components/Scene";
import {
  Empty,
  Meter,
  number,
  RewardLine,
  type PanelProps,
} from "../components/common";

export function World({ catalog, snapshot, busy, command }: PanelProps) {
  const { state } = snapshot;
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
              className={`map-stop ${state.areaId === area.id ? "current" : ""} ${state.baseLevel < area.minLevel ? "locked" : ""}`}
              key={area.id}
            >
              <span className="map-stop-marker">{index + 1}</span>
              <span>
                {area.name}
                <small>
                  Base {area.minLevel}
                  {state.visitedAreas.includes(area.id) ? " · explorada" : ""}
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
          return (
            <article
              className={`area-row ${current ? "current" : ""}`}
              key={area.id}
            >
              <div>
                <h3>
                  {area.name} <span>Base {area.minLevel}+</span>
                </h3>
                <p>{area.description}</p>
                <div className="area-monsters">
                  {area.monsters.map((id) => (
                    <span key={id}>{catalog.monsters[id].name}</span>
                  ))}
                </div>
              </div>
              <button
                className={
                  current && state.status === "hunting" ? "" : "primary"
                }
                disabled={
                  busy ||
                  !unlocked ||
                  (current && state.status === "hunting") ||
                  state.status === "challenge"
                }
                onClick={() =>
                  void command({ type: "startHunt", areaId: area.id })
                }
              >
                {!unlocked
                  ? `Base ${area.minLevel}`
                  : current && state.status === "hunting"
                    ? "Caçando aqui"
                    : "Caçar"}
              </button>
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
