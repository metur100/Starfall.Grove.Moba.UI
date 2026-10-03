// Scenery as paper pieces: trees, rocks, houses, stalls and everything else that stands in the valley. Each painter
// draws one thing around the origin (its foot at y = 0) in flat tones with a lit and a shaded side; the cutout bake
// adds the ink edge, grain and drop shadow, and `propShadow` the soft shadow on the ground beneath.
import { TAU, circle, ellipse, hash, mix, poly, rrect, shade, star } from './color';
import type { Obstacle, Palette } from '../types';

type Env = string;
const hex = (c: string, fallback: string) => c.startsWith('#') ? c : fallback;

/** The soft contact shadow on the ground under a prop (drawn beneath its cutout, with no edge). */
export function propShadow(g: CanvasRenderingContext2D, o: Obstacle) {
  const r = o.r, s = (x: number, y: number, rx: number, ry: number, a = .24) => ellipse(g, x, y, rx, ry, `rgba(40,24,40,${a})`);
  switch (o.kind) {
    case 'tree': s(6, r * .45, r * 1.25, r * .45); break;
    case 'pine': s(5, r * .45, r * 1.05, r * .38); break;
    case 'deadtree': s(5, r * .45, r * .9, r * .34); break;
    case 'house': s(8, 34, 98, 22, .28); break;
    case 'manor': s(10, 42, 132, 26, .28); break;
    case 'windmill': s(6, 22, 56, 16, .28); break;
    case 'tower': s(6, 32, 58, 18, .28); break;
    case 'fountain': s(4, 28, 70, 20, .24); break;
    case 'well': s(3, 16, 34, 12); break;
    case 'tent': s(5, 20, 50, 13); break;
    case 'stall': s(5, 20, 56, 12); break;
    case 'cliff': s(8, r * .45, r * 1.3, r * .42, .32); break;
    case 'campfire': break;
    case 'fence': s(0, 4, o.w! > o.h! ? 36 : 8, o.w! > o.h! ? 5 : 30, .16); break;
    case 'lamppost': s(2, 3, 10, 4); break;
    case 'banner': s(2, 4, 8, 3); break;
    default: s(3, r * .45, r * 1.1, r * .4);
  }
}

export function paintProp(g: CanvasRenderingContext2D, o: Obstacle, p: Palette, env: Env, dark: boolean) {
  const r = o.r, seed = o.seed;
  const rock = hex(p.rock, '#8c8f80'), trunk = hex(p.trunk, '#6f5337'), [f0, f1, f2] = p.foliage;
  const snow = env === 'stars', ash = env === 'embers', woods = env === 'leaves';
  switch (o.kind) {
    case 'tree': return tree(g, r, seed, trunk, f0, f1, f2, env);
    case 'pine': return pine(g, r, seed, trunk, f0, f1, f2, snow);
    case 'deadtree': return deadTree(g, r, seed, trunk, ash);
    case 'bush': return bush(g, r, seed, f0, f1, f2, env);
    case 'rock': return boulder(g, r, seed, rock, snow ? '#f2f5ff' : ash ? '#6e4a3a' : f2);
    case 'crystal': return crystal(g, r, p.accent);
    case 'mushroom': return mushroom(g, r, seed);
    case 'stump': { ellipse(g, 0, 0, r, r * .55, trunk); g.fillStyle = trunk; g.fillRect(-r, -6, r * 2, 6); ellipse(g, 0, -6, r, r * .5, '#d8b07a'); g.strokeStyle = shade('#d8b07a', -.25); g.lineWidth = 1.2; for (let i = 1; i < 3; i++) { g.beginPath(); g.ellipse(0, -6, r * i / 3, r * i / 6, 0, 0, TAU); g.stroke(); } return; }
    case 'log': { rrect(g, -34, -12, 68, 20, 10, trunk); g.fillStyle = shade(trunk, .15); g.fillRect(-30, -10, 58, 4); ellipse(g, 34, -2, 7, 10, '#d8b07a'); g.strokeStyle = shade('#d8b07a', -.25); g.lineWidth = 1; g.beginPath(); g.ellipse(34, -2, 3.5, 5, 0, 0, TAU); g.stroke(); if (woods) { ellipse(g, -14, -12, 9, 3.5, f2); ellipse(g, 4, -13, 6, 3, f1); } return; }
    case 'house': return house(g, o, p, dark, env);
    case 'manor': return manor(g, o, p, dark, env);
    case 'well': return well(g, p, rock);
    case 'windmill': return windmill(g, p, dark);
    case 'tower': return tower(g, p, rock, dark, snow);
    case 'tent': return tent(g, o.color || '#b86a5a');
    case 'stall': return stall(g, o.color || '#c9803d', seed);
    case 'pillar': return pillar(g, seed, rock, f2, snow);
    case 'statue': return statue(g, rock, f2);
    case 'lamppost': return lamppost(g, dark);
    case 'crate': { rrect(g, -15, -20, 30, 32, 2, '#b08654'); g.fillStyle = shade('#b08654', -.18); g.fillRect(4, -20, 11, 32); g.strokeStyle = '#6f5337'; g.lineWidth = 2.6; g.strokeRect(-13.5, -18.5, 27, 29); g.beginPath(); g.moveTo(-13, -18); g.lineTo(13, 10); g.stroke(); return; }
    case 'hay': { ellipse(g, 0, -2, 23, 17, '#dcb65a'); ellipse(g, 6, 2, 16, 12, shade('#dcb65a', -.1)); ellipse(g, -16, -2, 7.5, 15, '#ecd07a'); g.strokeStyle = '#a8844a'; g.lineWidth = 1.4; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-12, i * 8 - 2); g.quadraticCurveTo(4, i * 8 - 4, 20, i * 8 - 2); g.stroke(); } return; }
    case 'fence': return fence(g, o, snow);
    case 'campfire': return campfire(g, rock);
    case 'barrel': return barrel(g);
    case 'cart': return cart(g, seed);
    case 'bench': return bench(g);
    case 'banner': { rrect(g, -2.2, -96, 4.4, 100, 2, '#4a3a2a'); circle(g, 0, -97, 4.5, '#d9b04c'); return; }
    case 'planter': return planter(g, f1, seed);
    case 'cliff': return cliff(g, r, rock, snow ? '#eef2ff' : woods ? '#3f6a48' : ash ? '#4a3430' : f2, seed);
    case 'fountain': return fountain(g, p, rock);
  }
}

