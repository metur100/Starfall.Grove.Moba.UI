// Profile pictures: round badges with a paper cut-out on a coloured night sky. Heroes (head and shoulders), the
// valley's creatures, and emblems (moon, crown, swords, potion…), all cut with the same paper edge as the battlefield.
// Each picture is drawn once into an image and reused. The ids and level locks come from the server's catalog.
import { Cutter, STICKER, type Box } from './cutout';
import * as CR from './creatures';
import { paintFox, paintWolf } from './animals';
import { TAU, circle, ellipse, poly, rrect, star } from './color';
import { heroBustCanvas } from './bust';
import { isHero } from '../heroes';
import type { HeroId } from '../types';

type Painter = { bg: [string, string]; box: Box; scale: number; y: number; paint: (g: CanvasRenderingContext2D) => void };

const S = 160;
const cache = new Map<string, string>();
let cutter: Cutter | null = null;

const creature = (draw: (g: CanvasRenderingContext2D, en: CR.Creature, t: number, look: CR.Point, flash: boolean, trem: number) => void, kind: string, r: number) =>
  (g: CanvasRenderingContext2D) => {
    const en: CR.Creature = { kind, r, elite: false, rage: 0, windup: 0, aggro: false, lunge: 0, chargeX: 1, action: null, actionT: 0, phase: 1, burrowT: 0, angle: 0, x: 0, y: 0 };
    draw(g, en, 1.2, { x: .6, y: .3 }, false, 0);
  };

