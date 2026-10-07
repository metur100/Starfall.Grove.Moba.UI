// Messages between the Mini Rift server (Starfall.Grove.Moba.API) and this client. Mirrors Protocol.cs and the hub.

export type Target = 'self' | 'point' | 'direction' | 'enemy' | 'ally';
export type AbilityDef = {
  id: string; name: string; slot: number; cooldown: number; cost: number; range: number; radius: number; power: number;
  duration: number; cc: number; speed: number; windup: number; target: Target; toggle: boolean; effects: string;
};
export type HeroDef = {
  id: string; name: string; title: string; role: string; difficulty: number; hp: number; hpPerLevel: number; resource: string;
  mana: number; manaRegen: number; armor: number; speed: number; adPerLevel: number; crit: number; melee: boolean; abilities: AbilityDef[];
  /** The two abilities a duellist upgrades before each round. */
  duelSlots: number[];
};
export type UpgradeOption = { id: string; name: string; text: string };
export type MapInfo = { id: string; name: string; theme: string; type: 'battle' | 'duel'; lanes: number; blurb: string };
export type SkinTier = 'rare' | 'epic' | 'legendary';
export type SkinDef = { id: string; hero: string; name: string; tier: SkinTier; price: number };
export type CharmDef = { id: string; name: string; text: string; cooldown: number; duelCooldown: number };
export type RankDef = { name: string; min: number };
/** What can be bought and chosen (Economy.cs). */
export type Shop = { heroPrices: Record<string, number>; skins: SkinDef[]; charms: CharmDef[]; ranks: RankDef[]; firstWinBonus: number; starters: string[] };
export type Catalog = {
  heroes: HeroDef[]; basicTiers: UpgradeOption[][]; abilityTiers: UpgradeOption[][];
  basicCost: number[]; abilityCost: number[]; ultCost: number[]; ultLevel: number; maxLevel: number; maps: MapInfo[];
  shop: Shop;
};

export type MatchType = 'battle' | 'duel';
export type MatchRecord = { hero: string; type: MatchType; mode: number; won: boolean; k: number; d: number; a: number; coins: number; ranked: boolean; at: string };
/** The player's lasting progress (Profiles.cs). */
export type Profile = {
  id: string; name: string; coins: number; level: number; xp: number; xpNext: number; heroes: string[]; skins: string[];
  equipped: Record<string, string>; charm: string; rating: Record<MatchType, number>; rank: Record<MatchType, string>;
  games: number; wins: number; kills: number; deaths: number; assists: number; heroStats: Record<string, [number, number]>;
  firstWinReady: boolean; rotation: string[]; recent: MatchRecord[];
};
export type HelloResult = { ok: boolean; error: string | null; profile: Profile | null };
export type ShopResult = { error: string | null; profile: Profile | null };
export type QueueStatus = { state: 'idle' | 'searching' | 'found'; type: MatchType | null; mode: number; waited: number; searching: number; botsIn: number };
export type MatchFound = { id: string; type: MatchType; mode: number; accepted: number; total: number; timeLeft: number; youAccepted: boolean; bots: number };
export type RewardLine = { label: string; coins: number };
export type Rewards = {
  won: boolean; coins: number; xp: number; lines: RewardLine[]; levelFrom: number; xpFrom: number; xpNextFrom: number; levelTo: number; xpTo: number; xpNextTo: number;
  ranked: boolean; type: MatchType; ratingDelta: number; rating: number; rank: string; rankFrom: string;
};
export type LeaderRow = { name: string; level: number; rating: number; rank: string; wins: number; games: number };
export type RoomListing = { code: string; host: string; mode: number; map: string; type: MatchType; players: number; seats: number };

export type Phase = 'lobby' | 'heroSelect' | 'loading' | 'starting' | 'playing' | 'ended';
export type RoomPlayer = { id: string; name: string; team: number; ready: boolean; bot: boolean; connected: boolean; hero: string | null; locked: boolean; skin: string | null; level: number; charm: string };
export type RoomView = { code: string; phase: Phase; mode: number; map: string; type: MatchType; hostId: string; you: string; timer: number; players: RoomPlayer[]; winner: number; matchmade: boolean; public: boolean };
export type JoinResult = { ok: boolean; error: string | null; code: string | null; playerId: string | null };