// ───────────────────────────── trees and plants
/** A cloud of overlapping circles filled as one shape. */
function cloud(g: CanvasRenderingContext2D, blobs: Array<[number, number, number]>, color: string, dx = 0, dy = 0, k = 1) {
  g.fillStyle = color; g.beginPath();
  for (const [x, y, rr] of blobs) { g.moveTo(x * k + dx + rr * k, y * k + dy); g.arc(x * k + dx, y * k + dy, rr * k, 0, TAU); }
  g.fill();
}
function tree(g: CanvasRenderingContext2D, r: number, seed: number, trunk: string, f0: string, f1: string, f2: string, env: Env) {
  // Trunk flaring into roots, with a knot.
  g.fillStyle = trunk; g.beginPath();
  g.moveTo(-r * .3, r * .45); g.quadraticCurveTo(-r * .12, r * .2, -r * .13, -r * .6); g.lineTo(r * .13, -r * .6); g.quadraticCurveTo(r * .12, r * .2, r * .32, r * .45);
  g.quadraticCurveTo(r * .1, r * .36, 0, r * .5); g.quadraticCurveTo(-r * .1, r * .36, -r * .3, r * .45); g.fill();
  g.fillStyle = shade(trunk, -.22); g.fillRect(r * .03, -r * .55, r * .08, r * .95);
  const cy = -r * 1.05, v = Math.floor(seed * 3);
  const blobs: Array<[number, number, number]> = v === 0 ? [[0, 0, 1], [-.62, .22, .7], [.64, .18, .72], [-.3, -.52, .66], [.34, -.48, .62], [0, .38, .7]]
    : v === 1 ? [[0, -.1, .95], [-.7, .28, .62], [.7, .3, .6], [-.25, -.6, .6], [.4, -.35, .7], [.05, .4, .72]]
      : [[0, 0, .9], [-.55, .1, .75], [.55, .05, .78], [0, -.62, .66], [-.2, .42, .66], [.4, .4, .6]];
  const B = blobs.map(([x, y, rr]) => [x * r, y * r + cy, rr * r] as [number, number, number]);
  // Three paper layers: the dark underside, the canopy, and a sunlit crown up and to the left.
  cloud(g, B, f0, 0, r * .12);
  cloud(g, B, f1);
  cloud(g, B.slice(0, 5).map(([x, y, rr]) => [x - r * .14, y - r * .16, rr * .62] as [number, number, number]), f2);
  // Scalloped leaf marks on the canopy.
  g.strokeStyle = shade(f1, -.2); g.lineWidth = 1.3; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) { const a = i * 2.3 + seed * 9, d = r * (.35 + hash(i + seed * 50) * .45), x = Math.cos(a) * d, y = cy + Math.sin(a) * d * .8 + r * .1; g.beginPath(); g.arc(x, y, r * .16, Math.PI * .15, Math.PI * .85); g.stroke(); }
  if (env === 'petals' && seed > .55) for (let i = 0; i < 7; i++) { const a = i * 2.4 + seed * 10; circle(g, Math.cos(a) * r * .72, cy + Math.sin(a) * r * .55, 3.2, i % 2 ? '#f7c5d5' : '#fff4f8'); circle(g, Math.cos(a) * r * .72, cy + Math.sin(a) * r * .55, 1.2, '#f2d27a'); }
  if (env === 'petals' && seed < .2) for (let i = 0; i < 5; i++) { const a = i * 1.9; circle(g, Math.cos(a) * r * .6, cy + Math.sin(a) * r * .45, 3.8, '#e0525c'); circle(g, Math.cos(a) * r * .6 - 1.2, cy + Math.sin(a) * r * .45 - 1.2, 1.2, '#ffd0d0'); }
  if (env === 'leaves') { g.strokeStyle = '#8fae6a'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { const x = (i - 1) * r * .55 + seed * 6; g.beginPath(); g.moveTo(x, cy + r * .6); g.quadraticCurveTo(x + 3, cy + r * .95, x - 1, cy + r * 1.2); g.stroke(); } if (seed > .6) for (let i = 0; i < 4; i++) circle(g, Math.cos(i * 2.1 + seed * 10) * r * .7, cy + Math.sin(i * 2.1) * r * .5, 3, '#e8a54b'); }
  if (env === 'embers') for (let i = 0; i < 4; i++) circle(g, Math.cos(i * 2 + seed * 10) * r * .6, cy + Math.sin(i * 2) * r * .5, 2.6, '#ff9a3d');
}
function pine(g: CanvasRenderingContext2D, r: number, seed: number, trunk: string, f0: string, f1: string, f2: string, snow: boolean) {
  rrect(g, -r * .13, -r * .3, r * .26, r * .8, 2, trunk);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const ty = -r * .15 - i * r * .6, wd = r * (1.18 - i * .23), hgt = r * 1.05;
    const col = i % 2 ? f1 : mix(f0, f1, .4);
    // A tier with a scalloped hem.
    g.fillStyle = col; g.beginPath(); g.moveTo(0, ty - hgt);
    g.lineTo(wd, ty);
    for (let k = 3; k >= 0; k--) { const x0 = -wd + wd * 2 * k / 4; g.quadraticCurveTo(x0 + wd / 4, ty + r * .16, x0, ty); }
    g.closePath(); g.fill();
    g.fillStyle = shade(col, -.2); g.beginPath(); g.moveTo(0, ty - hgt); g.lineTo(wd, ty); g.lineTo(wd * .35, ty + r * .05); g.closePath(); g.fill();
    if (snow) { g.fillStyle = '#f2f6ff'; g.beginPath(); g.moveTo(0, ty - hgt); g.lineTo(wd * .5, ty - hgt * .5); g.quadraticCurveTo(wd * .2, ty - hgt * .42, 0, ty - hgt * .52); g.quadraticCurveTo(-wd * .2, ty - hgt * .4, -wd * .5, ty - hgt * .5); g.closePath(); g.fill(); }
    else if (i === tiers - 1) { g.fillStyle = f2; g.beginPath(); g.moveTo(0, ty - hgt); g.lineTo(wd * .3, ty - hgt * .6); g.lineTo(-wd * .3, ty - hgt * .6); g.closePath(); g.fill(); }
  }
  if (snow && seed > .5) { g.fillStyle = '#ffe38a'; star(g, 0, -r * .15 - (tiers - 1) * r * .6 - r * 1.1, 3, 5, .45); g.fill(); }
}
function deadTree(g: CanvasRenderingContext2D, r: number, seed: number, trunk: string, ash: boolean) {
  const c = shade(trunk, -.15);
  g.strokeStyle = c; g.lineCap = 'round';
  g.lineWidth = r * .34; g.beginPath(); g.moveTo(0, r * .4); g.quadraticCurveTo(-r * .12, -r, r * .1, -r * 2); g.stroke();
  g.lineWidth = r * .14;
  for (const [a, l, h] of [[-.9, 1, -1.2], [.8, 1.1, -1.5], [-.5, .8, -2], [.6, .7, -2.3]] as Array<[number, number, number]>) { g.beginPath(); g.moveTo(0, r * h * .8); g.quadraticCurveTo(Math.sin(a) * r * l * .5, r * h - r * .3, Math.sin(a) * r * l, r * h - r * .6); g.stroke(); }
  g.strokeStyle = shade(c, .18); g.lineWidth = r * .06; g.beginPath(); g.moveTo(-r * .06, r * .2); g.quadraticCurveTo(-r * .16, -r * .9, 0, -r * 1.7); g.stroke();
  if (ash) for (let i = 0; i < 3; i++) circle(g, Math.sin(i * 2 + seed) * r * .5, -r * (1.2 + i * .3), 2.4, '#ff9a3d');
}
function bush(g: CanvasRenderingContext2D, r: number, seed: number, f0: string, f1: string, f2: string, env: Env) {
  const B: Array<[number, number, number]> = [[-r * .62, -r * .1, r * .5], [0, -r * .35, r * .6], [r * .62, -r * .08, r * .5], [-r * .3, r * .1, r * .45], [r * .3, r * .1, r * .45]];
  cloud(g, B, f0, 0, r * .12); cloud(g, B, f1);
  cloud(g, B.slice(0, 3).map(([x, y, rr]) => [x - r * .1, y - r * .14, rr * .55] as [number, number, number]), f2);
  if (seed > .45) for (let i = 0; i < 6; i++) { const x = Math.cos(i * 2.3 + seed * 9) * r * .7, y = -r * .12 + Math.sin(i * 1.7) * r * .28; circle(g, x, y, 3, env === 'petals' ? '#e0525c' : env === 'stars' ? '#bfe8ff' : env === 'embers' ? '#ffb347' : '#9fe3c9'); circle(g, x - .9, y - .9, 1, 'rgba(255,255,255,.7)'); }
}
function boulder(g: CanvasRenderingContext2D, r: number, seed: number, rock: string, cap: string) {
  const v = Math.floor(seed * 3), pts = v === 0 ? [-1, .3, -.72, -.55, .05, -.95, .86, -.4, 1, .35, .3, .68] : v === 1 ? [-.95, .35, -.85, -.35, -.2, -.85, .6, -.75, 1, .1, .5, .62] : [-1, .25, -.5, -.7, .3, -.9, .9, -.2, .8, .45, -.1, .62];
  g.fillStyle = rock; g.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, pts[i] * r, pts[i + 1] * r); g.closePath(); g.fill();
  // The shaded right face and the lit top face.
  g.fillStyle = shade(rock, -.2); g.beginPath(); g.moveTo(pts[4] * r, pts[5] * r); for (let i = 6; i < pts.length; i += 2) g.lineTo(pts[i] * r, pts[i + 1] * r); g.lineTo(r * .15, r * .05); g.closePath(); g.fill();
  g.fillStyle = shade(rock, .2); g.beginPath(); g.moveTo(pts[2] * r, pts[3] * r); g.lineTo(pts[4] * r, pts[5] * r); g.lineTo(r * .15, r * .05); g.lineTo(-r * .45, -r * .05); g.closePath(); g.fill();
  g.strokeStyle = shade(rock, -.3); g.lineWidth = 1.1; g.beginPath(); g.moveTo(-r * .4, r * .3); g.lineTo(-r * .1, r * .15); g.lineTo(0, r * .4); g.stroke();
  g.fillStyle = cap; g.beginPath(); g.moveTo(pts[2] * r * .9, pts[3] * r * .95); g.quadraticCurveTo(pts[4] * r, pts[5] * r - 3, pts[6] * r * .8, pts[7] * r * .9); g.quadraticCurveTo(r * .1, -r * .45, pts[2] * r * .9, pts[3] * r * .95); g.fill();
}
function crystal(g: CanvasRenderingContext2D, r: number, accent: string) {
  for (const [ox, hgt, rot] of [[-.45, .9, -.3], [.45, 1.05, .28], [0, 1.5, 0]] as Array<[number, number, number]>) {
    g.save(); g.translate(ox * r, r * .3); g.rotate(rot);
    poly(g, [-r * .28, 0, -r * .22, -r * hgt, 0, -r * (hgt + .38), r * .22, -r * hgt, r * .28, 0], mix(accent, '#5a4bb0', .35));
    poly(g, [0, 0, 0, -r * (hgt + .38), r * .22, -r * hgt, r * .28, 0], shade(mix(accent, '#5a4bb0', .35), -.2));
    poly(g, [-r * .18, -2, -r * .14, -r * hgt, 0, -r * (hgt + .3), -r * .02, -2], 'rgba(255,255,255,.5)');
    g.restore();
  }
}
function mushroom(g: CanvasRenderingContext2D, r: number, seed: number) {
  const cap = seed > .5 ? '#b56ad6' : '#e0735a';
  g.fillStyle = '#efe4c8'; g.beginPath(); g.moveTo(-r * .26, r * .5); g.quadraticCurveTo(-r * .14, -r * .3, -r * .2, -r * .72); g.lineTo(r * .2, -r * .72); g.quadraticCurveTo(r * .14, -r * .3, r * .26, r * .5); g.closePath(); g.fill();
  g.fillStyle = shade('#efe4c8', -.15); g.fillRect(r * .04, -r * .7, r * .16, r * 1.18);
  ellipse(g, 0, -r * .72, r * 1.05, r * .26, shade(cap, -.35));
  g.fillStyle = cap; g.beginPath(); g.ellipse(0, -r * .78, r * 1.15, r * .85, 0, Math.PI, TAU); g.quadraticCurveTo(0, -r * .6, -r * 1.15, -r * .78); g.fill();
  g.fillStyle = shade(cap, .2); g.beginPath(); g.ellipse(-r * .3, -r * 1.15, r * .5, r * .25, -.3, 0, TAU); g.fill();
  for (let i = 0; i < 5; i++) { const a = i * 1.3 + 3.6; ellipse(g, Math.cos(a) * r * .7, -r * .98 + Math.sin(a) * r * .28, r * .13, r * .1, '#fff4dc'); }
}

