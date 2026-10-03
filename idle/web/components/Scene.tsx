import { useEffect, useRef, useState } from "react";
import type { Area, SpriteAsset } from "../../shared/types";
import {
  drawActor,
  getActorPose,
  loadActor,
  type DecodedActor,
} from "../assets/renderer";
import { Meter, number, type PanelProps } from "./common";

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
function landscape(ctx: CanvasRenderingContext2D, scene: SceneKind) {
  const cave = scene === "cave" || scene === "sewer" || scene === "castle";
  const desert = scene === "desert";
  const sea = scene === "sea";
  const palette = cave
    ? ["#4b5960", "#637573", "#829087", "#b8b39a"]
    : desert
      ? ["#d6c290", "#bca475", "#d8c49b", "#ead8ae"]
      : sea
        ? ["#73aeba", "#80b49a", "#a0c39c", "#e1d6b2"]
        : ["#9fbf9f", "#87a673", "#a4b983", "#d9cfab"];
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, 960, 420);
  // The original scenery is painted in broad, low contrast shapes so the local
  // client sprites remain the focus; no maps or proprietary images are bundled.
  ctx.fillStyle = cave ? "#3e4d52" : "#759588";
  ctx.beginPath();
  ctx.moveTo(0, 120);
  ctx.lineTo(0, 35);
  ctx.lineTo(90, 0);
  ctx.lineTo(180, 50);
  ctx.lineTo(265, 22);
  ctx.lineTo(350, 58);
  ctx.lineTo(460, 12);
  ctx.lineTo(560, 60);
  ctx.lineTo(690, 0);
  ctx.lineTo(790, 45);
  ctx.lineTo(960, 10);
  ctx.lineTo(960, 160);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette[1];
  ctx.beginPath();
  ctx.moveTo(0, 100);
  ctx.bezierCurveTo(300, 140, 520, 68, 960, 130);
  ctx.lineTo(960, 420);
  ctx.lineTo(0, 420);
  ctx.fill();
  ctx.fillStyle = palette[2];
  ctx.beginPath();
  ctx.moveTo(0, 235);
  ctx.bezierCurveTo(280, 190, 550, 240, 960, 160);
  ctx.lineTo(960, 420);
  ctx.lineTo(0, 420);
  ctx.fill();
  if (sea) {
    ctx.fillStyle = "#699caa";
    ctx.fillRect(0, 0, 960, 155);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 2 ? "#9fc1be" : "#80b0ba";
      ctx.fillRect((i * 107) % 960, 10 + i * 3.3, 30 + (i % 4) * 13, 2);
    }
  }
  ctx.fillStyle = palette[3];
  ctx.beginPath();
  ctx.moveTo(-60, 385);
  ctx.bezierCurveTo(230, 218, 480, 310, 730, 210);
  ctx.bezierCurveTo(840, 165, 930, 180, 1030, 190);
  ctx.lineTo(1030, 236);
  ctx.bezierCurveTo(790, 210, 650, 370, 340, 335);
  ctx.bezierCurveTo(175, 320, 120, 435, 0, 450);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 80; i++) {
    const x = (i * 137 + 61) % 950;
    const y = (i * 83 + 148) % 420;
    ctx.fillStyle =
      i % 3
        ? cave
          ? "#687977"
          : desert
            ? "#c4b184"
            : "#7e9d69"
        : cave
          ? "#a1a69a"
          : "#c2cca0";
    ctx.fillRect(x, y, 3 + (i % 4), 2);
    if (!cave && !desert && i % 3 === 0) {
      ctx.fillStyle = "#b8c895";
      ctx.fillRect(x + 3, y - 4, 2, 4);
    }
  }
  if (scene === "town") {
    cottage(ctx, 55, 145);
    cottage(ctx, 745, 135);
    ctx.fillStyle = "#918f70";
    ctx.fillRect(255, 87, 8, 82);
    ctx.fillStyle = "#e4d5ac";
    ctx.fillRect(230, 100, 60, 27);
    ctx.fillStyle = "#54666a";
    ctx.font = "13px Georgia";
    ctx.fillText("Prontera", 235, 118);
  } else if (cave) {
    for (const [x, y, scale] of [
      [80, 135, 1.8],
      [210, 120, 1],
      [770, 100, 2],
      [900, 210, 1.7],
    ]) {
      ctx.fillStyle = "#4b5a5c";
      ctx.beginPath();
      ctx.moveTo(x - 25 * scale, y);
      ctx.lineTo(x - 4 * scale, y - 85 * scale);
      ctx.lineTo(x + 32 * scale, y);
      ctx.fill();
      ctx.fillStyle = "#70817b";
      ctx.beginPath();
      ctx.moveTo(x - 4 * scale, y - 85 * scale);
      ctx.lineTo(x + 12 * scale, y);
      ctx.lineTo(x + 32 * scale, y);
      ctx.fill();
    }
  } else if (!desert && !sea) {
    tree(ctx, 45, 230, 1.1);
    tree(ctx, 200, 126, 0.7);
    tree(ctx, 797, 182, 1);
    tree(ctx, 925, 280, 1.3);
    tree(ctx, 610, 91, 0.65);
    if (scene === "forest" || scene === "orc") {
      tree(ctx, 115, 92, 1);
      tree(ctx, 690, 125, 0.9);
    }
  } else {
    for (const [x, y] of [
      [100, 185],
      [780, 325],
      [850, 190],
    ]) {
      ctx.fillStyle = "#a7a48b";
      ctx.beginPath();
      ctx.ellipse(x, y, 33, 13, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c4bda2";
      ctx.beginPath();
      ctx.ellipse(x - 4, y - 7, 25, 10, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = cave ? "#384f4b" : desert ? "#ac9869" : "#688764";
  for (let i = 0; i < 20; i++) {
    const x = i * 51;
    const y = 405 + (i % 3) * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, 33, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
function tree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#48654e55";
  ctx.beginPath();
  ctx.ellipse(5, 8, 57, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#73674d";
  ctx.fillRect(-8, -95, 16, 98);
  ctx.fillStyle = "#a0946c";
  ctx.fillRect(-4, -84, 4, 79);
  for (const [cx, cy, r, color] of [
    [0, -120, 57, "#48694e"],
    [-37, -96, 42, "#587a54"],
    [34, -93, 44, "#68885c"],
    [-20, -144, 37, "#739062"],
    [21, -143, 42, "#829b6b"],
    [-10, -159, 29, "#90a77b"],
  ] as Array<[number, number, number, string]>) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#a0b58a";
  ctx.fillRect(-25, -160, 7, 4);
  ctx.fillRect(12, -143, 10, 4);
  ctx.restore();
}
function cottage(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#61654d44";
  ctx.fillRect(x - 10, y + 10, 180, 22);
  ctx.fillStyle = "#e0d4af";
  ctx.fillRect(x, y - 72, 150, 100);
  ctx.fillStyle = "#958d72";
  ctx.fillRect(x + 11, y - 65, 7, 90);
  ctx.fillRect(x + 130, y - 65, 7, 90);
  ctx.fillStyle = "#6f6451";
  ctx.fillRect(x + 65, y - 27, 30, 55);
  ctx.fillStyle = "#789ca1";
  ctx.fillRect(x + 29, y - 42, 22, 25);
  ctx.fillRect(x + 109, y - 42, 20, 25);
  ctx.fillStyle = "#947465";
  ctx.beginPath();
  ctx.moveTo(x - 17, y - 69);
  ctx.lineTo(x + 73, y - 133);
  ctx.lineTo(x + 166, y - 69);
  ctx.fill();
  ctx.fillStyle = "#b18c71";
  ctx.beginPath();
  ctx.moveTo(x - 17, y - 69);
  ctx.lineTo(x + 73, y - 133);
  ctx.lineTo(x + 80, y - 69);
  ctx.fill();
}

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
  useEffect(() => {
    stateRef.current = snapshot;
    const newEvents = state.events.filter(
      (e) => e.id > eventCursor.current && e.amount && e.target,
    );
    eventCursor.current = state.events.at(-1)?.id ?? eventCursor.current;
    const now = performance.now();
    effects.current = [
      ...effects.current.filter((e) => now - e.start < 1200),
      ...newEvents.map((e) => ({
        id: e.id,
        text:
          e.text.toLowerCase().includes("cura") ||
          e.text.toLowerCase().includes("recuper")
            ? `+${e.amount}`
            : `${e.amount}`,
        enemy: e.target === "enemy",
        start: now,
      })),
    ].slice(-8);
  }, [snapshot, state.events]);
  useEffect(() => {
    actorsRef.current = { hero: hero.actor, enemy: enemy.actor };
  }, [hero.actor, enemy.actor]);
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
    const background = document.createElement("canvas");
    background.width = 960;
    background.height = 420;
    landscape(background.getContext("2d")!, scene);
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
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(background, 0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      const current = stateRef.current.state;
      const fighting = !!current.battle;
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
      const recent = effects.current.filter((e) => time - e.start < 1000);
      const heroHurt = recent.some((e) => !e.enemy && !e.text.startsWith("+"));
      const enemyHurt = recent.some((e) => e.enemy);
      const paint = (
        actor: DecodedActor,
        action: "idle" | "attack" | "hurt" | "dead",
        x: number,
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
          motion.matches ? 0 : time,
          x,
          ground - bounds.bottom * scale,
          scale,
        );
      };
      if (actorsRef.current.hero)
        paint(
          actorsRef.current.hero,
          current.hp <= 0
            ? "dead"
            : heroHurt
              ? "hurt"
              : fighting && enemyHurt
                ? "attack"
                : "idle",
          heroX,
        );
      if (fighting && actorsRef.current.enemy)
        paint(
          actorsRef.current.enemy,
          enemyHurt ? "hurt" : heroHurt ? "attack" : "idle",
          enemyX,
        );
      ctx.font = "bold 12px Tahoma";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fcf8dc";
      ctx.strokeStyle = "#364a3c";
      ctx.lineWidth = 3;
      ctx.strokeText(current.name, heroX, ground + 28);
      ctx.fillText(current.name, heroX, ground + 28);
      if (fighting) {
        const name = catalog.monsters[current.battle!.monsterId].name;
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
