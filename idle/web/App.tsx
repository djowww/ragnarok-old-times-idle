import { useEffect, useRef, useState } from "react";
import type { AccountView } from "../shared/portal-types";
import { useAuth } from "./portal/AuthProvider";
import { Link, navigate } from "./portal/router";
import type { Catalog, DerivedStats, GameState, Skill } from "../shared/types";
import { isTownScene } from "../shared/worldScene";
import { useGame } from "./api";
import { getClassicClientPaths } from "./public-client-routing";
import Scene from "./components/Scene";
import CharacterSelect from "./components/CharacterSelect";
import ChatJournal from "./components/ChatJournal";
import RewardNotifications from "./components/RewardNotifications";
import ShopScene from "./components/ShopScene";
import SkillIcon from "./components/SkillIcon";
import ClassicEquipment from "./components/ClassicEquipment";
import { resetWindowPositions, useDraggableWindow } from "./hooks/useDraggableWindow";
import "./styles/draggable-windows.css";
import QuestReward from "./components/QuestReward";
import { assetUrl, FALLBACK_ICON, getBitmapUrl } from "./assets/items";
import Offline from "./components/Offline";
import AudioToggle from "./components/AudioToggle";
import {
  duration,
  ItemIcon,
  Meter,
  number,
  Panel,
  slots,
  type PanelProps,
} from "./components/common";
import Inventory from "./panels/Inventory";
import Shop from "./panels/Shop";
import Build from "./panels/Build";
import { Bestiary, huntFocusLabel, Quests, World } from "./panels/World";
import Classes from "./panels/Classes";
import Challenges, { type ChallengeFilter } from "./panels/Challenges";
import CityServices, { type CityService } from "./panels/CityServices";
import Blacksmith from "./panels/Blacksmith";
import Stylist from "./panels/Stylist";
import { inventoryLoad } from "../engine/stats";
import { offensiveSkill, skillTargetInRange } from "../shared/combatRange";
import ClassicLoading from "./components/ClassicLoading";
import type { MapStatus } from "./components/OriginalMap";
import "./styles/city-services.css";

type GameWindow = "stats" | "equipment" | "inventory" | "skills" | "world" |
  "quests" | "bestiary" | "classes" | "challenges" | "shop" | "city" | "blacksmith" | "stylist";
const windowTitles: Record<GameWindow, string> = {
  stats: "Atributos", equipment: "Equipamento", inventory: "Mochila",
  skills: "Habilidades", world: "Mapa de Rune-Midgard", quests: "Missões",
  bestiary: "Bestiário", classes: "Classes", challenges: "Desafios",
  shop: "Loja de poções de Prontera",
  city: "Serviços de Prontera", blacksmith: "Ferreiro de Prontera", stylist: "Estilista de Prontera",
};
const classicMenu: ReadonlyArray<{ destination: GameWindow; label: string; file: string }> = [
  { destination: "stats", label: "Atributos", file: "btn_status_off.bmp" },
  { destination: "equipment", label: "Equipamento", file: "btn_equip_off.bmp" },
  { destination: "inventory", label: "Mochila", file: "btn_items_off.bmp" },
  { destination: "world", label: "Mapa", file: "btn_map_off.bmp" },
  { destination: "skills", label: "Habilidades", file: "btn_skill_off.bmp" },
];
const quickMenu: ReadonlyArray<{ destination: GameWindow; label: string }> = [
  { destination: "quests", label: "Missões" },
  { destination: "bestiary", label: "Bestiário" },
  { destination: "classes", label: "Classes" },
  { destination: "challenges", label: "Desafios" },
];
function ClassicMenuIcon({ file }: { file: string }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let active = true;
    setSource(undefined);
    void getBitmapUrl(`data/texture/유저인터페이스/basic_interface/${file}`).then(value => {
      if (active) setSource(value === FALLBACK_ICON ? undefined : value);
    });
    return () => { active = false; };
  }, [file]);
  // The classic resources are complete 30×20 buttons, with magenta keyed out
  // by the bitmap decoder. Resizing them as 22px icons distorts their letters.
  return source ? <img src={source} width={30} height={20} alt="" />
    : <span className="ro-book-entry-mark" aria-hidden="true">◇</span>;
}

