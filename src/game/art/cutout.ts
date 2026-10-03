// The paper-cutout look that ties the whole valley together. Everything in the world is drawn as if it were cut from
// paper and pasted into a pop-up storybook: one flat piece, lit from the top left, with fine paper grain, a cut edge
// around it and a crisp shadow where it stands off the page.
//
// A painter draws a thing plainly into a scratch buffer; `Cutter` then composites it: shadow, ink line, cut edge,
// then the lit, grained piece itself. Living things (heroes, villagers, creatures) get a cream "sticker" edge so they
// stand out from the scenery, which gets a thin dark ink edge instead. Scenery is baked once and reused.

/** How a cutout is finished. Sizes are in world units. */
export type CutStyle = {
  /** The paper's cut edge, drawn as a ring around the piece (0 for none). */
  edge: string; edgeW: number;
  /** A thin ink line around the edge (0 for none). */
  ink: string; inkW: number;
  /** The drop shadow cast down and to the right, onto the page below. */
  shadow: number; shadowX: number; shadowY: number;
  /** How strongly the top-left light and the paper grain show. */
  light: number; grain: number;
};
export const INK = '#2f2330';
export const PAPER = '#fff4de';
/** Heroes, villagers and creatures: a cream sticker edge ringed in ink. */
export const STICKER: CutStyle = { edge: PAPER, edgeW: 2.6, ink: INK, inkW: 1.4, shadow: .26, shadowX: 3, shadowY: 4, light: 1, grain: 1 };
/** Guardians: a heavier ink line and a deeper shadow, so they loom. */
export const BOSS: CutStyle = { edge: PAPER, edgeW: 3.2, ink: INK, inkW: 2, shadow: .3, shadowX: 6, shadowY: 8, light: 1, grain: 1 };
/** Rabbits, birds and other small animals: a thinner sticker edge. */
export const SMALL_STICKER: CutStyle = { edge: PAPER, edgeW: 1.8, ink: INK, inkW: 1.1, shadow: .22, shadowX: 2, shadowY: 3, light: .8, grain: .6 };
/** Trees, houses and props: a dark ink edge and a deeper shadow. */
export const SCENERY: CutStyle = { edge: INK, edgeW: 1.7, ink: INK, inkW: 0, shadow: .22, shadowX: 6, shadowY: 7, light: 1, grain: 1 };
/** Objects drawn live (chests, signs, shrines): the scenery look with a shorter shadow. */
export const SCENERY_LIVE: CutStyle = { edge: INK, edgeW: 1.6, ink: INK, inkW: 0, shadow: .22, shadowX: 4, shadowY: 5, light: 1, grain: 1 };
/** Small scenery (grass, flowers, pebbles): a fine edge and a short shadow. */
export const SMALL: CutStyle = { edge: '#4a3d48', edgeW: .85, ink: '#4a3d48', inkW: 0, shadow: .16, shadowX: 2, shadowY: 3, light: .6, grain: .5 };
/** Sheets of ground laid on the page: a lighter cut edge and a soft shadow. */
export const SHEET: CutStyle = { edge: 'rgba(255,250,235,.55)', edgeW: 1.4, ink: INK, inkW: 0, shadow: .16, shadowX: 4, shadowY: 5, light: 0, grain: 0 };

/** A box around an anchor: left, top, width, height (world units). */
export type Box = [number, number, number, number];
export type Baked = { c: HTMLCanvasElement; l: number; t: number; w: number; h: number };

const make = (w = 2, h = 2) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

