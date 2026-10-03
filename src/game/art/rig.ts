// One figure for every person in the valley: the five heroes, villagers, captives, followers and cutscene actors.
// A chibi paper puppet about 64 world units tall (feet at y = +22, head centred at y = -27), drawn facing the viewer,
// facing away, or side-on (mirrored for left). Parts are plain shapes; the cutout pass adds light, grain and edge.
import { TAU, circle, ellipse, limb, shade } from './color';
import type { NpcHat } from '../types';

export type Facing = 'front' | 'back' | 'side';
export type HairStyle = 'short' | 'long' | 'bob' | 'bun' | 'braid' | 'spiky' | 'bald' | 'pony' | 'curly' | 'swept';
export type Build = 'slim' | 'round' | 'tall' | 'child' | 'stout';
export type Outfit = 'robe' | 'tunic' | 'dress' | 'coat' | 'armor' | 'leather' | 'apron';
export type Hat = NpcHat | 'plume' | 'circlet' | 'star' | 'cowl' | 'ranger';
export type Figure = {
  skin: string; hair: string; hairStyle: HairStyle; eyes?: string;
  build: Build; outfit: Outfit;
  top: string; trim?: string; legs: string; boots: string; belt?: string; sleeves?: string;
  cape?: string; capeLong?: boolean; scarf?: string; shoulders?: string; gloves?: string;
  hat: Hat; hatColor: string; hatTrim?: string;
  beard?: string; brows?: boolean; freckles?: boolean; mask?: string; glowEyes?: string;
  /** A second colour on the chest: an apron, a sash or an emblem. */
  apron?: string; emblem?: string;
};
export type ArmAction = 'idle' | 'raise' | 'point' | 'swing' | 'thrust' | 'draw' | 'work' | 'wave' | 'hold' | 'fish' | 'sweep';
export type Pose = {
  facing: Facing; dir: 1 | -1; walk: number; moving: boolean; t: number;
  /** What the front arm does, and how far through it is (0…1). */
  arm?: ArmAction; k?: number;
  blink?: boolean; hurt?: boolean;
  /** Seconds-based seed so villagers don't breathe in step. */
  seed?: number;
};
export type Point = { x: number; y: number };
/** Where the parts ended up, for weapons, tools and glows drawn on top. */
export type Joints = { handF: Point; handB: Point; angF: number; head: Point; hip: Point; back: Point; scale: number; facing: Facing };
export type Hooks = {
  /** Behind everything (a quiver, the shaft of a staff held behind). */
  behind?: (g: CanvasRenderingContext2D, j: Joints) => void;
  /** The thing held in the front hand, drawn just before the hand closes on it. */
  held?: (g: CanvasRenderingContext2D, j: Joints) => void;
  /** Held in the back hand (a shield). */
  heldBack?: (g: CanvasRenderingContext2D, j: Joints) => void;
  /** On top of everything (glows, sparks). */
  front?: (g: CanvasRenderingContext2D, j: Joints) => void;
};

const EYE = '#2a1b26', MOUTH = '#8a3f4a', BLUSH = 'rgba(236,112,112,.38)';
const HEAD_Y = -27, HEAD_RX = 14.6, HEAD_RY = 13.6;

/** Proportions per build: body width, height, head size. */
const BUILD: Record<Build, { w: number; h: number; head: number; all: number }> = {
  slim: { w: .9, h: 1, head: 1, all: 1 }, round: { w: 1.16, h: .98, head: 1, all: 1 }, tall: { w: .94, h: 1.1, head: .96, all: 1.04 },
  child: { w: .95, h: .9, head: 1.08, all: .78 }, stout: { w: 1.22, h: .92, head: 1.02, all: 1 },
};

/** The facing that best matches a direction: toward the viewer, away, or side-on. */
export function facingOf(fx: number, fy: number): { facing: Facing; dir: 1 | -1 } {
  const dir: 1 | -1 = fx < -.05 ? -1 : 1;
  if (fy > .62 && Math.abs(fx) < .78) return { facing: 'front', dir };
  if (fy < -.62 && Math.abs(fx) < .78) return { facing: 'back', dir };
  return { facing: 'side', dir };
}