function skillReadiness(skill: Skill, state: GameState, stats: DerivedStats, catalog: Catalog, now: number) {
  const level = state.learnedSkills[skill.id] ?? 0;
  const index = Math.max(0, level - 1);
  const sp = Math.max(0, Math.floor((skill.spCost[index] ?? skill.spCost.at(-1) ?? 0) * (1 - Math.min(100, stats.effects.spCostReductionPct ?? 0) / 100)));
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
  const itemCosts = skill.itemCostByLevel?.[index] ?? (skill.itemCost ? [skill.itemCost] : []);
  for (const itemCost of itemCosts)
    if (state.inventory.filter(entry => entry.itemId === itemCost.itemId).reduce((amount, entry) => amount + entry.quantity, 0) < itemCost.quantity)
      reasons.push(`${catalog.items[itemCost.itemId]?.name ?? "reagente"} insuficiente`);
  if (skill.sourceName === "AS_CLOAKING" && level < 3) reasons.push("níveis 1–2 exigem paredes do mapa; disponível aqui a partir do nível 3");
  if (skill.kind === "heal" && state.hp > stats.maxHp * 0.7)
    reasons.push("aguardando HP abaixo de 70%");
  if (skill.kind === "buff" && (state.buffs[skill.id]?.expiresAt ?? 0) > now)
    reasons.push("efeito ainda ativo");
  const battle = state.battle;
  if (!battle) reasons.push("aguardando combate");
  else {
    if (battle.cast && battle.cast.endsAt > now) reasons.push("conjuração em andamento");
    else if ((battle.playerActionReadyAt ?? battle.playerNextAttackAt) > now)
      reasons.push("movimento ou pós conjuração em andamento");
    if (!offensiveSkill(skill) && battle.supportNeedsOffense)
      reasons.push("aguardando ação ofensiva entre habilidades de suporte");
    const target = battle.enemies?.find(enemy => enemy.id === battle.targetId) ?? battle.enemies?.[0];
    if (target && !skillTargetInRange(state, catalog, skill, level, target, now))
      reasons.push("alvo fora do alcance");
  }
  const baseCast = skill.castTimeMs?.[index] ?? skill.castTimeMs?.at(-1) ?? 0;
  const cast = Math.max(0, baseCast * (skill.ignoresDex ? 1 : 1 - (stats.attributes?.dex ?? state.stats.dex) / 150) * (1 - Math.min(100, stats.effects.castReductionPct ?? 0) / 100));
  const afterCast = (skill.afterCastDelayMs?.[index] ?? skill.afterCastDelayMs?.at(-1) ?? 0) * (1 - Math.min(100, stats.effects.afterCastReductionPct ?? 0) / 100);
  const detail = [`${sp} SP`, ...(zeny ? [`${zeny} zeny`] : []), ...(cast ? [`conjuração ${(cast / 1000).toLocaleString("pt-BR", {maximumFractionDigits:1})} s`] : ["instantânea"]), ...(afterCast ? [`pós conjuração ${(afterCast / 1000).toLocaleString("pt-BR", {maximumFractionDigits:1})} s`] : []), ...(skill.cooldownMs ? [`recarga ${(skill.cooldownMs / 1000).toLocaleString("pt-BR", {maximumFractionDigits:1})} s`] : [])].join(" · ");
  return {
    ready: reasons.length === 0,
    cooldownRemaining: Math.max(0, cooldown),
    cooldownFraction: Math.min(1, Math.max(0, cooldown) / Math.max(1, skill.cooldownMs)),
    label: `${skill.name} Nv. ${level} · rotação automática · ${detail} · ${reasons.length ? reasons.join("; ") : "pronta para uso automático"}`,
  };
}

function ClassicMinimap({ mapName, mapLabel }: { mapName: string; mapLabel: string }) {
  const [image, setImage] = useState<string | null>(null);
  const movable = useDraggableWindow<HTMLDivElement>("minimap", "minimapa");
  useEffect(() => {
    let active = true;
    setImage(null);
    void getBitmapUrl(`data/texture/유저인터페이스/map/${mapName}.bmp`).then((value) => {
      if (active && value !== FALLBACK_ICON) setImage(value);
    });
    return () => { active = false; };
  }, [mapName]);
  return (
    <div ref={movable.ref} style={movable.style} className="classic-minimap" aria-label={`Minimapa de ${mapLabel}`}>
      <div {...movable.handleProps} className="ro-drag-handle classic-minimap-title">{mapLabel}</div>
      <div className="classic-minimap-image" role="img" aria-label={`Minimapa de ${mapLabel}`}>
        {image && <img src={image} alt="" />}
        <span className="classic-minimap-marker" aria-hidden="true" />
      </div>
    </div>
  );
}