let grainTile: HTMLCanvasElement | null = null;
/** 128 px of paper fibre: speckles and short strands, light and dark. */
export function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = make(128, 128), g = c.getContext('2d')!;
  let s = 1234567;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // Mostly light fibres with a few darker ones: paper, not dirt.
  for (let i = 0; i < 900; i++) { const light = r() > .3; g.fillStyle = light ? `rgba(255,255,250,${.18 + r() * .22})` : `rgba(60,40,50,${.08 + r() * .12})`; g.fillRect(r() * 128, r() * 128, .7 + r() * .8, .7 + r() * .8); }
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) { const x = r() * 128, y = r() * 128, a = r() * 6.28, l = 3 + r() * 7; g.strokeStyle = r() > .35 ? 'rgba(255,255,250,.22)' : 'rgba(60,40,50,.09)'; g.lineWidth = .55; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + .6) * l * .5, y + Math.sin(a + .6) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  grainTile = c; return c;
}
const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();
export function grainPattern(g: CanvasRenderingContext2D) { let p = patterns.get(g); if (!p) { p = g.createPattern(grain(), 'repeat')!; patterns.set(g, p); } return p; }

/** Offsets for drawing a ring: `n` points around a circle of radius `r`. */
const RINGS = new Map<string, Array<[number, number]>>();
function ring(r: number, n: number) {
  const key = `${r.toFixed(2)}:${n}`; let v = RINGS.get(key);
  if (!v) { v = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; v.push([Math.cos(a) * r, Math.sin(a) * r]); } RINGS.set(key, v); }
  return v;
}

export class Cutter {
  private body = make(); private sil = make();
  /** 1 = full quality (12-point rings), less = 8-point rings and no grain on moving things. */
  quality = 1;