export function drawFigure(g: CanvasRenderingContext2D, F: Figure, P: Pose, hooks: Hooks = {}): Joints {
  const B = BUILD[F.build], side = P.facing === 'side', back = P.facing === 'back';
  const step = P.moving ? Math.sin(P.walk) : 0, t = P.t + (P.seed || 0);
  const bob = P.moving ? -Math.abs(step) * 2.6 : Math.sin(t * 2.2) * .7;
  g.save();
  g.scale(B.all, B.all);
  if (side && P.dir < 0) g.scale(-1, 1);
  g.translate(0, bob);
  const w = B.w, long = F.outfit === 'robe' || F.outfit === 'dress';
  const hemY = long ? 19 : F.outfit === 'coat' ? 14 : 11, hemW = (long ? 14.5 : 12.5) * w, shW = 10.2 * w;
  const sway = P.moving ? step * 1.6 : Math.sin(t * 1.6) * .4;

  // ── arms: the front arm follows the action, the back arm swings with the walk.
  const shF: Point = side ? { x: 2, y: -10 } : { x: back ? -shW : shW, y: -9.5 };
  const shB: Point = side ? { x: -3, y: -10.5 } : { x: back ? shW : -shW, y: -9.5 };
  const L = 12.5, k = P.k ?? 0;
  const idleF = side ? Math.PI / 2 - step * .55 : Math.PI / 2 - .32, idleB = side ? Math.PI / 2 + step * .55 : Math.PI / 2 + .32;
  let angF = idleF, reach = 1;
  switch (P.arm) {
    case 'raise': angF = side ? -1.1 + (1 - k) * .6 : -1.3; reach = .95; break;
    case 'point': angF = side ? -.2 : Math.PI / 2 - .9; break;
    case 'swing': angF = -2.1 + k * 2.9; break;
    case 'thrust': angF = side ? -.05 : .4; reach = .8 + Math.sin(k * Math.PI) * .45; break;
    case 'draw': angF = side ? -.1 : .9; break;
    case 'work': angF = -1.2 + Math.sin(k * TAU) * 1.1; break;
    case 'wave': angF = -1.9 + Math.sin(t * 9) * .45; break;
    case 'hold': angF = side ? .55 : Math.PI / 2 - .7; break;
    case 'fish': angF = side ? -.5 : -.6; break;
    case 'sweep': angF = Math.PI / 2 + .3 + Math.sin(t * 3) * .4; break;
  }
  const angB = P.arm === 'draw' ? (side ? Math.PI - .2 : Math.PI - .9) : idleB;
  const handF = { x: shF.x + Math.cos(angF) * L * reach, y: shF.y + Math.sin(angF) * L * reach };
  const handB = { x: shB.x + Math.cos(angB) * (P.arm === 'draw' ? 8 : L), y: shB.y + Math.sin(angB) * (P.arm === 'draw' ? 8 : L) };
  const J: Joints = { handF, handB, angF, head: { x: side ? 1 : 0, y: HEAD_Y }, hip: { x: 0, y: 4 }, back: { x: side ? -8 : 0, y: -6 }, scale: B.all, facing: P.facing };

  // ── cape and long hair behind the body (in front of it when seen from behind).
  const cape = () => {
    if (!F.cape) return;
    const cl = F.capeLong ? 20 : 12, wave = Math.sin(t * 3.2) * 1.4 + (P.moving ? 2.2 : 0);
    g.fillStyle = F.cape; g.beginPath();
    if (side) { g.moveTo(-1, -12); g.quadraticCurveTo(-14 - wave, 2, -15 - wave * 1.6, cl); g.quadraticCurveTo(-7, cl + 3, -1, cl - 2); g.closePath(); }
    else { g.moveTo(-shW + 1, -12); g.quadraticCurveTo(-shW - 4 - wave * .4, cl * .5, -shW - 5, cl); g.quadraticCurveTo(0, cl + 4 + wave * .4, shW + 5, cl); g.quadraticCurveTo(shW + 4 + wave * .4, cl * .5, shW - 1, -12); g.closePath(); }
    g.fill();
    if (back) { g.strokeStyle = shade(F.cape, -.22); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(1, cl * .5, 0, cl + 1); g.stroke(); }
  };
  const hairBack = () => {
    const h = F.hairStyle, c = shade(F.hair, -.08);
    if (h === 'long') { g.fillStyle = c; g.beginPath(); if (side) { g.moveTo(-6, -36); g.quadraticCurveTo(-18, -18, -12 - sway, 2); g.lineTo(-2, -2); g.lineTo(-2, -24); } else { g.moveTo(-14, -30); g.quadraticCurveTo(-18, -10, -13, 2); g.lineTo(13, 2); g.quadraticCurveTo(18, -10, 14, -30); } g.closePath(); g.fill(); }
    if (h === 'braid' || h === 'pony') {
      const bx = side ? -11 : back ? 0 : -11, by = -22;
      g.strokeStyle = c; g.lineCap = 'round'; g.lineWidth = h === 'braid' ? 5 : 6.5;
      g.beginPath(); g.moveTo(bx, by - 6); g.quadraticCurveTo(bx - 5 - sway, by + 8, bx - 3 - sway * 1.5, by + 20); g.stroke();
      if (h === 'braid') for (let i = 0; i < 3; i++) ellipse(g, bx - 3 - sway * (i * .5) - i * .5, by + 2 + i * 6, 3.2, 2.2, shade(c, -.12), .4);
      circle(g, bx - 3 - sway * 1.5, by + 21, 2.4, F.hatTrim || '#c0392b');
    }
    if (h === 'curly' && !back) for (let i = 0; i < 5; i++) circle(g, (i - 2) * 6.5, -18 + Math.abs(i - 2) * 1.5, 5, c);
  };
  if (!back) { cape(); hairBack(); }
  hooks.behind?.(g, J);

  // ── back arm (behind the body unless seen from behind).
  const sleeve = F.sleeves || F.top, glove = F.gloves || F.skin;
  const armB = () => { limb(g, shB.x, shB.y, handB.x, handB.y, 5.6, 4.6, shade(sleeve, -.14)); hooks.heldBack?.(g, J); circle(g, handB.x, handB.y, 3.1, shade(glove, -.1)); };
  if (!back) armB();

  // ── legs and boots.
  const legTop = long ? 12 : 7;
  if (side) {
    const fx = step * 6.5, lift = (s: number) => Math.max(0, s) * 2.4;
    limb(g, -1.5, legTop, -1.5 - fx, 19 - lift(-step), 5.6, 5, shade(F.legs, -.18)); ellipse(g, -.5 - fx, 21 - lift(-step), 5.6, 3, shade(F.boots, -.18));
    limb(g, 1.5, legTop, 1.5 + fx, 19 - lift(step), 5.6, 5, F.legs); ellipse(g, 2.8 + fx, 21 - lift(step), 5.8, 3.1, F.boots);
  } else {
    for (const s of [-1, 1]) {
      const lift = Math.max(0, s * step) * 2.8;
      limb(g, s * 4.6 * w, legTop, s * 5 * w, 19 - lift, 5.6, 5, F.legs);
      ellipse(g, s * 5.4 * w, 21 - lift, 5.2, 3.1, F.boots);
    }
  }

  // ── body.
  g.fillStyle = F.top; g.beginPath();
  if (side) {
    const fw = 9.5 * w, bw = 8 * w, hf = long ? 13.5 * w : 11 * w;
    g.moveTo(-bw + 1, -12.5); g.quadraticCurveTo(fw + 1, -14, fw, -4); g.quadraticCurveTo(fw + 1, hemY - 5, hf + sway, hemY);
    g.quadraticCurveTo(0, hemY + 3, -hf * .92 + sway * .5, hemY); g.quadraticCurveTo(-bw - 1, 0, -bw + 1, -12.5);
  } else {
    g.moveTo(-shW, -12.5); g.quadraticCurveTo(0, -15.5, shW, -12.5);
    g.quadraticCurveTo(shW + 1.5, -2, hemW + sway, hemY); g.quadraticCurveTo(0, hemY + 4, -hemW + sway, hemY);
    g.quadraticCurveTo(-shW - 1.5, -2, -shW, -12.5);
  }
  g.closePath(); g.fill();
  // Trim along the hem, the fold down the front, an apron or armour plates.
  if (F.trim) { g.strokeStyle = F.trim; g.lineWidth = 2.2; g.beginPath(); if (side) { g.moveTo(-8 * w + sway * .5, hemY - 1); g.quadraticCurveTo(0, hemY + 2, (long ? 13 : 10.5) * w + sway, hemY - 1); } else { g.moveTo(-hemW + 1.2 + sway, hemY - 1); g.quadraticCurveTo(0, hemY + 3, hemW - 1.2 + sway, hemY - 1); } g.stroke(); }
  if (F.outfit === 'coat' && !back) { g.strokeStyle = shade(F.top, -.28); g.lineWidth = 1.4; g.beginPath(); g.moveTo(side ? 6 : 0, -12); g.lineTo(side ? 8 : 0, hemY); g.stroke(); if (!side) { g.fillStyle = shade(F.top, .18); g.beginPath(); g.moveTo(-6, -13); g.lineTo(0, -5); g.lineTo(6, -13); g.closePath(); g.fill(); } }
  if (F.outfit === 'armor' && !back) {
    g.fillStyle = shade(F.top, .22); g.beginPath(); g.ellipse(side ? 3 : 0, -5, side ? 6.5 : 8 * w, 7, 0, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    g.strokeStyle = shade(F.top, -.3); g.lineWidth = 1.1; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(side ? -6 : -hemW * .8, 6 + i * 3.2); g.quadraticCurveTo(side ? 3 : 0, 8.5 + i * 3.2, side ? 10 : hemW * .8, 6 + i * 3.2); g.stroke(); }
  }
  if (F.outfit === 'leather' && !back) { g.strokeStyle = shade(F.top, -.32); g.lineWidth = 1.2; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(side ? 5 : 0, -12); g.lineTo(side ? 6 : 0, hemY - 1); g.stroke(); g.setLineDash([]); }
  if (F.apron && !back) { g.fillStyle = F.apron; g.beginPath(); if (side) { g.moveTo(3, -4); g.lineTo(9 * w, -4); g.lineTo(10 * w + sway, hemY - 1); g.lineTo(3, hemY); } else { g.moveTo(-6.5, -6); g.lineTo(6.5, -6); g.lineTo(8 + sway, hemY - 1); g.lineTo(-8 + sway, hemY - 1); } g.closePath(); g.fill(); }
  if (F.emblem && !back) { g.fillStyle = F.emblem; if (side) { g.beginPath(); g.arc(5, -5, 2.4, 0, TAU); g.fill(); } else { g.beginPath(); g.moveTo(0, -9); g.lineTo(3, -5); g.lineTo(0, -1); g.lineTo(-3, -5); g.closePath(); g.fill(); } }
  if (F.belt) { g.fillStyle = F.belt; if (side) g.fillRect(-8 * w, 1.5, 17.5 * w, 3.4); else g.fillRect(-shW - .8, 1.5, shW * 2 + 1.6, 3.4); if (!back) { g.fillStyle = '#f2d27a'; g.fillRect(side ? 5 : -2, 1.8, 3.6, 2.8); } }
  if (F.shoulders) { if (side) ellipse(g, 1, -11, 6.8, 4.4, F.shoulders); else { ellipse(g, -shW + .5, -11, 6.2, 4.2, F.shoulders); ellipse(g, shW - .5, -11, 6.2, 4.2, F.shoulders); } }
  if (F.scarf) { g.fillStyle = F.scarf; if (side) { g.beginPath(); g.ellipse(1, -12.5, 8, 3.6, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(-5, -12); g.quadraticCurveTo(-11 - sway * 2, -8, -13 - sway * 3, -3); g.lineTo(-8, -3); g.quadraticCurveTo(-7, -8, -2, -11); g.fill(); } else { g.beginPath(); g.ellipse(0, -12.5, shW + .5, 3.8, 0, 0, TAU); g.fill(); if (!back) { g.fillRect(-7, -12, 4.2, 9 + Math.abs(sway)); } } }

  if (back) { cape(); hairBack(); armB(); }

  // ── head.
  const hy = HEAD_Y, hx = side ? 1 : 0, s = B.head;
  g.save(); g.translate(hx, hy); g.scale(s, s);
  if (!back) {
    if (side) ellipse(g, -6, 1, 3, 3.6, shade(F.skin, -.1)); else { ellipse(g, -HEAD_RX + .6, 1.5, 3, 3.4, shade(F.skin, -.08)); ellipse(g, HEAD_RX - .6, 1.5, 3, 3.4, shade(F.skin, -.08)); }
  }
  ellipse(g, 0, 0, HEAD_RX, HEAD_RY, F.skin);
  if (back) {
    // Seen from behind: all hair.
    g.fillStyle = F.hair; g.beginPath(); g.ellipse(0, -1, HEAD_RX + .8, HEAD_RY + .6, 0, Math.PI * .92, Math.PI * 2.08); g.quadraticCurveTo(0, HEAD_RY + 2, -HEAD_RX - .6, 2); g.fill();
    if (F.hairStyle === 'bald') ellipse(g, 0, 0, HEAD_RX, HEAD_RY, F.skin);
  } else face(g, F, P, side, t);
  if (!back) hairFront(g, F, side, sway);
  hat(g, F, P, side, back, t);
  g.restore();

  // ── front arm, holding whatever it holds.
  limb(g, shF.x, shF.y, handF.x, handF.y, 5.6, 4.6, sleeve);
  if (F.shoulders && side) ellipse(g, shF.x - 1, shF.y - 1, 5.8, 4, F.shoulders);
  hooks.held?.(g, J);
  circle(g, handF.x, handF.y, 3.2, glove);
  hooks.front?.(g, J);
  g.restore();
  // Report joints in the unmirrored, unscaled frame.
  const m = side && P.dir < 0 ? -1 : 1, sc = B.all, tr = (p: Point) => ({ x: p.x * m * sc, y: (p.y + bob) * sc });
  return { ...J, handF: tr(handF), handB: tr(handB), head: tr({ x: hx, y: hy }), hip: tr(J.hip), back: tr(J.back), angF: m < 0 ? Math.PI - angF : angF };
}

function face(g: CanvasRenderingContext2D, F: Figure, P: Pose, side: boolean, t: number) {
  const blink = P.blink ?? ((t * .37 + (P.seed || 0) * .13) % 3.3 < .12), eye = F.glowEyes || F.eyes || EYE;
  const ex = side ? [3.4, 9.6] : [-5.2, 5.2], ey = 1.2, ew = side ? [2.2, 1.7] : [2.5, 2.5];
  if (F.mask) {
    // A cloth mask over nose and mouth: only the eyes show.
    g.fillStyle = F.mask; g.beginPath(); if (side) { g.moveTo(-2, 3); g.quadraticCurveTo(9, 2, 15, 4.5); g.quadraticCurveTo(12, 12, 2, 12.5); g.closePath(); } else { g.moveTo(-13, 3.4); g.quadraticCurveTo(0, 1.8, 13, 3.4); g.quadraticCurveTo(12, 12, 0, 13); g.quadraticCurveTo(-12, 12, -13, 3.4); } g.fill();
  }
  if (blink) { g.strokeStyle = eye; g.lineWidth = 1.5; g.lineCap = 'round'; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(ex[i] - ew[i], ey + .5); g.quadraticCurveTo(ex[i], ey + 2, ex[i] + ew[i], ey + .5); g.stroke(); } }
  else for (let i = 0; i < 2; i++) {
    ellipse(g, ex[i], ey, ew[i], 3.3, eye);
    if (F.glowEyes) ellipse(g, ex[i], ey, ew[i] * .55, 1.6, '#ffffff');
    else { circle(g, ex[i] - ew[i] * .35, ey - 1.3, .95, '#ffffff'); circle(g, ex[i] + ew[i] * .4, ey + 1.2, .45, 'rgba(255,255,255,.7)'); }
  }
  if (F.brows) { g.strokeStyle = shade(F.hair, -.25); g.lineWidth = 1.3; g.lineCap = 'round'; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(ex[i] - ew[i] - .5, ey - 4.8); g.lineTo(ex[i] + ew[i] + .5, ey - 5.6 + (side ? 0 : i ? 0 : .6)); g.stroke(); } }
  if (!F.mask) {
    const mx = side ? 7.5 : 0;
    ellipse(g, side ? ex[1] + 1.5 : -8.6, 5.4, 2.6, 1.6, BLUSH); if (!side) ellipse(g, 8.6, 5.4, 2.6, 1.6, BLUSH);
    g.strokeStyle = MOUTH; g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath(); g.moveTo(mx - 2, 6.2); g.quadraticCurveTo(mx, 7.8, mx + 2, 6.2); g.stroke();
    if (side) { g.fillStyle = shade(F.skin, -.12); g.beginPath(); g.ellipse(14, 2.6, 1.6, 1.4, 0, 0, TAU); g.fill(); }
    if (F.freckles) for (const [fx, fy] of side ? [[5, 5], [8, 5.6], [11, 5]] : [[-7, 4.6], [-9.2, 5.6], [7, 4.6], [9.2, 5.6]]) circle(g, fx, fy, .5, 'rgba(150,80,40,.7)');
  }
  if (F.beard) { g.fillStyle = F.beard; g.beginPath(); if (side) { g.moveTo(1, 4); g.quadraticCurveTo(8, 16, 15, 5); g.quadraticCurveTo(9, 8, 1, 4); } else { g.moveTo(-10, 3); g.quadraticCurveTo(0, 20, 10, 3); g.quadraticCurveTo(5, 7.5, 0, 7); g.quadraticCurveTo(-5, 7.5, -10, 3); } g.fill(); }
}

