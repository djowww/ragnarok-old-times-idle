import { useEffect, useState } from "react";
import type { Slot } from "../shared/types";
import { useGame } from "./api";
import Scene, { ActorPreview } from "./components/Scene";
import Offline from "./components/Offline";
import {
  duration,
  ItemIcon,
  itemName,
  Meter,
  number,
  Panel,
  slots,
  statusNames,
  type PanelProps,
} from "./components/common";
import Inventory from "./panels/Inventory";
import Shop from "./panels/Shop";
import Build from "./panels/Build";
import { Bestiary, Quests, World } from "./panels/World";
import Classes from "./panels/Classes";
import Challenges from "./panels/Challenges";

const tabs = [
  ["inventory", "Mochila"],
  ["shop", "Loja"],
  ["build", "Atributos & habilidades"],
  ["world", "Mapa"],
  ["quests", "Missões"],
  ["bestiary", "Bestiário"],
  ["classes", "Classes"],
  ["challenges", "Desafios"],
] as const;
type Tab = (typeof tabs)[number][0];
export default function App() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("inventory");
  const [areaId, setAreaId] = useState("");
  const [potionEditor, setPotionEditor] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [hpThreshold, setHpThreshold] = useState(50);
  const [spThreshold, setSpThreshold] = useState(25);
  useEffect(() => {
    if (game.snapshot) {
      setHpThreshold(game.snapshot.state.autoPotion.hpThreshold);
      setSpThreshold(game.snapshot.state.autoPotion.spThreshold);
    }
  }, [
    game.snapshot?.state.autoPotion.hpThreshold,
    game.snapshot?.state.autoPotion.spThreshold,
  ]);
  useEffect(() => {
    if (!areaId && game.catalog)
      setAreaId(game.snapshot?.state.areaId ?? game.catalog.areas[0].id);
  }, [game.catalog, game.snapshot, areaId]);
  useEffect(() => {
    if (game.snapshot?.state.areaId) setAreaId(game.snapshot.state.areaId);
  }, [game.snapshot?.state.areaId]);
  const { catalog, snapshot } = game;
  const panels = {
    inventory: Inventory,
    shop: Shop,
    build: Build,
    world: World,
    quests: Quests,
    bestiary: Bestiary,
    classes: Classes,
    challenges: Challenges,
  };
  const ActivePanel = panels[tab];
  const changeTab = (next: Tab) => {
    setTab(next);
    if (window.matchMedia("(max-width: 440px)").matches)
      requestAnimationFrame(() =>
        document
          .querySelector(".game-panels")
          ?.scrollIntoView({ block: "start", behavior: "auto" }),
      );
  };
  return (
    <div className="game-shell">
      <a className="skip-link" href="#adventure">
        Ir para a aventura
      </a>
      <header className="masthead">
        <a className="brand" href="/" aria-label="Ragnarok Old Times Idle">
          <span className="brand-name">Ragnarok</span>
          <span className="brand-subtitle">
            Old Times <b>Idle</b>
          </span>
        </a>
        <div className="header-divider" />
        <div className="header-character">
          {snapshot && catalog ? (
            <>
              <b>{snapshot.state.name}</b>
              <span>{catalog.classes[snapshot.state.job].name}</span>
            </>
          ) : (
            <>
              <b>Rune-Midgard</b>
              <span>Seu próximo capítulo</span>
            </>
          )}
        </div>
        {snapshot && catalog && (
          <div className="header-levels">
            <span>
              BASE <b>{snapshot.state.baseLevel}</b>
            </span>
            <span>
              JOB <b>{snapshot.state.jobLevel}</b>
            </span>
            <span className="zeny">
              <i aria-hidden="true">Z</i>
              <b>{number(snapshot.state.zeny)}</b> zeny
            </span>
          </div>
        )}
        <div className="connection">
          <span
            className={`connection-light ${game.connected ? "online" : ""}`}
          />
          <span>
            {game.sending
              ? "Salvando…"
              : game.connected
                ? "Progresso salvo"
                : snapshot
                  ? "Reconectando"
                  : "Conectando"}
          </span>
        </div>
      </header>
      {game.error && (
        <div className="error-banner" role="alert">
          <div>
            <b>
              {game.retryable
                ? "Não foi possível confirmar a ação."
                : "Não foi possível continuar."}
            </b>
            <span>{game.error}</span>
            {game.retryable && (
              <small>
                Use “Tentar novamente” para recuperar o resultado desta mesma
                ação.
              </small>
            )}
          </div>
          <button disabled={game.sending} onClick={() => void game.retry()}>
            Tentar novamente
          </button>
        </div>
      )}
      {!catalog || !snapshot ? (
        <main className="loading-screen" aria-busy="true">
          <div className="loading-wordmark">Rune-Midgard</div>
          <h1>Preparando sua aventura</h1>
          <p>Carregando personagem, mochila e áreas de caça.</p>
          <div className="loading-layout">
            <div />
            <div />
            <div />
          </div>
          {game.error && (
            <button className="primary" onClick={() => void game.retry()}>
              Reconectar
            </button>
          )}
        </main>
      ) : (
        (() => {
          const { state, stats, serverTime } = snapshot;
          const props: PanelProps = {
            catalog,
            snapshot,
            busy: game.busy,
            command: game.command,
          };
          const currentClass = catalog.classes[state.job];
          const area = catalog.areas.find((a) => a.id === state.areaId);
          const selectedArea =
            catalog.areas.find((a) => a.id === areaId) ?? catalog.areas[0];
          const active =
            state.status === "hunting" || state.status === "challenge";
          const baseGoal =
            (state.reborn
              ? (catalog.exp.baseTrans ?? catalog.exp.base)
              : catalog.exp.base)[state.baseLevel] ?? 0;
          const jobGoal =
            catalog.exp.job[currentClass.expGroup]?.[state.jobLevel] ?? 0;
          return (
            <>
              <div className="world-status">
                <div>
                  <span className="status-diamond" aria-hidden="true" />
                  {statusNames[state.status]}
                  <span className="dot-separator">/</span>
                  {area && state.status !== "town" ? area.name : "Prontera"}
                </div>
                <span>
                  EXP {catalog.rates.baseExp}× · Job {catalog.rates.jobExp}× ·
                  Drop {catalog.rates.drop}×
                </span>
              </div>
              <main id="adventure" className="cockpit">
                <aside className="hero-column">
                  <Panel
                    title="Personagem"
                    aside={
                      <span className="tiny-label">
                        {state.reborn ? "Transcendente" : "Aventureiro"}
                      </span>
                    }
                    className="hero-panel"
                  >
                    <div className="hero-identity">
                      <ActorPreview
                        asset={currentClass.sprite[state.gender]}
                        name={`${state.name}, ${currentClass.name}`}
                      />
                      <div>
                        <h1>{state.name}</h1>
                        <p>{currentClass.name}</p>
                        <span>
                          Base {state.baseLevel} · Job {state.jobLevel}
                        </span>
                      </div>
                    </div>
                    <div className="hero-vitals">
                      <Meter label="HP" value={state.hp} max={stats.maxHp} />
                      <Meter
                        label="SP"
                        value={state.sp}
                        max={stats.maxSp}
                        kind="sp"
                      />
                      <Meter
                        label="Base"
                        value={state.baseExp}
                        max={baseGoal}
                        kind="exp"
                        text={
                          state.baseLevel >= 99
                            ? "Nível máximo"
                            : `${number(state.baseExp)} / ${number(baseGoal)}`
                        }
                      />
                      <Meter
                        label="Job"
                        value={state.jobExp}
                        max={jobGoal}
                        kind="job"
                        text={
                          state.jobLevel >= currentClass.jobCap
                            ? "Nível máximo"
                            : `${number(state.jobExp)} / ${number(jobGoal)}`
                        }
                      />
                    </div>
                    <div className="hero-quick-stats">
                      <span>
                        ATQ <b>{stats.attack}</b>
                      </span>
                      <span>
                        DEF <b>{stats.def}</b>
                      </span>
                      <span>
                        ESQ <b>{stats.flee}</b>
                      </span>
                    </div>
                    {currentClass.tier === 0 && !state.reborn && (
                      <div className="avatar-choice">
                        <span>Avatar</span>
                        <button
                          disabled={game.busy}
                          aria-pressed={state.gender === "male"}
                          onClick={() =>
                            void game.command({
                              type: "setGender",
                              gender: "male",
                            })
                          }
                        >
                          Masculino
                        </button>
                        <button
                          disabled={game.busy}
                          aria-pressed={state.gender === "female"}
                          onClick={() =>
                            void game.command({
                              type: "setGender",
                              gender: "female",
                            })
                          }
                        >
                          Feminino
                        </button>
                      </div>
                    )}
                  </Panel>
                  <Panel
                    title="Equipamento"
                    aside={
                      <button
                        className="text-button"
                        onClick={() => changeTab("inventory")}
                      >
                        Mochila
                      </button>
                    }
                  >
                    <div className="equipment-list">
                      {(Object.keys(slots) as Slot[]).map((slot) => {
                        const entry = state.inventory.find(
                          (e) => e.uid === state.equipment[slot],
                        );
                        const item = entry ? catalog.items[entry.itemId] : null;
                        return (
                          <div
                            className={`equipment-row ${entry ? "" : "empty"}`}
                            key={slot}
                          >
                            <span className="slot-label">{slots[slot]}</span>
                            {entry && item ? (
                              <>
                                <ItemIcon item={item} />
                                <b title={itemName(item, entry)}>
                                  {itemName(item, entry)}
                                </b>
                                <button
                                  className="icon-button"
                                  title={`Desequipar ${slots[slot]}`}
                                  aria-label={`Desequipar ${slots[slot]}`}
                                  disabled={game.busy}
                                  onClick={() =>
                                    void game.command({ type: "unequip", slot })
                                  }
                                >
                                  ×
                                </button>
                              </>
                            ) : (
                              <span className="slot-empty">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                </aside>
                <section className="adventure-column">
                  <Panel
                    title={
                      state.status === "challenge"
                        ? "Arena de desafios"
                        : state.status === "town"
                          ? "Praça de Prontera"
                          : (area?.name ?? "Campos de Prontera")
                    }
                    aside={
                      <span
                        className={`hunt-indicator ${active ? "active" : ""}`}
                      >
                        {active ? "Em combate" : statusNames[state.status]}
                      </span>
                    }
                    className="scene-panel"
                  >
                    <Scene {...props} />
                    <div className="hunt-controls">
                      <label className="area-selector">
                        Área de caça
                        <select
                          value={areaId}
                          disabled={game.busy || state.status === "challenge"}
                          onChange={(e) => setAreaId(e.target.value)}
                        >
                          {catalog.areas.map((a) => (
                            <option
                              key={a.id}
                              value={a.id}
                              disabled={state.baseLevel < a.minLevel}
                            >
                              {a.name}
                              {state.baseLevel < a.minLevel
                                ? ` · Base ${a.minLevel}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="primary hunt-button"
                        disabled={
                          game.busy ||
                          state.baseLevel < selectedArea.minLevel ||
                          state.status === "challenge" ||
                          (state.status === "hunting" &&
                            state.areaId === areaId)
                        }
                        onClick={() =>
                          void game.command({ type: "startHunt", areaId })
                        }
                      >
                        {state.status === "hunting" && state.areaId === areaId
                          ? "Caçando"
                          : state.areaId === areaId && state.status === "paused"
                            ? "Retomar caça"
                            : "Iniciar caça"}
                      </button>
                      <button
                        disabled={game.busy || state.status === "town"}
                        onClick={() => void game.command({ type: "stop" })}
                      >
                        {state.status === "challenge" ? "Desistir" : "Cidade"}
                      </button>
                      <button
                        disabled={
                          game.busy ||
                          state.status === "resting" ||
                          (state.hp >= stats.maxHp && state.sp >= stats.maxSp)
                        }
                        onClick={() => void game.command({ type: "rest" })}
                      >
                        Descansar
                      </button>
                    </div>
                    {state.status === "resting" && (
                      <div className="rest-status" role="status">
                        Recuperando forças
                        {state.restUntil > serverTime
                          ? ` · ${duration(state.restUntil - serverTime)}`
                          : ""}
                        .
                      </div>
                    )}
                    {state.battle?.deadlineAt && (
                      <div className="rest-status">
                        Tempo do desafio:{" "}
                        {duration(state.battle.deadlineAt - serverTime)}.
                      </div>
                    )}
                    <div className="automation-controls">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={state.autoResume}
                          disabled={game.busy}
                          onChange={(e) =>
                            void game.command({
                              type: "setAutoResume",
                              enabled: e.target.checked,
                            })
                          }
                        />{" "}
                        Retomar caça após recuperar
                      </label>
                      <button
                        className="text-button"
                        aria-expanded={potionEditor}
                        onClick={() => setPotionEditor(!potionEditor)}
                      >
                        Auto poção · HP {state.autoPotion.hpThreshold}% / SP{" "}
                        {state.autoPotion.spThreshold}%
                      </button>
                    </div>
                    {potionEditor && (
                      <form
                        className="potion-settings"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (
                            await game.command({
                              type: "setPotions",
                              hpThreshold,
                              spThreshold,
                            })
                          )
                            setPotionEditor(false);
                        }}
                      >
                        <label>
                          HP ≤{" "}
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={hpThreshold}
                            onChange={(e) =>
                              setHpThreshold(
                                Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    Math.floor(Number(e.target.value) || 0),
                                  ),
                                ),
                              )
                            }
                          />{" "}
                          %
                        </label>
                        <label>
                          SP ≤{" "}
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={spThreshold}
                            onChange={(e) =>
                              setSpThreshold(
                                Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    Math.floor(Number(e.target.value) || 0),
                                  ),
                                ),
                              )
                            }
                          />{" "}
                          %
                        </label>
                        <button
                          className="primary"
                          disabled={game.busy}
                          type="submit"
                        >
                          Salvar
                        </button>
                        <p className="note">
                          0% desativa. Usa poções reais da mochila.
                        </p>
                      </form>
                    )}
                  </Panel>
                  <div className="adventure-note">
                    <span className="note-rule" />
                    <p>
                      {state.status === "town"
                        ? "Uma boa caçada começa com uma mochila preparada."
                        : "Você escolhe o caminho. Seu personagem cuida da caçada."}
                    </p>
                    <span className="note-rule" />
                  </div>
                </section>
                <aside className="journal-column">
                  <Panel title="Sua jornada" className="journey-panel">
                    <dl className="journey-stats">
                      <div>
                        <dt>Abates totais</dt>
                        <dd>{number(state.totals.kills)}</dd>
                      </div>
                      <div>
                        <dt>Áreas exploradas</dt>
                        <dd>
                          {state.visitedAreas.length} / {catalog.areas.length}
                        </dd>
                      </div>
                      <div>
                        <dt>Missões concluídas</dt>
                        <dd>
                          {
                            Object.values(state.quests).filter((q) => q.claimed)
                              .length
                          }{" "}
                          / {catalog.quests.length}
                        </dd>
                      </div>
                    </dl>
                    <div className="journey-divider" />
                    <button
                      className="journey-quest"
                      onClick={() => changeTab("quests")}
                    >
                      {(() => {
                        const next = catalog.quests.find(
                          (q) => !state.quests[q.id]?.claimed,
                        );
                        return next ? (
                          <>
                            <span>Próximo objetivo</span>
                            <b>{next.name}</b>
                            <small>{next.description}</small>
                          </>
                        ) : (
                          <>
                            <span>Objetivos concluídos</span>
                            <b>Siga explorando Rune-Midgard</b>
                          </>
                        );
                      })()}
                    </button>
                    <button
                      className="mobile-journal-toggle"
                      aria-expanded={journalOpen}
                      onClick={() => setJournalOpen(!journalOpen)}
                    >
                      {journalOpen ? "Recolher diário" : "Diário de combate"}
                    </button>
                  </Panel>
                  <Panel
                    title="Diário de combate"
                    aside={<span className="tiny-label">Recentes</span>}
                    className={`journal-panel ${journalOpen ? "mobile-open" : ""}`}
                  >
                    <div className="event-list" role="log" aria-live="off">
                      {[...state.events]
                        .reverse()
                        .slice(0, 30)
                        .map((event) => (
                          <div
                            className={`event event-${event.kind}`}
                            key={event.id}
                          >
                            <time>
                              {new Date(event.at).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            <span>
                              {event.text}
                              {event.amount !== undefined && (
                                <b className="event-amount">
                                  {" "}
                                  · {number(event.amount)}
                                </b>
                              )}
                            </span>
                          </div>
                        ))}
                      {state.events.length === 0 && (
                        <p className="journal-empty">
                          Seu diário aguarda a primeira aventura. Escolha uma
                          área e comece a caçar.
                        </p>
                      )}
                    </div>
                  </Panel>
                </aside>
              </main>
              <section className="game-panels panel">
                <div className="panel-heading mobile-panel-title">
                  <h2>{tabs.find(([id]) => id === tab)?.[1]}</h2>
                  <button
                    className="text-button"
                    onClick={() =>
                      document
                        .getElementById("adventure")
                        ?.scrollIntoView({ block: "start", behavior: "auto" })
                    }
                  >
                    Voltar à caça ↑
                  </button>
                </div>
                <nav
                  className="panel-tabs"
                  role="tablist"
                  aria-label="Painéis do jogo"
                >
                  {tabs.map(([id, label], index) => (
                    <button
                      role="tab"
                      id={`tab-${id}`}
                      aria-controls={`panel-${id}`}
                      aria-selected={tab === id}
                      tabIndex={tab === id ? 0 : -1}
                      key={id}
                      className={tab === id ? "active" : ""}
                      onClick={() => changeTab(id)}
                      onKeyDown={(e) => {
                        if (
                          ["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                            e.key,
                          )
                        ) {
                          e.preventDefault();
                          const next =
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? tabs.length - 1
                                : (index +
                                    (e.key === "ArrowRight" ? 1 : -1) +
                                    tabs.length) %
                                  tabs.length;
                          changeTab(tabs[next][0]);
                          document
                            .getElementById(`tab-${tabs[next][0]}`)
                            ?.focus();
                        }
                      }}
                    >
                      {label}
                      {id === "quests" &&
                        catalog.quests.some(
                          (q) =>
                            !state.quests[q.id]?.claimed &&
                            (state.quests[q.id]?.progress ?? 0) >= q.amount,
                        ) && (
                          <span
                            className="notification-count"
                            aria-label="Recompensa disponível"
                          >
                            !
                          </span>
                        )}
                    </button>
                  ))}
                </nav>
                <div
                  id={`panel-${tab}`}
                  role="tabpanel"
                  aria-labelledby={`tab-${tab}`}
                  tabIndex={0}
                  className="tab-content"
                >
                  <ActivePanel {...props} />
                </div>
              </section>
              <footer className="game-footer">
                <span>
                  Ragnarok Old Times Idle <span>·</span> aventura solo local
                </span>
                <span>Seu progresso continua por até 12h offline.</span>
                <a
                  href="http://localhost:3338/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Modo clássico ↗
                </a>
              </footer>
              <Offline
                {...props}
                error={game.error}
                retryable={game.retryable}
                sending={game.sending}
                retry={game.retry}
              />
            </>
          );
        })()
      )}
    </div>
  );
}
