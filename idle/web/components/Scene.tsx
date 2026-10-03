import { useEffect, useRef, useState } from "react";
import type { Area, SpriteAsset } from "../../shared/types";
import {
  drawActor,
  getActorPose,
  loadActor,
  type DecodedActor,
} from "../assets/renderer";
import { Meter, number, type PanelProps } from "./common";
import OriginalMap from "./OriginalMap";

function useActor(asset?: SpriteAsset) {
  const [actor, setActor] = useState<DecodedActor | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setActor(null);
    setError(false);
    if (asset)
      void loadActor(asset)
        .then((value) => {
          if (live) {
            setActor(value);
            setError(value.fallback || !!value.error);
          }
        })
        .catch(() => {
          if (live) setError(true);
        });
    return () => {
      live = false;
    };
  }, [asset]);
  return { actor, error };
}

export function ActorPreview({
  asset,
  name,
  large = false,
}: {
  asset: SpriteAsset;
  name: string;
  large?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { actor, error } = useActor(asset);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 120, 112);
    ctx.imageSmoothingEnabled = false;
    if (actor) {
      const bounds = actorBounds(actor);
      const scale = Math.min(
        large ? 2.2 : 1.8,
        104 / (bounds.right - bounds.left),
        96 / (bounds.bottom - bounds.top),
      );
      drawActor(
        ctx,
        actor,
        "idle",
        0,
        60 - ((bounds.left + bounds.right) / 2) * scale,
        104 - bounds.bottom * scale,
        scale,
      );
    }
  }, [actor, large]);
  return (
    <div className={`actor-preview ${large ? "large" : ""}`}>
      <canvas
        ref={canvas}
        width="120"
        height="112"
        role="img"
        aria-label={name}
      />
      {error && (
        <span
          className="sprite-missing"
          title="Sprite indisponível; representação de reserva"
        >
          Recurso indisponível
        </span>
      )}
    </div>
  );
}

const boundsCache = new WeakMap<
  DecodedActor,
  { left: number; right: number; top: number; bottom: number }
>();
function actorBounds(actor: DecodedActor) {
  const cached = boundsCache.get(actor);
  if (cached) return cached;
  const pose = getActorPose(actor, "idle", 0);
  if (!pose.length) return { left: -15, right: 15, top: -40, bottom: 0 };
  const points = pose.flatMap((layer) => {
    const angle = (layer.rotation * Math.PI) / 180;
    return [-1, 1].flatMap((x) =>
      [-1, 1].map((y) => {
        const dx = (x * layer.image.width * layer.scaleX) / 2;
        const dy = (y * layer.image.height * layer.scaleY) / 2;
        return {
          x: layer.x + dx * Math.cos(angle) - dy * Math.sin(angle),
          y: layer.y + dx * Math.sin(angle) + dy * Math.cos(angle),
        };
      }),
    );
  });
  const result = {
    left: Math.min(...points.map((p) => p.x)),
    right: Math.max(...points.map((p) => p.x)),
    top: Math.min(...points.map((p) => p.y)),
    bottom: Math.max(...points.map((p) => p.y)),
  };
  boundsCache.set(actor, result);
  return result;
}