// ── emblems, drawn around (0, 0) within about ±28 units
function moon(g: CanvasRenderingContext2D) {
  circle(g, 0, 0, 24, '#ffe9a8');
  // The bite out of the full moon.
  g.globalCompositeOperation = 'destination-out'; circle(g, 12, -8, 20, '#000'); g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#f2c96a'; for (const [x, y, r] of [[-12, 6, 3], [-4, 16, 2.2], [-16, -6, 1.8]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.fillStyle = '#fff6d8'; star(g, 16, 10, 6, 4, .35); g.fill(); star(g, 20, -14, 4, 4, .35); g.fill();
}
function crown(g: CanvasRenderingContext2D) {
  poly(g, [-26, 14, -28, -14, -14, -2, 0, -22, 14, -2, 28, -14, 26, 14], '#f2c94a');
  rrect(g, -27, 10, 54, 10, 3, '#d9a536');
  for (const [x, c] of [[-14, '#e2574c'], [0, '#5fb0ff'], [14, '#7ad16a']] as Array<[number, string]>) circle(g, x, 15, 3.6, c);
  for (const [x, y] of [[-28, -14], [0, -22], [28, -14]]) circle(g, x, y, 4, '#fff1c4');
}
function swords(g: CanvasRenderingContext2D) {
  for (const s of [-1, 1]) {
    g.save(); g.rotate(s * .78);
    poly(g, [-4, 14, -4, -24, 0, -32, 4, -24, 4, 14], '#dfe7f2'); poly(g, [0, -30, 0, 14, 4, 14, 4, -24], '#b9c4d6');
    rrect(g, -12, 13, 24, 5, 2.5, '#c58b3a'); rrect(g, -3, 18, 6, 12, 2, '#6a4026'); circle(g, 0, 32, 4, '#f2c94a');
    g.restore();
  }
}
function shield(g: CanvasRenderingContext2D) {
  g.fillStyle = '#5a7fd6'; g.beginPath(); g.moveTo(0, -28); g.quadraticCurveTo(16, -22, 26, -22); g.quadraticCurveTo(28, 12, 0, 30); g.quadraticCurveTo(-28, 12, -26, -22); g.quadraticCurveTo(-16, -22, 0, -28); g.fill();
  g.fillStyle = '#3f5fb0'; g.beginPath(); g.moveTo(0, -28); g.quadraticCurveTo(16, -22, 26, -22); g.quadraticCurveTo(28, 12, 0, 30); g.closePath(); g.fill();
  g.fillStyle = '#f2c94a'; star(g, 0, 0, 13, 5, .45); g.fill();
}
function potion(g: CanvasRenderingContext2D) {
  rrect(g, -6, -30, 12, 8, 2, '#a5774a'); rrect(g, -7, -23, 14, 10, 2, '#cfe6f0');
  circle(g, 0, 6, 22, '#cfe6f0'); g.fillStyle = '#d14fa6'; g.beginPath(); g.arc(0, 6, 19, .15, Math.PI - .15); g.closePath(); g.fill();
  ellipse(g, 0, 8, 19, 4, '#e877c0');
  circle(g, -8, -2, 3, 'rgba(255,255,255,.85)'); circle(g, 6, 14, 2.4, '#ffd0ef'); circle(g, -4, 18, 1.6, '#ffd0ef');
}
function crystal(g: CanvasRenderingContext2D) {
  poly(g, [0, -30, 16, -8, 8, 28, -8, 28, -16, -8], '#7fe0e8'); poly(g, [0, -30, 16, -8, 8, 28, 0, 8], '#4fbccb');
  poly(g, [0, -30, -16, -8, 0, 8], '#b9f4f6'); poly(g, [-24, 6, -16, -6, -10, 26, -18, 26], '#a58cf0'); poly(g, [24, 8, 17, -2, 12, 26, 20, 26], '#a58cf0');
}
function flame(g: CanvasRenderingContext2D) {
  const layer = (s: number, c: string) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, 28 * s); g.bezierCurveTo(-26 * s, 26 * s, -24 * s, -4 * s, -8 * s, -16 * s); g.bezierCurveTo(-8 * s, -6 * s, -2 * s, -4 * s, 0, -6 * s); g.bezierCurveTo(-2 * s, -18 * s, 4 * s, -28 * s, 12 * s, -32 * s); g.bezierCurveTo(10 * s, -16 * s, 26 * s, -6 * s, 22 * s, 12 * s); g.bezierCurveTo(20 * s, 24 * s, 10 * s, 28 * s, 0, 28 * s); g.fill(); };
  layer(1, '#ff6a3d'); g.translate(0, 6); layer(.68, '#ffb347'); g.translate(0, 6); layer(.38, '#fff0b8');
}
function tree(g: CanvasRenderingContext2D) {
  rrect(g, -5, 6, 10, 24, 3, '#7a4f2e');
  for (const [x, y, r, c] of [[-14, 0, 14, '#4f9a45'], [14, 0, 14, '#4f9a45'], [0, -14, 18, '#66b552'], [0, 2, 15, '#5aa84b']] as Array<[number, number, number, string]>) circle(g, x, y, r, c);
  for (const [x, y] of [[-10, -10], [8, -18], [12, 4], [-14, 6]]) circle(g, x, y, 2.6, '#ff6f61');
}
function heart(g: CanvasRenderingContext2D) {
  g.fillStyle = '#ff6f8e'; g.beginPath(); g.moveTo(0, 26); g.bezierCurveTo(-34, 2, -24, -30, 0, -12); g.bezierCurveTo(24, -30, 34, 2, 0, 26); g.fill();
  ellipse(g, -10, -10, 6, 4, 'rgba(255,255,255,.7)', -.5);
}
function snowflake(g: CanvasRenderingContext2D) {
  g.strokeStyle = '#eaf6ff'; g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    g.save(); g.rotate(i * Math.PI / 3); g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -28); g.stroke();
    g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, -16); g.lineTo(-8, -24); g.moveTo(0, -16); g.lineTo(8, -24); g.stroke(); g.restore();
  }
  circle(g, 0, 0, 6, '#bfe3ff');
}
function sun(g: CanvasRenderingContext2D) {
  g.fillStyle = '#ffb347'; for (let i = 0; i < 12; i++) { g.save(); g.rotate(i * Math.PI / 6); g.beginPath(); g.moveTo(-5, -18); g.lineTo(0, -31); g.lineTo(5, -18); g.fill(); g.restore(); }
  circle(g, 0, 0, 18, '#ffd35c'); circle(g, -6, -2, 2.2, '#5a3a22'); circle(g, 6, -2, 2.2, '#5a3a22');
  g.strokeStyle = '#5a3a22'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.arc(0, 3, 6, .3, Math.PI - .3); g.stroke();
  circle(g, -11, 5, 3, 'rgba(255,120,90,.5)'); circle(g, 11, 5, 3, 'rgba(255,120,90,.5)');
}
function mushroom(g: CanvasRenderingContext2D) {
  rrect(g, -9, -2, 18, 28, 8, '#f5ead2');
  g.fillStyle = '#e2574c'; g.beginPath(); g.ellipse(0, -4, 28, 22, 0, Math.PI, TAU); g.quadraticCurveTo(0, 6, -28, -4); g.fill();
  for (const [x, y, r] of [[-14, -12, 4.5], [4, -18, 5.5], [17, -8, 3.5], [-2, -6, 3]]) circle(g, x, y, r, '#fff4de');
}
function lantern(g: CanvasRenderingContext2D) {
  g.strokeStyle = '#4a3a30'; g.lineWidth = 3; g.beginPath(); g.arc(0, -24, 7, Math.PI, TAU); g.stroke();
  rrect(g, -14, -24, 28, 6, 2, '#4a3a30'); rrect(g, -12, -18, 24, 32, 4, '#ffd77a'); rrect(g, -14, 14, 28, 6, 2, '#4a3a30');
  for (const x of [-12, 9]) rrect(g, x, -18, 3, 32, 1, '#4a3a30');
  circle(g, 0, -2, 7, '#fff6d0');
}

