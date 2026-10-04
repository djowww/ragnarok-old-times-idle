import { useEffect, useRef, useState } from "react";
import type { Catalog, DerivedStats, GameEvent, GameState, Skill, Slot } from "../shared/types";
import { useGame } from "./api";
import Scene from "./components/Scene";
import ShopScene from "./components/ShopScene";
import SkillIcon from "./components/SkillIcon";
import QuestReward from "./components/QuestReward";
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
import Challenges, { type ChallengeFilter } from "./panels/Challenges";

type GameWindow = "stats" | "equipment" | "inventory" | "skills" | "world" |
  "quests" | "bestiary" | "classes" | "challenges" | "shop";
const windowTitles: Record<GameWindow, string> = {
  stats: "Atributos", equipment: "Equipamento", inventory: "Mochila",
  skills: "Habilidades", world: "Mapa de Rune-Midgard", quests: "Missões",
  bestiary: "Bestiário", classes: "Classes", challenges: "Desafios",
  shop: "Loja de poções de Prontera",
};
const classicMenu: ReadonlyArray<{ destination: GameWindow; label: string; file: string }> = [
  { destination: "stats", label: "Atributos", file: "btn_status_off.bmp" },
  { destination: "equipment", label: "Equipamento", file: "btn_equip_off.bmp" },
  { destination: "inventory", label: "Mochila", file: "btn_items_off.bmp" },
  { destination: "world", label: "Mapa", file: "btn_map_off.bmp" },
  { destination: "skills", label: "Habilidades", file: "btn_skill_off.bmp" },
];
const quickMenu: ReadonlyArray<{ destination: GameWindow; label: string }> = [
  { destination: "shop", label: "Loja" },
  { destination: "quests", label: "Missões" },
  { destination: "bestiary", label: "Bestiário" },
  { destination: "classes", label: "Classes" },
  { destination: "challenges", label: "Desafios" },
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
      <div className="classic-minimap-image">
        {image && <img src={image} alt="" />}
        <span className="classic-minimap-marker" aria-hidden="true" />
      </div>
    </div>
  );
}

type HuntSection = "hunt" | "quests" | "mvp" | "miniboss";

