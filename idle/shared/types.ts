// Public contracts. Times and cooldowns are milliseconds; chances are 0..10000.
export type Stat = 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk';
export type Stats = Record<Stat, number>;
export type Slot = 'weapon' | 'armor' | 'shield' | 'head' | 'garment' | 'shoes' | 'accessory';
export type WeaponType = 'dagger' | 'sword' | 'spear' | 'bow' | 'staff' | 'mace' | 'axe' | 'katar' | 'instrument' | 'whip';
export type Effects = Partial<Record<Stat | 'atk' | 'matk' | 'def' | 'mdef' | 'hp' | 'sp' | 'hit' | 'flee' | 'crit' | 'aspd' | 'damagePct' | 'neutralResist' | 'perfectDodge', number>>;
export interface SpriteAsset { spr: string; act: string; headSpr?: string; headAct?: string; }
export interface Drop { itemId: number; chance: number; }
export interface Monster {
  id: number; name: string; aegisName: string; sprite: SpriteAsset;
  level: number; hp: number; attack: [number, number]; def: number; mdef: number;
  stats: Stats; baseExp: number; jobExp: number; attackDelay: number;
  element: string; elementLevel: number; size: string; race: string; drops: Drop[];
  mvpDrops?: Drop[];
}
export interface Item {
  id: number; name: string; aegisName: string; type: 'loot' | 'consumable' | 'equipment' | 'card' | 'material';
  slot?: Slot; weaponType?: WeaponType; attack: number; def: number; slots: number;
  minLevel: number; allowedClasses: string[]; buyPrice: number; sellPrice: number;
  weight: number; resource: string; healHP?: number; healSP?: number;
  effects: Effects; cardSlots?: Slot[]; shop: boolean;
  twoHanded?: boolean; refinable?: boolean;
  /** Hercules item mechanics omitted from the idle rules are inert. */
  unsupportedEffect?: boolean;
}
export interface JobClass {
  id: string; name: string; family: string; tier: 0 | 1 | 2; trans: boolean;
  parent?: string; minJobLevel: number; gender?: 'male' | 'female';
  rebirthOf?: string;
  weapons: WeaponType[]; skills: string[]; jobCap: number; expGroup: string;
  // HP/SP arrays: index 0 is Base level 1. EXP arrays below: index n is EXP to leave level n.
  hp: number[]; sp: number[]; sprite: Record<'male' | 'female', SpriteAsset>;
}
export interface Skill {
  id: string; name: string; description: string;
  kind: 'physical' | 'magical' | 'heal' | 'buff' | 'passive' | 'steal';
  maxLevel: number; spCost: number[]; power: number[]; cooldownMs: number;
  /** Original client BMP from the skill's Hercules source name. */
  iconResource?: string;
  element?: string; effects?: Effects; durationMs?: number;
  zenyCost?: number[]; itemCost?: { itemId: number; quantity: number };
  requiredWeapon?: WeaponType[];
  requiredSlot?: Slot;
}
export interface Area {
  id: string; name: string; map: string; minLevel: number; description: string;
  monsters: number[]; scene: 'field' | 'forest' | 'sewer' | 'cave' | 'sea' | 'orc' | 'desert' | 'castle';
}
export type HuntFocus = 'any' | `monster:${number}` | `element:${string}`;
export interface AreaActivityBucket {
  /** Epoch milliseconds at the start of a one-minute bucket. */
  minute: number; elapsedMs: number; kills: number; deaths: number;
  baseExp: number; jobExp: number; lootZeny: number; damageTaken: number; potions: number;
}
export interface Reward { zeny: number; baseExp: number; jobExp: number; items: Array<{ itemId: number; quantity: number }>; }
export interface Quest {
  id: string; name: string; description: string;
  kind: 'kills' | 'baseLevel' | 'jobLevel' | 'class' | 'area' | 'refine' | 'challenge';
  target: number | string; amount: number; reward: Reward;
}
export interface Challenge {
  id: string; name: string; monsterId: number; category: 'mvp' | 'miniboss'; minLevel: number;
  cooldownMs: number; timeoutMs: number; firstReward: Reward;
}
export interface Catalog {
  version: string; source: { commit: string; files: string[]; hash: string };
  rates: { baseExp: number; jobExp: number; drop: number };
  monsters: Record<number, Monster>; items: Record<number, Item>;
  classes: Record<string, JobClass>; skills: Record<string, Skill>;
  areas: Area[]; quests: Quest[]; challenges: Challenge[];
  exp: { base: number[]; baseTrans?: number[]; job: Record<string, number[]> };
  elementModifiers?: Record<string, Record<string, number[]>>;
  sizeModifiers?: Partial<Record<WeaponType, Record<string, number>>>;
}
export interface InventoryEntry { uid: string; itemId: number; quantity: number; refine: number; cards: number[]; favorite: boolean; }
export interface Battle {
  monsterId: number; hp: number; maxHp: number; startedAt: number;
  playerNextAttackAt: number; enemyNextAttackAt: number;
  attemptId?: string; challengeId?: string; deadlineAt?: number;
}
export interface RewardSummary {
  elapsedMs: number; kills: number; deaths: number; baseExp: number; jobExp: number;
  zeny: number; items: Record<number, number>; potions: number; baseLevels: number; jobLevels: number;
}
export interface GameEvent {
  id: number; at: number; kind: string; text: string;
  amount?: number; target?: 'player' | 'enemy';
  /** Optional presentation metadata. Older persisted events remain valid. */
  skillId?: string; critical?: boolean;
  itemId?: number; quantity?: number; skillLevel?: number;
}
export interface GameState {
  schemaVersion: 1; id: string; revision: number; name: string; gender: 'male' | 'female';
  job: string; family: string | null; branch: string | null; reborn: boolean;
  baseLevel: number; jobLevel: number; baseExp: number; jobExp: number; zeny: number;
  hp: number; sp: number; stats: Stats; statPoints: number; skillPoints: number;
  learnedSkills: Record<string, number>; rotation: string[]; skillReadyAt: Record<string, number>;
  buffs: Record<string, { expiresAt: number; effects: Effects }>;
  inventory: InventoryEntry[]; equipment: Partial<Record<Slot, string>>;
  status: 'town' | 'hunting' | 'challenge' | 'resting' | 'paused';
  areaId: string | null; battle: Battle | null; nextEncounterAt: number; restUntil: number;
  /** Optional for profiles saved before hunt strategy was introduced. */
  pendingAreaId?: string | null; huntFocus?: Record<string, HuntFocus>;
  areaActivity?: Record<string, AreaActivityBucket[]>;
  autoPotion: { hpThreshold: number; spThreshold: number }; potionReadyAt: number; autoResume: boolean;
  bestiary: Record<number, number>; visitedAreas: string[]; quests: Record<string, { claimed: boolean; progress: number }>;
  challengeCooldowns: Record<string, number>; challengeAttempts: number; challengeWins: Record<string, number>;
  rewardedAttempts: string[]; highestRefine: number;
  lastSimulatedAt: number; lastSeenAt: number; rngState: number; nextItemId: number; nextEventId: number;
  totals: RewardSummary; contactTotals: RewardSummary; offlineSummary: RewardSummary | null; events: GameEvent[];
}
export interface DerivedStats {
  maxHp: number; maxSp: number; attack: number; magicAttack: [number, number];
  def: number; mdef: number; hit: number; flee: number; crit: number; attackIntervalMs: number;
  effects: Effects;
}
export interface GameSnapshot {
  state: GameState; stats: DerivedStats; serverTime: number; catalogVersion: string;
  availableClasses: string[]; offlineSummary: RewardSummary | null;
}
export type GameCommand =
  | { type: 'startHunt'; areaId: string }
  | { type: 'setHuntFocus'; areaId: string; focus: HuntFocus }
  | { type: 'stop' | 'rest' | 'sellLoot' | 'rebirth' | 'dismissOffline' }
  | { type: 'setGender'; gender: 'male' | 'female' }
  | { type: 'allocate'; stat: Stat; amount: number }
  | { type: 'learnSkill'; skillId: string }
  | { type: 'setRotation'; skillIds: string[] }
  | { type: 'buy'; itemId: number; quantity: number }
  | { type: 'sell'; uid: string; quantity: number }
  | { type: 'equip' | 'favorite' | 'refine'; uid: string }
  | { type: 'unequip'; slot: Slot }
  | { type: 'socket'; uid: string; cardUid: string }
  | { type: 'changeClass'; classId: string }
  | { type: 'setPotions'; hpThreshold: number; spThreshold: number }
  | { type: 'setAutoResume'; enabled: boolean }
  | { type: 'claimQuest'; questId: string }
  | { type: 'challenge'; challengeId: string };
export interface CommandRequest { requestId: string; command: GameCommand; }
export interface ApiError { error: { code: string; message: string }; snapshot?: GameSnapshot; }