const AV: Record<string, Painter> = {
  // emblems
  star: { bg: ['#3b2a6a', '#1d1530'], box: [-34, -34, 68, 68], scale: 2.3, y: 0, paint: g => { g.fillStyle = '#ffd35c'; star(g, 0, 2, 30, 5, .48); g.fill(); circle(g, -7, -2, 2.6, '#5a3a22'); circle(g, 7, -2, 2.6, '#5a3a22'); } },
  moon: { bg: ['#2c3f7a', '#141a3a'], box: [-30, -30, 60, 60], scale: 2.4, y: 0, paint: moon },
  sun: { bg: ['#ff9f6a', '#c2564a'], box: [-34, -34, 68, 68], scale: 2.2, y: 0, paint: sun },
  heart: { bg: ['#7a2f5a', '#3a1630'], box: [-32, -30, 64, 60], scale: 2.3, y: 0, paint: heart },
  swords: { bg: ['#4a5a7a', '#1f2638'], box: [-34, -36, 68, 72], scale: 2.1, y: 0, paint: swords },
  shield: { bg: ['#2f6a5a', '#132e27'], box: [-30, -30, 60, 62], scale: 2.3, y: 0, paint: shield },
  potion: { bg: ['#4a2f6a', '#1f1430'], box: [-26, -32, 52, 62], scale: 2.3, y: 2, paint: potion },
  flame: { bg: ['#5a2a2a', '#241010'], box: [-28, -34, 56, 64], scale: 2.2, y: 2, paint: flame },
  tree: { bg: ['#3f7a5a', '#173a28'], box: [-30, -34, 60, 66], scale: 2.2, y: -2, paint: tree },
  mushroom: { bg: ['#6a4a3a', '#2a1a14'], box: [-30, -28, 60, 56], scale: 2.4, y: 2, paint: mushroom },
  snowflake: { bg: ['#3a6a9a', '#152a44'], box: [-32, -32, 64, 64], scale: 2.3, y: 0, paint: snowflake },
  lantern: { bg: ['#2a3a5a', '#10172a'], box: [-18, -34, 36, 56], scale: 2.4, y: 8, paint: lantern },
  crystal: { bg: ['#2a4a6a', '#101c2c'], box: [-26, -32, 52, 62], scale: 2.3, y: 2, paint: crystal },
  crown: { bg: ['#6a4a1a', '#2c1e08'], box: [-32, -28, 64, 52], scale: 2.3, y: 4, paint: crown },
  // the valley's creatures (painted around their feet)
  tuft: { bg: ['#d98a50', '#7a3f22'], box: [-30, -24, 54, 36], scale: 2.8, y: 22, paint: g => paintFox(g, 1.3, 1) },
  fenn: { bg: ['#5a7a5a', '#22331f'], box: [-46, -36, 80, 54], scale: 2.1, y: 24, paint: g => paintWolf(g, 1.3, 1) },
  sporecap: { bg: ['#8a3a2a', '#381510'], box: [-30, -30, 60, 52], scale: 2.6, y: 22, paint: creature(CR.drawSporecap, 'sporecap', 19) },
  briarling: { bg: ['#4a6a2a', '#1c2a0f'], box: [-30, -40, 60, 62], scale: 2.4, y: 24, paint: creature(CR.drawThornling, 'briarling', 18) },
  boar: { bg: ['#7a5a3a', '#2f2014'], box: [-38, -30, 80, 54], scale: 1.9, y: 20, paint: creature(CR.drawBoar, 'bristleboar', 22) },
  golem: { bg: ['#5a6a7a', '#1e252c'], box: [-40, -50, 80, 74], scale: 1.9, y: 30, paint: creature(CR.drawGolem, 'cragGolem', 25) },
  hulk: { bg: ['#7a3a1a', '#2c1206'], box: [-40, -50, 80, 74], scale: 1.9, y: 30, paint: creature(CR.drawHulk, 'magmaHulk', 25) },
  wisp: { bg: ['#2a5a6a', '#0f2228'], box: [-30, -44, 60, 64], scale: 2.3, y: 18, paint: creature(CR.drawWisp, 'wisp', 18) },
  imp: { bg: ['#6a2a4a', '#2a0f1c'], box: [-30, -44, 60, 64], scale: 2.3, y: 18, paint: creature(CR.drawImp, 'imp', 18) },
  gloomling: { bg: ['#3a2a5a', '#160f24'], box: [-30, -40, 60, 60], scale: 2.3, y: 20, paint: creature(CR.drawGloomling, 'gloomling', 18) },
  warden: { bg: ['#3a5a2a', '#14200e'], box: [-70, -100, 140, 120], scale: 1, y: 52, paint: creature((g, en, t, l, f) => CR.drawWarden(g, en, t, l, f), 'brambleWarden', 40) },
};

