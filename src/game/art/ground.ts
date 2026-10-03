// The ground as sheets of paper laid on the page: a base sheet per land, lighter and darker sheets over it with a
// pale cut edge and a soft shadow, paths as strips of card, and plazas, fields and ruin floors cut to shape. Small
// plants are little paper pieces baked once and swayed as they are drawn.
import { TAU, circle, ellipse, hash, mix, rrect, shade } from './color';
import { INK } from './cutout';
import type { Decor } from '../types';

export type Blob = [number, number, number];
/** A cut sheet made of overlapping circles: its shadow, a pale cut edge, then the sheet itself. */
export function sheet(g: CanvasRenderingContext2D, blobs: Blob[], fill: string, under: string, sx = 4, sy = 5, edge = 1.8) {
  if (!blobs.length) return;
  const pass = (color: string, dx: number, dy: number, grow: number) => {
    g.fillStyle = color; g.beginPath();
    for (const [x, y, r] of blobs) { g.moveTo(x + dx + r + grow, y + dy); g.arc(x + dx, y + dy, r + grow, 0, TAU); }
    g.fill();
  };
  pass(mix(under, INK, .16), sx, sy, 0);
  pass(mix(fill, '#fffbea', .2), 0, 0, edge);
  pass(fill, 0, 0, 0);
}
/** A strip of card along a path: shadow, pale edge, face, and a stitched line down the middle. */
export function strip(g: CanvasRenderingContext2D, paths: Array<Array<{ x: number; y: number }>>, face: string, under: string, width: number) {
  const stroke = (color: string, w: number, dx: number, dy: number) => {
    g.strokeStyle = color; g.lineWidth = w; g.beginPath();
    for (const pts of paths) pts.forEach((p, i) => i ? g.lineTo(p.x + dx, p.y + dy) : g.moveTo(p.x + dx, p.y + dy));
    g.stroke();
  };
  g.lineCap = 'round'; g.lineJoin = 'round';
  stroke(mix(under, INK, .18), width, 4, 5);
  stroke(mix(face, '#fffbea', .4), width + 3.6, 0, 0);
  stroke(face, width, 0, 0);
  stroke(shade(face, .12), width * .55, -1.5, -2);
  g.setLineDash([9, 11]); stroke(alpha(shade(face, -.3), .55), 1.8, 0, 0); g.setLineDash([]);
}
const alpha = (c: string, a: number) => { const m = c.match(/\d+/g); return m ? `rgba(${m[0]},${m[1]},${m[2]},${a})` : c; };

/** Cobbles or flagstones filling an ellipse, each stone its own little piece of card. */
export function paving(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, stone: string, gap: string, size: number, seed: number) {
  ellipse(g, x + 4, y + 5, rx, ry, mix(gap, INK, .2));
  ellipse(g, x, y, rx + 2, ry + 2, mix(stone, '#fffbea', .3));
  ellipse(g, x, y, rx, ry, gap);
  g.save(); g.beginPath(); g.ellipse(x, y, rx - 2, ry - 2, 0, 0, TAU); g.clip();
  const sw = size, sh = size * .62;
  for (let row = 0, yy = y - ry; yy < y + ry; row++, yy += sh + 3) for (let xx = x - rx + (row % 2) * sw * .5, i = 0; xx < x + rx; xx += sw + 3, i++) {
    const k = hash(xx * .13 + yy * .71 + seed), c = k < .33 ? stone : k < .66 ? shade(stone, .08) : shade(stone, -.08);
    rrect(g, xx, yy, sw, sh, 3, c);
    g.fillStyle = 'rgba(255,255,245,.18)'; g.fillRect(xx + 2, yy + 1.5, sw - 4, 2);
  }
  g.restore();
}