/** Status flags (St in Entities.cs). */
export const ST = {
  stun: 1, root: 2, slow: 4, shell: 8, stealth: 16, guard: 32, spin: 64, shield: 128, stars: 256, dead: 512, blessed: 1024,
  marked: 2048, empowered: 4096, casting: 8192, frenzy: 16384, invulnerable: 32768, dashing: 65536, recall: 131072, haste: 262144,
} as const;

/** f: facing in degrees; st: ST flags; lv: hero level; sh: shield; n: Guardian Stars still circling. */
export type UnitSnap = { i: number; k: string; tm: number; x: number; y: number; hp: number; mh: number; f: number; st: number; lv: number; sh: number; n: number };
export type ProjSnap = { i: number; k: string; x: number; y: number; vx: number; vy: number; tm: number };
export type ZoneSnap = { i: number; k: string; x: number; y: number; r: number; tm: number; t: number };
/** Kill fx: v is the killer's multikill count, n their streak, s "shutdown" when a streak was ended. Damage fx: u2 is
 *  who dealt it (on heroes). Attack fx: u2 is the target. */
export type Fx = { e: string; u?: number; u2?: number; x?: number; y?: number; x2?: number; y2?: number; v?: number; r?: number; k?: string; tm?: number; n?: number; s?: string };
/** dm: damage dealt to enemy heroes, hl: healing given to allies. */
export type PlayerStat = { id: string; u: number; k: number; d: number; a: number; lv: number; rs: number; dm: number; hl: number };
export type Snapshot = {
  t: number; u: UnitSnap[]; p: ProjSnap[]; z: ZoneSnap[]; fx: Fx[]; sc: [number, number]; ps: PlayerStat[];
  pa: number; ob: number; sd: number; fv: number;
  /** Duels: round, rounds won [blue, red], phase (0 countdown, 1 fight, 2 over), seconds left, closing ring radius. */
  rd: number; rw: [number, number]; rp: number; rt: number; rr: number;
  /** Duels: 1 while the Starshard waits in the middle of the ring. */
  ss: number;
};
export type Me = {
  u: number; g: number; lv: number; xp: number; xn: number; mp: number; mm: number; cd: number[]; cm: number[]; mc: number[];
  up: string[][]; rs: number; sp: number; vx: number; vy: number; ad: number;
  /** Learned abilities (bit i = slot i) and spell points left to learn more (battles: one per level). */
  ln: number; lp: number;
  /** Duels, before a round: the abilities still waiting for this round's free upgrade. */
  dq: number[];
  /** The charm (id, cooldown left, full cooldown) and the seconds left of a recall home. */
  ch: string; chc: number; chm: number; rc: number;
};

export type ServerObstacle = { x: number; y: number; r: number; k: string; s: number };
export type MapData = {
  id: string; name: string; theme: string; type: 'battle' | 'duel'; w: number; h: number; laneWidth: number; lanes: [number, number][][];
  obstacles: ServerObstacle[]; spawn: [number, number][]; plants: [number, number][]; camps: [number, number][];
  objective: [number, number] | null; fountainRadius: number; center: [number, number]; arenaRadius: number;
};
export type MatchHero = { playerId: string; name: string; hero: string; team: number; u: number; bot: boolean; skin: string | null; level: number };
export type MatchInit = { map: MapData; heroes: MatchHero[]; you: string; team: number; tick: number; matchmade: boolean };
export type MatchEndPlayer = { id: string; name: string; hero: string; team: number; k: number; d: number; a: number; lv: number; gold: number; damage: number; healing: number; bot: boolean; heroDamage: number };
export type MatchEnd = { winner: number; duration: number; players: MatchEndPlayer[] };