// ───────────────────────────── buildings
/** A steep storybook roof with curved eaves, tile rows and a ridge cap. */
function roof(g: CanvasRenderingContext2D, x0: number, x1: number, eave: number, ridge: number, inset: number, color: string, snow: boolean, ash: boolean) {
  const w = x1 - x0, mid = (x0 + x1) / 2;
  g.fillStyle = shade(color, -.35); g.beginPath(); g.moveTo(x0 - 4, eave + 5); g.quadraticCurveTo(mid, eave + 1, x1 + 4, eave + 5); g.lineTo(x1 + 4, eave); g.lineTo(x0 - 4, eave); g.closePath(); g.fill();
  g.fillStyle = color; g.beginPath(); g.moveTo(x0 - 6, eave + 2); g.quadraticCurveTo(x0 + inset * .35, eave - 8, x0 + inset, ridge); g.lineTo(x1 - inset, ridge); g.quadraticCurveTo(x1 - inset * .35, eave - 8, x1 + 6, eave + 2); g.quadraticCurveTo(mid, eave - 5, x0 - 6, eave + 2); g.closePath(); g.fill();
  // The far slope in shade.
  g.fillStyle = shade(color, -.16); g.beginPath(); g.moveTo(mid + w * .12, ridge); g.lineTo(x1 - inset, ridge); g.quadraticCurveTo(x1 - inset * .35, eave - 8, x1 + 6, eave + 2); g.quadraticCurveTo(mid + w * .3, eave - 3, mid + w * .22, eave - 2); g.closePath(); g.fill();
  // Scalloped tile rows.
  g.strokeStyle = shade(color, -.26); g.lineWidth = 1.3;
  const rows = 5;
  for (let i = 1; i < rows; i++) {
    const yy = ridge + (eave - ridge) * i / rows, k = i / rows, xa = x0 + inset * (1 - k) - 3 * k, xb = x1 - inset * (1 - k) + 3 * k, n = Math.max(4, Math.round((xb - xa) / 13));
    g.beginPath(); for (let j = 0; j < n; j++) { const a = xa + (xb - xa) * j / n, b = xa + (xb - xa) * (j + 1) / n; g.moveTo(a, yy); g.quadraticCurveTo((a + b) / 2, yy + 5, b, yy); } g.stroke();
  }
  rrect(g, x0 + inset - 4, ridge - 4, w - inset * 2 + 8, 6, 3, shade(color, -.3));
  if (snow) { g.fillStyle = '#f4f7ff'; g.beginPath(); g.moveTo(x0 + inset - 3, ridge - 3); g.lineTo(x1 - inset + 3, ridge - 3); g.quadraticCurveTo(x1 - inset * .6, ridge + (eave - ridge) * .45, x1 - inset * .9, ridge + (eave - ridge) * .5); g.quadraticCurveTo(mid, ridge + (eave - ridge) * .35, x0 + inset * .9, ridge + (eave - ridge) * .5); g.quadraticCurveTo(x0 + inset * .6, ridge + (eave - ridge) * .45, x0 + inset - 3, ridge - 3); g.fill(); }
  if (ash) for (let i = 0; i < 6; i++) ellipse(g, x0 + inset + (w - inset * 2) * hash(i * 3.1 + x0), ridge + (eave - ridge) * (.3 + hash(i) * .5), 7, 2.5, 'rgba(60,40,36,.35)');
}
function windowPane(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dark: boolean, shutter: string, arch = false, box?: string) {
  rrect(g, x - w / 2 - 3, y - 3, w + 6, h + 6, arch ? w / 2 + 3 : 3, '#4a3426');
  g.fillStyle = dark ? '#ffd88a' : '#a8cfe6'; g.beginPath(); g.roundRect(x - w / 2, y, w, h, arch ? [w / 2, w / 2, 1, 1] : 2); g.fill();
  if (!dark) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(x - w / 2 + 2, y + h - 2); g.lineTo(x - w / 2 + 2, y + 3); g.lineTo(x - w / 2 + w * .45, y + 3); g.closePath(); g.fill(); }
  g.fillStyle = '#4a3426'; g.fillRect(x - 1, y, 2, h); g.fillRect(x - w / 2, y + h * .5 - 1, w, 2);
  for (const s of [-1, 1]) { rrect(g, x + s * (w / 2 + 3) - (s < 0 ? 8 : 0), y - 2, 8, h + 4, 2, shutter); g.fillStyle = shade(shutter, -.25); g.fillRect(x + s * (w / 2 + 3) - (s < 0 ? 8 : 0) + 3.2, y + 1, 1.4, h - 2); }
  if (box) { rrect(g, x - w / 2 - 6, y + h + 3, w + 12, 6, 2, '#8a6a4a'); for (let i = 0; i < 4; i++) { circle(g, x - w / 2 - 2 + i * (w + 4) / 3, y + h + 2, 3.4, ['#f2a1b8', '#ffd35c', '#c7a6f2', '#ff9b73'][i]); } }
}
function door(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, wood: string) {
  g.fillStyle = '#4a3426'; g.beginPath(); g.roundRect(x - w / 2 - 3, y - h - 3, w + 6, h + 3, [w / 2 + 3, w / 2 + 3, 0, 0]); g.fill();
  g.fillStyle = wood; g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, [w / 2, w / 2, 0, 0]); g.fill();
  g.strokeStyle = shade(wood, -.25); g.lineWidth = 1.2; for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x - w / 2 + w * i / 3, y - h + 4); g.lineTo(x - w / 2 + w * i / 3, y); g.stroke(); }
  circle(g, x + w * .28, y - h * .42, 1.8, '#e8c46a');
  rrect(g, x - w / 2 - 5, y - 2, w + 10, 5, 2, '#9a9a8c');
}
function house(g: CanvasRenderingContext2D, o: Obstacle, p: Palette, dark: boolean, env: Env) {
  const roofC = o.color || p.roof[0], wall = shade(p.wall, o.seed < .34 ? -.06 : o.seed > .66 ? .05 : 0), beam = shade(hex(p.trunk, '#6f5337'), -.1);
  const v = Math.floor(o.seed * 3), stone = shade(hex(p.rock, '#8c8f80'), .15), shutter = shade(roofC, -.1);
  // Stone footing, then the plastered walls with timber framing.
  rrect(g, -78, 18, 156, 20, 3, stone);
  g.fillStyle = shade(stone, -.18); for (let i = 0; i < 8; i++) g.fillRect(-74 + i * 19 + (i % 2) * 5, 20 + (i % 2) * 8, 13, 6);
  g.fillStyle = wall; g.fillRect(-74, -70, 148, 90);
  g.fillStyle = shade(wall, -.1); g.fillRect(30, -70, 44, 90);
  g.fillStyle = beam;
  for (const bx of [-74, -26, 22, 70]) g.fillRect(bx, -70, 5, 90);
  g.fillRect(-74, -70, 148, 5); g.fillRect(-74, -24, 148, 5); g.fillRect(-74, 15, 148, 5);
  g.strokeStyle = beam; g.lineWidth = 4; g.beginPath(); g.moveTo(-69, 15); g.lineTo(-26, -24); g.moveTo(74, 15); g.lineTo(27, -24); g.stroke();
  windowPane(g, -48, -58, 22, 24, dark, shutter, v === 1, '#8a6a4a');
  windowPane(g, 48, -58, 22, 24, dark, shutter, v === 1, v !== 2 ? '#8a6a4a' : undefined);
  door(g, 0, 18, 26, 40, v === 2 ? '#8a3a2a' : '#6f4a30');
  // Chimney and roof.
  const cx = v === 1 ? -44 : 44;
  rrect(g, cx - 9, -150, 18, 44, 2, '#9a8a7a'); g.fillStyle = '#7a6a5a'; g.fillRect(cx - 11, -154, 22, 7); g.fillStyle = shade('#9a8a7a', -.15); g.fillRect(cx + 2, -146, 7, 38);
  roof(g, -82, 82, -64, -146, 44, roofC, env === 'stars', env === 'embers');
  if (v === 0) { // A dormer window in the roof.
    g.fillStyle = shade(roofC, -.1); g.beginPath(); g.moveTo(-16, -84); g.lineTo(0, -106); g.lineTo(16, -84); g.closePath(); g.fill();
    rrect(g, -12, -96, 24, 16, 2, wall); windowPane(g, 0, -94, 12, 12, dark, shutter);
  }
  if (env === 'leaves') for (let i = 0; i < 9; i++) { const x = -74 + (i % 3) * 5 + (i > 5 ? 140 : 0), y = -40 + Math.floor(i / 3) * 18; circle(g, x, y, 5, i % 2 ? '#3f6a48' : '#5a8a50'); }
}
function manor(g: CanvasRenderingContext2D, o: Obstacle, p: Palette, dark: boolean, env: Env) {
  const roofC = o.color || p.roof[0], wall = shade(p.wall, o.seed < .34 ? -.05 : o.seed > .66 ? .04 : 0), beam = shade(hex(p.trunk, '#6f5337'), -.1);
  const stone = shade(hex(p.rock, '#8c8f80'), .1), shutter = shade(roofC, -.12);
  rrect(g, -110, -22, 220, 66, 3, stone);
  g.fillStyle = shade(stone, -.15); for (let r = 0; r < 3; r++) for (let i = 0; i < 11; i++) g.fillRect(-106 + i * 20 + (r % 2) * 10, -18 + r * 20, 16, 7);
  g.fillStyle = wall; g.fillRect(-104, -132, 208, 112); g.fillStyle = shade(wall, -.09); g.fillRect(52, -132, 52, 112);
  g.fillStyle = beam; for (const bx of [-104, -54, -2, 50, 100]) g.fillRect(bx, -132, 5, 112); g.fillRect(-104, -132, 208, 5); g.fillRect(-104, -78, 208, 5); g.fillRect(-104, -24, 208, 5);
  for (const bx of [-78, -26, 26, 78]) for (const by of [-122, -68]) windowPane(g, bx, by, 18, 24, dark, shutter, by < -100, by > -100 ? '#8a6a4a' : undefined);
  // Balcony over the door.
  rrect(g, -38, -72, 76, 6, 2, '#6f5337'); g.fillStyle = '#6f5337'; for (let i = 0; i < 8; i++) g.fillRect(-34 + i * 10, -68, 2.6, 12);
  rrect(g, -38, -58, 76, 4, 2, '#5a4130');
  door(g, 0, 44, 34, 54, '#5a3a24');
  for (const s of [-1, 1]) { rrect(g, s * 70 - 10, -236, 20, 52, 2, '#9a8a7a'); g.fillStyle = '#7a6a5a'; g.fillRect(s * 70 - 12, -240, 24, 7); }
  roof(g, -114, 114, -126, -206, 60, roofC, env === 'stars', env === 'embers');
  g.fillStyle = shade(roofC, -.1); g.beginPath(); g.moveTo(-24, -150); g.lineTo(0, -184); g.lineTo(24, -150); g.closePath(); g.fill();
  rrect(g, -15, -170, 30, 20, 2, wall); windowPane(g, 0, -167, 14, 14, dark, shutter, true);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { circle(g, s * (46 + i * 14), 40, 6, '#5a8a50'); circle(g, s * (46 + i * 14), 37, 3.6, ['#e0525c', '#ffd35c', '#c7a6f2'][i]); }
}
function well(g: CanvasRenderingContext2D, p: Palette, rock: string) {
  ellipse(g, 0, 6, 31, 15, shade(rock, -.12)); g.fillStyle = shade(rock, -.12); g.fillRect(-31, -2, 62, 8); ellipse(g, 0, -2, 31, 14, shade(rock, .12)); ellipse(g, 0, -2, 22, 9, '#2a4a5a'); ellipse(g, -4, -4, 10, 3, 'rgba(160,210,230,.45)');
  g.strokeStyle = shade(rock, -.3); g.lineWidth = 1.2; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 22, -2 + Math.sin(a) * 9); g.lineTo(Math.cos(a) * 31, -2 + Math.sin(a) * 14); g.stroke(); }
  rrect(g, -29, -60, 6, 60, 2, '#6f5337'); rrect(g, 23, -60, 6, 60, 2, '#6f5337'); rrect(g, -27, -48, 54, 4, 2, '#5a4130');
  g.strokeStyle = '#4a3a2a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -46); g.lineTo(0, -24); g.stroke(); rrect(g, -6, -26, 12, 10, 2, '#8a6a4a');
  const rc = p.roof[0]; poly(g, [-40, -54, 0, -80, 40, -54, 34, -50, -34, -50], rc); poly(g, [0, -80, 40, -54, 34, -50, 6, -70], shade(rc, -.18));
}
function windmill(g: CanvasRenderingContext2D, p: Palette, dark: boolean) {
  poly(g, [-40, 24, -24, -100, 24, -100, 40, 24], p.wall); poly(g, [8, 24, 8, -100, 24, -100, 40, 24], shade(p.wall, -.12));
  g.strokeStyle = shade(p.wall, -.2); g.lineWidth = 1.2; for (let i = 1; i < 6; i++) { const y = 24 - i * 21, w = 40 - i * 3.2; g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke(); }
  const rc = p.roof[1] || p.roof[0]; g.fillStyle = rc; g.beginPath(); g.moveTo(-32, -96); g.quadraticCurveTo(0, -146, 32, -96); g.closePath(); g.fill(); g.fillStyle = shade(rc, -.18); g.beginPath(); g.moveTo(0, -121); g.quadraticCurveTo(22, -114, 32, -96); g.lineTo(6, -96); g.closePath(); g.fill();
  door(g, 0, 24, 20, 30, '#6f4a30'); windowPane(g, 0, -68, 12, 14, dark, '#8a5a3a', true);
}
function tower(g: CanvasRenderingContext2D, p: Palette, rock: string, dark: boolean, snow: boolean) {
  poly(g, [-44, 34, -36, -150, 36, -150, 44, 34], rock); poly(g, [8, 34, 8, -150, 36, -150, 44, 34], shade(rock, -.16));
  g.fillStyle = shade(rock, -.22); for (let r = 0; r < 9; r++) for (let i = 0; i < 4; i++) g.fillRect(-38 + i * 20 + (r % 2) * 10 + r * .5, 20 - r * 20, 12, 5);
  door(g, 0, 34, 24, 38, '#4a3a2a'); windowPane(g, 0, -140, 14, 20, dark, '#5a4a6a', true);
  for (let i = -3; i <= 3; i++) rrect(g, i * 11 - 5, -168, 9, 16, 1, i % 2 ? rock : shade(rock, .12));
  poly(g, [-48, -164, 0, -212, 48, -164], p.roof[0]); poly(g, [0, -212, 48, -164, 10, -164], shade(p.roof[0], -.18));
  if (snow) poly(g, [-20, -186, 0, -210, 20, -186, 8, -182, -8, -184], '#f4f7ff');
  g.strokeStyle = '#4a3a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -212); g.lineTo(0, -228); g.stroke(); poly(g, [0, -228, 14, -223, 0, -218], '#c0392b');
}
function tent(g: CanvasRenderingContext2D, c: string) {
  poly(g, [-50, 22, 0, -64, 50, 22], c); poly(g, [0, -64, 50, 22, 14, 22], shade(c, -.2));
  g.strokeStyle = shade(c, .25); g.lineWidth = 3; g.beginPath(); g.moveTo(-36, -2); g.lineTo(-10, 12); g.moveTo(-26, -20); g.lineTo(-4, -6); g.stroke();
  poly(g, [-13, 22, 0, -16, 13, 22], '#2a2020'); poly(g, [0, -16, 13, 22, 6, 22], '#3a2a2a');
  g.strokeStyle = '#5a4130'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -64); g.lineTo(0, -74); g.stroke(); poly(g, [0, -74, 12, -70, 0, -66], shade(c, .3));
}
function stall(g: CanvasRenderingContext2D, c: string, seed: number) {
  rrect(g, -51, -62, 5, 82, 2, '#6f5337'); rrect(g, 46, -62, 5, 82, 2, '#6f5337');
  rrect(g, -54, -8, 108, 28, 3, '#9a7650'); g.fillStyle = shade('#9a7650', .18); g.fillRect(-54, -8, 108, 5);
  g.strokeStyle = shade('#9a7650', -.25); g.lineWidth = 1.2; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(-54 + i * 21.6, -3); g.lineTo(-54 + i * 21.6, 20); g.stroke(); }
  const goods = seed > .66 ? ['#e0525c', '#ffd35c', '#9fd46b', '#ff9b73', '#c7a6f2', '#e0525c'] : seed > .33 ? ['#d9b45a', '#e8c870', '#c9803d', '#d9b45a', '#e8c870', '#b08654'] : ['#8fd0e8', '#b56ad6', '#9fd46b', '#8fd0e8', '#f2a1b8', '#b56ad6'];
  for (let i = 0; i < 6; i++) { circle(g, -38 + i * 15, -13, 6.5, goods[i]); circle(g, -40 + i * 15, -15, 2, 'rgba(255,255,255,.55)'); }
  rrect(g, -60, -80, 120, 22, 4, c);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff4e0' : shade(c, -.08); g.beginPath(); g.moveTo(-60 + i * 20, -60); g.lineTo(-60 + (i + 1) * 20, -60); g.lineTo(-60 + (i + 1) * 20, -48); g.quadraticCurveTo(-60 + (i + .5) * 20, -38, -60 + i * 20, -48); g.closePath(); g.fill(); }
  g.fillStyle = shade(c, .22); g.fillRect(-60, -80, 120, 5);
}
function pillar(g: CanvasRenderingContext2D, seed: number, rock: string, moss: string, snow: boolean) {
  const broken = seed < .4, h = broken ? 40 + seed * 40 : 76;
  rrect(g, -14, -h, 28, h + 6, 2, rock); g.fillStyle = shade(rock, -.18); g.fillRect(4, -h, 10, h + 6);
  g.strokeStyle = shade(rock, -.28); g.lineWidth = 1; for (const fx of [-8, -2]) { g.beginPath(); g.moveTo(fx, -h + 4); g.lineTo(fx, 2); g.stroke(); }
  rrect(g, -19, -2, 38, 11, 2, shade(rock, .08));
  if (!broken) rrect(g, -19, -h - 9, 38, 11, 2, shade(rock, .15));
  else poly(g, [-14, -h, -4, -h - 10, 6, -h - 2, 14, -h - 8, 14, -h], rock);
  ellipse(g, -6, -h * .4, 8, 4, snow ? '#f4f7ff' : moss);
}
function statue(g: CanvasRenderingContext2D, rock: string, moss: string) {
  rrect(g, -27, -12, 54, 32, 3, shade(rock, -.05)); rrect(g, -31, -18, 62, 9, 3, shade(rock, .15));
  const st = shade(rock, .28);
  ellipse(g, 0, -36, 15, 19, st); circle(g, 4, -60, 11, st);
  poly(g, [-2, -66, 0, -82, 6, -68], st); poly(g, [8, -68, 14, -82, 14, -64], st);
  ellipse(g, -18, -22, 16, 7, st, -.5); ellipse(g, 7, -40, 5, 12, shade(st, -.12));
  ellipse(g, -8, -44, 6, 10, moss);
}
function lamppost(g: CanvasRenderingContext2D, dark: boolean) {
  rrect(g, -3, -66, 6, 70, 2, '#3a3440'); rrect(g, -8, -2, 16, 7, 2, '#3a3440');
  g.strokeStyle = '#3a3440'; g.lineWidth = 2; g.beginPath(); g.arc(8, -62, 8, Math.PI, Math.PI * 1.6); g.stroke();
  rrect(g, -10, -84, 20, 18, 3, '#2a2430'); rrect(g, -7, -81, 14, 12, 2, dark ? '#ffd88a' : '#f4e2b0');
  poly(g, [-12, -84, 0, -93, 12, -84], '#2a2430'); circle(g, 0, -94, 2, '#2a2430');
}
function fence(g: CanvasRenderingContext2D, o: Obstacle, snow: boolean) {
  const wood = '#9a7650';
  if (o.w! > o.h!) {
    for (const px of [-30, 0, 30]) { rrect(g, px - 3.5, -24, 7, 28, 2, shade(wood, -.12)); poly(g, [px - 3.5, -24, px, -29, px + 3.5, -24], shade(wood, -.12)); }
    rrect(g, -35, -19, 70, 5, 2, wood); rrect(g, -35, -9, 70, 5, 2, wood);
    if (snow) { rrect(g, -35, -21, 70, 3, 1.5, '#f4f7ff'); }
  } else {
    for (const py of [-28, 4, 34]) rrect(g, -3.5, py - 17, 7, 24, 2, shade(wood, -.12));
    rrect(g, -1.5, -42, 4, 76, 2, wood);
  }
}
function campfire(g: CanvasRenderingContext2D, rock: string) {
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; ellipse(g, Math.cos(a) * 21, Math.sin(a) * 10, 7.5, 5.5, i % 2 ? rock : shade(rock, .12)); }
  g.strokeStyle = '#5a4130'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-14, 4); g.lineTo(12, -4); g.moveTo(-12, -4); g.lineTo(14, 4); g.stroke();
  circle(g, 13, -4, 2.6, '#d8b07a'); circle(g, 14, 4, 2.6, '#d8b07a');
}
function barrel(g: CanvasRenderingContext2D) {
  g.fillStyle = '#9a6238'; g.beginPath(); g.moveTo(-13, -26); g.quadraticCurveTo(-18, -8, -13, 10); g.lineTo(13, 10); g.quadraticCurveTo(18, -8, 13, -26); g.closePath(); g.fill();
  g.fillStyle = shade('#9a6238', -.2); g.beginPath(); g.moveTo(4, -26); g.lineTo(13, -26); g.quadraticCurveTo(18, -8, 13, 10); g.lineTo(4, 10); g.closePath(); g.fill();
  g.strokeStyle = shade('#9a6238', -.3); g.lineWidth = 1; for (const sx of [-6, 0]) { g.beginPath(); g.moveTo(sx, -24); g.lineTo(sx, 8); g.stroke(); }
  for (const by of [-20, -8, 4]) rrect(g, -16, by, 32, 3.2, 1.5, '#5a5a62');
  ellipse(g, 0, -26, 13, 5, '#b07a4a'); ellipse(g, 0, -26, 9, 3, '#6f4a2a');
}
function cart(g: CanvasRenderingContext2D, seed: number) {
  rrect(g, -46, -24, 92, 28, 3, '#9a7650'); g.fillStyle = shade('#9a7650', .15); g.fillRect(-46, -24, 92, 5);
  g.strokeStyle = shade('#9a7650', -.25); g.lineWidth = 1.2; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(-46 + i * 18.4, -19); g.lineTo(-46 + i * 18.4, 4); g.stroke(); }
  g.strokeStyle = '#6f5337'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(44, -4); g.lineTo(58, 6); g.stroke();
  if (seed > .5) { ellipse(g, -10, -32, 30, 14, '#dcb65a'); ellipse(g, 14, -34, 18, 10, '#ecd07a'); }
  else { rrect(g, -34, -46, 24, 24, 2, '#b08654'); rrect(g, -6, -42, 20, 20, 2, '#c09660'); rrect(g, 18, -38, 18, 16, 2, '#b08654'); }
  for (const wx of [-26, 26]) { circle(g, wx, 8, 14, '#5a4130'); circle(g, wx, 8, 10.5, '#9a7650'); circle(g, wx, 8, 3, '#3a2a1a'); g.strokeStyle = '#5a4130'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(wx - Math.cos(a) * 10, 8 - Math.sin(a) * 10); g.lineTo(wx + Math.cos(a) * 10, 8 + Math.sin(a) * 10); g.stroke(); } }
}
function bench(g: CanvasRenderingContext2D) {
  for (const lx of [-27, 22]) rrect(g, lx, -12, 5, 20, 1.5, '#4a3a2a');
  rrect(g, -33, -16, 66, 7, 2, '#9a7650'); rrect(g, -33, -31, 66, 7, 2, '#9a7650');
  g.fillStyle = shade('#9a7650', .15); g.fillRect(-33, -16, 66, 2); g.fillRect(-33, -31, 66, 2);
  rrect(g, -31, -26, 4, 12, 1, '#6f5337'); rrect(g, 27, -26, 4, 12, 1, '#6f5337');
}
function planter(g: CanvasRenderingContext2D, stem: string, seed: number) {
  rrect(g, -27, -10, 54, 23, 3, '#9a7650'); g.fillStyle = shade('#9a7650', .15); g.fillRect(-27, -10, 54, 4);
  for (let i = 0; i < 7; i++) { const fx = -20 + i * 6.6, fy = -18 - (i % 2) * 6; g.strokeStyle = stem; g.lineWidth = 2; g.beginPath(); g.moveTo(fx, -8); g.lineTo(fx, fy); g.stroke(); circle(g, fx, fy - 2, 4.3, ['#e0525c', '#ffd35c', '#f2a1b8', '#c7a6f2'][(i + Math.floor(seed * 4)) % 4]); circle(g, fx, fy - 2, 1.5, '#fff2a1'); }
}
function cliff(g: CanvasRenderingContext2D, r: number, rock: string, cap: string, seed: number) {
  poly(g, [-r * 1.3, r * .5, -r * 1.1, -r * 1.4, -r * .5, -r * 2.6, r * .3, -r * 2.2, r * .9, -r * 2.5, r * 1.35, -r * 1.2, r * 1.3, r * .55], shade(rock, -.22));
  poly(g, [-r * 1.2, r * .4, -r, -r * 1.3, -r * .5, -r * 2.45, r * .1, -r * 2, r * .2, r * .45], rock);
  poly(g, [-r * 1.05, -r * .2, -r * .8, -r * 1.2, -r * .45, -r * 1.9, -r * .3, -r * .6], shade(rock, .16));
  g.strokeStyle = shade(rock, -.35); g.lineWidth = 1.6; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-r * .9 + i * r * .5, -r * (1.8 - i * .2)); g.lineTo(-r * .7 + i * r * .45 + hash(i + seed) * 6, r * .2); g.stroke(); }
  g.fillStyle = cap; g.beginPath(); g.moveTo(-r * .85, -r * 1.9); g.lineTo(-r * .5, -r * 2.6); g.lineTo(r * .3, -r * 2.2); g.lineTo(r * .9, -r * 2.5); g.lineTo(r * 1.1, -r * 2); g.quadraticCurveTo(r * .3, -r * 1.7, -r * .85, -r * 1.9); g.fill();
}
function fountain(g: CanvasRenderingContext2D, p: Palette, rock: string) {
  ellipse(g, 0, 12, 67, 29, shade(rock, -.15)); g.fillStyle = shade(rock, -.15); g.fillRect(-67, 2, 134, 10);
  ellipse(g, 0, 2, 67, 28, shade(rock, .16));
  ellipse(g, 0, 3, 57, 22, p.waterDeep); ellipse(g, -8, 0, 44, 15, p.water);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 3, 40, 14, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  rrect(g, -9, -62, 18, 66, 3, shade(rock, .1)); g.fillStyle = shade(rock, -.12); g.fillRect(2, -62, 7, 66);
  ellipse(g, 0, -63, 31, 11, shade(rock, .22)); ellipse(g, 0, -65, 24, 7, p.water);
  g.fillStyle = '#ece6d8'; g.beginPath(); g.moveTo(-6, -67); g.quadraticCurveTo(-9, -92, 0, -100); g.quadraticCurveTo(9, -92, 6, -67); g.closePath(); g.fill();
  g.fillStyle = p.accent; star(g, 0, -101, 7.5, 5, .45); g.fill();
}