// ───────────────────────────── little plants (baked once, drawn swaying)
/** How far a decor sprite reaches around its root. */
export const DECOR_BOX: Record<string, [number, number, number, number]> = {
  grass: [-14, -24, 28, 28], flower: [-10, -30, 20, 34], fern: [-18, -22, 36, 26], reed: [-10, -40, 20, 44], shroom: [-9, -14, 18, 18], shard: [-8, -22, 16, 26],
};
export function paintDecor(g: CanvasRenderingContext2D, d: Decor, variant: number, fol: [string, string, string], snow: boolean, ash: boolean) {
  const v = variant;
  switch (d.kind) {
    case 'grass': {
      // A tuft cut from one piece of paper: pointed blades fanning out, the inner ones lighter.
      const n = 4 + (v % 3), c0 = ash ? '#6a4a34' : fol[1], c1 = ash ? '#8a6a44' : snow ? mix(fol[2], '#e6eeff', .3) : fol[2];
      for (let pass = 0; pass < 2; pass++) {
        g.fillStyle = pass ? c1 : c0; g.beginPath();
        for (let i = 0; i < n; i++) {
          const f = n === 1 ? 0 : i / (n - 1) - .5, lean = f * 1.3 + (v - 1) * .12, len = (pass ? 12 : 17) + hash(i + v * 7) * 5, bx = f * 10;
          const tx = bx + Math.sin(lean) * len, ty = -Math.cos(lean) * len;
          g.moveTo(bx - 2.6, 0); g.quadraticCurveTo(bx + Math.sin(lean) * len * .45 - 1.5, -len * .5, tx, ty); g.quadraticCurveTo(bx + Math.sin(lean) * len * .45 + 1.5, -len * .5, bx + 2.6, 0);
        }
        g.closePath(); g.fill();
      }
      if (snow) for (let i = 0; i < 2; i++) circle(g, -4 + i * 8, -12 - i * 3, 1.8, '#f4f7ff');
      return;
    }
    case 'flower': {
      const len = 16 + v * 3, hx = (v - 1) * 2, hy = -len;
      g.strokeStyle = fol[1]; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(0, -len * .5, hx, hy); g.stroke();
      g.fillStyle = fol[2]; g.beginPath(); g.ellipse(4, -6, 5, 2.2, -.5, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-4, -10, 4.4, 2, .5, 0, TAU); g.fill();
      const petals = v === 2 ? 6 : 5;
      for (let i = 0; i < petals; i++) { const a = i / petals * TAU + v; ellipse(g, hx + Math.cos(a) * 3.8, hy + Math.sin(a) * 3.8, 3.4, 2.6, d.color, a); }
      circle(g, hx, hy, 2.3, '#fff2a1'); circle(g, hx - .6, hy - .6, .8, '#ffffff');
      return;
    }
    case 'fern': {
      g.fillStyle = fol[1];
      for (let i = -2; i <= 2; i++) {
        const a = i * .45 - Math.PI / 2 + (v - 1) * .1, len = 18 - Math.abs(i) * 2.5, ex = Math.cos(a) * len, ey = Math.sin(a) * len;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(ex * .5 - 3, ey * .5 - 3, ex, ey); g.quadraticCurveTo(ex * .5 + 3, ey * .5 + 3, 0, 0); g.fill();
      }
      g.strokeStyle = fol[2]; g.lineWidth = 1; for (let i = -2; i <= 2; i++) { const a = i * .45 - Math.PI / 2 + (v - 1) * .1, len = 15 - Math.abs(i) * 2.5; g.beginPath(); g.moveTo(0, -1); g.lineTo(Math.cos(a) * len, Math.sin(a) * len); g.stroke(); }
      return;
    }
    case 'reed': {
      g.strokeStyle = '#5f7f3f'; g.lineWidth = 2.2; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const bx = (i - 1) * 4, len = 22 + i * 4 + v * 2; g.beginPath(); g.moveTo(bx, 0); g.quadraticCurveTo(bx + 1, -len * .6, bx + (i - 1) * 2, -len); g.stroke(); }
      rrect(g, -1.4, -31 - v * 2, 4.4, 11, 2.2, '#7a5a3a');
      return;
    }
    case 'shroom': {
      rrect(g, -1.8, -8, 3.6, 8, 1.5, '#efe4c8');
      g.fillStyle = d.color; g.beginPath(); g.ellipse(0, -8, 7, 5, 0, Math.PI, TAU); g.closePath(); g.fill();
      circle(g, -2.5, -10, 1.2, 'rgba(255,255,255,.75)'); circle(g, 2, -11, .9, 'rgba(255,255,255,.75)');
      return;
    }
    case 'shard': {
      g.fillStyle = d.color; g.beginPath(); g.moveTo(-4.5, 0); g.lineTo(-1, -14 - v * 3); g.lineTo(3.5, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(-1, -2); g.lineTo(-1, -12 - v * 2.5); g.lineTo(1, -2); g.closePath(); g.fill();
      if (v > 0) { g.fillStyle = shade(d.color, -.15); g.beginPath(); g.moveTo(2, 0); g.lineTo(6, -8); g.lineTo(7, 0); g.closePath(); g.fill(); }
      return;
    }
  }
}
