import type { GameState, Item } from './types.js';
/** Explicit pre-renewal item scripts. No arbitrary item script is evaluated. */
export const resistancePotions: Readonly<Record<number, { status: string; strong: string; weak: string }>> = {
 12118: { status: 'SC_RESIST_PROPERTY_FIRE', strong: 'fire', weak: 'water' },
 12119: { status: 'SC_RESIST_PROPERTY_WATER', strong: 'water', weak: 'wind' },
 12120: { status: 'SC_RESIST_PROPERTY_GROUND', strong: 'earth', weak: 'fire' },
 12121: { status: 'SC_RESIST_PROPERTY_WIND', strong: 'wind', weak: 'earth' },
};
export const itemBuffId = (itemId: number) => `item:${itemId}`;
export function usableConsumable(item: Item | undefined): boolean {
 return !!item && item.type === 'consumable' && !item.unsupportedEffect &&
  ((item.healHP ?? 0) > 0 || (item.healSP ?? 0) > 0 || item.id === 605 || item.id === 606 || !!resistancePotions[item.id]);
}
export function itemElementResistance(s: GameState, element: string, at: number): number {
 let resistance = 0;
 for (const [id, potion] of Object.entries(resistancePotions)) {
  const buff = s.buffs[itemBuffId(Number(id))];
  if (!buff || buff.expiresAt <= at || (buff.startsAt ?? 0) > at) continue;
  if (potion.strong === element.toLowerCase()) resistance += 20;
  if (potion.weak === element.toLowerCase()) resistance -= 15;
 }
 return resistance;
}
export function manualItemProvoke(s: GameState, at: number) {
 const buff = s.buffs[itemBuffId(606)];
 return buff && (buff.startsAt ?? 0) <= at && buff.expiresAt > at ? { level: 1, automatic: false } : undefined;
}
export function consumableDescription(item: Item): string | undefined {
 const resistance = resistancePotions[item.id];
 const names: Record<string,string> = {fire:'Fogo',water:'Água',earth:'Terra',wind:'Vento'};
 if (resistance) return `20 min: resistência a ${names[resistance.strong]} +20%; a ${names[resistance.weak]} −15%.`;
 if (item.id === 605) return 'Vigor 1 por 10 s: DEFM +1 e sem reação ao dano por uma quantidade limitada de golpes. Recarga de Vigor: 10 s.';
 if (item.id === 606) return 'Provocar 1 em si por 30 s: ATQ +5% e defesa de VIT −10%. A defesa do equipamento é preservada.';
 return undefined;
}
