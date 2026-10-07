import type { Figure } from './art/rig';
import { heroFigure } from './art/heroes';
import type { HeroId, Look } from './types';

// What each skin looks like. Names, tiers and prices come from the server's shop (Economy.cs); this is the paint: new
// colours on the paper puppet, the weapon's material and gem, and for the finer tiers a glow at the feet (epic) and a
// trail of motes while walking (legendary). Spells keep their own colours, so a skin never hides what a hero is doing.

export type Motes = 'star' | 'snow' | 'ember' | 'leaf' | 'smoke';
export type SkinLook = {
  /** Colours laid over the hero's own figure. */
  fig: Partial<Figure>;
  /** The weapon: tier 0 wood, 1 living wood, 2 silver, 3 dark; its gem colour and whether it glows. */
  weapon: { tier: number; color: string; glow: boolean };
  /** The skin's colour in menus and for the staff's glow. */
  accent: string;
  aura?: string;
  trail?: { color: string; kind: Motes };
};

const w = (tier: number, color: string, glow = false) => ({ tier, color, glow });

export const SKINS: Record<string, SkinLook> = {
  // ── Mira
  mira_moon: {
    fig: { top: '#6f86b8', sleeves: '#6f86b8', cape: '#2e3a66', hatColor: '#2a3358', hatTrim: '#dfe8ff', trim: '#dfe8ff', belt: '#dfe8ff', emblem: '#ffffff', hair: '#c8d0e8', legs: '#3a3f5e' },
    weapon: w(2, '#dff4ff'), accent: '#bcd2ff',
  },
  mira_ember: {
    fig: { top: '#3a2230', sleeves: '#3a2230', cape: '#b8362a', hatColor: '#241520', hatTrim: '#ff8a3d', trim: '#ff8a3d', belt: '#ff8a3d', hair: '#d8452e', emblem: '#ffb347', legs: '#2a1820' },
    weapon: w(3, '#ff7a2e', true), accent: '#ff9a4a', aura: '#ff7a3d',
  },
  mira_nebula: {
    fig: { top: '#4b2a7a', sleeves: '#4b2a7a', cape: '#1c1238', hatColor: '#2a1650', hatTrim: '#f2d27a', trim: '#f2d27a', belt: '#f2d27a', hair: '#e8d8ff', emblem: '#ffffff', legs: '#2a1a48' },
    weapon: w(2, '#c9b6ff', true), accent: '#c9b6ff', aura: '#b39cff', trail: { color: '#e0d4ff', kind: 'star' },
  },
  // ── Kael
  kael_oak: {
    fig: { top: '#8a6a3a', sleeves: '#7a5c30', shoulders: '#5d7a3a', gloves: '#5a4a30', cape: '#3f6a3a', hatColor: '#8a6a3a', hatTrim: '#7fae5a', legs: '#4a3e2a', trim: '#9fc46a' },
    weapon: w(1, '#9fe8b0'), accent: '#9fc46a',
  },
  kael_frost: {
    fig: { top: '#cfe0f0', sleeves: '#b4c8de', shoulders: '#9fc0e0', gloves: '#7fa0c8', cape: '#e8f4ff', hatColor: '#cfe0f0', hatTrim: '#5a8ac8', legs: '#6a84a8', trim: '#9fe4ff', hair: '#e6f0ff' },
    weapon: w(2, '#9fe4ff', true), accent: '#9fe4ff', aura: '#9fe4ff',
  },
  kael_sun: {
    fig: { top: '#f2c96a', sleeves: '#e0b456', shoulders: '#e0a83a', gloves: '#c98a2a', cape: '#fff1d0', hatColor: '#f2c96a', hatTrim: '#ffffff', legs: '#b8862a', trim: '#fff6d8', belt: '#7a4a1a' },
    weapon: w(1, '#fff1a8', true), accent: '#ffd35c', aura: '#ffd35c', trail: { color: '#ffe9a8', kind: 'star' },
  },
  // ── Lyra
  lyra_spring: {
    fig: { top: '#7fc8a0', sleeves: '#7fc8a0', cape: '#f7c5d5', trim: '#fff4f8', apron: '#fff4f8', hair: '#f7c5d5', hatColor: '#f2d27a', hatTrim: '#f7c5d5', legs: '#4a7a5a', belt: '#f7c5d5' },
    weapon: w(1, '#f7c5d5'), accent: '#f7c5d5',
  },
  lyra_aurora: {
    fig: { top: '#2e6a7a', sleeves: '#2e6a7a', cape: '#8a5ac8', trim: '#9fffd8', apron: '#c8fff0', hair: '#9fffd8', hatColor: '#c9b6ff', hatTrim: '#9fffd8', legs: '#2a3a5a', belt: '#9fffd8' },
    weapon: w(2, '#9fffd8', true), accent: '#7fffd4', aura: '#7fffd4',
  },
  lyra_queen: {
    fig: { top: '#eef6ff', sleeves: '#eef6ff', cape: '#bfe0ff', trim: '#9fe4ff', apron: '#ffffff', hair: '#ffffff', hatColor: '#9fe4ff', hatTrim: '#ffffff', legs: '#8aa8d0', boots: '#8aa8d0', belt: '#9fe4ff', eyes: '#4a9ad8' },
    weapon: w(2, '#bfeaff', true), accent: '#d6f4ff', aura: '#bfeaff', trail: { color: '#ffffff', kind: 'snow' },
  },
  // ── Riven
  riven_crimson: {
    fig: { top: '#5a1e24', sleeves: '#4a1a20', hatColor: '#3a1418', hatTrim: '#c0392b', mask: '#2a0e12', scarf: '#c0392b', glowEyes: '#ff5a5a', legs: '#2a1418', gloves: '#1a0a0e' },
    weapon: w(3, '#ff5a5a'), accent: '#ff6b6b',
  },
  riven_ghost: {
    fig: { top: '#2a4a4a', sleeves: '#243e3e', hatColor: '#1e3434', hatTrim: '#7fffd4', mask: '#162828', scarf: '#3a6a5a', glowEyes: '#7fffd4', legs: '#1e2e2e', skin: '#cfe8e0' },
    weapon: w(2, '#7fffd4', true), accent: '#7fffd4', aura: '#5ae0b8',
  },
  riven_eclipse: {
    fig: { top: '#16121e', sleeves: '#120e18', hatColor: '#0e0a14', hatTrim: '#f2c96a', mask: '#0a0810', scarf: '#f2c96a', glowEyes: '#ffd35c', legs: '#100c16', gloves: '#f2c96a', belt: '#f2c96a' },
    weapon: w(3, '#ffd35c', true), accent: '#ffd35c', aura: '#6a3ad6', trail: { color: '#8a5aff', kind: 'smoke' },
  },
  // ── Wren
  wren_autumn: {
    fig: { top: '#b8642a', sleeves: '#8a4a20', cape: '#c98a2a', hatColor: '#8a3a1a', hatTrim: '#f2c96a', hair: '#7a3a1a', legs: '#5a3a24', gloves: '#5a3a24' },
    weapon: w(0, '#f2b84b'), accent: '#f2a04b',
  },
  wren_snow: {
    fig: { top: '#e8eef6', sleeves: '#c8d4e4', cape: '#9fb6d0', hatColor: '#ffffff', hatTrim: '#9fb6d0', hair: '#f0f4fa', legs: '#8a9ab0', boots: '#6a7a90', gloves: '#9fb6d0' },
    weapon: w(2, '#bfeaff'), accent: '#d6f4ff', aura: '#d6f4ff',
  },
  wren_hunt: {
    fig: { top: '#24382a', sleeves: '#1c2c20', cape: '#14241a', hatColor: '#1a2a1e', hatTrim: '#9fe8b0', hair: '#e8e0d0', legs: '#1a241c', gloves: '#2a1a14' },
    weapon: w(3, '#7fffb0', true), accent: '#7fffb0', aura: '#4ad88a', trail: { color: '#7fffb0', kind: 'ember' },
  },
  // ── Elara
  elara_blossom: {
    fig: { top: '#f2a6c0', sleeves: '#f2a6c0', apron: '#fff4f8', trim: '#ffffff', cape: '#c86a8a', hair: '#f7d0dc', hatColor: '#ffffff', hatTrim: '#f2a6c0', legs: '#a85a7a', belt: '#c86a8a' },
    weapon: w(0, '#ffd0e0'), accent: '#f7c5d5',
  },
  elara_shroom: {
    fig: { top: '#c8382a', sleeves: '#c8382a', apron: '#fff4de', trim: '#ffffff', cape: '#7a4a2a', hair: '#e8d8b0', hatColor: '#d8402e', hatTrim: '#ffffff', legs: '#6a4a30', emblem: '#ffffff' },
    weapon: w(1, '#ff8a6a'), accent: '#ff8a6a', aura: '#ff9a6b',
  },
  elara_ancient: {
    fig: { top: '#5a4026', sleeves: '#4a3420', apron: '#c8a46a', trim: '#f2d27a', cape: '#2e4a22', hair: '#9fe8b0', hatColor: '#f2d27a', hatTrim: '#9fe8b0', legs: '#3a2a18', skin: '#e8c8a0', glowEyes: '#9fe8b0' },
    weapon: w(3, '#9fe8b0', true), accent: '#9fe8b0', aura: '#9fe8b0', trail: { color: '#c8f0a0', kind: 'leaf' },
  },
};

export const TIER_COLOR: Record<string, string> = { rare: '#5fb0ff', epic: '#c08aff', legendary: '#ffb347' };
export const TIER_NAME: Record<string, string> = { rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

export const skinLook = (skin?: string | null): SkinLook | null => (skin && SKINS[skin]) || null;

/** The worn gear a skin amounts to (just its weapon). */
export function skinGear(skin?: string | null): Look {
  const s = skinLook(skin);
  return s ? { weapon: s.weapon } : {};
}

/** A hero's paper figure in a skin. */
export function skinFigure(hero: HeroId, skin?: string | null): Figure {
  const base = heroFigure(hero, {}), s = skinLook(skin);
  return s ? { ...base, ...s.fig } : base;
}
