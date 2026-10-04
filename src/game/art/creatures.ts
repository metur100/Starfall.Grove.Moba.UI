// Starfall Grove's creatures, painted exactly as in the valley (copied from its renderer), for Mini Rift's minions,
// camps and the Star Warden. Each painter draws one creature around its feet at (0, 0), facing right unless it looks
// the other way. `Creature` holds just the bits of state the painters read.
import { TAU, alpha } from './color';

export type Look = { x: number; y: number };
export type Creature = {
  kind: string; r: number; elite: boolean; rage: number; windup: number; aggro: boolean; lunge: number; chargeX: number;
  action: string | null; actionT: number; phase: number; burrowT: number; angle: number; x: number; y: number;
};
export type Point = Look;
type Ctx = { bossUnlocked(en: Creature): boolean };
const AWAKE: Ctx = { bossUnlocked: () => true };
type Mote = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; rot: number; vr: number; kind: string; color: string; phase: number };

let clock = 0;
let emit: (m: Mote) => void = () => {};
/** The time the painters animate by, and where the motes they shed go. */
export function setCreatureClock(t: number, onMote: (m: Mote) => void) { clock = t; emit = onMote; }
const ambient = (m: Mote) => emit(m);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const tintCache = new Map<string, string>();
/** Blends a '#rrggbb' colour toward angry red as a creature turns aggressive (k = 0…1). */
function enrage(c: string, k: number) {
  if (k < .06) return c;
  const q = Math.round(k * 8) / 8, key = c + q;
  let v = tintCache.get(key);
  if (!v) { const n = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), red = [255, 46, 36], m = q * .82; v = `rgb(${n.map((x, i) => Math.round(x + (red[i] - x) * m)).join(',')})`; tintCache.set(key, v); }
  return v;
}
const glowCache = new Map<string, HTMLCanvasElement>();
/** A soft glow, drawn from a cached sprite (no gradients made per frame). */
export function glowSprite(color: string) {
  let c = glowCache.get(color);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, alpha(color, 1)); grad.addColorStop(.25, alpha(color, .55)); grad.addColorStop(1, alpha(color, 0));
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64); glowCache.set(color, c);
  }
  return c;
}
/** While a creature is being baked, its glows are set aside (in world units around its anchor) and drawn outside the
 *  paper piece, so they don't get a cut edge. */
type Deferred = { g: CanvasRenderingContext2D; inv: DOMMatrix; res: number; glows: GlowMark[] };
export type GlowMark = [number, number, number, string, number];
let DEFER: Deferred | null = null;
export function beginGlows(g: CanvasRenderingContext2D, res: number) { DEFER = { g, inv: g.getTransform().inverse(), res, glows: [] }; }
export function endGlows(): GlowMark[] { const d = DEFER; DEFER = null; return d?.glows ?? []; }
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 1) {
  if (r <= 0 || a <= 0) return;
  if (DEFER && ctx === DEFER.g) {
    const m = ctx.getTransform(), p = DEFER.inv.transformPoint(m.transformPoint(new DOMPoint(x, y)));
    DEFER.glows.push([p.x, p.y, r * Math.hypot(m.a, m.b) / DEFER.res, color, a * ctx.globalAlpha]);
    return;
  }
  const prevA = ctx.globalAlpha, prevOp = ctx.globalCompositeOperation;
  ctx.globalAlpha = prevA * a; ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prevA; ctx.globalCompositeOperation = prevOp;
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points = 4, inner = .38, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) { const a = rot + (i / (points * 2)) * TAU - Math.PI / 2, rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rot = 0) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rot, 0, TAU); ctx.fill(); }
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(.1, r), 0, TAU); ctx.fill(); }
/** Shadows are drawn by the renderer under the cutout, so the painters skip them. */
function shadow(_ctx: CanvasRenderingContext2D, _x: number, _y: number, _rx: number, _ry: number, _a = .25) { /* drawn outside the piece */ }

type Skin = { body: string; elite: string; trim: string; glow: string; eye?: string; mark?: 'leaf' | 'frost' | 'ember' };
const SKIN: Partial<Record<string, Skin>> = {
  bogling: { body: '#5f8a4a', elite: '#3f6a3a', trim: '#40603a', glow: '#c9ff7a', mark: 'leaf' },
  briarling: { body: '#8a3a4a', elite: '#6a2a3a', trim: '#4a2a3a', glow: '#ff8fb0', eye: '#e0a0b0' },
  rimeling: { body: '#bfe8ff', elite: '#9fc8f0', trim: '#7fb0e0', glow: '#dff6ff', eye: '#ffffff', mark: 'frost' },
  mirecap: { body: '#3f9aa0', elite: '#2a6a8a', trim: '#d8e8e0', glow: '#9ff0e8' },
  snowfang: { body: '#dfe8f4', elite: '#b8c8e0', trim: '#9fb8d8', glow: '#5a8fe0', mark: 'frost' },
  cinderhound: { body: '#3a2a26', elite: '#2a1a18', trim: '#ff7a3d', glow: '#ffb347', mark: 'ember' },
  marshlight: { body: '#8fe0a0', elite: '#c9ff7a', trim: '#4fb070', glow: '#7fe08a' },
  pyrewisp: { body: '#ffa040', elite: '#ff4d4d', trim: '#c8501e', glow: '#ff8a3d' },
};
export function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    const t = clock;
    glow(ctx, x, y - 10 * size, 60 * size, color, .9);
    for (let i = 0; i < 5; i++) {
      const f = Math.sin(t * 12 + i * 2 + x) * 3 * size, h = (22 - i * 3) * size;
      ctx.fillStyle = i === 0 ? alpha(color, .9) : i < 3 ? 'rgba(255,190,90,.8)' : 'rgba(255,245,210,.9)';
      ctx.beginPath(); ctx.moveTo(x - (10 - i * 1.6) * size, y); ctx.quadraticCurveTo(x - 8 * size + f, y - h * .6, x + f * .6, y - h); ctx.quadraticCurveTo(x + 8 * size + f, y - h * .6, x + (10 - i * 1.6) * size, y); ctx.fill();
    }
    if (Math.random() < .3 * size) ambient({ x: x + rand(-6, 6), y: y - 14 * size, vx: rand(-10, 10), vy: rand(-70, -40), life: .9, max: .9, size: 2, rot: 0, vr: 0, kind: 'mote', color: '#ffcf6e', phase: 0 });
  }