  private fit(c: HTMLCanvasElement, w: number, h: number) {
    if (c.width < w || c.height < h) { c.width = Math.max(c.width, Math.ceil(w / 64) * 64); c.height = Math.max(c.height, Math.ceil(h / 64) * 64); }
  }
  private cur: { W: number; H: number; pad: number; res: number; style: CutStyle; box: Box; overlay?: string } | null = null;
  /**
   * Starts a piece: returns the scratch buffer's context, set up so the painter draws in world units around the anchor.
   * `box` is the area it covers around its anchor, `res` the device pixels per world unit. End it with `finish`.
   */
  begin(box: Box, res: number, style: CutStyle, overlay?: string): CanvasRenderingContext2D {
    const pad = Math.ceil(style.edgeW + style.inkW + 2), [l, t, w, h] = box;
    const W = Math.ceil((w + pad * 2) * res), H = Math.ceil((h + pad * 2) * res);
    this.fit(this.body, W, H); this.fit(this.sil, W, H);
    const g = this.body.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W + 2, H + 2);
    g.setTransform(res, 0, 0, res, (pad - l) * res, (pad - t) * res);
    this.cur = { W, H, pad, res, style, box, overlay };
    return g;
  }
  /** Lights and grains the piece, then composites it onto `out` (in world units) with its anchor at (x, y). */
  finish(out: CanvasRenderingContext2D, x: number, y: number, shadowOnly = false) {
    const c = this.cur; if (!c) return; this.cur = null;
    const { W, H, pad, res, style, box } = c, g = this.body.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    if (style.light > 0) {
      // Light from the top left: a warm lift where it falls, a cool dusk on the far side.
      const gr = g.createLinearGradient(pad * res, pad * res, (pad + box[2]) * res, (pad + box[3]) * res);
      gr.addColorStop(0, `rgba(255,246,220,${.16 * style.light})`); gr.addColorStop(.45, 'rgba(255,246,220,0)'); gr.addColorStop(1, `rgba(38,18,60,${.2 * style.light})`);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    if (style.grain > 0 && this.quality > .5) {
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = .35 * style.grain; g.fillStyle = grainPattern(g); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    }
    // A flash of colour over the whole piece (a creature struck, or turning angry).
    if (c.overlay) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = c.overlay; g.fillRect(0, 0, W, H); }
    g.globalCompositeOperation = 'source-over';
    this.compose(out, x + box[0], y + box[1], W, H, pad, res, style, shadowOnly);
  }
  /** Tints the silhouette buffer to one colour. */
  private tint(W: number, H: number, color: string) {
    const s = this.sil.getContext('2d')!;
    s.setTransform(1, 0, 0, 1, 0, 0); s.globalCompositeOperation = 'source-over'; s.globalAlpha = 1; s.clearRect(0, 0, W + 2, H + 2);
    s.drawImage(this.body, 0, 0, W, H, 0, 0, W, H);
    s.globalCompositeOperation = 'source-in'; s.fillStyle = color; s.fillRect(0, 0, W, H); s.globalCompositeOperation = 'source-over';
  }
  private out = make();
  /**
   * Builds shadow, ink, edge and piece in a small result buffer (in device pixels), then draws that onto `out` (whose
   * units are world units) in one go, with the box's top-left at (x, y). One draw per piece matters: on a GPU canvas
   * every draw from a small software canvas is a texture upload.
   */
  private compose(out: CanvasRenderingContext2D, x: number, y: number, W: number, H: number, pad: number, res: number, style: CutStyle, shadowOnly = false) {
    // A ring of n copies leaves the outline r·(1 − cos π/n) short between copies: a narrow ring needs fewer copies than
    // a wide one for the same smooth edge. These keep every ring within half a pixel of round.
    const count = (r: number) => r <= 3.5 ? 6 : r <= 6.5 || this.quality < .75 ? 8 : 12;
    const sx = Math.round(style.shadowX * res), sy = Math.round(style.shadowY * res);
    const RW = W + Math.max(0, sx) + 2, RH = H + Math.max(0, sy) + 2;
    this.fit(this.out, RW, RH);
    const o = this.out.getContext('2d')!;
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1; o.clearRect(0, 0, RW + 2, RH + 2);
    this.tint(W, H, style.ink);
    if (style.shadow > 0) { o.globalAlpha = style.shadow; o.drawImage(this.sil, 0, 0, W, H, sx, sy, W, H); o.globalAlpha = 1; }
    if (!shadowOnly) {
      const ri = (style.edgeW + style.inkW) * res, re = style.edgeW * res;
      if (style.inkW > 0) for (const [ox, oy] of ring(ri, count(ri))) o.drawImage(this.sil, 0, 0, W, H, ox, oy, W, H);
      if (style.edgeW > 0) {
        if (style.edge !== style.ink) this.tint(W, H, style.edge);
        for (const [ox, oy] of ring(re, count(re))) o.drawImage(this.sil, 0, 0, W, H, ox, oy, W, H);
      }
      o.drawImage(this.body, 0, 0, W, H, 0, 0, W, H);
    }
    out.drawImage(this.out, 0, 0, RW, RH, x - pad, y - pad, RW / res, RH / res);
  }
  /** Draws a piece straight onto the page (for things that move and change every frame). */
  stamp(out: CanvasRenderingContext2D, x: number, y: number, box: Box, res: number, style: CutStyle, draw: (g: CanvasRenderingContext2D) => void, overlay?: string) {
    draw(this.begin(box, res, style, overlay));
    this.finish(out, x, y);
  }
  /** Bakes a finished piece (with its shadow) into its own canvas, for scenery drawn many times. `under` paints what
   *  lies beneath it on the ground (a soft contact shadow), with no edge. */
  bake(box: Box, res: number, style: CutStyle, draw: (g: CanvasRenderingContext2D) => void, under?: (g: CanvasRenderingContext2D) => void): Baked {
    const extra = Math.max(style.shadowX, style.shadowY) + 2;
    const [l, t, w, h] = box, bl = l - extra, bt = t - extra, bw = w + extra * 3, bh = h + extra * 3;
    const c = make(Math.ceil(bw * res), Math.ceil(bh * res)), o = c.getContext('2d')!;
    o.setTransform(res, 0, 0, res, -bl * res, -bt * res);
    if (under) under(o);
    draw(this.begin(box, res, style));
    this.finish(o, 0, 0);
    return { c, l: bl, t: bt, w: bw, h: bh };
  }
}
