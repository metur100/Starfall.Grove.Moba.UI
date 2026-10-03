import type { HeroId } from './types';

// How each hero is presented: the words, icons and colours. Numbers (cooldowns, costs, damage) come from the server's
// catalog, so the two can't disagree.

export type AbilityLook = { icon: string; color: string; text: string };
export type HeroLook = {
  id: HeroId; quote: string; blurb: string; color: string; accent: string;
  /** 1–5 bars for the select screen. */
  bars: { damage: number; toughness: number; control: number; mobility: number; support: number };
  abilities: Record<string, AbilityLook>;
};

export const HERO_ORDER: HeroId[] = ['mira', 'kael', 'lyra', 'riven', 'wren', 'elara'];

export const HEROES: Record<HeroId, HeroLook> = {
  mira: {
    id: 'mira', color: '#d0654e', accent: '#ffe38a',
    quote: 'She bends fragments of the night sky into weapons.',
    blurb: 'A fragile star-mage with huge area damage. Hold enemies in a Gravity Well, then drop a Sunflare on them.',
    bars: { damage: 5, toughness: 1, control: 3, mobility: 1, support: 1 },
    abilities: {
      spark: { icon: '✦', color: '#ffe38a', text: 'A homing mote of starlight. Sometimes lands a critical hit.' },
      gravity: { icon: '◎', color: '#b39cff', text: 'Opens a small black star at the target spot for 2 seconds, dragging enemies into its heart and grinding them with starlight.' },
      sunfire: { icon: '☀', color: '#ffb05c', text: 'After a short charge, hurls a blazing sun orb that explodes in a wide blast.' },
      starguard: { icon: '⁂', color: '#fff1b8', text: 'Three stars circle you, burning enemies they touch. Each one catches a blow meant for you and bursts on the attacker. Stars left at the end fly at the nearest enemies.' },
      starfall: { icon: '☄', color: '#c9b6ff', text: 'Comets fall on every enemy around you. They land where the enemy stood, so quick feet can dodge them.' },
    },
  },
  kael: {
    id: 'kael', color: '#a3aec0', accent: '#c9a44c',
    quote: 'His shield has never once been lowered for himself.',
    blurb: 'A sturdy knight who starts fights. Rush in, stun the group with Earthsplitter and soak the damage.',
    bars: { damage: 3, toughness: 5, control: 4, mobility: 3, support: 2 },
    abilities: {
      slash: { icon: '⚔', color: '#ffd0a0', text: 'A wide sword swing: full damage to the target and some to enemies beside it.' },
      charge: { icon: '➤', color: '#ffb35c', text: 'Rush at an enemy. You can’t be hurt mid-rush, and the enemy (and anyone next to it) is stunned.' },
      slam: { icon: '✺', color: '#e0a060', text: 'Smash the ground: a shockwave hurts and stuns everything around you.' },
      guard: { icon: '⛨', color: '#b8c8e0', text: 'Raise your shield: blocks all harm for a moment, bounces projectiles back and shoves enemies away.' },
      bladestorm: { icon: '✵', color: '#ff8a6b', text: 'Spin into a whirlwind of steel, cutting everything nearby. You take half damage while spinning.' },
    },
  },
  lyra: {
    id: 'lyra', color: '#5a8ac8', accent: '#bfeaff',
    quote: 'Winter answers when she sings.',
    blurb: 'A controller who freezes and slows. Keep enemies where you want them, and hide in ice when they reach you.',
    bars: { damage: 4, toughness: 2, control: 5, mobility: 3, support: 2 },
    abilities: {
      frostbolt: { icon: '❄', color: '#9fe4ff', text: 'A shard of ice that seeks its target and chills it, slowing it briefly.' },
      blink: { icon: '✧', color: '#d6f4ff', text: 'Teleport a short way, leaving a burst of frost that hurts and slows enemies where you stood.' },
      frostnova: { icon: '❆', color: '#7fd0ff', text: 'Ice bursts out around you: nearby enemies are hurt and frozen in place.' },
      iceBlock: { icon: '⬢', color: '#bfeaff', text: 'Freeze yourself in glacier ice: nothing can hurt you and you slowly heal, but you can’t move or cast. Press again to break free.' },
      blizzard: { icon: '✻', color: '#e0f6ff', text: 'Call a whiteout onto an area: ice rains down for 4 seconds, hurting and slowing everything inside.' },
    },
  },
  riven: {
    id: 'riven', color: '#4a3e62', accent: '#b69cff',
    quote: 'You never see him. You only see what he leaves.',
    blurb: 'A deadly assassin. Vanish, step behind a lone enemy and strike for triple damage — then get out.',
    bars: { damage: 5, toughness: 2, control: 1, mobility: 5, support: 1 },
    abilities: {
      stab: { icon: '†', color: '#e0c8ff', text: 'Two quick stabs. Critical hits deal double damage.' },
      shadowstep: { icon: '◐', color: '#b69cff', text: 'Step through the shadows to right behind an enemy. Your next stab is a certain, extra-strong critical hit.' },
      knives: { icon: '✥', color: '#d8d0f0', text: 'Throw ten knives in every direction at once.' },
      stealth: { icon: '◌', color: '#a898c8', text: 'Fade from sight and move faster. Attacking, casting or getting hurt brings you out; your first strike from the veil hits much harder.' },
      deathmark: { icon: '☠', color: '#ff6b9a', text: 'Brand an enemy with a sigil. Two seconds later it bursts, and shadow blades cut everything around it.' },
    },
  },
  wren: {
    id: 'wren', color: '#8a6a44', accent: '#9fe8b0',
    quote: 'Two hunters, one heartbeat: hers and Fenn’s.',
    blurb: 'A ranged hunter with Fenn the wolf at her side. Shoot from afar and let Fenn pin enemies down.',
    bars: { damage: 4, toughness: 2, control: 3, mobility: 4, support: 1 },
    abilities: {
      arrow: { icon: '➹', color: '#e8d49a', text: 'Loose an arrow that flies far and pierces the first enemy it hits. Fenn attacks whatever you shoot.' },
      command: { icon: '🐾', color: '#c8e6a0', text: 'Fenn pounces on an enemy, stunning it, and keeps fighting it.' },
      volley: { icon: '⋔', color: '#f0c070', text: 'Fire a fan of seven arrows at once.' },
      leap: { icon: '⤺', color: '#b9e27a', text: 'Vault away from the nearest enemy and loose three arrows at it in mid-air. You can’t be hurt during the leap, and the arrows root what they hit.' },
      wildcall: { icon: '🐺', color: '#9fe8b0', text: 'Fenn howls: two spirit wolves join the hunt for 8 seconds, and Fenn bites twice as fast and hard.' },
    },
  },
  elara: {
    id: 'elara', color: '#6f9a4a', accent: '#f7c5d5',
    quote: 'She coaxes the old forest awake, one seed at a time.',
    blurb: 'A Bloomwarden of the deep groves. Heal and shield your friends, root enemies in vines, and wake the forest itself.',
    bars: { damage: 2, toughness: 3, control: 4, mobility: 2, support: 5 },
    abilities: {
      seed: { icon: '❦', color: '#b9e27a', text: 'A thorn seed that seeks its target. Each one that lands sends a sliver of life to the most hurt ally nearby.' },
      naturebolt: { icon: '➶', color: '#8fdc6a', text: 'A bolt of living wood: it heals allies it passes through, then roots and hurts the first enemy it strikes.' },
      grove: { icon: '✿', color: '#f7c5d5', text: 'Raise a ring of blossoms for 4 seconds. Allies inside heal steadily; enemies inside are slowed.' },
      barkskin: { icon: '⛉', color: '#c8a46a', text: 'Wrap an ally (or yourself) in living bark that soaks up damage for a few seconds.' },
      awakening: { icon: '🌳', color: '#9fe8b0', text: 'The old forest wakes: after a moment, allies in a huge circle are healed and freed from stuns and roots, while enemies are hurt and rooted.' },
    },
  },
};

export const ROLE_ICON: Record<string, string> = { Mage: '✦', Tank: '⛨', Controller: '❄', Assassin: '†', Marksman: '➹', Support: '✿' };
export const SLOT_KEYS = ['Space', 'Q', 'E', 'R', 'F'];
export const isHero = (k: string): k is HeroId => k in HEROES;