export function drawBoar(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r, charging = en.lunge > 0, dir = charging ? Math.sign(en.chargeX || 1) : look.x >= 0 ? 1 : -1, run = en.aggro ? Math.sin(t * (charging ? 30 : 12)) : Math.sin(t * 4) * .3;
    shadow(ctx, 0, r * .75, r * 1.25, r * .4);
    ctx.translate(trem, charging ? -2 : 0); ctx.scale(dir, 1); if (charging) ctx.rotate(.12);
    ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const [lx, ph] of [[-.55, 1], [-.25, -1], [.3, -1], [.6, 1]] as Array<[number, number]>) { ctx.beginPath(); ctx.moveTo(lx * r, r * .25); ctx.lineTo(lx * r + run * ph * 5, r * .72); ctx.stroke(); }
    const body = flash ? '#fff' : enrage(en.elite ? '#6a3a24' : '#8a5a3a', en.rage);
    ellipse(ctx, 0, 0, r * 1.05, r * .68, body);
    ctx.fillStyle = flash ? '#fff' : enrage('#5a3622', en.rage);
    for (let i = 0; i < 9; i++) { const bx = -r * .8 + i * r * .2; ctx.beginPath(); ctx.moveTo(bx - 4, -r * .45); ctx.lineTo(bx, -r * .78 - (i % 2) * 4); ctx.lineTo(bx + 4, -r * .45); ctx.fill(); }
    ellipse(ctx, r * .8, r * .05, r * .42, r * .36, body);
    ellipse(ctx, r * 1.12, r * .12, r * .18, r * .14, '#e0a08a'); circle(ctx, r * 1.14, r * .1, 2, '#3a2618'); circle(ctx, r * 1.22, r * .12, 2, '#3a2618');
    ctx.fillStyle = '#fff4e0'; ctx.beginPath(); ctx.moveTo(r * .98, r * .22); ctx.quadraticCurveTo(r * 1.1, r * .05, r * 1.02, -r * .12); ctx.lineTo(r * .94, r * .18); ctx.fill();
    circle(ctx, r * .78, -r * .1, 3, en.windup > 0 || charging ? '#ff5a4a' : '#1d1726');
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(r * .55, -r * .25); ctx.lineTo(r * .62, -r * .55); ctx.lineTo(r * .75, -r * .28); ctx.fill();
    ctx.strokeStyle = body; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r, -r * .05); ctx.quadraticCurveTo(-r * 1.3, -r * .2 + Math.sin(t * 8) * 4, -r * 1.2, r * .1); ctx.stroke();
  }
export function drawSporecap(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r, swell = en.windup > 0 ? 1 + (1 - en.windup / .9) * .35 : 1 + Math.sin(t * 3) * .03, hop = en.aggro ? Math.abs(Math.sin(t * 5)) * 3 : 0;
    shadow(ctx, 0, r * .8, r, r * .35);
    ctx.translate(trem, -hop);
    const sk = SKIN[en.kind];
    ellipse(ctx, 0, r * .35, r * .5, r * .55, flash ? '#fff' : sk?.trim || '#efe4c8');
    for (const s of [-1, 1]) ellipse(ctx, s * r * .22, r * .85, r * .18, r * .1, '#c9b89a');
    eyes(ctx, 0, r * .3, r * .2, r * .13, look, t, en.aggro);
    ctx.save(); ctx.scale(swell, swell);
    const cap = flash ? '#fff' : enrage(sk ? (en.elite ? sk.elite : sk.body) : en.elite ? '#7a3aa0' : '#c8503a', en.rage);
    ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(0, -r * .1, r * 1.1, r * .8, 0, Math.PI, TAU); ctx.quadraticCurveTo(0, r * .2, -r * 1.1, -r * .1); ctx.fill();
    for (let i = 0; i < 6; i++) circle(ctx, Math.cos(i * 1.1 + 3.4) * r * .65, -r * .4 + Math.sin(i * 1.1 + 3.4) * r * .25, r * (.1 + (i % 2) * .05), sk ? 'rgba(200,255,250,.9)' : 'rgba(235,255,190,.85)');
    ctx.restore();
    if (en.windup > 0 || Math.random() < .08) ambient({ x: en.x + rand(-r, r), y: en.y - r * .5, vx: rand(-10, 10), vy: rand(-30, -10), life: .9, max: .9, size: 2.4, rot: 0, vr: 0, kind: 'mote', color: sk?.glow || '#b9e27a', phase: 0 });
    if (sk) glow(ctx, 0, -r * .3, r * 1.4, sk.glow, .3);
  }
export function drawWolf(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r, dir = look.x >= 0 ? 1 : -1, run = Math.sin(t * (en.aggro ? 18 : 6)), lunge = en.lunge > 0;
    shadow(ctx, 0, r * .75, r * 1.2, r * .38);
    ctx.translate(trem, lunge ? -4 : 0); ctx.scale(dir, 1); if (lunge) ctx.rotate(-.15);
    const sk = SKIN[en.kind];
    const fur = flash ? '#fff' : enrage(sk ? (en.elite ? sk.elite : sk.body) : en.elite ? '#2a2a44' : '#4a4e6a', en.rage);
    ctx.strokeStyle = fur; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const [lx, ph] of [[-.6, 1], [-.3, -1], [.35, -1], [.62, 1]] as Array<[number, number]>) { ctx.beginPath(); ctx.moveTo(lx * r, r * .2); ctx.lineTo(lx * r + run * ph * 6, r * .74); ctx.stroke(); }
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-r * .9, -r * .1); ctx.quadraticCurveTo(-r * 1.4, -r * .5 + Math.sin(t * 7) * 5, -r * 1.55, -r * .1); ctx.stroke();
    ellipse(ctx, 0, 0, r * 1, r * .52, fur); ellipse(ctx, -r * .1, r * .15, r * .7, r * .25, 'rgba(255,255,255,.08)');
    ellipse(ctx, r * .85, -r * .3, r * .42, r * .34, fur);
    ctx.fillStyle = fur; ctx.beginPath(); ctx.moveTo(r * 1.05, -r * .35); ctx.lineTo(r * 1.5, -r * .18); ctx.lineTo(r * 1.05, -r * .08); ctx.fill();
    for (const ex of [.62, .9]) { ctx.beginPath(); ctx.moveTo(r * ex - 5, -r * .55); ctx.lineTo(r * ex, -r * .95); ctx.lineTo(r * ex + 5, -r * .55); ctx.fill(); }
    if (sk) { ctx.strokeStyle = sk.trim; ctx.lineWidth = 2.4; for (let i = 0; i < 4; i++) { const sx = -r * .55 + i * r * .3; ctx.beginPath(); ctx.moveTo(sx, -r * .48); ctx.lineTo(sx + r * .12, -r * .2); ctx.stroke(); } }
    if (sk?.mark === 'ember') glow(ctx, 0, -r * .2, r * 1.3, '#ff7a3d', .35);
    const eye = en.windup > 0 || lunge ? '#ff5a4a' : sk?.glow || '#9fe8ff';
    circle(ctx, r * 1.02, -r * .38, 2.8, eye); glow(ctx, r * 1.02, -r * .38, 10, eye, .8);
    if (lunge || en.windup > 0) { ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(r * (1.12 + i * .1), -r * .17); ctx.lineTo(r * (1.16 + i * .1), -r * .06); ctx.lineTo(r * (1.2 + i * .1), -r * .17); ctx.fill(); } }
  }