function HuntExplorer({
  catalog,
  snapshot,
  busy,
  command,
  areaId,
  setAreaId,
  readyQuest,
  openWindow,
  openChallenges,
  launcherRef,
}: PanelProps & {
  areaId: string;
  setAreaId: (id: string) => void;
  readyQuest: boolean;
  openWindow: (destination: GameWindow, trigger?: HTMLElement) => void;
  openChallenges: (filter: ChallengeFilter, trigger?: HTMLElement) => void;
  launcherRef: { current: HTMLButtonElement | null };
}) {
  const [expanded, setExpanded] = useState(false);
  const [section, setSection] = useState<HuntSection>("hunt");
  const { state, stats, serverTime } = snapshot;
  const selectedArea = catalog.areas.find((candidate) => candidate.id === areaId) ?? catalog.areas[0];
  const currentArea = catalog.areas.find((candidate) => candidate.id === state.areaId);
  const pendingArea = catalog.areas.find((candidate) => candidate.id === state.pendingAreaId);
  const cancellingPendingArea = !!state.pendingAreaId && state.status === "hunting" && state.areaId === selectedArea.id;
  const focus = state.areaId ? state.huntFocus?.[state.areaId] : undefined;
  const claimedQuests = catalog.quests.filter((quest) => state.quests[quest.id]?.claimed).length;
  const readyQuests = catalog.quests.filter((quest) =>
    !state.quests[quest.id]?.claimed && (state.quests[quest.id]?.progress ?? 0) >= quest.amount,
  ).length;
  const availableQuests = catalog.quests.length - claimedQuests;
  const challengeFilter: ChallengeFilter = section === "mvp" ? "mvp" : "miniboss";
  const challenges = section === "mvp" || section === "miniboss"
    ? catalog.challenges.filter((challenge) => challenge.category === challengeFilter)
    : [];
  const currentLabel = state.status === "hunting" && currentArea
    ? `${state.battle ? "Combatendo em" : "Procurando monstros em"} ${currentArea.name}`
    : state.status === "challenge" ? "Desafio em andamento"
    : state.status === "resting" ? "Recuperando forças"
    : currentArea ? currentArea.name : "Escolha seu próximo destino";

  return (
    <section className={`hunt-explorer ${expanded ? "is-expanded" : ""}`}>
      <button ref={launcherRef} type="button" className="hunt-launcher" aria-expanded={expanded}
        aria-controls="hunt-explorer-content" onClick={() => setExpanded((value) => !value)}>
        <span className="hunt-launcher-glyph" aria-hidden="true"><i /><i /></span>
        <span className="hunt-launcher-copy"><strong>Explorar Rune-Midgard</strong><small>{currentLabel}</small></span>
        <span className="hunt-launcher-action">{expanded ? "Fechar" : "Escolher destino"}</span>
        <span className="hunt-launcher-chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && <div className="hunt-explorer-content" id="hunt-explorer-content">
        <div className="hunt-categories" role="group" aria-label="Tipo de atividade">
          {([
            ["hunt", "Caçadas"], ["quests", "Missões"], ["mvp", "MVP"], ["miniboss", "Mini-chefes"],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} aria-pressed={section === value}
              onClick={() => setSection(value)}>{label}
              {value === "quests" && readyQuests > 0 && <span className="hunt-count">{readyQuests}</span>}
            </button>
          ))}
        </div>
        {section === "hunt" && <div className="hunt-section hunt-section-areas">
          <label className="hunt-area-field">
            <span>Área de caça</span>
            <select value={selectedArea.id} disabled={busy || state.status === "challenge"}
              onChange={(event) => setAreaId(event.target.value)}>
              {catalog.areas.map((candidate) => (
                <option key={candidate.id} value={candidate.id} disabled={state.baseLevel < candidate.minLevel}>
                  {candidate.name}{state.baseLevel < candidate.minLevel ? ` · Base ${candidate.minLevel}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="primary hunt-button" disabled={
            busy || state.baseLevel < selectedArea.minLevel || state.status === "resting" ||
            state.status === "challenge" || state.pendingAreaId === selectedArea.id ||
            (state.status === "hunting" && state.areaId === selectedArea.id && !cancellingPendingArea)
          } onClick={() => void command({ type: "startHunt", areaId: selectedArea.id })}>
            {cancellingPendingArea ? "Cancelar troca"
              : state.pendingAreaId === selectedArea.id ? "Troca agendada"
              : state.status === "resting" ? "Recuperando"
              : state.status === "hunting" && state.areaId === selectedArea.id ? "Caçando"
              : state.status === "hunting" && state.battle ? "Trocar após combate"
              : state.areaId === selectedArea.id && state.status === "paused" ? "Retomar caça"
              : "Iniciar caça"}
          </button>
          <button type="button" disabled={busy || state.status === "town" || (state.status === "resting" && !state.autoResume)}
            onClick={() => void command({ type: "stop" })}>
            {state.status === "challenge" ? "Desistir"
              : state.status === "resting" ? "Cancelar retomada"
              : state.status === "hunting" && state.battle ? "Recuar · 10 s" : "Cidade"}
          </button>
          <button type="button" disabled={busy || state.status === "challenge" || state.status === "resting" ||
            (state.hp >= stats.maxHp && state.sp >= stats.maxSp)}
            onClick={() => void command({ type: "rest" })}>Descansar</button>
          {state.areaId && <div className="hunt-detail-line">
            Foco em {currentArea?.name ?? "área atual"}: <b>{huntFocusLabel(focus, catalog)}</b>
            {pendingArea && <span>Próxima área: <b>{pendingArea.name}</b> após o combate atual.</span>}
          </div>}
          {state.status === "resting" && <div className="hunt-detail-line" role="status">
            Recuperando forças{state.restUntil > serverTime ? ` · ${duration(state.restUntil - serverTime)}` : ""}.
          </div>}
          {state.battle?.deadlineAt && <div className="hunt-detail-line">
            Tempo do desafio: {duration(state.battle.deadlineAt - serverTime)}.
          </div>}
          <label className="hunt-auto-resume">
            <input type="checkbox" checked={state.autoResume} disabled={busy}
              onChange={(event) => void command({ type: "setAutoResume", enabled: event.target.checked })} />
            Retomar caça após recuperar
          </label>
        </div>}
        {section === "quests" && <div className="hunt-section hunt-section-feature">
          <div><small>DIÁRIO DE AVENTURA</small><strong>{availableQuests} missões em andamento</strong>
            <span>{claimedQuests} de {catalog.quests.length} concluídas{readyQuests ? ` · ${readyQuests} recompensa${readyQuests === 1 ? "" : "s"} ${readyQuests === 1 ? "disponível" : "disponíveis"}` : ""}</span></div>
          <button type="button" className="primary" onClick={(event) => {
            setExpanded(false); openWindow("quests", launcherRef.current ?? event.currentTarget);
          }}>Abrir missões</button>
        </div>}
        {(section === "mvp" || section === "miniboss") && <div className="hunt-section hunt-section-feature">
          <div><small>{section === "mvp" ? "CAÇADAS DE CHEFE MVP" : "ENCONTROS COM MINI-CHEFES"}</small>
            <strong>{challenges.length ? `${challenges.length} encontros registrados` : "Nenhum encontro cadastrado"}</strong>
            <span>{challenges.length ? "Escolha um alvo no livro de desafios." : "Novos encontros serão adicionados à jornada."}</span></div>
          {challenges.length > 0 && <button type="button" className="primary" onClick={(event) => {
            setExpanded(false); openChallenges(challengeFilter, launcherRef.current ?? event.currentTarget);
          }}>Ver desafios</button>}
        </div>}
      </div>}
    </section>
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
function EquipmentWindow({ catalog, snapshot, busy, command, onInventory }: PanelProps & { onInventory: () => void }) {
  const { state } = snapshot;
  return (
    <div className="equipment-window">
      <p className="ro-window-intro">Seu equipamento atual acompanha o personagem em toda caçada.</p>
      <div className="equipment-list">
        {(Object.keys(slots) as Slot[]).map((slot) => {
          const entry = state.inventory.find((item) => item.uid === state.equipment[slot]);
          const item = entry ? catalog.items[entry.itemId] : null;
          return (
            <div className={`equipment-row ${entry ? "" : "empty"}`} key={slot}>
              <span className="slot-label">{slots[slot]}</span>
              {entry && item ? (
                <>
                  <ItemIcon item={item} />
                  <b title={itemName(item, entry)}>{itemName(item, entry)}</b>
                  <button className="icon-button" title={`Desequipar ${slots[slot]}`}
                    aria-label={`Desequipar ${slots[slot]}`} disabled={busy}
                    onClick={() => void command({ type: "unequip", slot })}>×</button>
                </>
              ) : <span className="slot-empty">—</span>}
            </div>
          );
        })}
      </div>
      <button className="ro-window-link" onClick={onInventory}>Abrir mochila</button>
    </div>
  );
}
export default function App() {
  const game = useGame();
  const [activeWindow, setActiveWindow] = useState<GameWindow | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [challengeFilter, setChallengeFilter] = useState<ChallengeFilter>("all");
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  const bookTrigger = useRef<HTMLButtonElement | null>(null);
  const huntTrigger = useRef<HTMLButtonElement | null>(null);
  const windowTrigger = useRef<HTMLElement | null>(null);
  const windowClose = useRef<HTMLButtonElement | null>(null);
  const [areaId, setAreaId] = useState("");
  const [potionEditor, setPotionEditor] = useState<"hp" | "sp" | null>(null);
  const [potionValue, setPotionValue] = useState(0);
  const [journalOpen, setJournalOpen] = useState(
    () => !window.matchMedia("(max-width: 640px)").matches,
  );
  const [lootPulse, setLootPulse] = useState(false);
  const lastLootId = useRef<number | null | undefined>(undefined);
  const newestLootId = [...(game.snapshot?.state.events ?? [])]
    .reverse()
    .find((event) => event.kind === "loot")?.id ?? null;
  const claimedBaseline = useRef<Record<string, boolean> | null>(null);
  const [rewardQuestId, setRewardQuestId] = useState<string | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!game.snapshot || !game.catalog) return;
    const current = Object.fromEntries(game.catalog.quests.map((quest) =>
      [quest.id, !!game.snapshot?.state.quests[quest.id]?.claimed]));
    if (claimedBaseline.current) {
      const newlyClaimed = game.catalog.quests.find((quest) =>
        current[quest.id] && !claimedBaseline.current?.[quest.id]);
      if (newlyClaimed) setRewardQuestId(newlyClaimed.id);
    }
    claimedBaseline.current = current;
  }, [game.snapshot?.state.quests, game.catalog]);
  const focusWindowTrigger = () => {
    const preferred = windowTrigger.current;
    if (preferred?.isConnected) return preferred;
    if (bookTrigger.current?.isConnected) return bookTrigger.current;
    if (huntTrigger.current?.isConnected) return huntTrigger.current;
    return null;
  };
  const dismissReward = () => {
    setRewardQuestId(null);
    window.setTimeout(() => {
      const target = windowClose.current?.isConnected ? windowClose.current : focusWindowTrigger();
      if (target?.isConnected) target.focus();
    }, 0);
  };
  useEffect(() => {
    if (!rewardQuestId) return;
    const timeout = window.setTimeout(dismissReward, 7000);
    return () => window.clearTimeout(timeout);
  }, [rewardQuestId, activeWindow]);
  useEffect(() => {
    if (!activeWindow) return;
    windowClose.current?.focus();
  }, [activeWindow]);
  const openWindow = (destination: GameWindow, trigger?: HTMLElement) => {
    if (trigger) windowTrigger.current = trigger;
    setBookOpen(false);
    setPotionEditor(null);
    setActiveWindow(destination);
  };
  const openChallenges = (filter: ChallengeFilter, trigger?: HTMLElement) => {
    setChallengeFilter(filter);
    openWindow("challenges", trigger);
  };
  const closeWindow = () => {
    setActiveWindow(null);
    window.setTimeout(() => focusWindowTrigger()?.focus(), 0);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (rewardQuestId) { dismissReward(); return; }
      if (potionEditor) { setPotionEditor(null); return; }
      if (bookOpen) {
        setBookOpen(false);
        window.setTimeout(() => bookTrigger.current?.focus(), 0);
        return;
      }
      if (activeWindow) closeWindow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeWindow, bookOpen, potionEditor, rewardQuestId]);
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
  return (
    <div className="game-shell">
      <a className="skip-link" href="#adventure" inert={isMobile && !!activeWindow}>
        Ir para a aventura
      </a>
      <header className="masthead" inert={isMobile && !!activeWindow}>
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
        <a className="classic-mode-link" href="http://localhost:3338/" target="_blank" rel="noreferrer">
          RO clássico ↗
        </a>
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
          const readyQuest = catalog.quests.find((quest) =>
            !state.quests[quest.id]?.claimed && (state.quests[quest.id]?.progress ?? 0) >= quest.amount,
          );
          const rewardedQuest = rewardQuestId
            ? catalog.quests.find((quest) => quest.id === rewardQuestId)
            : undefined;
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
              <main id="adventure" className="cockpit">
                <aside className="hero-column" inert={isMobile && !!activeWindow}>
                  <Panel
                    title=""
                    className="hero-panel"
                  >
                    <div className="hero-identity" aria-label={`${state.name}, ${currentClass.name}`}>
                      <h1>{state.name}</h1>
                      <span>· {currentClass.name}{state.reborn ? " · Transcendente" : ""}</span>
                    </div>
                    <div className="hero-vitals">
                      <div className="vital-row">
                        <Meter label="HP" value={state.hp} max={stats.maxHp} />
                        <button type="button" className="potion-threshold"
                          aria-label={`Ajustar auto cura de HP, atualmente ${state.autoPotion.hpThreshold}%`}
                          aria-expanded={potionEditor === "hp"}
                          aria-controls="hp-potion-editor"
                          title={`Poção vermelha automática: HP ≤ ${state.autoPotion.hpThreshold}%`}
                          onClick={() => {
                            setActiveWindow(null);
                            setPotionValue(state.autoPotion.hpThreshold);
                            setPotionEditor(potionEditor === "hp" ? null : "hp");
                          }}>
                          <ItemIcon item={catalog.items[501]} />
                          <span>{state.autoPotion.hpThreshold}%</span>
                        </button>
                        {potionEditor === "hp" && (
                          <form id="hp-potion-editor" className="potion-popover"
                            onSubmit={async (event) => {
                              event.preventDefault();
                              if (await game.command({ type: "setPotions", hpThreshold: potionValue,
                                spThreshold: state.autoPotion.spThreshold })) setPotionEditor(null);
                            }}>
                            <label>Usar poção vermelha quando HP ≤
                              <input type="number" min="0" max="100" value={potionValue}
                                onChange={(event) => setPotionValue(Math.min(100, Math.max(0,
                                  Math.floor(Number(event.target.value) || 0))))} />%
                            </label>
                            <small>0% desativa o uso automático.</small>
                            <button type="submit" className="primary" disabled={game.busy}>Salvar</button>
                          </form>
                        )}
                      </div>
                      <div className="vital-row">
                        <Meter label="SP" value={state.sp} max={stats.maxSp} kind="sp" />
                        <button type="button" className="potion-threshold"
                          aria-label={`Ajustar auto cura de SP, atualmente ${state.autoPotion.spThreshold}%`}
                          aria-expanded={potionEditor === "sp"}
                          aria-controls="sp-potion-editor"
                          title={`Poção azul automática: SP ≤ ${state.autoPotion.spThreshold}%`}
                          onClick={() => {
                            setActiveWindow(null);
                            setPotionValue(state.autoPotion.spThreshold);
                            setPotionEditor(potionEditor === "sp" ? null : "sp");
                          }}>
                          <ItemIcon item={catalog.items[505]} />
                          <span>{state.autoPotion.spThreshold}%</span>
                        </button>
                        {potionEditor === "sp" && (
                          <form id="sp-potion-editor" className="potion-popover"
                            onSubmit={async (event) => {
                              event.preventDefault();
                              if (await game.command({ type: "setPotions", hpThreshold: state.autoPotion.hpThreshold,
                                spThreshold: potionValue })) setPotionEditor(null);
                            }}>
                            <label>Usar poção azul quando SP ≤
                              <input type="number" min="0" max="100" value={potionValue}
                                onChange={(event) => setPotionValue(Math.min(100, Math.max(0,
                                  Math.floor(Number(event.target.value) || 0))))} />%
                            </label>
                            <small>0% desativa o uso automático.</small>
                            <button type="submit" className="primary" disabled={game.busy}>Salvar</button>
                          </form>
                        )}
                      </div>
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
                    <nav className="classic-basic-menu" aria-label="Livro do aventureiro">
                      <button ref={bookTrigger} type="button" className="book-trigger" aria-expanded={bookOpen}
                        aria-controls="ro-book-content" onClick={() => setBookOpen((value) => !value)}>
                        <span className="adventure-book-icon" aria-hidden="true"><i /><i /></span>
                        <span>Livro do aventureiro</span>
                        {readyQuest && <span className="notification-count" aria-label="Recompensa de missão disponível">!</span>}
                        <span className="book-trigger-chevron" aria-hidden="true">{bookOpen ? "▴" : "▾"}</span>
                      </button>
                      {bookOpen && <div id="ro-book-content" className="ro-book-popover">
                        <div className="ro-book-section">
                          <span className="ro-book-section-title">Personagem</span>
                          {classicMenu.map(({ destination, label, file }) => (
                            <button type="button" key={destination}
                              className={`ro-book-entry ${label === "Mochila" && lootPulse ? "loot-pulse" : ""}`}
                              data-loot-destination={label === "Mochila" ? "inventory" : undefined}
                              aria-label={`Abrir ${label}`}
                              title={label}
                              aria-pressed={activeWindow === destination}
                              onClick={(event) => openWindow(destination, bookTrigger.current ?? event.currentTarget)}>
                              <img src={classicTexture(file)} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="ro-book-section">
                          <span className="ro-book-section-title">Rune-Midgard</span>
                          {quickMenu.map(({ destination, label }) => (
                            <button type="button" key={destination} className="ro-book-entry"
                              aria-pressed={activeWindow === destination}
                              onClick={(event) => destination === "challenges"
                                ? openChallenges("all", bookTrigger.current ?? event.currentTarget)
                                : openWindow(destination, bookTrigger.current ?? event.currentTarget)}>
                              <span className="ro-book-entry-mark" aria-hidden="true">◇</span>
                              <span>{label}</span>
                              {destination === "quests" && readyQuest && <span className="notification-count" aria-label="Recompensa disponível">!</span>}
                            </button>
                          ))}
                          <button type="button" className="ro-book-entry" aria-pressed={journalOpen}
                            onClick={() => {
                              setJournalOpen((value) => !value); setBookOpen(false);
                              window.setTimeout(() => bookTrigger.current?.focus(), 0);
                            }}>
                            <img src={classicTexture("btn_dialog_off.bmp")} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />
                            <span>Diário de combate</span>
                          </button>
                        </div>
                      </div>}
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
                <section className="adventure-column" inert={isMobile && !!activeWindow}>
                  <Panel
                    title={
                      activeWindow === "shop"
                        ? "Loja de poções de Prontera"
                        : state.status === "challenge"
                        ? "Arena de desafios"
                        : state.status === "town"
                          ? "Praça de Prontera"
                          : (area?.name ?? "Campos de Prontera")
                    }
                    aside={
                      <div className="scene-heading-tools">
                        <span className={`hunt-indicator ${active ? "active" : ""}`}>
                          {active ? "Em combate" : statusNames[state.status]}
                        </span>
                        <span className="scene-rates">
                          EXP {catalog.rates.baseExp}× · Job {catalog.rates.jobExp}× · Drop {catalog.rates.drop}×
                        </span>
                        <AudioToggle map={mapName} />
                      </div>
                    }
                    className="scene-panel"
                  >
                    <div className="classic-map-stage">
                      {activeWindow === "shop" ? <ShopScene /> : <Scene {...props} />}
                      <ClassicMinimap mapName={activeWindow === "shop" ? "prontera" : mapName}
                        mapLabel={activeWindow === "shop" ? "Prontera · loja" : mapLabel} />
                      {activeWindow !== "shop" && <CombatJournal events={state.events} open={journalOpen} />}
                      <div className="classic-shortcuts" role="group" aria-label="Atalhos de habilidades automáticas">
                        {Array.from({ length: 9 }, (_, index) => {
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
                              onClick={(event) => openWindow("skills", event.currentTarget)}
                            >
                              <small>F{index + 1}</small>
                              <SkillIcon skill={skill} />
                              <span className="shortcut-readiness" aria-hidden="true" />
                            </button>
                          ) : index === 3 ? (
                            <span className="classic-shortcut basic-attack" key={index}
                              role="img" aria-label="F4: ataque básico automático"
                              title="Ataque básico automático">
                              <small>F4</small>
                              <ItemIcon item={catalog.items[1101]} />
                            </span>
                          ) : (
                            <span className="classic-shortcut empty" key={index} aria-hidden="true">
                              <small>F{index + 1}</small>
                            </span>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        className="classic-chat-toggle"
                        aria-expanded={journalOpen}
                        onClick={() => setJournalOpen(!journalOpen)}
                      >
                        {journalOpen ? "Recolher chat" : "Diário de combate"}
                      </button>
                      <HuntExplorer {...props}
                        areaId={areaId}
                        setAreaId={setAreaId}
                        readyQuest={!!readyQuest}
                        launcherRef={huntTrigger}
                        openWindow={openWindow}
                        openChallenges={openChallenges}
                      />
                    </div>
                  </Panel>
                </section>
                {activeWindow && (
                  <div className="ro-window-layer">
                    <button type="button" className="ro-window-backdrop"
                      aria-label="Fechar janela" onClick={closeWindow} />
                    <section className={`ro-window ro-window-${activeWindow}`}
                      role="dialog" aria-label={windowTitles[activeWindow]}
                      aria-modal={isMobile}
                      onKeyDown={(event) => {
                        if (!isMobile || event.key !== "Tab") return;
                        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
                          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                        )].filter((element) => element.getClientRects().length > 0);
                        const first = controls[0];
                        const last = controls.at(-1);
                        if (!first || !last) return;
                        if (event.shiftKey && document.activeElement === first) {
                          event.preventDefault();
                          last.focus();
                        } else if (!event.shiftKey && document.activeElement === last) {
                          event.preventDefault();
                          first.focus();
                        }
                      }}>
                      <div className="ro-window-titlebar">
                        <h2>{windowTitles[activeWindow]}</h2>
                        <button type="button" className="ro-window-close"
                          ref={windowClose} aria-label="Fechar janela"
                          onClick={closeWindow}>×</button>
                      </div>
                      <div className="ro-window-content">
                        {activeWindow === "stats" && <Build {...props} mode="stats" />}
                        {activeWindow === "equipment" &&
                          <EquipmentWindow {...props} onInventory={() => setActiveWindow("inventory")} />}
                        {activeWindow === "inventory" && <Inventory {...props} />}
                        {activeWindow === "skills" && <Build {...props} mode="skills" />}
                        {activeWindow === "world" && <>
                          <div className="ro-journey-summary" role="group" aria-label="Sua jornada">
                            <span>Abates <b>{number(state.totals.kills)}</b></span>
                            <span>Áreas exploradas <b>{state.visitedAreas.length} / {catalog.areas.length}</b></span>
                            <span>Missões concluídas <b>{Object.values(state.quests).filter((quest) => quest.claimed).length} / {catalog.quests.length}</b></span>
                          </div>
                          <World {...props} />
                        </>}
                        {activeWindow === "quests" && <Quests {...props} />}
                        {activeWindow === "bestiary" && <Bestiary {...props} />}
                        {activeWindow === "classes" && <Classes {...props} />}
                        {activeWindow === "challenges" && <Challenges {...props} filter={challengeFilter} onFilterChange={setChallengeFilter} />}
                        {activeWindow === "shop" && <Shop {...props} />}
                      </div>
                      {rewardedQuest && <QuestReward quest={rewardedQuest}
                        catalog={catalog} onClose={dismissReward} />}
                    </section>
                  </div>
                )}
                {!activeWindow && rewardedQuest && <QuestReward quest={rewardedQuest}
                  catalog={catalog} onClose={dismissReward} />}
              </main>
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