/** The ids this module can draw: every entry above, plus "hero:<id>" for each hero. */
export const AVATAR_ART = new Set(Object.keys(AV));

/** A profile picture as an image URL. Unknown ids (or none) get the star. */
export function avatarArt(id: string | null | undefined): string {
  const key = id && (AV[id] || (id.startsWith('hero:') && isHero(id.slice(5)))) ? id : 'star';
  const hit = cache.get(key); if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const a = AV[key];
  // The badge: a coloured sky with a few stars, inside a paper ring.
  const [top, bottom] = a?.bg ?? ['#4a3a6a', '#1d1530'];
  const sky = g.createRadialGradient(S * .38, S * .3, 4, S / 2, S / 2, S * .56);
  sky.addColorStop(0, top); sky.addColorStop(1, bottom);
  g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 6, 0, TAU); g.clip();
  g.fillStyle = sky; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,244,222,.5)';
  for (const [x, y, r] of [[30, 40, 1.6], [122, 30, 1.3], [134, 92, 1.8], [38, 118, 1.2], [96, 20, 1], [20, 80, 1.1]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  if (a) {
    cutter ??= new Cutter();
    g.translate(S / 2, S / 2 + a.y * a.scale / 2.4); g.scale(a.scale, a.scale);
    let glows: CR.GlowMark[] = [];
    cutter.stamp(g, 0, 0, a.box, a.scale, STICKER, gg => { CR.beginGlows(gg, a.scale); a.paint(gg); glows = CR.endGlows(); });
    // Wisps and the Warden glow: their light goes on top of the paper, as on the battlefield.
    for (const [x, y, r, col, al] of glows) CR.glow(g, x, y, r, col, al);
  } else {
    // A hero: their portrait, a little larger than the menus show it.
    g.drawImage(heroBustCanvas(key.slice(5) as HeroId), -4, 4, S + 8, S + 8);
  }
  g.restore();
  g.lineWidth = 6; g.strokeStyle = '#fff4de'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 6, 0, TAU); g.stroke();
  g.lineWidth = 2.5; g.strokeStyle = '#2f2330'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1.8, 0, TAU); g.stroke();
  const url = c.toDataURL('image/png');
  cache.set(key, url); return url;
}