export function drawSpider(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r, walk = en.aggro ? t * 16 : t * 4;
    shadow(ctx, 0, r * .6, r * 1.3, r * .4);
    ctx.translate(trem, Math.sin(t * 6) * 1.5);
    ctx.strokeStyle = flash ? '#fff' : '#2a1a30'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const a = (-.9 + i * .55) + Math.sin(walk + i * 1.7 + (s > 0 ? 1 : 0)) * .15, kx = s * Math.cos(a) * r * 1.1, ky = Math.sin(a) * r * .5 - r * .35;
      ctx.beginPath(); ctx.moveTo(s * r * .3, 0); ctx.lineTo(kx, ky); ctx.lineTo(kx + s * r * .4, ky + r * .9); ctx.stroke();
    }
    const body = flash ? '#fff' : enrage(en.elite ? '#4a1a5a' : '#5a3a6a', en.rage);
    ellipse(ctx, -r * .45 * Math.sign(look.x || 1) * -.2, r * .05, r * .85, r * .7, body);
    ctx.fillStyle = 'rgba(230,220,255,.55)'; ctx.beginPath(); ctx.moveTo(0, -r * .5); ctx.lineTo(r * .18, -r * .1); ctx.lineTo(0, r * .3); ctx.lineTo(-r * .18, -r * .1); ctx.closePath(); ctx.fill();
    ellipse(ctx, look.x * r * .3, -r * .4 + look.y * 3, r * .45, r * .36, flash ? '#fff' : '#3a2448');
    for (let i = 0; i < 4; i++) circle(ctx, look.x * r * .3 + (i - 1.5) * r * .16, -r * .45 + (i % 2) * 3, 2.2, en.windup > 0 ? '#ff5a4a' : '#e0ff9a');
    if (en.windup > 0) glow(ctx, look.x * r * .3, -r * .3, 20, '#e8e0f0', .8);
  }
export function drawWraith(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean) {
    const r = en.r, fl = Math.sin(t * 5) * 3;
    ctx.translate(0, Math.sin(t * 2.4) * 6 - 14);
    shadow(ctx, 0, r * 2.1, r * .9, r * .3, .18);
    glow(ctx, 0, 0, r * 3.2, en.elite ? '#7ad8ff' : '#bfe8ff', .55);
    const g = ctx.createLinearGradient(0, -r * 1.4, 0, r * 1.6); g.addColorStop(0, flash ? '#fff' : enrage('#e8f8ff', en.rage)); g.addColorStop(.6, flash ? '#fff' : 'rgba(150,210,255,.75)'); g.addColorStop(1, 'rgba(150,210,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -r * 1.4);
    ctx.quadraticCurveTo(r * 1.1, -r * 1.1, r * .9, r * .2);
    for (let i = 0; i <= 4; i++) { const px = r * .9 - i * r * .45; ctx.quadraticCurveTo(px - r * .2, r * (1.1 + Math.sin(t * 7 + i) * .2), px - r * .45, r * (.9 + (i % 2) * .5)); }
    ctx.quadraticCurveTo(-r * 1.1, -r * 1.1, 0, -r * 1.4); ctx.fill();
    ctx.fillStyle = 'rgba(20,40,70,.55)'; ctx.beginPath(); ctx.ellipse(look.x * 2, -r * .45, r * .55, r * .5, 0, 0, TAU); ctx.fill();
    for (const s of [-1, 1]) { circle(ctx, look.x * 3 + s * r * .22, -r * .5 + fl * .2, 3, en.windup > 0 ? '#ffffff' : '#8ee8ff'); glow(ctx, look.x * 3 + s * r * .22, -r * .5, 10, '#8ee8ff', .9); }
    for (let i = 0; i < 3; i++) { const a = t * 2 + i * TAU / 3, ox = Math.cos(a) * r * 1.4, oy = Math.sin(a) * r * .5; ctx.fillStyle = '#e8f8ff'; ctx.beginPath(); ctx.moveTo(ox, oy - 7); ctx.lineTo(ox + 3, oy); ctx.lineTo(ox, oy + 7); ctx.lineTo(ox - 3, oy); ctx.fill(); }
    if (en.windup > 0) glow(ctx, 0, 0, r * 2.4, '#ffffff', .5);
  }
export function drawGolem(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r, raise = en.windup > 0 ? 1 - en.windup : 0, step = en.aggro ? Math.sin(t * 4) : 0;
    shadow(ctx, 0, r * .8, r * 1.3, r * .42);
    ctx.translate(trem * 2, -raise * 10);
    const rock = flash ? '#fff' : enrage(en.elite ? '#5a6078' : '#7a8098', en.rage), dark = flash ? '#fff' : enrage('#50566e', en.rage);
    for (const s of [-1, 1]) { ctx.fillStyle = dark; ctx.beginPath(); ctx.roundRect(s * r * .28 - r * .2, r * .2 + step * s * 3, r * .4, r * .55, 6); ctx.fill(); }
    ctx.fillStyle = rock; ctx.beginPath(); ctx.moveTo(-r * .8, r * .3); ctx.lineTo(-r * .95, -r * .5); ctx.lineTo(-r * .4, -r * 1.05); ctx.lineTo(r * .45, -r * 1); ctx.lineTo(r * .95, -r * .45); ctx.lineTo(r * .8, r * .32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(r * .1, -r * 1); ctx.lineTo(r * .45, -r * 1); ctx.lineTo(r * .95, -r * .45); ctx.lineTo(r * .8, r * .32); ctx.lineTo(r * .2, r * .3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#eef2ff'; ctx.beginPath(); ctx.moveTo(-r * .95, -r * .5); ctx.lineTo(-r * .4, -r * 1.05); ctx.lineTo(r * .45, -r * 1); ctx.lineTo(r * .6, -r * .8); ctx.quadraticCurveTo(0, -r * .7, -r * .95, -r * .5); ctx.fill();
    const core = en.windup > 0 ? '#ffffff' : '#8ee8ff';
    ctx.fillStyle = core; ctx.beginPath(); ctx.moveTo(0, -r * .5); ctx.lineTo(r * .16, -r * .25); ctx.lineTo(0, 0); ctx.lineTo(-r * .16, -r * .25); ctx.closePath(); ctx.fill(); glow(ctx, 0, -r * .25, r * 1.1, '#8ee8ff', .6 + raise * .4);
    for (const s of [-1, 1]) { ellipse(ctx, look.x * 3 + s * r * .3, -r * .72, 4, 3, '#8ee8ff'); }
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * r * .95, -r * .45); ctx.rotate(s * (.3 - raise * 2.4) + step * .1);
      ctx.fillStyle = rock; ctx.beginPath(); ctx.roundRect(-r * .22, 0, r * .44, r * .8, 8); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.roundRect(-r * .28, r * .7, r * .56, r * .38, 8); ctx.fill();
      ctx.restore();
    }
  }
  /** Ember imp: a little horned fire devil on bat wings, hovering and glowing brighter as it winds up a throw. */
export function drawImp(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean) {
    const r = en.r, hover = Math.sin(t * 5) * 4 - 14, flap = Math.sin(t * 18);
    shadow(ctx, 0, r * .9, r * .9, r * .3, .25);
    ctx.translate(0, hover);
    glow(ctx, 0, 0, r * 2.4, '#ff7a3d', .55 + (en.windup > 0 ? .3 : 0));
    const wing = flash ? '#fff' : enrage('#7a2a1e', en.rage);
    for (const s of [-1, 1]) { ctx.save(); ctx.scale(s, 1); ctx.rotate(-.3 + flap * .35); ctx.fillStyle = wing; ctx.beginPath(); ctx.moveTo(r * .3, -r * .2); ctx.quadraticCurveTo(r * 1.3, -r * 1.1, r * 1.6, -r * .1); ctx.quadraticCurveTo(r * 1.1, -r * .2, r * 1.2, r * .3); ctx.quadraticCurveTo(r * .8, 0, r * .3, r * .2); ctx.closePath(); ctx.fill(); ctx.restore(); }
    const body = flash ? '#fff' : enrage(en.elite ? '#c0391e' : '#e0572a', en.rage);
    ctx.strokeStyle = body; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, r * .6); ctx.quadraticCurveTo(-r * .6, r * 1.2 + Math.sin(t * 6) * 3, -r * .9, r * .9); ctx.stroke();
    ellipse(ctx, 0, 0, r * .75, r * .85, body);
    ellipse(ctx, -r * .2, -r * .3, r * .25, r * .2, 'rgba(255,220,150,.45)');
    ctx.fillStyle = '#3a2420';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * r * .35, -r * .6); ctx.quadraticCurveTo(s * r * .75, -r * 1.2, s * r * .45, -r * 1.4); ctx.lineTo(s * r * .18, -r * .72); ctx.fill(); }
    eyes(ctx, look.x * 2, -r * .15, r * .3, r * .17, look, t, en.aggro, '#fff1b8');
    if (en.windup > 0) { const k = 1 - en.windup / .5; glow(ctx, look.x * r, look.y * r, r * (1 + k), '#ffd27a', .9); circle(ctx, look.x * r * .9, look.y * r * .9 - 2, r * .3 * (.5 + k), '#fff1b8'); }
  }
  /** Ash scorpion: a sand-coloured scorpion with its tail arched; while burrowed only a moving mound of sand shows. */
