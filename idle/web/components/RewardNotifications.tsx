import { useEffect, useRef, useState } from "react";
import type { Catalog, GameSnapshot } from "../../shared/types";
import { isItemIdentified, itemRarity, rarityNames } from "../../shared/loot";

interface RewardNotificationsProps {
  catalog: Catalog;
  snapshot: GameSnapshot;
  enabled: boolean;
}
interface RewardNotice {
  id: number;
  kind: "level" | "quest" | "rare";
  title: string;
  detail: string;
  expiresAt: number;
  questIds?: string[];
}
const NOTICE_LIFETIME = 5_000;
const LIVE_GAP_LIMIT = 10_000;
const MAX_NOTICES = 3;

/** Observe live changes only. Persisted event history is never replayed on mount. */
export default function RewardNotifications({ catalog, snapshot, enabled }: RewardNotificationsProps) {
  const baseline = useRef<GameSnapshot | null>(null);
  const sequence = useRef(0);
  const [notices, setNotices] = useState<RewardNotice[]>([]);

  useEffect(() => {
    const rebase = () => {
      baseline.current = null;
      setNotices(current => current.length ? [] : current);
    };
    document.addEventListener("visibilitychange", rebase);
    return () => document.removeEventListener("visibilitychange", rebase);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // A disabled render may retain the last response. Never compare the first
      // reconnected response with that stale snapshot, even after a short outage.
      baseline.current = null;
      setNotices(current => current.length ? [] : current);
      return;
    }
    const previous = baseline.current;
    baseline.current = snapshot;
    const { state, serverTime } = snapshot;
    // Loading, offline summaries and reconnects establish a fresh live baseline.
    if (document.hidden || snapshot.offlineSummary || state.offlineSummary || !previous ||
      previous.state.id !== state.id || serverTime < previous.serverTime ||
      serverTime - previous.serverTime > LIVE_GAP_LIMIT) {
      setNotices(current => current.length ? [] : current);
      return;
    }

    const additions: RewardNotice[] = [];
    const add = (kind: RewardNotice["kind"], title: string, detail: string, questIds?: string[]) => {
      additions.push({ id: ++sequence.current, kind, title, detail,
        expiresAt: performance.now() + NOTICE_LIFETIME, ...(questIds ? { questIds } : {}) });
    };
    const levels: string[] = [];
    if (state.baseLevel > previous.state.baseLevel) levels.push(`Base ${state.baseLevel}`);
    if (state.job === previous.state.job && state.reborn === previous.state.reborn &&
      state.jobLevel > previous.state.jobLevel) levels.push(`Job ${state.jobLevel}`);
    if (levels.length) add("level", "Nível aumentado!", levels.join(" · "));

    const newlyReady = catalog.quests.filter(quest => {
      const current = state.quests[quest.id];
      const old = previous.state.quests[quest.id];
      return !current?.claimed && (current?.progress ?? 0) >= quest.amount &&
        !old?.claimed && (old?.progress ?? 0) < quest.amount;
    });
    if (newlyReady.length) add("quest",
      newlyReady.length === 1 ? "Missão pronta" : `${newlyReady.length} missões prontas`,
      newlyReady.length === 1 ? `${newlyReady[0].name} · recompensa no Livro do aventureiro`
        : "Recompensas disponíveis no Livro do aventureiro",
      newlyReady.map(quest => quest.id));

    const oldInventory = new Map(previous.state.inventory.map(entry => [entry.uid, entry]));
    const discoveries: string[] = [];
    for (const entry of state.inventory) {
      const old = oldInventory.get(entry.uid);
      // Never derive text from a concealed item's identity or rolled rarity.
      if (old?.identified !== false || !isItemIdentified(entry)) continue;
      const item = catalog.items[entry.itemId];
      const rarity = itemRarity(entry);
      if (item?.type === "equipment" && (rarity === "rare" || rarity === "epic" || rarity === "legendary"))
        discoveries.push(`${item.name} · ${rarityNames[rarity]}`);
    }
    for (const event of state.events) {
      if (event.id < previous.state.nextEventId || event.kind !== "loot" || event.itemId === undefined ||
        event.at < previous.serverTime - 1_000 || serverTime - event.at > LIVE_GAP_LIMIT) continue;
      const item = catalog.items[event.itemId];
      // Cards have a public catalog identity; equipment still requires identification above.
      if (item?.type === "card") discoveries.push(`${item.name} ×${event.quantity ?? event.amount ?? 1}`);
    }
    if (discoveries.length) add("rare", "Descoberta rara!",
      `${discoveries.slice(0, 2).join(" · ")}${discoveries.length > 2 ? ` · mais ${discoveries.length - 2} descobertas` : ""}`);

    const claimedIds = new Set(catalog.quests.filter(quest => state.quests[quest.id]?.claimed &&
      !previous.state.quests[quest.id]?.claimed).map(quest => quest.id));
    if (additions.length || claimedIds.size) setNotices(current => [
      // The existing mission reward summary owns the claim; remove its earlier ready notice.
      ...current.filter(notice => !notice.questIds?.some(id => claimedIds.has(id))),
      ...additions,
    ].slice(-MAX_NOTICES));
  }, [catalog, snapshot, enabled]);

  useEffect(() => {
    if (!notices.length) return;
    const expiry = Math.min(...notices.map(notice => notice.expiresAt));
    const timer = window.setTimeout(() => setNotices(current =>
      current.filter(notice => notice.expiresAt > performance.now())), Math.max(1, expiry - performance.now()));
    return () => window.clearTimeout(timer);
  }, [notices]);

  return (
    <div className="reward-notifications" role="status" aria-live="polite" aria-atomic="false" aria-relevant="additions" aria-label="Novas conquistas">
      {notices.map(notice => <div className={`reward-notice reward-notice-${notice.kind}`} key={notice.id}>
        <span className="reward-notice-mark" aria-hidden="true">{notice.kind === "level" ? "↑" : notice.kind === "quest" ? "!" : "◇"}</span>
        <div><strong>{notice.title}</strong><span>{notice.detail}</span></div>
      </div>)}
    </div>
  );
}