function hairFront(g: CanvasRenderingContext2D, F: Figure, side: boolean, sway: number) {
  const h = F.hairStyle, c = F.hair;
  if (h === 'bald') return;
  g.fillStyle = c; g.beginPath();
  if (side) {
    // A cap of hair sweeping back, bangs over the brow.
    g.moveTo(-HEAD_RX - .5, 3); g.quadraticCurveTo(-HEAD_RX - 1, -HEAD_RY - 1, 2, -HEAD_RY - 1.2); g.quadraticCurveTo(HEAD_RX + 1, -HEAD_RY + 2, HEAD_RX, -3);
    g.quadraticCurveTo(9, -6.5, 6, -4); g.quadraticCurveTo(3, -7, -1, -4); g.quadraticCurveTo(-3, 2, -8, 4); g.closePath();
  } else {
    g.moveTo(-HEAD_RX - .6, 2); g.quadraticCurveTo(-HEAD_RX - 1.2, -HEAD_RY - 1.5, 0, -HEAD_RY - 1.2); g.quadraticCurveTo(HEAD_RX + 1.2, -HEAD_RY - 1.5, HEAD_RX + .6, 2);
    if (h === 'spiky') { for (let i = 5; i >= -5; i--) g.lineTo(i * 2.6, i % 2 ? -7 : -3.5); }
    else if (h === 'swept') { g.quadraticCurveTo(10, -9, 2, -6.5); g.quadraticCurveTo(-6, -4, -12, -1); }
    else { g.quadraticCurveTo(11, -5.5, 7, -4.5); g.quadraticCurveTo(4, -7.5, 1, -4.5); g.quadraticCurveTo(-3, -8, -6, -4.5); g.quadraticCurveTo(-10, -6, -12, -1); }
    g.closePath();
  }
  g.fill();
  if ((h === 'bob' || h === 'long' || h === 'curly') && !side) { g.beginPath(); g.moveTo(-HEAD_RX - .6, 0); g.quadraticCurveTo(-HEAD_RX - 2, 8, -HEAD_RX + 2, 11); g.lineTo(-HEAD_RX + 3, -2); g.fill(); g.beginPath(); g.moveTo(HEAD_RX + .6, 0); g.quadraticCurveTo(HEAD_RX + 2, 8, HEAD_RX - 2, 11); g.lineTo(HEAD_RX - 3, -2); g.fill(); }
  if (h === 'bun') { circle(g, side ? -6 : 0, -HEAD_RY - 3, 5.5, c); }
  if (h === 'curly') for (let i = 0; i < 4; i++) circle(g, -9 + i * 6 + (side ? 2 : 0), -HEAD_RY + 1, 4.3, c);
  // A soft shine on the hair.
  g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.arc(side ? -1 : -4, -6, 7, Math.PI * 1.15, Math.PI * 1.5); g.stroke();
  void sway;
}