export function drawScorpion(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r;
    if (en.burrowT > 0) {
      const w = r * 1.3 + Math.sin(t * 12) * 2;
      ellipse(ctx, 0, r * .5, w, r * .45, '#9a7650'); ellipse(ctx, -r * .2, r * .35, w * .6, r * .25, '#c9a26e');
      for (let i = 0; i < 4; i++) { const a = t * 6 + i * 1.6; circle(ctx, Math.cos(a) * w * .9, r * .5 + Math.sin(a) * r * .2, 2.5, '#6a4e34'); }
      return;
    }
    const dir = look.x >= 0 ? 1 : -1, walk = en.aggro ? Math.sin(t * 14) : Math.sin(t * 4) * .3, sting = en.windup > 0 ? 1 - en.windup / .5 : en.lunge > 0 ? 1 : 0;
    shadow(ctx, 0, r * .6, r * 1.3, r * .35);
    ctx.translate(trem, 0); ctx.scale(dir, 1);
    const shell = flash ? '#fff' : enrage(en.elite ? '#8a4a2a' : '#b0764a', en.rage), dark = flash ? '#fff' : enrage('#6a4428', en.rage);
    ctx.strokeStyle = dark; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const lx = -r * .5 + i * r * .33, ph = (i % 2 ? 1 : -1) * walk * 4; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx + ph, s * r * .55 + r * .25); ctx.stroke(); } }
    ellipse(ctx, 0, 0, r * .8, r * .45, shell); ellipse(ctx, r * .6, -r * .05, r * .35, r * .3, shell);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-r * .3 + i * r * .3, 0, r * .4, -1.2, 1.2); ctx.stroke(); }
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(r * .9, s * r * .25); ctx.rotate(s * .4 - (sting ? s * .3 : 0)); ellipse(ctx, r * .25, 0, r * .3, r * .14, shell); ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(r * .45, -r * .12); ctx.lineTo(r * .7, 0); ctx.lineTo(r * .45, r * .05); ctx.fill(); ctx.restore(); }
    const up = .6 + sting * .6;
    ctx.strokeStyle = shell; ctx.lineWidth = r * .28; ctx.beginPath(); ctx.moveTo(-r * .7, 0); ctx.quadraticCurveTo(-r * 1.4, -r * 1.2 * up, -r * .4, -r * 1.5 * up); ctx.stroke();
    ctx.fillStyle = '#3a2418'; ctx.beginPath(); ctx.moveTo(-r * .45, -r * 1.55 * up); ctx.lineTo(r * .05 + sting * r * .3, -r * 1.3 * up + sting * r * .4); ctx.lineTo(-r * .3, -r * 1.35 * up); ctx.fill();
    glow(ctx, -r * .2, -r * 1.4 * up, r * .5, '#b9e27a', .3 + sting * .5);
    circle(ctx, r * .75, -r * .15, 2.2, '#ffd27a'); circle(ctx, r * .75, r * .05, 2.2, '#ffd27a');
  }
  /** Magma hulk: a lumbering heap of basalt with lava running through its cracks; it raises its fists to crack the ground. */
