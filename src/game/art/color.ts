// Colour helpers shared by every painter.

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function rgbOf(c: string): [number, number, number] {
  if (c.startsWith('#')) {
    if (c.length === 4) return [1, 2, 3].map(i => parseInt(c[i] + c[i], 16)) as [number, number, number];
    return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = c.match(/[\d.]+/g); return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [128, 128, 128];
}
const cache = new Map<string, string>();
/** The same colour with a new alpha. */
export function alpha(c: string, a: number) { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; }
/** Lighter (f > 0, toward white) or darker (f < 0, toward a deep plum, never grey). */
export function shade(c: string, f: number) {
  const key = `${c}|${f}`; let v = cache.get(key); if (v) return v;
  const n = rgbOf(c), dark = [34, 20, 44];
  const out = n.map((x, i) => Math.round(clamp(f < 0 ? x + (dark[i] - x) * -f : x + (255 - x) * f, 0, 255)));
  v = `rgb(${out[0]},${out[1]},${out[2]})`; cache.set(key, v); return v;
}
/** A blend of two colours (k = 0 → a, 1 → b). */
export function mix(a: string, b: string, k: number) {
  const key = `${a}|${b}|${k.toFixed(2)}`; let v = cache.get(key); if (v) return v;
  const x = rgbOf(a), y = rgbOf(b), o = x.map((p, i) => Math.round(p + (y[i] - p) * k));
  v = `rgb(${o[0]},${o[1]},${o[2]})`; cache.set(key, v); return v;
}
/** A seeded random in [0, 1) from any number. */
export const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// Small shape helpers.
export function ellipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rot = 0) { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rot, 0, TAU); g.fill(); }
export function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) { g.fillStyle = color; g.beginPath(); g.arc(x, y, Math.max(.1, r), 0, TAU); g.fill(); }
export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) { g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
export function poly(g: CanvasRenderingContext2D, pts: number[], color: string) { g.fillStyle = color; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); }
export function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5, inner = .45, rot = 0) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) { const a = rot + (i / (points * 2)) * TAU - Math.PI / 2, rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}
/** A tapered limb from (x0, y0) to (x1, y1), w0 wide at the start and w1 at the end, with rounded ends. */
export function limb(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, color: string) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  g.fillStyle = color; g.beginPath();
  g.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2); g.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  g.arc(x1, y1, w1 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true);
  g.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
  g.arc(x0, y0, w0 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI, true);
  g.closePath(); g.fill();
}
