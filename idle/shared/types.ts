// Public contracts. Times and cooldowns are milliseconds; chances are 0..10000.
export type Stat = "str" | "agi" | "vit" | "int" | "dex" | "luk";
export type Stats = Record<Stat, number>;
export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Slot =
  "weapon" | "armor" | "shield" | "head" | "garment" | "shoes" | "accessory";
export type WeaponType =
  | "dagger"
  | "sword"
  | "spear"
  | "bow"
  | "staff"
  | "mace"
  | "axe"
  | "katar"
  | "instrument"
  | "whip";
export type Effects = Partial<
  Record<
    | Stat
    | "atk"
    | "matk"
    | "def"
    | "mdef"
    | "hp"
    | "sp"
    | "hit"
    | "flee"
    | "crit"
    | "aspd"
    | "damagePct"
    | "neutralResist"
    | "perfectDodge"
    | "castReductionPct"
    | "afterCastReductionPct"
    | "spCostReductionPct"
    | "hpPct"
    | "spPct"
    | "defPct"
    | "softDefPct"
    | "physicalResistPct"
    | "reflectPct"
    | "blockPct",
    number
  >
>;
export interface Appearance {
  /** Hercules hair style IDs: 0–27. Client hair assets start at 1. */
  hairStyle: number;
  /** Hercules hair palette IDs: 0 keeps the sprite's default palette. */
  hairColor: number;
  /** Hercules clothes palette IDs: 0 keeps the sprite's default palette. */
  clothesColor: number;
}
export const DEFAULT_APPEARANCE: Appearance = Object.freeze({
  hairStyle: 0,
  hairColor: 0,
  clothesColor: 0,
});
export interface SpriteAsset {
  spr: string;
  act: string;
  headSpr?: string;
  headAct?: string;
}
export interface Drop {
  itemId: number;
  chance: number;
}
export interface Monster {
  boss?: boolean;
  detector?: boolean;
  aggressive?: boolean;
  id: number;
  name: string;
  aegisName: string;
  sprite: SpriteAsset;
  level: number;
  hp: number;
  attack: [number, number];
  def: number;
  mdef: number;
  stats: Stats;
  baseExp: number;
  jobExp: number;
  attackDelay: number;
  /** Hercules attack and damage animation motion, independent of attack delay. */
  attackMotionMs?: number;
  damageMotionMs?: number;
  attackRange?: number;
  /** Source milliseconds per walked cell; optional for older catalogs. */
  moveSpeedMs?: number;
  canMove?: boolean;
  viewRange?: number;
  chaseRange?: number;
  element: string;
  elementLevel: number;
  size: string;
  race: string;
  drops: Drop[];
  mvpDrops?: Drop[];
}
export interface Item {
  id: number;
  name: string;
  aegisName: string;
  type: "loot" | "consumable" | "equipment" | "card" | "material";
  slot?: Slot;
  weaponType?: WeaponType;
  attack: number;
  def: number;
  slots: number;
  minLevel: number;
  allowedClasses: string[];
  buyPrice: number;
  sellPrice: number;
  weight: number;
  resource: string;
  healHP?: number;
  healSP?: number;
  effects: Effects;
  cardSlots?: Slot[];
  shop: boolean;
  twoHanded?: boolean;
  refinable?: boolean;
  weaponLevel?: number;
  attackRange?: number;
  /** Hercules item mechanics omitted from the idle rules are inert. */
  unsupportedEffect?: boolean;
  /** Original gear with a slot or weapon subtype unavailable in the idle engine. */
  equipSupported?: boolean;
}
export interface JobClass {
  id: string;
  name: string;
  family: string;
  tier: 0 | 1 | 2;
  trans: boolean;
  parent?: string;
  minJobLevel: number;
  gender?: "male" | "female";
  rebirthOf?: string;
  weapons: WeaponType[];
  skills: string[];
  jobCap: number;
  expGroup: string;
  // HP/SP arrays: index 0 is Base level 1. EXP arrays below: index n is EXP to leave level n.
  hp: number[];
  sp: number[];
  sprite: Record<"male" | "female", SpriteAsset>;
  jobBonuses?: Partial<Record<Stat, number[]>>;
  weaponAspd?: Partial<Record<WeaponType | "unarmed" | "shield", number>>;
  baseWeight?: number;
  attackMotion?: Record<string, number>;
}
export interface Skill {
  id: string;
  name: string;
  description: string;
  kind: "physical" | "magical" | "heal" | "buff" | "passive" | "steal";
  maxLevel: number;
  spCost: number[];
  power: number[];
  cooldownMs: number;
  /** Original client BMP from the skill's Hercules source name. */
  iconResource?: string;
  element?: string;
  effects?: Effects;
  durationMs?: number;
  zenyCost?: number[];
  itemCost?: { itemId: number; quantity: number };
  requiredWeapon?: WeaponType[];
  requiredSlot?: Slot;
  herculesId?: number;
  sourceName?: string;
  mechanic?: string;
  castTimeMs?: number[];
  afterCastDelayMs?: number[];
  hitCount?: number[];
  sourceHitCount?: number[];
  aoeRadius?: number[];
  range?: number[];
  rangeBonusByVulture?: boolean;
  groundDurationMs?: number[];
  groundIntervalMs?: number;
  statusEffect?: string;
  statusDurationMs?: number[];
  statusChance?: number[];
  targetType?: "enemy" | "self" | "ground" | "support" | "passive";
  ignoresDex?: boolean;
  splitDamage?: boolean;
  ignoreDefense?: boolean;
  ignoreElement?: boolean;
  minimumJobLevel?: number;
  prerequisites?: { skillId: string; level: number }[];
  prerequisitesByClass?: Record<string, { skillId: string; level: number }[]>;
  damageType?: "weapon" | "magic" | "misc" | "none";
  implementation?: "supported" | "unsupported";
  unsupportedReason?: string;
  itemCostByLevel?: { itemId: number; quantity: number }[][];
  requiredState?: string;
  requiredTwoHanded?: boolean;
  hpCostPercent?: number;
  hpCost?: number[];
  sphereCost?: number[];
  spDrainIntervalMs?: number[];
  spDrainAmount?: number;
  toggle?: boolean;
  effectDelayMs?: number;
  groundHitLimit?: number;
  ignoreFlee?: boolean;
  interruptCast?: boolean;
  castDefenseReductionPct?: number;
}
export interface Area {
  id: string;
  name: string;
  map: string;
  minLevel: number;
  description: string;
  monsters: number[];
  scene:
    "field" | "forest" | "sewer" | "cave" | "sea" | "orc" | "desert" | "castle";
}
export type HuntFocus = "any" | `monster:${number}` | `element:${string}`;
export interface AreaActivityBucket {
  /** Epoch milliseconds at the start of a one-minute bucket. */
  minute: number;
  elapsedMs: number;
  kills: number;
  deaths: number;
  baseExp: number;
  jobExp: number;
  lootZeny: number;
  damageTaken: number;
  potions: number;
}
export interface Reward {
  zeny: number;
  baseExp: number;
  jobExp: number;
  items: Array<{ itemId: number; quantity: number }>;
}
export interface Quest {
  id: string;
  name: string;
  description: string;
  kind:
    | "kills"
    | "baseLevel"
    | "jobLevel"
    | "class"
    | "area"
    | "refine"
    | "challenge";
  target: number | string;
  amount: number;
  reward: Reward;
}
export interface Challenge {
  id: string;
  name: string;
  monsterId: number;
  category: "mvp" | "miniboss";
  minLevel: number;
  cooldownMs: number;
  timeoutMs: number;
  firstReward: Reward;
}
export interface Catalog {
  version: string;
  source: { commit: string; files: string[]; hash: string };
  rates: { baseExp: number; jobExp: number; drop: number };
  monsters: Record<number, Monster>;
  items: Record<number, Item>;
  classes: Record<string, JobClass>;
  skills: Record<string, Skill>;
  areas: Area[];
  quests: Quest[];
  challenges: Challenge[];
  exp: { base: number[]; baseTrans?: number[]; job: Record<string, number[]> };
  elementModifiers?: Record<string, Record<string, number[]>>;
  sizeModifiers?: Partial<Record<WeaponType, Record<string, number>>>;
}
export interface InventoryEntry {
  uid: string;
  itemId: number;
  quantity: number;
  refine: number;
  cards: number[];
  favorite: boolean;
  /** Missing fields preserve equipment from profiles saved before loot identification. */
  identified?: boolean;
  rarity?: ItemRarity;
  rarityBonus?: { stat: Stat; value: number };
}
export interface BattleEnemy {
  /** Stable population slot for visible enemies in a hunting area. */
  fieldSlot?: number;
  engaged?: boolean;
  /** Arrival starts here; position is its contact destination until arrivedAt. */
  approachFrom?: { x: number; y: number };
  /** Immobilization freezes the shared server/client arrival interpolation. */
  approachPausedAt?: number;
  homePosition?: { x: number; y: number };
  stormGustHits?: number;
  hostile?: boolean;
  stolenItem?: boolean;
  stolenCoin?: boolean;
  id: string;
  monsterId: number;
  hp: number;
  maxHp: number;
  startedAt: number;
  arrivedAt: number;
  enemyNextAttackAt: number;
  spawnDirection: number;
  position: { x: number; y: number };
  statuses?: Record<
    string,
    {
      expiresAt: number;
      level: number;
      startsAt?: number;
      petrifiesAt?: number;
      nextTickAt?: number;
    }
  >;
}
export interface Battle {
  monsterId: number;
  hp: number;
  maxHp: number;
  startedAt: number;
  playerNextAttackAt: number;
  /** Optional clocks preserve encounters saved before independent action timing. */
  playerNextSkillAt?: number;
  playerActionReadyAt?: number;
  /** Automatic support waits for a basic attack or an offensive skill. */
  supportNeedsOffense?: boolean;
  /** Bounded authoritative movement decisions for a persistent field session. */
  fieldDecisionAt?: number;
  fieldTransferReady?: boolean;
  enemyNextAttackAt: number;
  attemptId?: string;
  challengeId?: string;
  deadlineAt?: number;
  enemies?: BattleEnemy[];
  targetId?: string;
  cast?: {
    skillId: string;
    level: number;
    targetId: string;
    startedAt: number;
    endsAt: number;
    position?: { x: number; y: number };
    actionId?: string;
    afterCastDelayMs?: number;
  };
  groundEffects?: {
    skillId: string;
    level: number;
    position: { x: number; y: number };
    nextTickAt: number;
    expiresAt: number;
    remainingHits?: number;
    targetId?: string;
    intervalMs?: number;
  }[];
  delayedSkills?: {
    skillId: string;
    level: number;
    targetId: string;
    position: { x: number; y: number };
    endsAt: number;
  }[];
}
export interface RewardSummary {
  elapsedMs: number;
  kills: number;
  deaths: number;
  baseExp: number;
  jobExp: number;
  zeny: number;
  items: Record<number, number>;
  potions: number;
  baseLevels: number;
  jobLevels: number;
}
export interface GameEvent {
  id: number;
  at: number;
  kind: string;
  text: string;
  amount?: number;
  target?: "player" | "enemy";
  /** Optional presentation metadata. Older persisted events remain valid. */
  skillId?: string;
  critical?: boolean;
  itemId?: number;
  quantity?: number;
  skillLevel?: number;
  enemyId?: string;
  /** Exact source point and area at the event deadline for corpses and loot. */
  enemyPosition?: { x: number; y: number };
  areaId?: string;
  monsterId?: number;
  castMs?: number;
  hitCount?: number;
  sourceActorId?: string;
  targetActorId?: string;
  /** One source action can have several target effects (for example an AoE). */
  actionId?: string;
  actorAction?: "attack" | "skill" | "none";
  actionStartedAt?: number;
  actionMotionMs?: number;
  hitMotionMs?: number;
}
export interface GameState {
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  gender: "male" | "female";
  /** Optional only for profiles written before appearance customization existed. */
  appearance?: Appearance;
  job: string;
  family: string | null;
  branch: string | null;
  reborn: boolean;
  baseLevel: number;
  jobLevel: number;
  baseExp: number;
  jobExp: number;
  zeny: number;
  hp: number;
  sp: number;
  stats: Stats;
  statPoints: number;
  skillPoints: number;
  learnedSkills: Record<string, number>;
  rotation: string[];
  skillReadyAt: Record<string, number>;
  buffs: Record<string, { expiresAt: number; effects: Effects }>;
  recovery?: {
    hpMs: number;
    spMs: number;
    /** Legacy shared passive timer, retained for saved profile compatibility. */
    skillMs: number;
    skillHpMs?: number;
    skillSpMs?: number;
  };
  combatEffects?: {
    buffDrainAt?: Record<string, number>;
    buffLevels?: Record<string, number>;
    safetyWallHits?: number;
    magicPower?: number;
    energyCoat?: boolean;
    kyrieHp?: number;
    kyrieHits?: number;
    spiritSpheres?: number;
    consumedSpheres?: number;
    combo?: { sourceName: string; expiresAt: number };
  };
  inventory: InventoryEntry[];
  equipment: Partial<Record<Slot, string>>;
  status: "town" | "hunting" | "challenge" | "resting" | "paused";
  areaId: string | null;
  fieldHero?: {
    areaId: string;
    from: { x: number; y: number };
    position: { x: number; y: number };
    startedAt: number;
    arrivedAt: number;
    routeIndex: number;
    phase?: "seeking" | "chasing" | "fighting" | "waiting";
    targetId?: string;
    moveBlockedUntil?: number;
  };
  /** Visible hunt population persists while the adventurer rests in the field. */
  fieldPopulation?: {
    areaId: string;
    generation: number;
    enemies: BattleEnemy[];
    respawns: Array<{ slot: number; at: number }>;
  };
  battle: Battle | null;
  /** Offline cap suspends this intent without discarding the active encounter. */
  pausedStatus?: "town" | "hunting" | "challenge" | "resting";
  pausedAt?: number;
  nextEncounterAt: number;
  restUntil: number;
  /** Older resting profiles follow the town recovery flow. */
  restMode?: "field" | "recovery";
  /** Optional for profiles saved before hunt strategy was introduced. */
  pendingAreaId?: string | null;
  huntFocus?: Record<string, HuntFocus>;
  areaActivity?: Record<string, AreaActivityBucket[]>;
  autoPotion: { hpThreshold: number; spThreshold: number };
  potionReadyAt: number;
  autoResume: boolean;
  bestiary: Record<number, number>;
  visitedAreas: string[];
  quests: Record<string, { claimed: boolean; progress: number }>;
  challengeCooldowns: Record<string, number>;
  challengeAttempts: number;
  challengeWins: Record<string, number>;
  rewardedAttempts: string[];
  highestRefine: number;
  lastSimulatedAt: number;
  lastSeenAt: number;
  rngState: number;
  nextItemId: number;
  nextEventId: number;
  totals: RewardSummary;
  contactTotals: RewardSummary;
  offlineSummary: RewardSummary | null;
  events: GameEvent[];
}
export interface DerivedStats {
  baseAttack?: number;
  aspd?: number;
  perfectDodge?: number;
  maxHp: number;
  maxSp: number;
  attack: number;
  magicAttack: [number, number];
  def: number;
  mdef: number;
  hit: number;
  flee: number;
  crit: number;
  attackIntervalMs: number;
  effects: Effects;
  attributes?: Stats;
  weaponAttack?: number;
  weaponRefineAttack?: number;
  weaponLevel?: number;
  softDef?: number;
  hardMdef?: number;
  softMdef?: number;
}
export interface GameSnapshot {
  state: GameState;
  stats: DerivedStats;
  serverTime: number;
  catalogVersion: string;
  availableClasses: string[];
  offlineSummary: RewardSummary | null;
}
export type GameCommand =
  | { type: "startHunt"; areaId: string }
  | { type: "setHuntFocus"; areaId: string; focus: HuntFocus }
  | { type: "stop" | "rest" | "sellLoot" | "rebirth" | "dismissOffline" }
  | { type: "setGender"; gender: "male" | "female" }
  | { type: "changeAppearance"; hairStyle: number; hairColor: number; clothesColor: number }
  | { type: "allocate"; stat: Stat; amount: number }
  | { type: "learnSkill"; skillId: string }
  | { type: "setRotation"; skillIds: string[] }
  | { type: "buy"; itemId: number; quantity: number }
  | { type: "sell"; uid: string; quantity: number }
  | { type: "equip" | "favorite" | "refine" | "identify"; uid: string }
  | { type: "unequip"; slot: Slot }
  | { type: "socket"; uid: string; cardUid: string }
  | { type: "changeClass"; classId: string }
  | { type: "setPotions"; hpThreshold: number; spThreshold: number }
  | { type: "setAutoResume"; enabled: boolean }
  | { type: "claimQuest"; questId: string }
  | { type: "challenge"; challengeId: string };
export interface CommandRequest {
  requestId: string;
  command: GameCommand;
}
export interface ApiError {
  error: { code: string; message: string };
  snapshot?: GameSnapshot;
}