export function drawHulk(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r, raise = en.windup > 0 ? 1 - en.windup / 1.1 : 0, step = en.aggro ? Math.sin(t * 3.5) : 0;
    shadow(ctx, 0, r * .8, r * 1.35, r * .42);
    ctx.translate(trem * 2, -raise * 8);
    const rock = flash ? '#fff' : enrage(en.elite ? '#2e2220' : '#4a3a36', en.rage), dark = flash ? '#fff' : '#2a1e1c', lava = en.windup > 0 ? '#fff1b8' : '#ff7a3d';
    for (const s of [-1, 1]) { ctx.fillStyle = dark; ctx.beginPath(); ctx.roundRect(s * r * .3 - r * .22, r * .15 + step * s * 3, r * .44, r * .6, 7); ctx.fill(); }
    ctx.fillStyle = rock; ctx.beginPath(); ctx.moveTo(-r * .85, r * .35); ctx.lineTo(-r, -r * .4); ctx.lineTo(-r * .55, -r * 1.05); ctx.lineTo(0, -r * 1.15); ctx.lineTo(r * .55, -r * 1.05); ctx.lineTo(r, -r * .4); ctx.lineTo(r * .85, r * .35); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lava; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const [a, b, c2, d] of [[-.6, -.8, -.2, -.2], [-.2, -.2, .3, -.6], [.3, -.6, .7, -.3], [-.1, -.2, 0, .25]] as Array<[number, number, number, number]>) { ctx.beginPath(); ctx.moveTo(a * r, b * r); ctx.lineTo(c2 * r, d * r); ctx.stroke(); }
    glow(ctx, 0, -r * .4, r * 1.3, '#ff7a3d', .55 + raise * .45);
    for (const s of [-1, 1]) { ellipse(ctx, look.x * 3 + s * r * .28, -r * .75, 4.5, 3, '#ffd27a'); glow(ctx, look.x * 3 + s * r * .28, -r * .75, 10, '#ffb347', .8); }
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * r * .98, -r * .5); ctx.rotate(s * (.3 - raise * 2.4) + step * .1);
      ctx.fillStyle = rock; ctx.beginPath(); ctx.roundRect(-r * .24, 0, r * .48, r * .82, 8); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.roundRect(-r * .3, r * .72, r * .6, r * .4, 8); ctx.fill();
      ctx.fillStyle = lava; ctx.fillRect(-r * .2, r * .86, r * .4, 3);
      ctx.restore();
    }
  }
  /** Pyrrhus, the Cinder Tyrant: a basalt-armoured fire giant with a crown of flame and a molten hammer. */
export function drawTyrant(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean) {
    const r = en.r, ph = en.phase, slam = en.action === 'slam' ? 1 - en.actionT / 1.25 : 0, walk = en.aggro ? Math.sin(t * 5) : 0;
    shadow(ctx, 0, r * .95, r * 1.5, r * .5, .45);
    glow(ctx, 0, -r * .5, r * 3.2, ph > 1 ? '#ff3d1f' : '#ff7a3d', .55);
    const armour = flash ? '#fff' : ph > 1 ? '#3a1e1a' : '#2e2422', seam = ph > 1 ? '#ffd27a' : '#ff7a3d';
    for (const s of [-1, 1]) { ctx.fillStyle = armour; ctx.beginPath(); ctx.roundRect(s * r * .32 - r * .2, r * .3 + walk * s * 4, r * .4, r * .65, 8); ctx.fill(); ctx.fillStyle = seam; ctx.fillRect(s * r * .32 - r * .12, r * .55 + walk * s * 4, r * .24, 3); }
    ctx.fillStyle = armour; ctx.beginPath(); ctx.moveTo(-r * .75, r * .45); ctx.lineTo(-r * 1.05, -r * .6); ctx.lineTo(-r * .45, -r * 1.05); ctx.lineTo(r * .45, -r * 1.05); ctx.lineTo(r * 1.05, -r * .6); ctx.lineTo(r * .75, r * .45); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = seam; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(0, -r * .95); ctx.lineTo(0, r * .35); ctx.moveTo(-r * .8, -r * .4); ctx.quadraticCurveTo(0, -r * .1, r * .8, -r * .4); ctx.stroke();
    glow(ctx, 0, -r * .35, r * .9, seam, .8);
    for (const s of [-1, 1]) { ctx.fillStyle = '#4a3632'; ctx.beginPath(); ctx.ellipse(s * r * .95, -r * .75, r * .38, r * .26, s * .3, 0, TAU); ctx.fill(); ctx.fillStyle = seam; ctx.beginPath(); ctx.moveTo(s * r * .8, -r * .95); ctx.lineTo(s * r * 1.15, -r * 1.35); ctx.lineTo(s * r * 1.05, -r * .85); ctx.fill(); }
    // Head: horned helm, burning eyes, a crown of flame.
    ctx.fillStyle = '#1e1614'; ctx.beginPath(); ctx.roundRect(-r * .35, -r * 1.55, r * .7, r * .6, 10); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillStyle = '#3a2a26'; ctx.beginPath(); ctx.moveTo(s * r * .3, -r * 1.45); ctx.quadraticCurveTo(s * r * .8, -r * 1.7, s * r * .7, -r * 2.05); ctx.lineTo(s * r * .22, -r * 1.55); ctx.fill(); }
    for (const s of [-1, 1]) { ellipse(ctx, look.x * 4 + s * r * .14, -r * 1.25, r * .09, r * .05, '#fff1b8'); glow(ctx, look.x * 4 + s * r * .14, -r * 1.25, 16, '#ffb347', .9); }
    drawFlame(ctx, 0, -r * 1.55, ph > 1 ? 1.1 : .8, ph > 1 ? '#ff5f3d' : '#ffb347');
    // The hammer: raised high, then brought down in a slam.
    const ang = en.action === 'slam' ? -2.4 + Math.min(1, slam * 1.6) * 2.6 : -.7 + Math.sin(t * 1.5) * .08;
    ctx.save(); ctx.translate(r * 1.05, -r * .55); ctx.rotate(ang);
    ctx.fillStyle = '#3a2a26'; ctx.fillRect(-4, -r * 1.3, 8, r * 1.35);
    ctx.fillStyle = '#2a1e1c'; ctx.beginPath(); ctx.roundRect(-r * .38, -r * 1.65, r * .76, r * .45, 6); ctx.fill();
    ctx.fillStyle = seam; ctx.fillRect(-r * .32, -r * 1.46, r * .64, 4); glow(ctx, 0, -r * 1.43, r * .6, seam, .7);
    ctx.restore();
  }
  /** Umbra: a black sun wearing the powers of all three guardians — moss, thorns and a hollow star circle it. */
