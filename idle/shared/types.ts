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
  | "book"
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
    | "blockPct"
    | "autoGuardPct"
    | "parryPct",
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
export type PlayerDisease = 'SC_POISON' | 'SC_DPOISON' | 'SC_BLIND';
export interface PlayerStatus {
  startsAt: number; expiresAt: number; level: number; nextTickAt?: number;
  remainingTicks?: number; tickDamage?: number; sourceDurationMs?: number;
  sourceActorId?: string; sourceMonsterId?: number; sourceSkillId?: number; sourceActionId?: string;
}
export interface MonsterStatusSkill {
  baseSp?: number;
  damageType?: 'weapon' | 'magic' | 'misc';
  element?: string;
  hitCount?: number;
  condition?: 'MSC_ALWAYS' | 'MSC_SKILLUSED';
  conditionData?: number;
  state?: 'MSS_BERSERK' | 'MSS_RUSH';
  sourceRowIndex?: number;
  skillId: number; sourceName: 'NPC_POISON' | 'NPC_BLINDATTACK' | 'MG_FIREBOLT' | 'MG_COLDBOLT' | 'MG_LIGHTNINGBOLT' | 'MG_SOULSTRIKE'; level: number;
  rate: number; castTimeMs: number; delayMs: number; range: number; cancelable: boolean;
  status?: 'SC_POISON' | 'SC_BLIND'; durationMs?: number;
}
export interface Monster {
  /** Deliberately selected NPC actions, separate from learnable player skills. */
  npcStatusSkills?: MonsterStatusSkill[];
  boss?: boolean;
  detector?: boolean;
  aggressive?: boolean;
  id: number;
  name: string;
  aegisName: string;
  sprite: SpriteAsset;
  level: number;
  hp: number;
  maxSp?: number;
  attack: [number, number];
  def: number;
  mdef: number;
  /** Runtime status scalar for Hercules SC_MINDBREAKER; absent in source catalog rows. */
  mdefPercent?: number;
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
  noKnockback?: boolean;
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
  /** Statically translated Hercules bDefEle; never evaluates an item script. */
  defenseElement?: string;
  /** Literal Hercules bAtkEle; temporary enchants take precedence. */
  attackElement?: string;
  shop: boolean;
  /** NPC script price, independent of the item database Buy/Sell fields. */
  shopPrice?: number;
  shopDiscount?: boolean;
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
  mountedSprite?: Record<"male" | "female", SpriteAsset>;
  jobBonuses?: Partial<Record<Stat, number[]>>;
  weaponAspd?: Partial<Record<WeaponType | "twoHandSword" | "twoHandSpear" | "twoHandAxe" | "twoHandMace" | "twoHandStaff" | "unarmed" | "shield", number>>;
  /** Per-class source pc_max_aspd converted to minimum player amotion in ms. */
  minimumAttackMotionMs?: number;
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
  /** Idle-only scaling applied after the complete Hercules damage formula. */
  idleDamageMultiplierPct?: number[];
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
  ignoresStatusEffects?: boolean;
  splitDamage?: boolean;
  ignoreDefense?: boolean;
  ignoreElement?: boolean;
  minimumJobLevel?: number;
  prerequisites?: { skillId: string; level: number }[];
  prerequisitesByClass?: Record<string, { skillId: string; level: number }[]>;
  damageType?: "weapon" | "magic" | "misc" | "none";
  implementation?: "supported" | "unsupported";
  manualUse?: "inventory" | "toggle" | "rest" | "mount" | "castCancel" | "converterCraft" | "pharmacyCraft" | "weaponRefine" | "activate" | "inspect" | "teleport";
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
  /** Pinned Hercules SkillInfo.AllowPlagiarism; absent means not copyable. */
  allowPlagiarism?: boolean;
}
export interface Area {
  id: string;
  name: string;
  map: string;
  /** Hercules map flag disables skill knockback. */
  noKnockback?: boolean;
  minLevel: number;
  description: string;
  monsters: number[];
  /** Hercules map spawn counts used as relative ambient encounter weights. */
  spawnWeights?: Record<number, number>;
  scene:
    "field" | "forest" | "sewer" | "cave" | "sea" | "orc" | "desert" | "castle";
  /** Safe rendering metadata; source GAT cells and masks stay server-private. */
  fieldNavigation?: { map: string; origin: { x: number; y: number }; homeOffsets: readonly { x: number; y: number }[] };
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
  /** Pinned Hercules noteleport map flags; absence disables manual Teleport. */
  teleportBlockedMaps?: string[];
  /** Public scene anchors derived from GAT dimensions; collision masks stay server-side. */
  sceneNavigation?: Record<string, { map: string; origin: { x: number; y: number } }>;
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
  /** Pinned pre-renewal Hindsight selection caps, indexed by Hindsight level. */
  autospellChoices?: Record<string, number[]>;
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
  /** Hercules ATTR_BROKEN; absent means intact for existing schemaVersion 1 profiles. */
  broken?: boolean;
}
export interface LootOrigin {
  source: 'monster' | 'reward' | 'quest' | 'challenge' | 'steal' | 'trap' | 'skill';
  areaId?: string;
  enemyId?: string;
  monsterId?: number;
  position?: { x: number; y: number };
  questId?: string;
  challengeId?: string;
}
/** A found item waiting for backpack capacity; its equipment rolls never repeat. */
export interface PendingLoot extends LootOrigin {
  entry: InventoryEntry;
  acquiredAt: number;
}
export type JointBeatPart = 'ankle' | 'wrist' | 'knee' | 'shoulder' | 'waist' | 'neck';
export interface BattleEnemy {
  /** Source maxHP before a NoSave Deluge contribution, not a healed HP value. */
  elementalFieldBaseMaxHp?: number;
  npcCombat?: { firstAttackDone: boolean; readyAt: Record<number, number>; lastUsedAt?: Record<number, number>;
    /** Attack target is independent of a pending skill's retained target. */
    attackTargetActorId?: string; targetReleasedAt?: number; nextTargetCheckAt?: number;
    nextWanderAt?: number; pendingAttackerActorId?: string; pendingAttackerAt?: number; lastReceivedSkillId?: number;
    cast?: {
    skillId: number; level: number; targetActorId: string; startedAt: number; endsAt: number; sourceRowIndex?: number;
    areaId: string | null; actionId: string; baseSp?: number; sourcePosition?: { x: number; y: number };
    clockOwnership?: { attackReadyAt:number; previousAttackReadyAt:number };
  } };
  /** Stable population slot for visible enemies in a hunting area. */
  fieldSlot?: number;
  engaged?: boolean;
  /** Arrival starts here; position is its contact destination until arrivedAt. */
  approachFrom?: { x: number; y: number };
  /** Optional schemaVersion 1 movement waypoints; absent on legacy saves. */
  movementRoute?: { x: number; y: number }[];
  movementTargetKey?: string;
  movementTargetWithinRange?: boolean;
  /** Cached source cell speed for retiming an active route after a speed change. */
  movementSpeedMs?: number;
  /** Immobilization freezes the shared server/client arrival interpolation. */
  approachPausedAt?: number;
  /** Next movement decision while the source SC_CONFUSION is active. */
  confusionWalkAt?: number;
  homePosition?: { x: number; y: number };
  stormGustHits?: number;
  hostile?: boolean;
  stolenItem?: boolean;
  stolenCoin?: boolean;
  /** Hercules monster-instance flag; retained until this instance respawns. */
  soulChangeUsed?: boolean;
  id: string;
  monsterId: number;
  hp: number;
  maxHp: number;
  /** Current monster SP; optional for compatibility with existing saves. */
  sp?: number;
  startedAt: number;
  arrivedAt: number;
  enemyNextAttackAt: number;
  spawnDirection: number;
  /** Last eight-way facing vector, retained after walking stops. */
  facing?: { x: number; y: number };
  position: { x: number; y: number };
  statuses?: Record<
    string,
    {
      expiresAt: number;
      level: number;
      startsAt?: number;
      petrifiesAt?: number;
      nextTickAt?: number;
      trapId?: string;
      groundId?: string;
      webCharges?: number;
      webHeld?: boolean;
      element?: string;
      elementLevel?: number;
      /** Bomb ownership; old status records remain valid without these fields. */
      skillId?: string;
      sourceActorId?: string;
      sourceActionId?: string;
      /** Hercules SC_JOINTBEAT BREAK_FLAGS accumulated on this monster instance. */
      parts?: JointBeatPart[];
      /** Hercules SC_BLADESTOP reciprocally locks one actor pair. */
      partnerActorId?: string;
      /** Hercules SC_DONTFORGETME translated source ASPD and movement penalties. */
      attackDelayPct?: number;
      moveSlowPct?: number;
      attackPercent?: number;
      hitPercent?: number;
      fleePercent?: number;
      defensePercent?: number;
      /** Hercules SC_MINDBREAKER and Tarot statuses modify monster MATK. */
      magicAttackPct?: number;
      mdefPercent?: number;
    }
  >;
}
export type SenseElementRates = [number, number, number, number, number, number, number, number, number];
export interface SenseInspectionResult {
  sourceSkill: 'WZ_ESTIMATION';
  actorId: string;
  monsterId: number;
  areaId: string | null;
  challengeId?: string;
  fieldGeneration?: number;
  observedAt: number;
  classId: number;
  level: number;
  size: string;
  currentHp: number;
  def: number;
  race: string;
  mdef: number;
  element: string;
  elementLevel: number;
  elementRates: SenseElementRates;
}
export interface SkillClockOwnership { readyAt: number; previousReadyAt?: number }
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
    skillClockOwnership?: SkillClockOwnership;
    clockOwnership?: { actionReadyAt?: number; previousActionReadyAt?: number; nextSkillAt?: number; previousNextSkillAt?: number; moveBlockedUntil?: number; previousMoveBlockedUntil?: number };
  };
  groundEffects?: {
    groundPlacementId?: string;
    skillId: string;
    level: number;
    position: { x: number; y: number };
    nextTickAt: number;
    expiresAt: number;
    remainingHits?: number;
    targetId?: string;
    intervalMs?: number;
  }[];
  /** Source ground groups retain individual cells for partial removal. */
  skillUnits?: {
    groundPlacementId?: string;
    id: string;
    skillId: string;
    level: number;
    position: { x: number; y: number };
    cells: { x: number; y: number }[];
    placedAt: number;
    nextTickAt: number;
    expiresAt: number;
    capturedEnemyId?: string;
    targetTickAt?: Record<string, number>;
    nextSpDrainAt?: number;
    sourceActionId?: string;
    slowValues?: { attackDelayPct: number; moveSlowPct: number };
  }[];
  /** Persistent hunter skill units; resources are spent only when placed. */
  traps?: {
    groundPlacementId?: string;
    id: string;
    skillId: string;
    level: number;
    position: { x: number; y: number };
    placedAt: number;
    nextTickAt: number;
    expiresAt: number;
    triggeredAt?: number;
    capturedEnemyId?: string;
  }[];
  delayedSkills?: {
    skillId: string;
    level: number;
    targetId: string;
    position: { x: number; y: number };
    endsAt: number;
    effect?: "doublecast";
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
  /** Secondary Falcon effect follows this swing in presentation only. */
  triggerActionId?: string;
  statusName?: string;
  id: number;
  at: number;
  kind: string;
  text: string;
  amount?: number;
  /** Restoration resource; absent on historical HP heal events. */
  resource?: 'hp' | 'sp';
  target?: "player" | "enemy";
  /** Optional presentation metadata. Older persisted events remain valid. */
  skillId?: string;
  critical?: boolean;
  itemId?: number;
  quantity?: number;
  attempts?: number;
  failures?: number;
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
  /** Source position at the action deadline, before subsequent route replans. */
  actionSourcePosition?: { x: number; y: number };
  /** Optional immediate movement endpoint for native skill actions; old events omit it. */
  movementDestination?: { x: number; y: number };
  /** Facing captured at action time for movements whose presentation spans later server ticks. */
  actionFacing?: { x: number; y: number };
  hitMotionMs?: number;
  /** Exact health before resolving this hit; optional for older saved events. */
  targetHpBefore?: number;
}
export type SageFieldSource = 'SA_VOLCANO' | 'SA_DELUGE' | 'SA_VIOLENTGALE';
export interface GroundPlacement {
  id: string;
  ownerActorId: string;
  allocationOrder?: number;
  skillId: string;
  sourceName: string;
  level: number;
  sceneKey: string;
  map: string;
  cellOffset: { x: number; y: number };
  cells: { x: number; y: number }[];
  range: number;
  placedAt: number;
  expiresAt: number;
  /** FogWall's Deluge overlap doubles individual unit limits, not every cell. */
  cellExpiresAt?: Record<string, number>;
  /** Translate the existing unit processor's integer cells into this GAT frame. */
  logicalCellOffset?: { x: number; y: number };
  /** Link early depletion to the existing effect processor in this encounter. */
  binding?: 'groundEffect' | 'skillUnit' | 'defensiveGround' | 'trap';
  battleStartedAt?: number;
}
export interface ElementalFieldEntry {
  enteredAt: number;
  statusExpiresAt: number;
  defenseElement: string;
  weaponAttack: number;
  flee: number;
  hpPercent: number;
}
export interface ElementalField {
  id: string;
  ownerActorId: string;
  allocationOrder?: number;
  skillId: string;
  sourceName: SageFieldSource;
  level: number;
  sceneKey: string;
  map?: string;
  /** Affine GAT transform: gridPoint = battlePoint*12 + cellOffset. */
  cellOffset: { x: number; y: number };
  cells: { x: number; y: number }[];
  placedAt: number;
  expiresAt: number;
  /** Raw group limit passed to a status on entry. Replacement uses remaining time. */
  durationMs: number;
  occupants: Record<string, ElementalFieldEntry>;
}
export interface FalconStrike {
  triggerActionId?: string;
  id: string;
  sourceActorId: string;
  sceneKey: string;
  areaId?: string;
  skillId: string;
  level: number;
  automatic: boolean;
  launchedAt: number;
  impactAt: number;
  sourcePosition: { x: number; y: number };
  targets: { enemyId: string; monsterId: number; damage: number; maxDistance: number; hitMotionMs: number }[];
}
export interface WeaponRefineMenu {
 id:string; openedAt:number; catalogVersion:string; learnedLimit:number;
 sceneKey:string; deaths:number;
 offeredWeapons:{uid:string;itemId:number;signature:string}[];
}
export interface WeaponRefineResult {
 menuId:string; outcome:'success'|'failed'|'cancelled'|'rejected'|'empty';
 uid?:string;itemId?:number;fromRefine?:number;toRefine?:number;reasonCode?:string;message?:string;
}
export interface GameState {
 weaponRefineMenu?:WeaponRefineMenu;
 weaponRefineResult?:WeaponRefineResult;
  /** Final Falcon damage waits for native amotion independently of the current battle. */
  falconStrikes?: FalconStrike[];
  /** Fixed source footprints of successful casts; separate from damage/status adaptations. */
  groundPlacements?: GroundPlacement[];
  /** Source NoSave owned field; lives across battle replacement only in this session. */
  elementalField?: ElementalField;
  playerStatuses?: Partial<Record<PlayerDisease | 'SC_SILENCE' | 'SC_CONFUSION' | 'SC_BITESCAR', PlayerStatus>>;
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  gender: "male" | "female";
  /** Optional only for profiles written before appearance customization existed. */
  appearance?: Appearance;
  job: string;
  /** Peco option; missing on legacy profiles means dismounted. */
  mounted?: boolean;
  /** Native OPTION_FALCON, independent from learned Falconry; absent legacy flag means false. */
  falconEquipped?: boolean;
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
  /** Optional cast preferences; absence means the maximum learned level. */
  skillUseLevels?: Record<string, number>;
  /** Temporary Plagiarism overlay, independent of paid skill levels and points. */
  copiedSkill?: { skillId: string; level: number };
  rotation: string[];
  /** Optional per-map automation order; missing profiles inherit rotation. */
  rotationByArea?: Record<string, string[]>;
  autospellSkillId?: string;
  skillReadyAt: Record<string, number>;
  buffs: Record<string, { expiresAt: number; effects: Effects; startsAt?: number }>;
  recovery?: {
    hpMs: number;
    spMs: number;
    /** Legacy shared passive timer, retained for saved profile compatibility. */
    skillMs: number;
    skillHpMs?: number;
    skillSpMs?: number;
    sittingHpMs?: number;
    sittingSpMs?: number;
  };
  combatEffects?: {
    poisonReact?: { charges: number };
    rejectSword?: { charges: number };
    /** Frenzy drain is captured at activation and survives reconnects. */
    berserk?: { nextTickAt: number; drainHp: number; remainingTicks: number };
    tensionRelax?: { nextTickAt: number; remainingTicks: number };
    /** PA_GOSPEL self-status resource pulses while hunting. */
    battleChant?: { nextTickAt: number; remainingTicks: number; level: number };
    regenBlockedUntil?: number;
    buffDrainAt?: Record<string, number>;
    buffLevels?: Record<string, number>;
    safetyWallHits?: number;
    magicPower?: number;
    energyCoat?: boolean;
    kyrieHp?: number;
    kyrieHits?: number;
    spiritSpheres?: number;
    consumedSpheres?: number;
    /** Active choice is a cast-time snapshot, independent of the configured choice. */
    autospell?: { skillId: string; level: number };
    memorizeCharges?: number;
    endure?: { level: number; charges: number; expiresAt: number; infinite?: boolean };
    /** Fixed source map cells: defensive ground never follows a moving caster. */
    pneumaGround?: { cells: { x: number; y: number }[]; expiresAt: number; sceneKey: string };
    safetyWallGround?: { cells: { x: number; y: number }[]; expiresAt: number; sceneKey: string };
    defensiveGrounds?: {
      groundPlacementId?: string;
      kind: "pneumaGround" | "safetyWallGround";
      cells: { x: number; y: number }[];
      expiresAt: number;
      sceneKey: string;
      hits?: number;
    }[];
    combo?: { sourceName: string; expiresAt: number };
    sacrifice?: { level: number; charges: number };
    /** Source NoSave Blade Stop wait/link; stripped from durable profile JSON. */
    bladeStopWait?: { level: number; startsAt?: number; expiresAt: number };
    bladeStopLink?: { level: number; partnerActorId: string; areaId: string | null; expiresAt: number };
  };
  inventory: InventoryEntry[];
  /** Optional for schemaVersion 1 saves; pending rewards are owned by this profile. */
  pendingLoot?: PendingLoot[];
  /** Idle's automatic return after reaching the source 90% combat weight limit. */
  carryReturnAt?: number;
  /** Finish effects at this instant before the automatic carry-limit return. */
  carryReturnRequestedAt?: number;
  equipment: Partial<Record<Slot, string>>;
  status: "town" | "hunting" | "challenge" | "resting" | "paused";
  /** Last server-facing direction, retained while a defensive posture stops walking. */
  playerFacing?: { x: number; y: number };
  areaId: string | null;
  fieldHero?: {
    areaId: string;
    from: { x: number; y: number };
    position: { x: number; y: number };
    startedAt: number;
    arrivedAt: number;
    routeIndex: number;
    /** Optional schemaVersion 1 movement waypoints; absent on legacy saves. */
    movementRoute?: { x: number; y: number }[];
    movementTargetKey?: string;
    movementTargetWithinRange?: boolean;
    /** Cached source cell speed for retiming an active route after a speed change. */
    movementSpeedMs?: number;
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
  /** Source actor canact; absent in old saves, never inferred from a basic swing. */
  playerCanActAt?: number;
  /** Own self-target skill cast; unlike Battle.cast this also works in Prontera. */
  supportCast?: { skillId: string; level: number; startedAt: number; endsAt: number; actionId: string;
    skillClockOwnership?: SkillClockOwnership;
    /** Ground casts retain the selected map position even when FreeCast moves. */
    position?: { x: number; y: number }; sceneKey?: string;
    battleClockOwnership?: { actionReadyAt?: number; nextSkillAt?: number; nextAttackAt?: number;
      ownedActionReadyAt?: number; ownedNextSkillAt?: number;
      battleIdentity?: { startedAt: number; attemptId?: string; challengeId?: string; areaId: string | null } } };
  /** One immutable, actor-bound WZ_ESTIMATION result; absent in older saves. */
  senseInspection?: SenseInspectionResult;
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
  sourceAttackPercent?: number;
  sourceDefensePercent?: number;
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
  /** Hercules amotion after source modifiers; distinct from doubled adelay. */
  attackMotionMs: number;
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
  | { type: 'weaponRefine'; menuId: string; uid: string }
  | { type: 'cancelWeaponRefine'; menuId: string }
  | { type: 'teleport'; destination: 'random' | 'save' }
  | { type: "startHunt"; areaId: string }
  | { type: "setHuntFocus"; areaId: string; focus: HuntFocus }
  | { type: "stop" | "rest" | "sellLoot" | "rebirth" | "dismissOffline" | "repairAll" | "collectPendingLoot" }
  | { type: "setGender"; gender: "male" | "female" }
  | { type: "changeAppearance"; hairStyle: number; hairColor: number; clothesColor: number }
  | { type: "allocate"; stat: Stat; amount: number }
  | { type: "learnSkill"; skillId: string }
  | { type: "setRotation"; skillIds: string[]; areaId?: string }
  | { type: "setSkillUseLevel"; skillId: string; level: number | null }
  | { type: "setAutospell"; skillId: string | null }
  | { type: "cancelBuff"; skillId: string }
  | { type: "toggleBuff"; skillId: string }
  | { type: "useSkill"; skillId: string; expectedCastActionId?: string; expectedEnemyId?: string }
  | { type: "setMount"; mounted: boolean }
  | { type: "rentFalcon" | "dismissFalcon" }
  | { type: "buy"; itemId: number; quantity: number }
  | { type: "craftConverter"; itemId: number; quantity: number }
  | { type: "craftPharmacy"; itemId: number; quantity: number }
  | { type: "sell"; uid: string; quantity: number }
  | { type: "equip" | "favorite" | "refine"; uid: string }
  | { type: "identify"; uid: string; method?: "magnifier" | "skill" }
  | { type: "unequip"; slot: Slot }
  | { type: "socket"; uid: string; cardUid: string }
  | { type: "changeClass"; classId: string }
  | { type: "consumeItem"; uid: string }
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
