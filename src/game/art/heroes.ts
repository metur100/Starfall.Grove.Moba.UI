// The six heroes as paper puppets: their signature colours (the same as in their intro films), what worn gear
// changes, and the weapon each one carries. Gear dyes the part it is worn on; the weapon's tier changes its material.
import { circle, ellipse, limb, shade, star } from './color';
import type { Figure, Hooks, Joints } from './rig';
import type { Look } from '../types';
import type { HeroId } from '../types';

type Weapon = { tier: number; wood: string; metal: string; gem: string; glow: boolean };
export function weaponOf(L: Look, wood: string, metal: string, gem: string): Weapon {
  const w = L.weapon;
  if (!w) return { tier: -1, wood, metal, gem, glow: false };
  return { tier: w.tier, wood: ['#7a5a3f', '#5f7a3a', '#d0d8e8', '#2e2630'][w.tier], metal: ['#c8ccd6', '#d8a860', '#cdefff', '#4a3434'][w.tier], gem: w.color, glow: w.glow };
}
const c = (L: Look, slot: keyof Look, base: string) => L[slot]?.color ?? base;

export function heroFigure(hero: HeroId, L: Look): Figure {
  switch (hero) {
    case 'mira': return {
      skin: '#f3cfae', hair: '#7a3f28', hairStyle: 'long', build: 'slim', outfit: 'robe',
      top: c(L, 'chest', '#d0654e'), trim: '#f2c46a', sleeves: c(L, 'chest', '#d0654e'), legs: c(L, 'legs', '#5a3a44'), boots: c(L, 'feet', '#4b3025'),
      belt: c(L, 'waist', '#f2c46a'), cape: c(L, 'back', '#6e2f4a'), capeLong: true, gloves: L.hands?.color, shoulders: L.shoulders?.color,
      hat: 'star', hatColor: c(L, 'head', '#3f6a45'), hatTrim: '#f2c46a', emblem: '#fff1b8',
    };
    case 'kael': return {
      skin: '#f0c8a2', hair: '#6b3f2a', hairStyle: 'short', build: 'stout', outfit: 'armor',
      top: c(L, 'chest', '#a3aec0'), trim: '#c9a44c', sleeves: shade(c(L, 'chest', '#a3aec0'), -.1), legs: c(L, 'legs', '#5a6478'), boots: c(L, 'feet', '#3a3040'),
      belt: c(L, 'waist', '#6a4a30'), cape: c(L, 'back', '#9a2e2e'), capeLong: true, shoulders: c(L, 'shoulders', '#7d889c'), gloves: c(L, 'hands', '#6a7486'),
      hat: 'plume', hatColor: c(L, 'head', '#a3aec0'), hatTrim: '#c0392b', brows: true,
    };
    case 'lyra': return {
      skin: '#f6dcc8', hair: '#e6f4ff', hairStyle: 'long', build: 'slim', outfit: 'dress', eyes: '#2a4a6a',
      top: c(L, 'chest', '#5a8ac8'), trim: '#e6f4ff', apron: '#e6f4ff', sleeves: c(L, 'chest', '#5a8ac8'), legs: c(L, 'legs', '#3a4a6a'), boots: c(L, 'feet', '#3a4a6a'),
      belt: c(L, 'waist', '#bfeaff'), cape: c(L, 'back', '#9fd0ee'), capeLong: true, gloves: L.hands?.color, shoulders: L.shoulders?.color,
      hat: 'circlet', hatColor: c(L, 'head', '#bfeaff'), hatTrim: '#eaf8ff',
    };
    case 'riven': return {
      skin: '#e8c4a8', hair: '#2a2236', hairStyle: 'swept', build: 'slim', outfit: 'leather', glowEyes: '#b69cff',
      top: c(L, 'chest', '#4a3e62'), sleeves: shade(c(L, 'chest', '#4a3e62'), -.1), legs: c(L, 'legs', '#3a3448'), boots: c(L, 'feet', '#241c2c'),
      belt: c(L, 'waist', '#6a4a3a'), scarf: c(L, 'back', '#2e2440'), gloves: c(L, 'hands', '#2a2236'), shoulders: L.shoulders?.color,
      hat: 'cowl', hatColor: c(L, 'head', '#3a2e52'), hatTrim: '#6a5a8a', mask: '#2e2440',
    };
    case 'wren': return {
      skin: '#f0c8a2', hair: '#a8502e', hairStyle: 'braid', build: 'slim', outfit: 'leather', eyes: '#2d3a20', freckles: true,
      top: c(L, 'chest', '#8a6a44'), sleeves: '#6f5436', legs: c(L, 'legs', '#5a4a36'), boots: c(L, 'feet', '#4b3025'),
      belt: c(L, 'waist', '#5a3a24'), cape: c(L, 'back', '#3f6a3a'), gloves: c(L, 'hands', '#6a4a30'), shoulders: L.shoulders?.color,
      hat: 'ranger', hatColor: c(L, 'head', '#4a7a44'), hatTrim: '#6f9a4a',
    };
    case 'elara': return {
      skin: '#f0cfae', hair: '#5e8f3e', hairStyle: 'long', build: 'slim', outfit: 'dress', eyes: '#2f4a22', freckles: true,
      top: c(L, 'chest', '#6f9a4a'), trim: '#f2d27a', apron: '#eef3cf', sleeves: c(L, 'chest', '#6f9a4a'), legs: c(L, 'legs', '#4a5a36'), boots: c(L, 'feet', '#5a3e28'),
      belt: c(L, 'waist', '#8a5a34'), cape: c(L, 'back', '#3f6a3a'), capeLong: true, gloves: L.hands?.color, shoulders: L.shoulders?.color,
      hat: 'circlet', hatColor: c(L, 'head', '#8fbf5a'), hatTrim: '#f7c5d5', emblem: '#f7c5d5',
    };
  }
}