export function drawEclipse(ctx: CanvasRenderingContext2D, en: Creature, t: number, flash: boolean) {
    const r = en.r, ph = en.phase, hover = Math.sin(t * 1.6) * 10 - 26;
    const fade = en.action === 'blink' && en.actionT > 1.1 ? (en.actionT - 1.1) / .3 : en.action === 'blink' && en.actionT > .9 ? 1 - (en.actionT - .9) / .2 : 1;
    ctx.globalAlpha = clamp(fade, .1, 1);
    shadow(ctx, 0, r * 1.1, r * 1.3, r * .4, .4);
    ctx.translate(0, hover);
    glow(ctx, 0, 0, r * 4, ph === 3 ? '#ff3b6b' : ph === 2 ? '#ff6b9a' : '#8a6ff0', .8);
    ctx.save(); ctx.rotate(t * .4);
    for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); const len = r * (1.5 + Math.sin(t * 3 + i) * .25 + (i % 2) * .3); const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(255,200,240,.0)'); g.addColorStop(.55, ph > 1 ? 'rgba(255,110,160,.75)' : 'rgba(201,182,255,.7)'); g.addColorStop(1, 'rgba(201,182,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(r * .9, -6); ctx.lineTo(len, 0); ctx.lineTo(r * .9, 6); ctx.fill(); }
    ctx.restore();
    circle(ctx, 0, 0, r * 1.02, flash ? '#fff' : '#05020c');
    ctx.strokeStyle = ph > 1 ? '#ff9ac0' : '#e0d4ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.02, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(167,139,250,.9)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, r * (.25 + i * .15), t * (2 + i) + i, t * (2 + i) + i + 2.2); ctx.stroke(); }
    const eye = ph === 3 ? '#ff3b6b' : ph === 2 ? '#ff9a6b' : '#e9ddff';
    for (const s of [-1, 1]) { ellipse(ctx, s * r * .3, -r * .1, r * .14, r * .07, eye, s * .25); glow(ctx, s * r * .3, -r * .1, 22, eye, .9); }
    // The three stolen guardian powers.
    for (let i = 0; i < 3; i++) {
      const a = t * .9 + i * TAU / 3, ox = Math.cos(a) * r * 1.9, oy = Math.sin(a) * r * .8;
      if (i === 0) { circle(ctx, ox, oy, 12, '#6f9a4c'); circle(ctx, ox - 3, oy - 3, 6, '#a3c46a'); glow(ctx, ox, oy, 26, '#a3c46a', .7); }
      else if (i === 1) { ctx.strokeStyle = '#b6df91'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ox, oy, 11, 0, TAU); ctx.stroke(); ctx.fillStyle = '#e6d9a0'; for (let k = 0; k < 6; k++) { const b = k * TAU / 6 + t; ctx.beginPath(); ctx.moveTo(ox + Math.cos(b) * 10, oy + Math.sin(b) * 10); ctx.lineTo(ox + Math.cos(b) * 17, oy + Math.sin(b) * 17); ctx.lineTo(ox + Math.cos(b + .3) * 10, oy + Math.sin(b + .3) * 10); ctx.fill(); } glow(ctx, ox, oy, 26, '#b6df91', .6); }
      else { ctx.fillStyle = '#c9b6ff'; star(ctx, ox, oy, 14, 5, .45, t * 2); ctx.fill(); circle(ctx, ox, oy, 5, '#1a1030'); glow(ctx, ox, oy, 28, '#c9b6ff', .8); }
    }
    ctx.globalAlpha = 1;
  }
export function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, size: number, look: Point, t: number, angry: boolean, color = '#fff8e6') {
    const blink = Math.sin(t * 1.7) > .97;
    for (const s of [-1, 1]) {
      if (blink) { ctx.fillStyle = '#1d1726'; ctx.fillRect(x + s * gap - size, y, size * 2, 1.5); continue; }
      ellipse(ctx, x + s * gap, y, size, size * 1.15, color);
      circle(ctx, x + s * gap + look.x * size * .4, y + look.y * size * .35, size * .55, '#1d1726');
      circle(ctx, x + s * gap + look.x * size * .4 - size * .2, y + look.y * size * .35 - size * .25, size * .2, '#fff');
      if (angry) { ctx.strokeStyle = '#1d1726'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + s * gap - size * s, y - size * 1.5); ctx.lineTo(x + s * gap + size * s * .8, y - size * .9); ctx.stroke(); }
    }
  }
