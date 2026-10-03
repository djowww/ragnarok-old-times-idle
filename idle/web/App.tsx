import { useEffect, useRef, useState } from "react";
import type { Catalog, DerivedStats, GameEvent, GameState, Skill, Slot } from "../shared/types";
import { useGame } from "./api";
import Scene from "./components/Scene";
import SkillIcon from "./components/SkillIcon";
import { assetUrl, FALLBACK_ICON, getBitmapUrl } from "./assets/items";
import Offline from "./components/Offline";
import AudioToggle from "./components/AudioToggle";
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
import { Bestiary, huntFocusLabel, Quests, World } from "./panels/World";
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
const classicMenu: ReadonlyArray<{ tab: Tab; label: string; file: string; fallback: string }> = [
  { tab: "build", label: "Status", file: "btn_status_off.bmp", fallback: "St" },
  { tab: "inventory", label: "Equipamento", file: "btn_equip_off.bmp", fallback: "Eq" },
  { tab: "inventory", label: "Mochila", file: "btn_items_off.bmp", fallback: "It" },
  { tab: "world", label: "Mapa", file: "btn_map_off.bmp", fallback: "Mp" },
  { tab: "build", label: "Habilidades", file: "btn_skill_off.bmp", fallback: "Sk" },
];
const classicTexture = (file: string) =>
  assetUrl(`data/texture/유저인터페이스/basic_interface/${file}`);

function skillReadiness(skill: Skill, state: GameState, stats: DerivedStats, catalog: Catalog, now: number) {
  const level = state.learnedSkills[skill.id] ?? 0;
  const index = Math.max(0, level - 1);
  const sp = skill.spCost[index] ?? skill.spCost.at(-1) ?? 0;
  const zeny = skill.zenyCost?.[index] ?? skill.zenyCost?.at(-1) ?? 0;
  const reasons: string[] = [];
  const cooldown = (state.skillReadyAt[skill.id] ?? 0) - now;
  if (cooldown > 0) reasons.push(`recarga em ${Math.ceil(cooldown / 1000)} s`);
  if (state.sp < sp) reasons.push(`SP insuficiente (${state.sp}/${sp})`);
  if (state.zeny < zeny) reasons.push(`zeny insuficiente (${state.zeny}/${zeny})`);
  const weapon = state.inventory.find((entry) => entry.uid === state.equipment.weapon);
  const weaponType = weapon ? catalog.items[weapon.itemId]?.weaponType : undefined;
  if (skill.requiredWeapon?.length && (!weaponType || !skill.requiredWeapon.includes(weaponType)))
    reasons.push("arma incompatível");
  if (skill.requiredSlot && !state.equipment[skill.requiredSlot])
    reasons.push(`${slots[skill.requiredSlot].toLowerCase()} necessário`);
  const itemCost = skill.itemCost;
  if (itemCost && !state.inventory.some((entry) =>
    entry.itemId === itemCost.itemId && entry.quantity >= itemCost.quantity,
  )) reasons.push(`${catalog.items[itemCost.itemId]?.name ?? "reagente"} insuficiente`);
  if (skill.kind === "heal" && state.hp > stats.maxHp * 0.7)
    reasons.push("aguardando HP abaixo de 70%");
  if (skill.kind === "buff" && (state.buffs[skill.id]?.expiresAt ?? 0) > now)
    reasons.push("efeito ainda ativo");
  if (!state.battle) reasons.push("aguardando combate");
  const detail = [`${sp} SP`, ...(zeny ? [`${zeny} zeny`] : []), `intervalo ${Math.ceil(skill.cooldownMs / 1000)} s`].join(" · ");
  return {
    ready: reasons.length === 0,
    label: `${skill.name} Nv. ${level} · rotação automática · ${detail} · ${reasons.length ? reasons.join("; ") : "pronta para uso automático"}`,
  };
}