type HuntSection = "hunt" | "quests" | "mvp" | "miniboss";

function huntActivityLabel(state: GameState, catalog: Catalog): string {
  const fieldHero = state.fieldHero?.areaId === state.areaId ? state.fieldHero : undefined;
  const phase = fieldHero?.phase ?? (state.battle ? "fighting" : "seeking");
  if (phase === "waiting") return "Aguardando respawn";
  if (phase === "seeking") return "Procurando monstros";
  if (phase === "chasing") {
    const target = state.fieldPopulation?.enemies.find(enemy => enemy.id === fieldHero?.targetId);
    const name = target ? catalog.monsters[target.monsterId]?.name : undefined;
    return `Caminhando até ${name ?? "o monstro"}`;
  }
  return "Combatendo";
}

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
  const movable = useDraggableWindow<HTMLElement>("hunt-explorer", "exploração");
  const { state, stats, serverTime } = snapshot;
  const recovering = state.status === "resting" && (state.restMode !== "field" || state.restUntil > serverTime);
  const fieldRest = state.status === "resting" && state.restMode === "field";
  const sitting = fieldRest && !recovering;
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
    ? `${huntActivityLabel(state, catalog)} · ${currentArea.name}`
    : state.status === "challenge" ? "Desafio em andamento"
    : state.status === "resting" ? recovering
      ? `Recuperando forças${state.restUntil > serverTime ? ` · ${duration(state.restUntil - serverTime)}` : ""}`
      : `Sentado${currentArea ? ` em ${currentArea.name}` : ""}`
    : state.status === "paused" ? `Caça pausada${currentArea ? ` · ${currentArea.name}` : ""}`
    : "Na cidade · Prontera";

  return (
    <section ref={movable.ref} style={movable.style} className={`hunt-explorer ${expanded ? "is-expanded" : ""}`}>
      <div {...movable.handleProps} className="ro-drag-handle hunt-drag-handle"><span aria-hidden="true">⋮⋮</span></div>
      <button ref={launcherRef} type="button" className="hunt-launcher" aria-expanded={expanded}
        aria-label={`Explorar Rune-Midgard · ${currentLabel}`} title="Explorar Rune-Midgard"
        aria-controls="hunt-explorer-content" onClick={() => setExpanded((value) => !value)}>
        <span className="hunt-launcher-glyph" aria-hidden="true"><i /><i /></span>
        <span className="hunt-launcher-copy"><strong>Exploração</strong><small>{currentLabel}</small></span>
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
            busy || state.baseLevel < selectedArea.minLevel || recovering ||
            state.status === "challenge" || state.pendingAreaId === selectedArea.id ||
            (state.status === "hunting" && state.areaId === selectedArea.id && !cancellingPendingArea)
          } onClick={() => void command({ type: "startHunt", areaId: selectedArea.id })}>
            {cancellingPendingArea ? "Cancelar troca"
              : state.pendingAreaId === selectedArea.id ? "Troca agendada"
              : recovering ? "Recuperando"
              : state.status === "hunting" && state.areaId === selectedArea.id ? "Caçando"
              : state.status === "hunting" && state.battle ? "Trocar após combate"
              : state.areaId === selectedArea.id && (state.status === "paused" || sitting) ? "Retomar caça"
              : "Iniciar caça"}
          </button>
          <button type="button" disabled={busy || state.status === "town" || (state.status === "resting" && !fieldRest && !state.autoResume)}
            onClick={() => void command({ type: "stop" })}>
            {state.status === "challenge" ? "Desistir"
              : state.status === "resting" && !fieldRest ? "Cancelar retomada"
              : state.status === "hunting" && state.battle ? "Recuar · 10 s" : "Cidade"}
          </button>
          <button type="button" disabled={busy || state.status === "challenge" || state.status === "resting" ||
            (state.status !== "hunting" && state.hp >= stats.maxHp && state.sp >= stats.maxSp)}
            onClick={() => void command({ type: "rest" })}>Descansar</button>
          {state.areaId && <div className="hunt-detail-line">
            Foco em {currentArea?.name ?? "área atual"}: <b>{huntFocusLabel(focus, catalog)}</b>
            {pendingArea && <span>Próxima área: <b>{pendingArea.name}</b> após o combate atual.</span>}
          </div>}
          {state.status === "resting" && <div className="hunt-detail-line" role="status">
            {recovering ? <>Recuperando forças{state.restUntil > serverTime ? ` · ${duration(state.restUntil - serverTime)}` : ""}.</>
              : "Sentado. Retome a caça ou volte à cidade quando desejar."}
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
function ClassicShortcuts({ catalog, snapshot, onSkills }: Pick<PanelProps, "catalog" | "snapshot"> & { onSkills: (trigger: HTMLElement) => void }) {
  const { state, stats, serverTime } = snapshot;
  const movable = useDraggableWindow<HTMLDivElement>("skill-shortcuts", "atalhos de habilidades");
  const [collapseEmpty, setCollapseEmpty] = useState(() => {
    try { return localStorage.getItem("ragidle:shortcuts:collapse-empty:v1") === "1"; }
    catch { return false; }
  });
  const [clock, setClock] = useState(() => performance.now());
  const anchor = useRef({ serverTime, receivedAt: performance.now() });
  if (anchor.current.serverTime !== serverTime) anchor.current = { serverTime, receivedAt: performance.now() };
  useEffect(() => {
    const timer = window.setInterval(() => setClock(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("ragidle:shortcuts:collapse-empty:v1", collapseEmpty ? "1" : "0"); }
    catch { /* The current choice still works when storage is unavailable. */ }
  }, [collapseEmpty]);
  const now = serverTime + Math.max(0, clock - anchor.current.receivedAt);
  return (
    <div ref={movable.ref} style={movable.style ? { ...movable.style, width: undefined } : undefined}
      className={`classic-shortcuts${collapseEmpty ? " is-compact" : ""}`} role="group" aria-label="Atalhos de habilidades automáticas">
      <span {...movable.handleProps} className="ro-drag-handle shortcut-drag-handle" aria-label="Mover atalhos de habilidades"><span aria-hidden="true">⋮</span></span>
      {Array.from({ length: Math.max(9, state.rotation.length + 1) }, (_, index) => {
        const skillId = state.rotation[index];
        const skill = skillId ? catalog.skills[skillId] : undefined;
        const readiness = skill ? skillReadiness(skill, state, stats, catalog, now) : null;
        return skill ? (
          <button type="button" className={`classic-shortcut ${readiness?.ready ? "is-ready" : "is-waiting"}`}
            key={index} title={readiness?.label} aria-label={`Ver habilidades: ${readiness?.label}`}
            onClick={event => onSkills(event.currentTarget)}>
            <SkillIcon skill={skill} />
            {!!readiness?.cooldownRemaining && <>
              <span className="shortcut-cooldown-mask" style={{ height: `${readiness.cooldownFraction * 100}%` }} aria-hidden="true" />
              <span className="shortcut-cooldown-seconds" aria-hidden="true">{Math.ceil(readiness.cooldownRemaining / 1000)}</span>
            </>}
            <span className="shortcut-readiness" aria-hidden="true" />
          </button>
        ) : skillId ? (
          <button type="button" className="classic-shortcut" key={index}
            title="Habilidade indisponível no catálogo · ver habilidades" aria-label="Ver habilidade indisponível"
            onClick={event => onSkills(event.currentTarget)}><span aria-hidden="true">?</span></button>
        ) : index === state.rotation.length ? (
          <span className="classic-shortcut basic-attack" key={index} role="img"
            aria-label="Ataque básico automático" title="Ataque básico automático">
            <ItemIcon item={catalog.items[1101]} />
          </span>
        ) : collapseEmpty ? null : <span className="classic-shortcut empty" key={index} aria-hidden="true" />;
      })}
      <button type="button" className="shortcut-fold" aria-pressed={collapseEmpty}
        aria-label={collapseEmpty ? "Expandir slots vazios dos atalhos" : "Recolher slots vazios dos atalhos"}
        title={collapseEmpty ? "Expandir slots vazios" : "Recolher slots vazios"}
        onClick={() => setCollapseEmpty(value => !value)}><span aria-hidden="true">{collapseEmpty ? "+" : "−"}</span></button>
    </div>
  );
}
export default function App({ identity, onAuthRequired }: { identity: AccountView; onAuthRequired: () => void }) {
  const game = useGame(identity, onAuthRequired);
  const auth = useAuth();
  const [activeWindow, setActiveWindow] = useState<GameWindow | null>(null);
  const heroMovable = useDraggableWindow<HTMLElement>("hero-hud", "informações do personagem");
  const windowMovable = useDraggableWindow<HTMLElement>(`window-${activeWindow ?? "closed"}`, activeWindow ? windowTitles[activeWindow] : "janela");
  const [mapStatus, setMapStatus] = useState<MapStatus>({ map: "", phase: "loading", progress: 0 });
  const [mapReload, setMapReload] = useState(0);
  const [enteredWorld, setEnteredWorld] = useState(false);
  const connectedBefore = useRef(false);
  const previousConnection = useRef(false);
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
    if (game.connected && connectedBefore.current && !previousConnection.current) {
      setEnteredWorld(false);
      setActiveWindow(null);
      setBookOpen(false);
      setMapStatus({ map: "", phase: "loading", progress: 0 });
    }
    if (game.connected) connectedBefore.current = true;
    previousConnection.current = game.connected;
  }, [game.connected]);
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
    const cityOnly = destination === "city" || destination === "shop" || destination === "blacksmith" || destination === "stylist";
    if (cityOnly && game.snapshot?.state.status !== "town") {
      setBookOpen(false);
      if (game.snapshot) void game.command({ type: "stop" });
      return;
    }
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
    if (!game.snapshot) return;
    if (lastLootId.current === undefined) {
      lastLootId.current = newestLootId;
      return;
    }
    if (newestLootId === null || newestLootId === lastLootId.current) return;
    lastLootId.current = newestLootId;
    setLootPulse(true);
    const timeout = window.setTimeout(() => setLootPulse(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [newestLootId, !!game.snapshot]);
  const { catalog, snapshot } = game;
  const expectedMap = activeWindow === "shop" ? "prt_in" : isTownScene(snapshot?.state) ? "prontera"
    : catalog?.areas.find(area => area.id === snapshot?.state.areaId)?.map ?? "prontera";
  const mapMatches = mapStatus.map === expectedMap;
  const loading = !catalog || !snapshot || (enteredWorld && (!mapMatches || mapStatus.phase !== "ready"));
  const selectingCharacter = !!catalog && !!snapshot && !enteredWorld;
  const loadingProgress = !catalog ? 0 : !snapshot ? 5 : mapMatches ? 10 + (mapStatus.progress ?? 0) * 0.9 : 10;
  const loadingError = !catalog || !snapshot ? game.error ?? undefined
    : enteredWorld && mapMatches && mapStatus.phase === "error" ? "O mapa não pôde ser carregado." : undefined;
  const retryLoading = () => {
    if (!catalog || !snapshot) { void game.retry(); return; }
    setMapStatus({ map: expectedMap, phase: "loading", progress: 0 });
    setMapReload(value => value + 1);
  };
  const enterWorld = () => {
    setActiveWindow(null);
    setBookOpen(false);
    setMapStatus({ map: "", phase: "loading", progress: 0 });
    setEnteredWorld(true);
  };
  const saveStatus = game.sending
    ? "Salvando…"
    : game.connected
      ? "Progresso salvo"
      : snapshot
        ? "Reconectando"
        : "Conectando";
  return (
    <div className={`game-shell${loading ? " is-loading" : ""}${selectingCharacter ? " is-character-selecting" : ""}`}>
      <a className="skip-link" href="#adventure" inert={isMobile && !!activeWindow}>
        Ir para a aventura
      </a>
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
          const mapName = isTownScene(state) ? "prontera" : (area?.map ?? "prontera");
          const mapLabel = isTownScene(state) ? "Prontera" : (area?.name ?? "Prontera");
          const load = inventoryLoad(state, catalog);
          const readyQuest = catalog.quests.find((quest) =>
            !state.quests[quest.id]?.claimed && (state.quests[quest.id]?.progress ?? 0) >= quest.amount,
          );
          const rewardedQuest = rewardQuestId
            ? catalog.quests.find((quest) => quest.id === rewardQuestId)
            : undefined;
          const baseGoal =
            (state.reborn
              ? (catalog.exp.baseTrans ?? catalog.exp.base)
              : catalog.exp.base)[state.baseLevel] ?? 0;
          const jobGoal =
            catalog.exp.job[currentClass.expGroup]?.[state.jobLevel] ?? 0;
          return (
            <>
              <main id="adventure" className="cockpit">
                <aside ref={heroMovable.ref} style={heroMovable.style} className="hero-column" inert={isMobile && !!activeWindow}>
                  <Panel
                    title=""
                    className="hero-panel"
                  >
                    <div {...heroMovable.handleProps} className="ro-drag-handle hero-identity">
                      <h1>{state.name}</h1>
                      <span>· {currentClass.name}{state.reborn ? " · Transcendente" : ""}</span>
                      <button type="button" className="hud-city-access" data-no-drag
                        aria-label={state.status === "town" ? "Abrir serviços de Prontera" : "Voltar à cidade"}
                        title={state.status === "town" ? "Serviços de Prontera" : "Voltar à cidade"}
                        disabled={game.busy || (state.status === "resting" && state.restMode !== "field")}
                        onClick={event => state.status === "town"
                          ? openWindow("city", event.currentTarget)
                          : void game.command({ type: "stop" })}>
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                          <path d="M3.5 10.2 12 4l8.5 6.2v9.3h-17z" />
                          <path d="M8 19.5v-5.8h8v5.8M10 10h4M12 8v4M5.7 11h12.6" />
                          <circle cx="12" cy="15" r="1.2" />
                        </svg>
                      </button>
                      <span className={`hud-save-indicator ${game.sending ? "is-saving" : game.connected ? "is-saved" : "is-reconnecting"}`}
                        role="img" aria-label={saveStatus} title={saveStatus} tabIndex={0} data-no-drag>
                        <i aria-hidden="true" />
                      </span>
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
                      <span title={load.recoveryBlocked
                        ? "Peso acima de 50%: recuperação natural de HP/SP bloqueada. Na cidade, abra a Mochila e venda loot comum para aliviar o peso."
                        : "A recuperação natural de HP/SP é bloqueada a partir de 50% do peso máximo."}>
                        Peso <b>{number(load.weight)} / {number(load.maxWeight)}</b>
                        {load.recoveryBlocked && <b aria-label="Recuperação bloqueada pelo peso"> · 50%+</b>}
                      </span>
                      <span className="hud-zeny" title={`${number(state.zeny)} zeny`} aria-label={`${number(state.zeny)} zeny`}>
                        <i aria-hidden="true">Z</i><b>{number(state.zeny)}</b>
                      </span>
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
                              <ClassicMenuIcon file={file} />
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
                            aria-label="Diário de combate" title="Diário de combate"
                            onClick={() => {
                              setJournalOpen((value) => !value); setBookOpen(false);
                              window.setTimeout(() => bookTrigger.current?.focus(), 0);
                            }}>
                            <ClassicMenuIcon file="btn_dialog_off.bmp" />
                            <span>Diário</span>
                          </button>
                          <button type="button" className="ro-book-entry"
                            aria-label="Restaurar posições das janelas" title="Restaurar posições das janelas" onClick={() => {
                            resetWindowPositions();
                            setBookOpen(false);
                            window.setTimeout(() => bookTrigger.current?.focus(), 0);
                          }}>
                            <span className="ro-book-entry-mark" aria-hidden="true">↺</span>
                            <span>Restaurar HUD</span>
                          </button>
                          <Link className="ro-book-entry" href="/painel">Painel da conta</Link>
                          <button type="button" className="ro-book-entry" onClick={() => { void auth.logout().catch(() => {}); navigate('/'); }}>Sair da conta</button>
                          <a className="ro-book-entry ro-book-classic-link" href={getClassicClientPaths(window.location).entry}
                            target="_blank" rel="noreferrer" onClick={() => setBookOpen(false)}>
                            <span className="ro-book-entry-mark" aria-hidden="true">↗</span>
                            <span>RO clássico</span>
                          </a>
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
                        : isTownScene(state)
                          ? "Praça de Prontera"
                          : (area?.name ?? "Campos de Prontera")
                    }
                    aside={
                      <div className="scene-heading-tools">
                        {enteredWorld && <AudioToggle map={activeWindow === "shop" ? "prt_in" : mapName} />}
                      </div>
                    }
                    className="scene-panel"
                  >
                    <div className="classic-map-stage">
                      {enteredWorld && <>
                        {activeWindow === "shop" ? <ShopScene key={`shop-${mapReload}`} onMapStatusChange={setMapStatus} />
                          : <Scene key={`world-${mapReload}`} {...props} onMapStatusChange={setMapStatus} />}
                        <ClassicMinimap mapName={activeWindow === "shop" ? "prontera" : mapName}
                          mapLabel={activeWindow === "shop" ? "Prontera · loja" : mapLabel} />
                        <ChatJournal {...props} identity={identity} onAuthRequired={onAuthRequired} isOpen={journalOpen} onOpenChange={setJournalOpen} />
                        <RewardNotifications catalog={catalog} snapshot={snapshot}
                          enabled={!loading && game.connected && enteredWorld} />
                        <ClassicShortcuts catalog={catalog} snapshot={snapshot}
                          onSkills={trigger => openWindow("skills", trigger)} />
                        <button
                          type="button"
                          className="classic-chat-toggle"
                          aria-expanded={journalOpen}
                          onClick={() => setJournalOpen(!journalOpen)}
                        >
                          {journalOpen ? "Recolher chat" : "Diário de combate"}
                        </button>
                      </>}
                      {enteredWorld && !activeWindow && <HuntExplorer {...props}
                        areaId={areaId}
                        setAreaId={setAreaId}
                        readyQuest={!!readyQuest}
                        launcherRef={huntTrigger}
                        openWindow={openWindow}
                        openChallenges={openChallenges}
                      />}
                    </div>
                  </Panel>
                </section>
                {activeWindow && (
                  <div className="ro-window-layer">
                    <button type="button" className="ro-window-backdrop"
                      aria-label="Fechar janela" onClick={closeWindow} />
                    <section ref={windowMovable.ref} style={windowMovable.style} className={`ro-window ro-window-${activeWindow}`}
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
                      <div {...windowMovable.handleProps} className="ro-drag-handle ro-window-titlebar">
                        <h2>{windowTitles[activeWindow]}</h2>
                        <button type="button" className="ro-window-close"
                          ref={windowClose} aria-label="Fechar janela"
                          onClick={closeWindow}>×</button>
                      </div>
                      <div className="ro-window-content">
                        {activeWindow === "stats" && <Build {...props} mode="stats" />}
                        {activeWindow === "equipment" &&
                          <ClassicEquipment {...props} onInventory={() => setActiveWindow("inventory")} />}
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
                        {activeWindow === "city" && <CityServices onOpen={(service: CityService, trigger) => openWindow(service, trigger)} />}
                        {activeWindow === "blacksmith" && <Blacksmith {...props} />}
                        {activeWindow === "stylist" && <Stylist {...props} />}
                      </div>
                      {rewardedQuest && <QuestReward quest={rewardedQuest}
                        catalog={catalog} onClose={dismissReward} />}
                    </section>
                  </div>
                )}
                {!activeWindow && rewardedQuest && <QuestReward quest={rewardedQuest}
                  catalog={catalog} onClose={dismissReward} />}
              </main>
              {enteredWorld && !loading && <Offline
                {...props}
                error={game.error}
                retryable={game.retryable}
                sending={game.sending}
                retry={game.retry}
              />}
            </>
          );
        })()
      )}
      {selectingCharacter && catalog && snapshot && <CharacterSelect catalog={catalog} snapshot={snapshot}
        error={game.error} retrying={game.sending}
        onRetry={() => void game.retry()} onEnter={enterWorld} />}
      {loading && <ClassicLoading progress={loadingProgress} error={loadingError} onRetry={retryLoading} />}
    </div>
  );
}