export function drawGloomling(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r, hop = en.aggro ? Math.abs(Math.sin(t * 6)) * 7 : Math.abs(Math.sin(t * 3)) * 3, swell = en.windup > 0 ? 1.15 : 1, lunge = en.lunge > 0 ? 1.2 : 1;
    shadow(ctx, 0, r * .8, r * (1.1 - hop * .02), r * .4);
    ctx.translate(trem, -hop); ctx.scale(swell * lunge, swell / lunge * (1 + Math.sin(t * 12) * .04));
    const sk = SKIN[en.kind];
    ctx.fillStyle = flash ? '#fff' : enrage(sk ? (en.elite ? sk.elite : sk.body) : en.elite ? '#5a3a8a' : '#6d5fc0', en.rage); ctx.beginPath(); ctx.moveTo(-r, r * .1); ctx.bezierCurveTo(-r, -r * 1.2, r, -r * 1.2, r, r * .1);
    for (let i = 0; i <= 4; i++) { const px = r - i * r * .5; ctx.quadraticCurveTo(px - r * .25, r * (.75 + Math.sin(t * 8 + i) * .12), px - r * .5, r * .55); }
    ctx.closePath(); ctx.fill();
    ellipse(ctx, -r * .3, -r * .45, r * .35, r * .25, 'rgba(255,255,255,.18)');
    ctx.strokeStyle = sk?.trim || '#6e5fb8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -r * .85); ctx.quadraticCurveTo(Math.sin(t * 3) * 6, -r * 1.3, Math.sin(t * 3) * 8, -r * 1.45); ctx.stroke();
    const lamp = sk?.glow || '#ffd35c'; circle(ctx, Math.sin(t * 3) * 8, -r * 1.45, 3.5, lamp); glow(ctx, Math.sin(t * 3) * 8, -r * 1.45, 12, lamp, .8);
    if (sk?.mark === 'leaf') { ctx.fillStyle = '#7fb85a'; ctx.beginPath(); ctx.ellipse(-r * .45, -r * .7, r * .38, r * .16, -.5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#40603a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-r * .75, -r * .52); ctx.lineTo(-r * .15, -r * .88); ctx.stroke(); }
    eyes(ctx, 0, -r * .2, r * .34, r * .24, look, t, en.aggro, en.windup > 0 ? '#ffb4a8' : undefined);
  }
export function drawThornling(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, trem: number) {
    const r = en.r, sway = Math.sin(t * 2) * .15;
    shadow(ctx, 0, r * .7, r * 1.2, r * .4);
    const sk = SKIN[en.kind];
    for (let i = -1; i <= 1; i++) { ctx.save(); ctx.translate(0, r * .45); ctx.rotate(i * .9 + sway * (i || 1)); ellipse(ctx, 0, -r * .1, r * .28, r * .8, sk?.trim || '#5d8a3a'); ctx.restore(); }
    ctx.translate(trem, 0);
    ctx.fillStyle = flash ? '#fff' : enrage(sk ? (en.elite ? sk.elite : sk.body) : en.elite ? '#7a8a3a' : '#8aab52', en.rage); ctx.beginPath(); ctx.ellipse(0, -r * .1, r * .9, r * .85, 0, 0, TAU); ctx.fill();
    ellipse(ctx, -r * .3, -r * .45, r * .35, r * .22, 'rgba(255,255,255,.2)');
    ctx.fillStyle = sk?.eye || '#e6d9a0';
    for (let i = 0; i < 7; i++) { const a = -Math.PI + (i / 6) * Math.PI + sway * .3; ctx.beginPath(); ctx.moveTo(Math.cos(a - .15) * r * .8, -r * .1 + Math.sin(a - .15) * r * .8); ctx.lineTo(Math.cos(a) * r * 1.35, -r * .1 + Math.sin(a) * r * 1.3); ctx.lineTo(Math.cos(a + .15) * r * .8, -r * .1 + Math.sin(a + .15) * r * .8); ctx.fill(); }
    eyes(ctx, 0, -r * .3, r * .32, r * .2, look, t, true);
    const open = en.windup > 0 ? .5 + Math.sin(t * 30) * .2 : .15;
    ellipse(ctx, 0, r * .25, r * .3, r * open, '#2a1f1b');
    if (en.windup > 0) glow(ctx, 0, r * .25, 22, sk?.glow || '#b6df91', .8);
    if (sk?.mark === 'frost') glow(ctx, 0, -r * .2, r * 1.6, '#dff6ff', .35);
  }
export function drawWisp(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean) {
    const r = en.r, fl = Math.sin(t * 10) * 2;
    ctx.translate(0, Math.sin(t * 3) * 6 - 10);
    shadow(ctx, 0, r * 2, r * .8, r * .3, .18);
    const sk = SKIN[en.kind], green = en.kind === 'marshlight', fire = en.kind === 'pyrewisp';
    glow(ctx, 0, 0, r * 3.5, sk ? (en.elite ? sk.elite : sk.glow) : en.elite ? '#ff6b9a' : '#8a6ff0', .6);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 5; i >= 0; i--) circle(ctx, Math.sin(t * 6 - i * .7) * i * 1.6, i * r * .38, r * (1 - i * .14), green ? `rgba(${100 + i * 10},${220 - i * 10},140,${.35 - i * .04})` : fire ? `rgba(255,${140 - i * 12},60,${.35 - i * .04})` : `rgba(${120 + i * 10},${140 - i * 10},255,${.35 - i * .04})`);
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(0, -2, 1, 0, 0, r); g.addColorStop(0, flash ? '#fff' : green ? '#efffe8' : fire ? '#fff1d0' : '#f1ecff'); g.addColorStop(.6, flash ? '#fff' : enrage(sk?.body || '#9f8cff', en.rage)); g.addColorStop(1, green ? 'rgba(60,160,90,.2)' : fire ? 'rgba(200,80,30,.2)' : 'rgba(90,70,200,.2)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -r * 1.5 + fl); ctx.quadraticCurveTo(r * 1.1, -r * .3, r * .8, r * .3); ctx.arc(0, r * .2, r * .82, 0, Math.PI); ctx.quadraticCurveTo(-r * 1.1, -r * .3, 0, -r * 1.5 + fl); ctx.fill();
    circle(ctx, -r * .3 + look.x * 2, 0, 2.6, '#1d1540'); circle(ctx, r * .3 + look.x * 2, 0, 2.6, '#1d1540');
    if (en.windup > 0) glow(ctx, 0, 0, r * 2.5, '#ffffff', .6);
  }
export function drawMossback(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, e: Ctx = AWAKE) {
    const r = en.r, awake = e.bossUnlocked(en), slam = en.action === 'slam' && en.actionT > .3 ? Math.sin(Math.min(1, (1.25 - en.actionT) / .95) * Math.PI * .5) : 0;
    const walk = en.aggro && !en.action ? Math.sin(t * 6) : 0;
    shadow(ctx, 0, r * .75, r * 1.35 * (1 - slam * .2), r * .5);
    ctx.translate(0, -slam * 26); ctx.scale(1 - slam * .05, 1 + slam * .1);
    for (const [lx, ph] of [[-.7, 0], [.7, Math.PI], [-.35, Math.PI], [.35, 0]] as Array<[number, number]>) ellipse(ctx, lx * r, r * .55 + Math.sin(t * 6 + ph) * walk * 3, r * .2, r * .26, '#4a5a3a');
    const hx = look.x * r * .15, hy = r * .25;
    ellipse(ctx, hx, hy, r * .42, r * .32, flash ? '#fff' : '#7d8a5a');
    const eyeC = en.phase === 2 ? '#ff6b5b' : awake ? '#ffb347' : '#3a3a30';
    if (awake) { circle(ctx, hx - r * .17, hy - 2, 4.5, eyeC); circle(ctx, hx + r * .17, hy - 2, 4.5, eyeC); glow(ctx, hx - r * .17, hy - 2, 14, eyeC, .8); glow(ctx, hx + r * .17, hy - 2, 14, eyeC, .8); }
    else { ctx.fillStyle = '#2a2a20'; ctx.fillRect(hx - r * .25, hy - 2, 9, 2); ctx.fillRect(hx + r * .1, hy - 2, 9, 2); }
    const g = ctx.createRadialGradient(-r * .3, -r * .6, 4, 0, -r * .2, r * 1.2); g.addColorStop(0, flash ? '#fff' : enrage('#9aa37c', en.rage)); g.addColorStop(1, flash ? '#fff' : enrage('#4d5840', en.rage));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -r * .15, r * 1.12, r * .82, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(0, r * .2, -r * 1.12, -r * .1); ctx.fill();
    ctx.strokeStyle = 'rgba(40,45,30,.45)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-r * .8 + i * r * .55, -r * .05); ctx.lineTo(-r * .55 + i * r * .4, -r * .7); ctx.stroke(); }
    ellipse(ctx, 0, -r * .8, r * .8, r * .25, '#6f9a4c');
    ctx.strokeStyle = '#a3c46a'; ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) { const bx = -r * .65 + i * r * .16, s = Math.sin(t * 2.5 + i) * 4; ctx.beginPath(); ctx.moveTo(bx, -r * .82); ctx.quadraticCurveTo(bx + s * .5, -r * .95, bx + s, -r * 1.08); ctx.stroke(); }
    for (const [mx, mc] of [[-.4, '#e0735a'], [.25, '#f2d27a'], [.5, '#e0735a']] as Array<[number, string]>) { ctx.fillStyle = '#efe4c8'; ctx.fillRect(mx * r - 1.5, -r * 1.02, 3, 8); ctx.fillStyle = mc; ctx.beginPath(); ctx.arc(mx * r, -r * 1.02, 6, Math.PI, TAU); ctx.fill(); }
    if (en.phase === 2 && Math.random() < .3) ambient({ x: en.x + rand(-r, r), y: en.y - r, vx: 0, vy: -40, life: 1, max: 1, size: 6, rot: 0, vr: 0, kind: 'mote', color: 'rgba(255,140,110,.6)', phase: 0 });
  }
export function drawWarden(ctx: CanvasRenderingContext2D, en: Creature, t: number, look: Point, flash: boolean, e: Ctx = AWAKE) {
    const r = en.r, awake = e.bossUnlocked(en), raise = en.action === 'nova' ? 1 : en.action === 'roots' ? .5 : 0, sway = Math.sin(t * 1.6) * .12;
    shadow(ctx, 0, r * .8, r * 1.2, r * .45);
    ctx.strokeStyle = '#4a3522'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 8, r * .5); ctx.quadraticCurveTo(i * 20, r * .7, i * 30 + Math.sin(t * 2 + i) * 3, r * .85); ctx.stroke(); }
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * r * .5, -r * .4); ctx.rotate(s * (.9 - raise * 1.6 + sway + (en.aggro ? Math.sin(t * 4 + s) * .15 : 0)));
      ctx.strokeStyle = '#5a4130'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, r * .9); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, r * .6); ctx.lineTo(s * 12, r * 1.05); ctx.moveTo(0, r * .8); ctx.lineTo(-s * 8, r * 1.1); ctx.stroke();
      circle(ctx, 0, r * .45, 8, '#6f9a5c'); ctx.restore();
    }
    const g = ctx.createLinearGradient(-r * .6, 0, r * .6, 0); const bark = enrage('#4a3522', en.rage); g.addColorStop(0, flash ? '#fff' : bark); g.addColorStop(.5, flash ? '#fff' : enrage('#7a5a3f', en.rage)); g.addColorStop(1, flash ? '#fff' : bark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-r * .6, -r * 1.1, r * 1.2, r * 1.65, [r * .5, r * .5, r * .2, r * .2]); ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,10,.4)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-r * .4 + i * r * .27, -r * .7); ctx.quadraticCurveTo(-r * .35 + i * r * .27, 0, -r * .42 + i * r * .27, r * .45); ctx.stroke(); }
    for (let i = 0; i < 9; i++) { const a = -Math.PI + (i / 8) * Math.PI, s2 = Math.sin(t * 2 + i) * .08; ellipse(ctx, Math.cos(a + s2) * r * .62, -r * 1.05 + Math.sin(a + s2) * r * .5, r * .26, r * .16, i % 2 ? '#355c3e' : '#6f9a5c', a); }
    ctx.fillStyle = '#e6d9a0'; for (let i = 0; i < 5; i++) { const a = -Math.PI * .85 + i * Math.PI * .175; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * .45 - 3, -r * 1.05 + Math.sin(a) * r * .4); ctx.lineTo(Math.cos(a) * r * .95, -r * 1.05 + Math.sin(a) * r * .9); ctx.lineTo(Math.cos(a) * r * .45 + 3, -r * 1.05 + Math.sin(a) * r * .4); ctx.fill(); }
    const eyeC = en.phase === 2 ? '#ff6b5b' : awake ? '#b6ff7a' : '#2a2018';
    for (const s of [-1, 1]) { ellipse(ctx, s * r * .22 + look.x * 3, -r * .55, 6, 4, eyeC, s * .3); if (awake) glow(ctx, s * r * .22, -r * .55, 16, eyeC, .9); }
    ctx.fillStyle = '#1e140c'; ctx.beginPath(); ctx.ellipse(0, -r * .2, r * .2, raise ? r * .18 : r * .06, 0, 0, TAU); ctx.fill();
  }
