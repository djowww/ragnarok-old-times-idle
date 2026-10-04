import { useEffect, useState, type ReactNode } from "react";
import type {
  Catalog,
  GameCommand,
  GameSnapshot,
  Item,
  InventoryEntry,
  Slot,
} from "../../shared/types";
import { getItemIcon } from "../assets/items";

export interface PanelProps {
  catalog: Catalog;
  snapshot: GameSnapshot;
  busy: boolean;
  command: (value: GameCommand) => Promise<boolean>;
}
export const number = (value: number) =>
  Math.floor(value).toLocaleString("pt-BR");
export const slots: Record<Slot, string> = {
  weapon: "Arma",
  armor: "Armadura",
  shield: "Escudo",
  head: "Cabeça",
  garment: "Capa",
  shoes: "Calçado",
  accessory: "Acessório",
};
export const statusNames = {
  town: "Na cidade",
  hunting: "Em caça",
  challenge: "Em desafio",
  resting: "Recuperando",
  paused: "Caça pausada",
};
export function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`
    : seconds >= 60
      ? `${Math.floor(seconds / 60)}min ${seconds % 60}s`
      : `${seconds}s`;
}
export function itemName(item: Item, entry?: InventoryEntry) {
  return `${entry?.refine ? `+${entry.refine} ` : ""}${item.name}${item.slots ? ` [${item.slots}]` : ""}`;
}
export function Panel({
  title,
  aside,
  className = "",
  children,
}: {
  title?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && <div className="panel-heading">
        <h2>{title}</h2>
        {aside}
      </div>}
      {children}
    </section>
  );
}
export function Meter({
  label,
  value,
  max,
  kind = "hp",
  text,
}: {
  label: string;
  value: number;
  max: number;
  kind?: string;
  text?: string;
}) {
  const percent =
    max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 100;
  return (
    <div
      className={`meter meter-${kind}`}
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={Math.max(max, value)}
    >
      <span className="meter-fill" style={{ width: `${percent}%` }} />
      <span className="meter-text">
        <b>{label}</b>
        <span>{text ?? `${number(value)} / ${number(max)}`}</span>
      </span>
    </div>
  );
}
export function ItemIcon({
  item,
  className = "",
}: {
  item: Item;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    void getItemIcon(item)
      .then((value) => {
        if (live) setSrc(value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [item]);
  return (
    <span className={`item-icon ${className}`} aria-hidden="true">
      {src ? (
        <img src={src} alt="" onError={() => setSrc(null)} />
      ) : (
        <span className={`item-fallback ${item.type}`}>
          {item.type === "card"
            ? "C"
            : item.type === "equipment"
              ? "E"
              : item.type === "consumable"
                ? "P"
                : "I"}
        </span>
      )}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
export function RewardLine({
  catalog,
  reward,
}: {
  catalog: Catalog;
  reward: {
    zeny: number;
    baseExp: number;
    jobExp: number;
    items: Array<{ itemId: number; quantity: number }>;
  };
}) {
  return (
    <p className="reward-line">
      {[
        reward.zeny ? `${number(reward.zeny)} z` : "",
        reward.baseExp ? `${number(reward.baseExp)} EXP base` : "",
        reward.jobExp ? `${number(reward.jobExp)} EXP classe` : "",
        ...reward.items.map(
          (i) => `${i.quantity}× ${catalog.items[i.itemId]?.name ?? "Item"}`,
        ),
      ]
        .filter(Boolean)
        .join(" · ")}
    </p>
  );
}