type SceneKind = Area["scene"] | "town";
type CombatCue = { id: number; start: number; duration: number; action: "attack" | "hurt"; hit: boolean };
export default function Scene({ catalog, snapshot, busy }: PanelProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(snapshot);
  const actorsRef = useRef<{
    hero: DecodedActor | null;
    enemy: DecodedActor | null;
  }>({ hero: null, enemy: null });
  const { state } = snapshot;
  const area = catalog.areas.find((a) => a.id === state.areaId);
  const monster = state.battle
    ? catalog.monsters[state.battle.monsterId]
    : undefined;
  const hero = useActor(catalog.classes[state.job].sprite[state.gender]);
  const enemy = useActor(monster?.sprite);
  const scene: SceneKind =
    state.status === "town" || (state.status === "resting" && !state.areaId)
      ? "town"
      : (area?.scene ?? "field");
  const effects = useRef<
    Array<{ id: number; text: string; enemy: boolean; start: number }>
  >([]);
  const eventCursor = useRef(snapshot.state.events.at(-1)?.id ?? 0);
  const opponentRequest = useRef(0);
  const combatCues = useRef<CombatCue[]>([]);
  const lastOpponent = useRef<{
    actor: DecodedActor;
    monsterId: number;
    areaId: typeof state.areaId;
  } | null>(null);
  const defeatedOpponent = useRef<{
    actor: DecodedActor;
    monsterId: number;
    until: number;
    deadAt?: number;
  } | null>(null);
  useEffect(() => {
    const previous = stateRef.current.state;
    stateRef.current = snapshot;
    const newEvents = state.events.filter((e) => e.id > eventCursor.current);
    eventCursor.current = state.events.at(-1)?.id ?? eventCursor.current;
    const now = performance.now();
    combatCues.current = combatCues.current.filter(
      (cue) => cue.start + cue.duration > now,
    );
    const attackAction = actorsRef.current.hero?.body?.action.actions[40];
    const attackDuration = attackAction?.frames.length
      ? attackAction.frames.length * Math.max(25, attackAction.delayMs)
      : 500;
    let nextCueStart = Math.max(
      now,
      ...combatCues.current.map((cue) => cue.start + cue.duration),
    );
    const effectStarts = new Map<number, number>();
    for (const event of newEvents.filter((entry) => entry.at >= snapshot.serverTime - 4000)
      .sort((a, b) => a.at - b.at || a.id - b.id)) {
      // The engine's player miss currently has no target field.
      if (
        (event.kind === "damage" && event.target === "enemy") ||
        (event.kind === "miss" && event.target !== "player")
      ) {
        effectStarts.set(event.id, nextCueStart);
        combatCues.current.push({
          id: event.id,
          start: nextCueStart,
          duration: attackDuration,
          action: "attack",
          hit: event.kind === "damage",
        });
        nextCueStart += attackDuration;
      }
      if (event.kind === "damage" && event.target === "player") {
        effectStarts.set(event.id, nextCueStart);
        combatCues.current.push({
          id: event.id,
          start: nextCueStart,
          duration: 350,
          action: "hurt",
          hit: true,
        });
        nextCueStart += 350;
      }
    }
    const finalCue = combatCues.current.at(-1);
    const kill = [...newEvents].reverse().find((event) => event.kind === "kill");
    const finishingAttack = kill
      ? [...combatCues.current].reverse().find((cue) => cue.action === "attack" && cue.hit && cue.id < kill.id)
      : undefined;
    const deadAt = finishingAttack
      ? finishingAttack.start + finishingAttack.duration
      : undefined;
    const suspendedIds = new Set<number>();
    let suspendedEffects: typeof effects.current = [];
    if (previous.areaId !== state.areaId || state.battle || kill)
      opponentRequest.current++;
    if (
      previous.battle && !state.battle &&
      previous.areaId === state.areaId &&
      newEvents.some((event) => event.kind === "kill" || event.kind === "death") &&
      lastOpponent.current?.monsterId === previous.battle.monsterId &&
      lastOpponent.current.areaId === state.areaId && finalCue
    ) {
      defeatedOpponent.current = {
        ...lastOpponent.current,
        until: Math.max(finalCue.start + finalCue.duration, (deadAt ?? 0) + 200),
        deadAt,
      };
    }
    // A short encounter can start and end between snapshots, leaving no battle
    // to identify its sprite. The kill text is authored by the local engine.
    if (!previous.battle && !state.battle && kill && finishingAttack && finalCue &&
      previous.areaId === state.areaId) {
      const opponent = Object.values(catalog.monsters).find(
        (entry) => kill.text === `${entry.name} derrotado.`,
      );
      if (opponent) {
        const request = opponentRequest.current;
        const areaId = state.areaId;
        const encounter = [...newEvents].reverse().find(
          (event) => event.kind === "encounter" && event.id < kill.id,
        );
        const pending = combatCues.current.filter(
          (cue) => cue.id <= kill.id && (!encounter || cue.id > encounter.id),
        );
        for (const cue of pending) suspendedIds.add(cue.id);
        // Hold this exchange out of the active queue until its target loads.
        combatCues.current = combatCues.current.filter((cue) => !suspendedIds.has(cue.id));
        void loadActor(opponent.sprite).then((actor) => {
          if (opponentRequest.current !== request ||
            stateRef.current.state.areaId !== areaId || stateRef.current.state.battle)
            return;
          // Begin the queued exchange once its target is available, so an
          // uncached sprite cannot consume the finishing animation offscreen.
          const readyStart = Math.max(
            performance.now(),
            ...combatCues.current.map((cue) => cue.start + cue.duration),
          );
          const delay = Math.max(0, readyStart - pending[0].start);
          for (const cue of pending) cue.start += delay;
          combatCues.current = [
            ...combatCues.current,
            ...pending,
          ].sort((a, b) => a.start - b.start || a.id - b.id);
          for (const effect of suspendedEffects) effect.start += delay;
          effects.current = [...effects.current, ...suspendedEffects].slice(-8);
          // Retain the opponent through all pending cues and the death pose.
          defeatedOpponent.current = {
            actor,
            monsterId: opponent.id,
            until: Math.max(finalCue.start + finalCue.duration, (deadAt ?? 0) + delay + 200),
            deadAt: deadAt === undefined ? undefined : deadAt + delay,
          };
        }).catch(() => { /* loadActor normally returns its local fallback. */ });
      }
    }
    if (previous.areaId !== state.areaId) {
      defeatedOpponent.current = null;
      combatCues.current = [];
    }
    effects.current = [
      ...effects.current.filter((e) => now - e.start < 1200),
      ...newEvents.filter((e) => e.amount && e.target).map((e) => ({
        id: e.id,
        text:
          e.text.toLowerCase().includes("cura") ||
          e.text.toLowerCase().includes("recuper")
            ? `+${e.amount}`
            : `${e.amount}`,
        enemy: e.target === "enemy",
        start: effectStarts.get(e.id) ?? now,
      })),
    ].slice(-8);
    suspendedEffects = effects.current.filter((effect) => suspendedIds.has(effect.id));
    effects.current = effects.current.filter((effect) => !suspendedIds.has(effect.id));
  }, [snapshot, state.events, catalog]);
  useEffect(() => () => { opponentRequest.current++; }, []);
  useEffect(() => {
    actorsRef.current = { hero: hero.actor, enemy: enemy.actor };
    if (enemy.actor && state.battle)
      lastOpponent.current = {
        actor: enemy.actor,
        monsterId: state.battle.monsterId,
        areaId: state.areaId,
      };
  }, [hero.actor, enemy.actor, state.battle, state.areaId]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let previous = 0;
    let width = 640;
    let height = 350;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resize = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
    resize.observe(element);
    const render = (time: number) => {
      raf = requestAnimationFrame(render);
      if (time - previous < (motion.matches ? 250 : 33) || document.hidden)
        return;
      previous = time;
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      const current = stateRef.current.state;
      const defeated = defeatedOpponent.current;
      const lingering = defeated && time < defeated.until ? defeated : null;
      const fighting = !!current.battle || !!lingering;
      const heroX = width * (fighting ? 0.4 : 0.48);
      const enemyX = width * 0.7;
      const ground = height * 0.76;
      const targetHeight = width < 440 ? 96 : 123;
      for (const x of fighting ? [heroX, enemyX] : [heroX]) {
        ctx.fillStyle = "#3a584744";
        ctx.beginPath();
        ctx.ellipse(x, ground + 1, 22, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const recent = effects.current.filter((e) => time >= e.start && time - e.start < 1000);
      const cue = combatCues.current.find(
        (cue) => time >= cue.start && time < cue.start + cue.duration,
      );
      const attack = cue?.action === "attack" ? cue : undefined;
      const hurt = cue?.action === "hurt" ? cue : undefined;
      const heroHurt = !!hurt;
      const enemyHurt = !!attack?.hit;
      const paint = (
        actor: DecodedActor,
        action: "idle" | "attack" | "hurt" | "dead",
        x: number,
        elapsed = time,
      ) => {
        const bounds = actorBounds(actor);
        const scale = Math.min(
          2.8,
          targetHeight / (bounds.bottom - bounds.top),
        );
        drawActor(
          ctx,
          actor,
          action,
          motion.matches ? 0 : elapsed,
          x,
          ground - bounds.bottom * scale,
          scale,
        );
      };
      if (actorsRef.current.hero)
        paint(
          actorsRef.current.hero,
          cue
            ? cue.action
            : current.hp <= 0
              ? "dead"
                : "idle",
          heroX,
          attack ? time - attack.start : heroHurt ? time - hurt!.start : time,
        );
      const opponentActor = current.battle ? actorsRef.current.enemy : lingering?.actor;
      if (fighting && opponentActor)
        paint(
          opponentActor,
          lingering?.deadAt !== undefined && time >= lingering.deadAt
            ? "dead" : enemyHurt ? "hurt" : heroHurt ? "attack" : "idle",
          enemyX,
          enemyHurt ? time - attack!.start : heroHurt ? time - hurt!.start : time,
        );
      ctx.font = "bold 12px Tahoma";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fcf8dc";
      ctx.strokeStyle = "#364a3c";
      ctx.lineWidth = 3;
      ctx.strokeText(current.name, heroX, ground + 28);
      ctx.fillText(current.name, heroX, ground + 28);
      if (fighting) {
        const name = catalog.monsters[current.battle?.monsterId ?? lingering!.monsterId].name;
        ctx.strokeText(name, enemyX, ground + 28);
        ctx.fillText(name, enemyX, ground + 28);
      }
      for (const e of recent) {
        ctx.font = "bold 20px Tahoma";
        const age = time - e.start;
        const x = e.enemy ? enemyX : heroX;
        const y = ground - 65 - (motion.matches ? 0 : age / 35);
        ctx.fillStyle = e.text.startsWith("+")
          ? "#def8a0"
          : e.enemy
            ? "#fff5d3"
            : "#ffcebb";
        ctx.strokeStyle = "#3b4140";
        ctx.lineWidth = 3;
        ctx.strokeText(e.text, x, y);
        ctx.fillText(e.text, x, y);
      }
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, [scene, catalog]);
  return (
    <div className={`scene scene-${scene}`}>
      <OriginalMap map={scene === "town" ? "prontera" : (area?.map ?? "prontera")} />
      <canvas
        ref={canvas}
        aria-label={
          monster
            ? `${state.name} enfrenta ${monster.name}`
            : `${state.name} em ${scene === "town" ? "Prontera" : (area?.name ?? "Rune-Midgard")}`
        }
        role="img"
      />
      <div className="scene-location">
        <span>
          {state.status === "challenge"
            ? "Desafio em andamento"
            : scene === "town"
              ? "Cidade de Prontera"
              : area?.name}
        </span>
        <small>
          {state.status === "town"
            ? "Prepare-se para a próxima aventura"
            : state.status === "resting"
              ? "Recuperando HP e SP"
              : state.status === "paused"
                ? "Sua caçada está pausada"
                : "Caça automática"}
        </small>
      </div>
      {monster && state.battle && (
        <div className="target-card">
          <div>
            <b>{monster.name}</b>
            <span>Nv. {monster.level}</span>
          </div>
          <Meter
            label="HP"
            value={state.battle.hp}
            max={state.battle.maxHp}
            kind="enemy"
            text={`${number(state.battle.hp)} / ${number(state.battle.maxHp)}`}
          />
        </div>
      )}
      {(hero.error || enemy.error) && (
        <div className="scene-warning" role="status">
          <span>
            Um sprite está indisponível. Você pode continuar a aventura.
          </span>
          <button disabled={busy} onClick={() => window.location.reload()}>
            Recarregar recursos
          </button>
        </div>
      )}
    </div>
  );
}