export function drawHollowStar(ctx: CanvasRenderingContext2D, en: Creature, t: number, flash: boolean, e: Ctx = AWAKE) {
    const r = en.r, awake = e.bossUnlocked(en);
    const fade = en.action === 'blink' && en.actionT > 1.1 ? (en.actionT - 1.1) / .3 : en.action === 'blink' && en.actionT > .9 ? 1 - (en.actionT - .9) / .2 : 1;
    ctx.globalAlpha = clamp(fade, .1, 1);
    const hover = Math.sin(t * 2) * 8 - 18;
    shadow(ctx, 0, r * .9, r * .9, r * .3, .3);
    ctx.translate(0, hover);
    glow(ctx, 0, 0, r * 3.2, en.phase === 2 ? '#ff6b9a' : '#8a6ff0', .7);
    for (let i = 0; i < 5; i++) { const a = t * 1.3 + i * TAU / 5, ox = Math.cos(a) * r * 1.5, oy = Math.sin(a) * r * .7; ctx.fillStyle = '#c9b6ff'; ctx.beginPath(); ctx.moveTo(ox, oy - 8); ctx.lineTo(ox + 4, oy); ctx.lineTo(ox, oy + 8); ctx.lineTo(ox - 4, oy); ctx.fill(); glow(ctx, ox, oy, 12, '#c9b6ff', .8); }
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 1.2); g.addColorStop(0, flash ? '#fff' : '#1a1030'); g.addColorStop(.6, flash ? '#fff' : enrage('#3d2a78', en.rage)); g.addColorStop(1, flash ? '#fff' : '#a78bfa');
    ctx.fillStyle = g; star(ctx, 0, 0, r * 1.2, 5, .5, en.angle * .4); ctx.fill();
    ctx.strokeStyle = 'rgba(230,220,255,.8)'; ctx.lineWidth = 2; ctx.stroke();
    circle(ctx, 0, 0, r * .38, '#05020c');
    ctx.strokeStyle = 'rgba(167,139,250,.9)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, r * (.12 + i * .08), t * (3 + i) + i, t * (3 + i) + i + 2.4); ctx.stroke(); }
    if (awake) { circle(ctx, -r * .14, -r * .02, 3.5, en.phase === 2 ? '#ff6b9a' : '#e9ddff'); circle(ctx, r * .14, -r * .02, 3.5, en.phase === 2 ? '#ff6b9a' : '#e9ddff'); }
    if (en.phase === 2) { ctx.strokeStyle = '#ff9a6b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * .5, -r * .6); ctx.lineTo(-r * .2, -r * .3); ctx.lineTo(-r * .35, 0); ctx.moveTo(r * .6, r * .2); ctx.lineTo(r * .3, r * .15); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  // ───────────────────────────── the heroes' own guardians
  /** A guardian as one hero meets it: the shape, colours and detail come from its variant (see bosses.ts). */
export { AWAKE };
