// Messages between the Mini Rift server (Starfall.Grove.Moba.API) and this client. Mirrors Protocol.cs and the hub.

export type Target = 'self' | 'point' | 'direction' | 'enemy' | 'ally';
export type AbilityDef = {
  id: string; name: string; slot: number; cooldown: number; cost: number; range: number; radius: number; power: number;
  duration: number; cc: number; speed: number; windup: number; target: Target; toggle: boolean; effects: string;
};
export type HeroDef = {
  id: string; name: string; title: string; role: string; difficulty: number; hp: number; hpPerLevel: number; resource: string;
  mana: number; manaRegen: number; armor: number; speed: number; adPerLevel: number; crit: number; melee: boolean; abilities: AbilityDef[];
};
export type UpgradeOption = { id: string; name: string; text: string };
export type MapInfo = { id: string; name: string; theme: string; type: 'battle' | 'duel'; lanes: number; blurb: string };
export type Catalog = {
  heroes: HeroDef[]; basicTiers: UpgradeOption[][]; abilityTiers: UpgradeOption[][];
  basicCost: number[]; abilityCost: number[]; ultCost: number[]; ultLevel: number; maxLevel: number; maps: MapInfo[];
};

export type Phase = 'lobby' | 'heroSelect' | 'loading' | 'starting' | 'playing' | 'ended';
export type RoomPlayer = { id: string; name: string; team: number; ready: boolean; bot: boolean; connected: boolean; hero: string | null; locked: boolean };
export type RoomView = { code: string; phase: Phase; mode: number; map: string; type: 'battle' | 'duel'; hostId: string; you: string; timer: number; players: RoomPlayer[]; winner: number };
export type JoinResult = { ok: boolean; error: string | null; code: string | null; playerId: string | null };

/** Status flags (St in Entities.cs). */
export const ST = {
  stun: 1, root: 2, slow: 4, shell: 8, stealth: 16, guard: 32, spin: 64, shield: 128, stars: 256, dead: 512, blessed: 1024,
  marked: 2048, empowered: 4096, casting: 8192, frenzy: 16384, invulnerable: 32768, dashing: 65536,
} as const;

/** f: facing in degrees; st: ST flags; lv: hero level; sh: shield; n: Guardian Stars still circling. */
export type UnitSnap = { i: number; k: string; tm: number; x: number; y: number; hp: number; mh: number; f: number; st: number; lv: number; sh: number; n: number };
export type ProjSnap = { i: number; k: string; x: number; y: number; vx: number; vy: number; tm: number };
export type ZoneSnap = { i: number; k: string; x: number; y: number; r: number; tm: number; t: number };
export type Fx = { e: string; u?: number; u2?: number; x?: number; y?: number; x2?: number; y2?: number; v?: number; r?: number; k?: string; tm?: number };
/** dm: damage dealt to enemy heroes, hl: healing given to allies. */
export type PlayerStat = { id: string; u: number; k: number; d: number; a: number; lv: number; rs: number; dm: number; hl: number };
export type Snapshot = {
  t: number; u: UnitSnap[]; p: ProjSnap[]; z: ZoneSnap[]; fx: Fx[]; sc: [number, number]; ps: PlayerStat[];
  pa: number; ob: number; sd: number; fv: number;
  /** Duels: round, rounds won [blue, red], phase (0 countdown, 1 fight, 2 over), seconds left, closing ring radius. */
  rd: number; rw: [number, number]; rp: number; rt: number; rr: number;
};
export type Me = {
  u: number; g: number; lv: number; xp: number; xn: number; mp: number; mm: number; cd: number[]; cm: number[]; mc: number[];
  up: string[][]; rs: number; sp: number; vx: number; vy: number; ad: number;
};

export type ServerObstacle = { x: number; y: number; r: number; k: string; s: number };
export type MapData = {
  id: string; name: string; theme: string; type: 'battle' | 'duel'; w: number; h: number; laneWidth: number; lanes: [number, number][][];
  obstacles: ServerObstacle[]; spawn: [number, number][]; plants: [number, number][]; camps: [number, number][];
  objective: [number, number] | null; fountainRadius: number; center: [number, number]; arenaRadius: number;
};
export type MatchHero = { playerId: string; name: string; hero: string; team: number; u: number; bot: boolean };
export type MatchInit = { map: MapData; heroes: MatchHero[]; you: string; team: number; tick: number };
export type MatchEndPlayer = { id: string; name: string; hero: string; team: number; k: number; d: number; a: number; lv: number; gold: number; damage: number; healing: number; bot: boolean; heroDamage: number };
export type MatchEnd = { winner: number; duration: number; players: MatchEndPlayer[] };