function ClassicMinimap({ mapName, mapLabel }: { mapName: string; mapLabel: string }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setImage(null);
    void getBitmapUrl(`data/texture/유저인터페이스/map/${mapName}.bmp`).then((value) => {
      if (active && value !== FALLBACK_ICON) setImage(value);
    });
    return () => { active = false; };
  }, [mapName]);
  return (
    <div className="classic-minimap" role="img" aria-label={`Minimapa de ${mapLabel}`}>
      <div className="classic-minimap-title">{mapLabel}</div>
      <div className="classic-minimap-image">
        {image && <img src={image} alt="" />}
        <span className="classic-minimap-marker" aria-hidden="true" />
      </div>
    </div>
  );
}
function CombatJournal({ events, open }: { events: GameEvent[]; open: boolean }) {
  return (
    <Panel
      title="Diário de combate"
      aside={<span className="tiny-label">Recentes</span>}
      className={`journal-panel ${open ? "mobile-open" : ""}`}
    >
      <div className="event-list" role="log" aria-live="off">
        {[...events].reverse().slice(0, 30).map((event) => (
          <div className={`event event-${event.kind}`} key={event.id}>
            <time>
              {new Date(event.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </time>
            <span>
              {event.text}
              {event.amount !== undefined && <b className="event-amount"> · {number(event.amount)}</b>}
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <p className="journal-empty">
            Seu diário aguarda a primeira aventura. Escolha uma área e comece a caçar.
          </p>
        )}
      </div>
    </Panel>
  );
}
export default function App() {
  const game = useGame();
  const [tab, setTab] = useState<Tab>("inventory");
  const [areaId, setAreaId] = useState("");
  const [potionEditor, setPotionEditor] = useState(false);
  const [journalOpen, setJournalOpen] = useState(
    () => !window.matchMedia("(max-width: 640px)").matches,
  );
  const [lootPulse, setLootPulse] = useState(false);
  const lastLootId = useRef<number | null | undefined>(undefined);
  const newestLootId = [...(game.snapshot?.state.events ?? [])]
    .reverse()
    .find((event) => event.kind === "loot")?.id ?? null;
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
  useEffect(() => {
    if (lastLootId.current === undefined) {
      lastLootId.current = newestLootId;
      return;
    }
    if (newestLootId === null || newestLootId === lastLootId.current) return;
    lastLootId.current = newestLootId;
    setLootPulse(true);
    const timeout = window.setTimeout(() => setLootPulse(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [newestLootId]);
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
    if (window.matchMedia("(max-width: 640px)").matches)
      requestAnimationFrame(() =>
        document
          .querySelector(".game-panels")
          ?.scrollIntoView({ block: "start", behavior: "auto" }),
      );
  };
  const openClassicTab = (next: Tab) => {
    changeTab(next);
    requestAnimationFrame(() =>
      document.querySelector(".game-panels")?.scrollIntoView({ block: "start", behavior: "smooth" }),
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
          const mapName = state.status === "town" ? "prontera" : (area?.map ?? "prontera");
          const mapLabel = state.status === "town" ? "Prontera" : (area?.name ?? "Prontera");
          const carriedWeight = state.inventory.reduce(
            (total, entry) => total + (catalog.items[entry.itemId]?.weight ?? 0) * entry.quantity,
            0,
          );
          const selectedArea =
            catalog.areas.find((a) => a.id === areaId) ?? catalog.areas[0];
          const pendingArea = catalog.areas.find((a) => a.id === state.pendingAreaId);
          const cancellingPendingArea = !!state.pendingAreaId && state.status === "hunting" && state.areaId === selectedArea.id;
          const currentFocus = state.areaId ? state.huntFocus?.[state.areaId] : undefined;
          const latestEvent = state.events.at(-1);
          const retreatRecovery = state.status === "resting" && latestEvent?.kind === "retreat" && serverTime < latestEvent.at + 10_000;
          const readyQuest = catalog.quests.find((quest) =>
            !state.quests[quest.id]?.claimed && (state.quests[quest.id]?.progress ?? 0) >= quest.amount,
          );
          const nextQuest = readyQuest ?? catalog.quests.find((quest) => !state.quests[quest.id]?.claimed);
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
                <div className="world-status-tools">
                  <span>
                    EXP {catalog.rates.baseExp}× · Job {catalog.rates.jobExp}× ·
                    Drop {catalog.rates.drop}×
                  </span>
                  <AudioToggle
                    map={state.status === "town" ? "prontera" : (area?.map ?? "prontera")}
                  />
                </div>
              </div>
              <main id="adventure" className="cockpit">
                <aside className="hero-column">
                  <Panel
                    title="Informações básicas"
                    className="hero-panel"
                  >
                    <div className="hero-identity">
                      <h1>{state.name}</h1>
                      <span>{currentClass.name}{state.reborn ? " · Transcendente" : ""}</span>
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
                        label={`Base ${state.baseLevel}`}
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
                        label={`Job ${state.jobLevel}`}
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
                    <div className="classic-basic-resources">
                      <span>Peso <b>{number(carriedWeight)}</b></span>
                      <span>Zeny <b>{number(state.zeny)}</b></span>
                    </div>
                    <nav className="classic-basic-menu" aria-label="Janelas clássicas">
                      {classicMenu.map(({ tab: destination, label, file, fallback }, index) => (
                        <button
                          type="button"
                          key={`${label}-${index}`}
                          className={label === "Mochila" && lootPulse ? "loot-pulse" : undefined}
                          data-loot-destination={label === "Mochila" ? "inventory" : undefined}
                          aria-label={`Abrir ${label}`}
                          title={label}
                          onClick={() => openClassicTab(destination)}
                        >
                          <img src={classicTexture(file)} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
                          <span aria-hidden="true">{fallback}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label="Abrir diário de combate"
                        title="Diário de combate"
                        onClick={() => setJournalOpen(!journalOpen)}
                      >
                        <img src={classicTexture("btn_dialog_off.bmp")} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
                        <span aria-hidden="true">Ch</span>
                      </button>
                    </nav>
                    {currentClass.tier === 0 && !state.reborn && (
                      <div className="avatar-choice">
                        <span>Aprendiz</span>
                        <button
                          disabled={game.busy}
                          aria-pressed={state.gender === "male"}
                          aria-label="Avatar masculino"
                          onClick={() =>
                            void game.command({
                              type: "setGender",
                              gender: "male",
                            })
                          }
                        >
                          ♂
                        </button>
                        <button
                          disabled={game.busy}
                          aria-pressed={state.gender === "female"}
                          aria-label="Avatar feminino"
                          onClick={() =>
                            void game.command({
                              type: "setGender",
                              gender: "female",
                            })
                          }
                        >
                          ♀
                        </button>
                      </div>
                    )}
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
                    <div className="classic-map-stage">
                      <Scene {...props} />
                      <ClassicMinimap mapName={mapName} mapLabel={mapLabel} />
                      <CombatJournal events={state.events} open={journalOpen} />
                      <div className="classic-shortcuts" role="group" aria-label="Atalhos de habilidades automáticas">
                        {Array.from({ length: 7 }, (_, index) => {
                          const skillId = index < 3 ? state.rotation[index] : undefined;
                          const skill = skillId ? catalog.skills[skillId] : undefined;
                          const readiness = skill ? skillReadiness(skill, state, stats, catalog, serverTime) : null;
                          return skill ? (
                            <button
                              type="button"
                              className={`classic-shortcut ${readiness?.ready ? "is-ready" : "is-waiting"}`}
                              key={index}
                              title={readiness?.label}
                              aria-label={`Ver habilidades: ${readiness?.label}`}
                              onClick={() => openClassicTab("build")}
                            >
                              <small>F{index + 1}</small>
                              <SkillIcon skill={skill} />
                              <span className="shortcut-readiness" aria-hidden="true" />
                            </button>
                          ) : (
                            <span className="classic-shortcut empty" key={index} aria-hidden="true">
                              <small>F{index + 1}</small>
                            </span>
                          );
                        })}
                        <button type="button" className={`classic-shortcut ${lootPulse ? "loot-pulse" : ""}`} data-loot-destination="shortcut" title="Abrir mochila" aria-label="Abrir mochila" onClick={() => openClassicTab("inventory")}>
                          <small>F8</small><b aria-hidden="true">It</b>
                        </button>
                        <button type="button" className="classic-shortcut" title="Abrir habilidades" aria-label="Abrir habilidades" onClick={() => openClassicTab("build")}>
                          <small>F9</small><b aria-hidden="true">Sk</b>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="classic-chat-toggle"
                        aria-expanded={journalOpen}
                        onClick={() => setJournalOpen(!journalOpen)}
                      >
                        {journalOpen ? "Recolher chat" : "Diário de combate"}
                      </button>
                    </div>
                    <div className="hunt-controls">
                      <label className="area-selector">
                        Área de caça
                        <select
                          value={selectedArea.id}
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
                          state.status === "resting" ||
                          state.status === "challenge" ||
                          state.pendingAreaId === selectedArea.id ||
                          (state.status === "hunting" &&
                            state.areaId === selectedArea.id && !cancellingPendingArea)
                        }
                        onClick={() =>
                          void game.command({ type: "startHunt", areaId: selectedArea.id })
                        }
                      >
                        {cancellingPendingArea ? "Cancelar troca"
                          : state.pendingAreaId === selectedArea.id ? "Troca agendada"
                          : state.status === "resting" ? "Recuperando"
                          : state.status === "hunting" && state.areaId === selectedArea.id ? "Caçando"
                          : state.status === "hunting" && state.battle ? "Trocar após combate"
                          : state.areaId === selectedArea.id && state.status === "paused" ? "Retomar caça"
                          : "Iniciar caça"}
                      </button>
                      <button
                        disabled={game.busy || state.status === "town" || (state.status === "resting" && !state.autoResume)}
                        onClick={() => void game.command({ type: "stop" })}
                      >
                        {state.status === "challenge" ? "Desistir"
                          : state.status === "resting" ? "Cancelar retomada"
                          : state.status === "hunting" && state.battle ? "Recuar · 10 s"
                          : "Cidade"}
                      </button>
                      <button
                        disabled={
                          game.busy ||
                          state.status === "challenge" ||
                          state.status === "resting" ||
                          (state.hp >= stats.maxHp && state.sp >= stats.maxSp)
                        }
                        onClick={() => void game.command({ type: "rest" })}
                      >
                        Descansar
                      </button>
                    </div>
                    {state.areaId && (
                      <div className="hunt-context">
                        Foco em {area?.name ?? "área atual"}: <b>{huntFocusLabel(currentFocus, catalog)}</b>
                        {pendingArea && <span>Próxima área: <b>{pendingArea.name}</b> após o combate atual.</span>}
                      </div>
                    )}
                    {state.status === "resting" && (
                      <div className="rest-status" role="status">
                        {retreatRecovery ? "Retirada · recuperando forças" : "Recuperando forças"}
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
                <Panel
                  title="Equipamento"
                  className="equipment-panel"
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
                      className={`journey-quest ${readyQuest ? "claimable" : ""}`}
                      onClick={() => changeTab("quests")}
                    >
                      {nextQuest ? (
                        <>
                          <span>{readyQuest ? "Recompensa disponível" : "Próximo objetivo"}</span>
                          <b>{nextQuest.name}</b>
                          <small>{nextQuest.description}</small>
                          <small className="journey-progress">
                            {readyQuest ? "Pronta para resgatar" : "Progresso"} · {number(state.quests[nextQuest.id]?.progress ?? 0)} / {number(nextQuest.amount)}
                          </small>
                        </>
                      ) : (
                        <>
                          <span>Objetivos concluídos</span>
                          <b>Siga explorando Rune-Midgard</b>
                        </>
                      )}
                    </button>
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
