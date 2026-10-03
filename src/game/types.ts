// Shared types for the art modules (copied from Starfall Grove) and the match client.

export type HeroId = 'mira' | 'kael' | 'lyra' | 'riven' | 'wren' | 'elara';
export type NpcHat = 'none' | 'straw' | 'hood' | 'cap' | 'wizard' | 'bonnet' | 'helm' | 'ears' | 'scarf';
export type GearSlot = 'head' | 'shoulders' | 'back' | 'chest' | 'hands' | 'waist' | 'legs' | 'feet' | 'weapon';
/** Worn gear that recolours a hero. Mini Rift has no gear yet, so heroes always wear their own colours. */
export type Look = Partial<Record<GearSlot, { color: string; glow: boolean; tier: number }>>;

export type ObstacleKind = 'tree' | 'pine' | 'rock' | 'bush' | 'crystal' | 'mushroom' | 'deadtree' | 'stump' | 'log' | 'pool'
  | 'house' | 'manor' | 'well' | 'fountain' | 'windmill' | 'tent' | 'stall' | 'pillar' | 'statue' | 'lamppost' | 'crate' | 'hay' | 'fence' | 'tower' | 'campfire'
  | 'barrel' | 'cart' | 'bench' | 'banner' | 'planter' | 'cliff';
/** `seed` is 0…1. */
export type Obstacle = { x: number; y: number; r: number; kind: ObstacleKind; seed: number; w?: number; h?: number; color?: string };
export type DecorKind = 'grass' | 'flower' | 'fern' | 'pebble' | 'shroom' | 'shard' | 'crop' | 'reed' | 'clover';
export type Decor = { x: number; y: number; kind: DecorKind; seed: number; color: string };
export type Palette = {
  ground: string; alternate: string; path: string; pathEdge: string; accent: string; water: string; waterDeep: string;
  foliage: [string, string, string]; trunk: string; rock: string; pod: string; roof: string[]; wall: string;
};
