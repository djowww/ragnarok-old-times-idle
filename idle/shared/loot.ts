import type { InventoryEntry, ItemRarity, Stat } from "./types.js";

export const MAGNIFIER_ITEM_ID = 611;
export const rarityNames: Record<ItemRarity, string> = {
  common: "Comum",
  uncommon: "Incomum",
  rare: "Raro",
  epic: "Épico",
  legendary: "Lendário",
};
const bonusStats: Stat[] = ["str", "agi", "vit", "int", "dex", "luk"];

/** Old equipment had no identification field and remains usable. */
export function isItemIdentified(entry?: InventoryEntry): boolean {
  return entry?.identified !== false;
}

/** This is a presentation value: concealed equipment never exposes its rolled rarity. */
export function itemRarity(entry?: InventoryEntry): ItemRarity | "unidentified" {
  if (!isItemIdentified(entry)) return "unidentified";
  return entry?.rarity && Object.hasOwn(rarityNames, entry.rarity)
    ? entry.rarity
    : "common";
}

export function rarityBonus(entry?: InventoryEntry) {
  const bonus = entry?.rarityBonus;
  const rarity = itemRarity(entry);
  return rarity !== "common" && rarity !== "unidentified" && bonus &&
      bonusStats.includes(bonus.stat) && Number.isInteger(bonus.value) &&
      bonus.value >= 1 && bonus.value <= 5
    ? bonus
    : undefined;
}

export function rarityBonusText(entry?: InventoryEntry): string {
  const bonus = rarityBonus(entry);
  return bonus ? `${bonus.stat.toUpperCase()} +${bonus.value}` : "";
}

/** Invoked by the authoritative engine once when each equipment reward is created. */
export function rollEquipmentLoot(nextRandom: () => number):
    Pick<InventoryEntry, "identified" | "rarity" | "rarityBonus"> {
  const roll = nextRandom() * 100;
  const rarity: ItemRarity = roll < 65 ? "common" :
    roll < 87 ? "uncommon" : roll < 96 ? "rare" : roll < 99 ? "epic" : "legendary";
  return {
    identified: false,
    rarity,
    ...(rarity === "common" ? {} : {
      rarityBonus: {
        stat: bonusStats[Math.floor(nextRandom() * bonusStats.length)],
        value: 1 + Math.floor(nextRandom() * 5),
      },
    }),
  };
}