/** What each hero holds, and any glow on top. `cast` is 0…1 through a cast or swing. */
export function heroHooks(hero: HeroId, L: Look, cast: number, t: number, extra: { bowDraw?: number } = {}): Hooks {
  switch (hero) {
    case 'mira': {
      const W = weaponOf(L, '#7a5a3f', '', '#ffe38a');
      return { held: (g, j) => staff(g, j, W, t, cast, 'star') };
    }
    case 'lyra': {
      const W = weaponOf(L, '#c8d8e8', '', '#9fe4ff');
      return { held: (g, j) => staff(g, j, W, t, cast, 'ice') };
    }
    case 'kael': {
      const W = weaponOf(L, '', '#e6ecf5', '#c9a44c');
      return {
        held: (g, j) => sword(g, j, W),
        heldBack: (g, j) => shield(g, j),
      };
    }
    case 'riven': {
      const W = weaponOf(L, '', '#eef0f8', '#e0c8ff');
      return { held: (g, j) => dagger(g, j, W, 15), heldBack: (g, j) => dagger(g, j, W, 12, true) };
    }
    case 'wren': {
      const W = weaponOf(L, '#7a5230', '', '#e8e0c8');
      return { behind: (g, j) => quiver(g, j), held: (g, j) => bow(g, j, W, extra.bowDraw || 0) };
    }
    case 'elara': {
      const W = weaponOf(L, '#8a6a44', '', '#f7c5d5');
      return { held: (g, j) => staff(g, j, W, t, cast, 'bloom') };
    }
  }
}