function hat(g: CanvasRenderingContext2D, F: Figure, P: Pose, side: boolean, back: boolean, t: number) {
  const c = F.hatColor, dk = shade(c, -.22), trim = F.hatTrim || shade(c, .3), sx = side ? 1.5 : 0;
  switch (F.hat) {
    case 'straw': ellipse(g, sx, -8, side ? 21 : 22, 5.5, c); g.fillStyle = c; g.beginPath(); g.ellipse(sx, -10, 10.5, 9, 0, Math.PI, TAU); g.fill(); g.fillStyle = trim; g.fillRect(sx - 10.5, -11, 21, 2.6); break;
    case 'hood': case 'cowl': case 'ranger': {
      g.fillStyle = c; g.beginPath();
      if (back) { g.ellipse(0, -1, HEAD_RX + 2.4, HEAD_RY + 2.2, 0, 0, TAU); g.fill(); if (F.hat !== 'cowl') { g.beginPath(); g.moveTo(-4, -HEAD_RY); g.quadraticCurveTo(0, -HEAD_RY - 8, 5, -HEAD_RY - 2); g.fill(); } break; }
      if (side) { g.moveTo(10, 8); g.quadraticCurveTo(16, -4, 10, -12); g.quadraticCurveTo(0, -20, -12, -12); g.quadraticCurveTo(-19, -2, -14, 11); g.quadraticCurveTo(-6, 14, -2, 9); g.quadraticCurveTo(-7, 0, -3, -7); g.quadraticCurveTo(4, -10, 10, -5); g.closePath(); }
      else { g.moveTo(-HEAD_RX - 2.5, 10); g.quadraticCurveTo(-HEAD_RX - 4, -HEAD_RY - 3, 0, -HEAD_RY - 3.4); g.quadraticCurveTo(HEAD_RX + 4, -HEAD_RY - 3, HEAD_RX + 2.5, 10); g.quadraticCurveTo(HEAD_RX - 1, 1, HEAD_RX - 3, -5); g.quadraticCurveTo(0, -12, -HEAD_RX + 3, -5); g.quadraticCurveTo(-HEAD_RX + 1, 1, -HEAD_RX - 2.5, 10); g.closePath(); }
      g.fill();
      if (F.hat === 'ranger') { g.fillStyle = dk; g.beginPath(); g.moveTo(side ? -9 : -6, -HEAD_RY - 1); g.quadraticCurveTo(side ? -18 : 0, -HEAD_RY - 9, side ? -16 : 5, -HEAD_RY - 1); g.fill(); }
      if (F.hat === 'hood' || F.hat === 'ranger') { g.strokeStyle = trim; g.lineWidth = 1.2; g.beginPath(); if (side) { g.moveTo(10, -5); g.quadraticCurveTo(4, -10, -3, -7); } else g.arc(0, 1, HEAD_RX - 1.2, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      break;
    }
    case 'cap': g.fillStyle = c; g.beginPath(); g.ellipse(sx, -7, 12.5, 10, 0, Math.PI, TAU); g.fill(); ellipse(g, side ? 12 : sx, side ? -7 : -6, side ? 8 : 12, side ? 2.6 : 3, dk); if (!back) { g.fillStyle = trim; g.fillRect(sx - 12, -8.5, 24, 2); } break;
    case 'wizard': case 'star': {
      const bend = Math.sin(t * 1.3) * 2.5 + (P.moving ? -3 : 0);
      ellipse(g, sx, -9, 20, 5.2, dk);
      g.fillStyle = c; g.beginPath(); g.moveTo(sx - 11, -10); g.quadraticCurveTo(sx - 5, -30, sx - 13 + bend, -41); g.quadraticCurveTo(sx + 5, -30, sx + 11, -10); g.closePath(); g.fill();
      g.fillStyle = trim; g.fillRect(sx - 11, -13, 22, 3.2);
      if (F.hat === 'star') { g.fillStyle = '#ffe38a'; drawStar(g, sx - 13 + bend, -42, 4.5); g.fill(); circle(g, sx + 4, -22, 1.4, '#fff1b8'); circle(g, sx - 3, -29, 1.1, '#fff1b8'); }
      break;
    }
    case 'bonnet': g.fillStyle = c; g.beginPath(); g.ellipse(sx - 1, -3, HEAD_RX + 2.2, HEAD_RY + 1.5, 0, Math.PI * .9, Math.PI * 2.1); g.fill(); if (!back) { ellipse(g, side ? -8 : -12, 7, 2.4, 4.4, c); if (!side) ellipse(g, 12, 7, 2.4, 4.4, c); } g.strokeStyle = trim; g.lineWidth = 1.2; g.beginPath(); g.ellipse(sx - 1, -3, HEAD_RX, HEAD_RY - .5, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); break;
    case 'helm': case 'plume': {
      g.fillStyle = c; g.beginPath(); g.ellipse(sx, -3, HEAD_RX + 1.5, HEAD_RY + 1, 0, Math.PI * .98, Math.PI * 2.02); g.lineTo(HEAD_RX + 1.5, 2); g.lineTo(-HEAD_RX - 1.5, 2); g.closePath(); g.fill();
      g.fillStyle = shade(c, .28); g.beginPath(); g.ellipse(sx - 4, -7, 5, 4, -.5, 0, TAU); g.fill();
      if (!back) { g.fillStyle = dk; if (side) g.fillRect(4, -1.5, 11, 2.6); else g.fillRect(-HEAD_RX - 1.5, -.5, HEAD_RX * 2 + 3, 2.6); g.fillRect(side ? 5 : -1.2, -1.5, 2.4, 6); }
      if (F.hat === 'plume') { const pw = Math.sin(t * 3.3) * 2 + (P.moving ? 3 : 0); g.fillStyle = F.hatTrim || '#c0392b'; g.beginPath(); g.moveTo(sx - 1, -HEAD_RY - 1); g.quadraticCurveTo(sx - 10 - pw, -HEAD_RY - 12, sx - 18 - pw, -HEAD_RY + 3); g.quadraticCurveTo(sx - 9, -HEAD_RY - 5, sx + 2, -HEAD_RY + 1); g.fill(); }
      else { g.fillStyle = F.hatTrim || '#c0392b'; g.fillRect(sx - 1.4, -HEAD_RY - 6, 2.8, 6); }
      break;
    }
    case 'circlet': if (!back) { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.arc(0, 1, HEAD_RX - .5, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); g.fillStyle = trim; g.beginPath(); g.moveTo(sx, -HEAD_RY - 5); g.lineTo(sx + 3.2, -HEAD_RY + 1); g.lineTo(sx, -HEAD_RY + 4); g.lineTo(sx - 3.2, -HEAD_RY + 1); g.closePath(); g.fill(); } break;
    case 'ears': for (const e of side ? [-4, 5] : [-8.5, 8.5]) { g.fillStyle = c; g.beginPath(); g.moveTo(e - 4.5, -HEAD_RY + 3); g.lineTo(e, -HEAD_RY - 9); g.lineTo(e + 4.5, -HEAD_RY + 3); g.closePath(); g.fill(); g.fillStyle = '#f2b8c0'; g.beginPath(); g.moveTo(e - 2, -HEAD_RY + 1); g.lineTo(e, -HEAD_RY - 5); g.lineTo(e + 2, -HEAD_RY + 1); g.closePath(); g.fill(); } break;
    case 'scarf': case 'none': break;
  }
}
function drawStar(g: CanvasRenderingContext2D, x: number, y: number, r: number) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }

/** How far a figure reaches around its anchor (for the cutout buffer). */
export const FIGURE_BOX: [number, number, number, number] = [-34, -80, 68, 108];
