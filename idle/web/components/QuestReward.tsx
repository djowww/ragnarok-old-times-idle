import type { Catalog, Quest } from "../../shared/types";
import { ItemIcon, number } from "./common";

interface QuestRewardProps {
  quest: Quest;
  catalog: Catalog;
  onClose: () => void;
}

/** Presentation only: the server has already granted these rewards. */
export default function QuestReward({ quest, catalog, onClose }: QuestRewardProps) {
  const { reward } = quest;

  return (
    <section className="quest-reward" role="status" aria-live="polite">
      <span className="quest-reward__eyebrow">Missão concluída</span>
      <button
        className="quest-reward__close"
        type="button"
        aria-label="Fechar recompensa da missão"
        autoFocus
        onClick={onClose}
      >
        ×
      </button>
      <h2 className="quest-reward__title">{quest.name}</h2>
      <p className="quest-reward__summary">Recompensas recebidas</p>
      <div className="quest-reward__loot">
        {reward.zeny > 0 && (
          <span className="quest-reward__loot-item">
            <strong>{number(reward.zeny)}</strong> Zeny
          </span>
        )}
        {reward.baseExp > 0 && (
          <span className="quest-reward__loot-item">
            <strong>{number(reward.baseExp)}</strong> EXP base
          </span>
        )}
        {reward.jobExp > 0 && (
          <span className="quest-reward__loot-item">
            <strong>{number(reward.jobExp)}</strong> EXP classe
          </span>
        )}
        {reward.items.map(({ itemId, quantity }) => {
          const item = catalog.items[itemId];
          return (
            <span className="quest-reward__loot-item" key={itemId}>
              {item && <ItemIcon item={item} />}
              <strong>{quantity}×</strong> {item?.name ?? `Item ${itemId}`}
            </span>
          );
        })}
      </div>
    </section>
  );
}