/** Where a staff's head is, for the glow drawn over it. */
export const staffTip = (j: Joints, cast = 0) => { const lean = (j.facing === 'side' ? .22 : .08) - cast * .35; return { x: j.handF.x + Math.sin(lean) * 30, y: j.handF.y - Math.cos(lean) * 30 - 8 }; };
/** A tall staff held upright in the front hand: Mira's with a crescent and star, Lyra's with a floating ice shard. */
function staff(g: CanvasRenderingContext2D, j: Joints, W: Weapon, t: number, cast: number, kind: 'star' | 'ice' | 'bloom') {
  const hx = j.handF.x, hy = j.handF.y, lean = (j.facing === 'side' ? .22 : .08) - cast * .35;
  const top = { x: hx + Math.sin(lean) * 30, y: hy - Math.cos(lean) * 30 }, bot = { x: hx - Math.sin(lean) * 12, y: hy + Math.cos(lean) * 12 };
  limb(g, bot.x, bot.y, top.x, top.y, 3.4, 3, W.wood);
  const tier = Math.max(0, W.tier), bob = Math.sin(t * 3) * 1.5;
  if (kind === 'star') {
    g.strokeStyle = shade(W.wood, .1); g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.arc(top.x, top.y - 6, 7 + tier, Math.PI * .1, Math.PI * .9, true); g.stroke();
    g.fillStyle = W.gem; star(g, top.x, top.y - 8 + bob, 5.5 + tier * .8 + cast * 2, 5, .45, t * .8); g.fill();
    circle(g, top.x, top.y - 8 + bob, 1.8, '#ffffff');
  } else if (kind === 'bloom') {
    // A gnarled branch that bursts into leaves and one big blossom.
    const fy = top.y - 6 + bob, k = 1 + tier * .12 + cast * .35;
    ellipse(g, top.x - 5 * k, fy + 2, 5 * k, 2.6 * k, '#5d8a4c', -.5); ellipse(g, top.x + 5 * k, fy + 1, 5 * k, 2.6 * k, '#7fae5a', .5);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + t * .6; ellipse(g, top.x + Math.cos(a) * 3.6 * k, fy - 4 + Math.sin(a) * 3.6 * k, 3.4 * k, 2.4 * k, W.gem, a); }
    circle(g, top.x, fy - 4, 2.2 * k, '#fff2a1');
  } else {
    const fy = top.y - 10 + bob, sz = 1 + tier * .12 + cast * .3;
    g.fillStyle = W.gem; g.beginPath(); g.moveTo(top.x, fy - 9 * sz); g.lineTo(top.x + 5 * sz, fy); g.lineTo(top.x, fy + 7 * sz); g.lineTo(top.x - 5 * sz, fy); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(top.x, fy - 9 * sz); g.lineTo(top.x - 5 * sz, fy); g.lineTo(top.x, fy); g.closePath(); g.fill();
    g.strokeStyle = shade(W.wood, -.1); g.lineWidth = 2; g.beginPath(); g.moveTo(top.x - 5, top.y - 1); g.quadraticCurveTo(top.x, top.y + 3, top.x + 5, top.y - 1); g.stroke();
  }
}
function sword(g: CanvasRenderingContext2D, j: Joints, W: Weapon) {
  const a = j.angF - Math.PI / 2 + (j.facing === 'side' ? -.2 : 0), bl = 30 + Math.max(0, W.tier) * 3, bw = W.tier === 1 ? 3.6 : 2.8;
  g.save(); g.translate(j.handF.x, j.handF.y); g.rotate(a + Math.PI);
  g.fillStyle = '#6a4a30'; g.fillRect(-1.6, -2, 3.2, 8); circle(g, 0, 6.5, 2.2, W.gem);
  g.fillStyle = W.gem; g.fillRect(-6, -3.4, 12, 3);
  g.fillStyle = W.metal; g.beginPath(); g.moveTo(-bw, -3); g.lineTo(-bw, -bl * .8); g.lineTo(0, -bl); g.lineTo(bw, -bl * .8); g.lineTo(bw, -3); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(-.6, -bl * .8, 1.2, bl * .75);
  g.restore();
}
function shield(g: CanvasRenderingContext2D, j: Joints) {
  const x = j.handB.x + (j.facing === 'side' ? -2 : 0), y = j.handB.y - 4, back = j.facing === 'back';
  if (back) return;
  const s = j.facing === 'side' ? .7 : 1;
  g.save(); g.translate(x, y); g.scale(s, 1);
  g.fillStyle = '#3f5a8a'; g.beginPath(); g.moveTo(-9, -11); g.lineTo(9, -11); g.lineTo(9, 3); g.quadraticCurveTo(0, 15, -9, 3); g.closePath(); g.fill();
  g.strokeStyle = '#c9a44c'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#e8c46a'; star(g, 0, -2.5, 4.6, 4, .4); g.fill();
  g.restore();
}
function dagger(g: CanvasRenderingContext2D, j: Joints, W: Weapon, len: number, back = false) {
  const p = back ? j.handB : j.handF, a = back ? 2.4 : j.angF - Math.PI / 2 + .9;
  len += Math.max(0, W.tier) * 2;
  g.save(); g.translate(p.x, p.y); g.rotate(a);
  g.fillStyle = '#3a2a26'; g.fillRect(-1.4, -1, 2.8, 6); g.fillStyle = W.tier < 0 ? '#d8dce8' : W.gem; g.fillRect(-4, -2, 8, 2);
  g.fillStyle = W.metal; g.beginPath(); g.moveTo(-2, -2); g.lineTo(0, -2 - len); g.lineTo(2, -2); g.closePath(); g.fill();
  g.restore();
}
function quiver(g: CanvasRenderingContext2D, j: Joints) {
  if (j.facing === 'front') return;
  const x = j.facing === 'back' ? 5 : -8, y = -12;
  g.save(); g.translate(x, y); g.rotate(j.facing === 'back' ? .35 : -.35);
  g.fillStyle = '#6a4a30'; g.beginPath(); g.roundRect(-4, -12, 8, 22, 3); g.fill();
  for (let i = 0; i < 3; i++) { g.fillStyle = '#e8e0c8'; g.fillRect(-3 + i * 2.6, -18, 1.4, 7); g.fillStyle = '#c0392b'; g.fillRect(-3.4 + i * 2.6, -20, 2.2, 3); }
  g.restore();
}
function bow(g: CanvasRenderingContext2D, j: Joints, W: Weapon, draw: number) {
  const x = j.handF.x, y = j.handF.y, face = j.facing;
  g.save(); g.translate(x, y); if (face === 'front') g.scale(.55, 1);
  g.strokeStyle = W.wood; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, -20); g.quadraticCurveTo(10 + draw * 2, 0, 0, 20); g.stroke();
  if (W.tier >= 0) circle(g, 7, 0, 2.2, W.gem);
  g.strokeStyle = W.tier === 3 ? W.gem : '#efe8d4'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -20); g.lineTo(-draw * 9, 0); g.lineTo(0, 20); g.stroke();
  if (draw > .15) { g.fillStyle = '#efe8d4'; g.fillRect(-draw * 9, -.7, 20 + draw * 8, 1.4); g.fillStyle = '#c8c8d0'; g.beginPath(); g.moveTo(12 + draw * 2, -3); g.lineTo(17 + draw * 2, 0); g.lineTo(12 + draw * 2, 3); g.fill(); }
  g.restore();
  void ellipse;
}
