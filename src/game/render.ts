import { TAU, alpha, circle, ellipse, hash, mix, rrect, shade, star } from './art/color';
import { Cutter, INK, SCENERY, STICKER, type Baked } from './art/cutout';
import { drawFigure, facingOf, FIGURE_BOX, type ArmAction } from './art/rig';
import { heroFigure, heroHooks } from './art/heroes';
import { paintProp, propShadow } from './art/props';
import { paintDecor, paving, sheet, strip } from './art/ground';
import { paintWolf } from './art/animals';
import { sfx, type Sfx } from './audio';
import { ST, type Fx } from '../net/protocol';
import type { MatchClient, ViewUnit } from './client';
import type { Obstacle, ObstacleKind, Palette } from './types';
import { isHero } from './heroes';

// Draws a match: the baked battlefield, then everything standing on it sorted by depth, then projectiles, effects,
// health bars and numbers. Heroes are the same paper puppets as in Starfall Grove.

export const TEAM_COLOR = ['#f2c96a', '#4f8ad8', '#d8564f'];
const TEAM_LIGHT = ['#ffe9a8', '#a8ccff', '#ffb0a8'];

type Theme = { palette: Palette; env: string; flowers: string[]; decor: Array<'grass' | 'flower' | 'fern' | 'shard' | 'shroom'>; pool: [string, string] };
const THEMES: Record<string, Theme> = {
  meadow: {
    palette: { ground: '#7fa05a', alternate: '#8fb065', path: '#d8c48e', pathEdge: '#a8915f', accent: '#f5cd5c', water: '#58a7b4', waterDeep: '#3d7f8f', foliage: ['#35593f', '#5d8a4c', '#a3c46a'], trunk: '#6f5337', rock: '#8c8f80', pod: '#f2b84b', roof: ['#b85a44'], wall: '#efe0bf' },
    env: 'petals', flowers: ['#f7c5d5', '#fff4f8', '#f2d27a', '#c9b6ff'], decor: ['grass', 'grass', 'flower', 'fern'], pool: ['#58a7b4', '#3d7f8f'],
  },
  summit: {
    palette: { ground: '#c9d4e8', alternate: '#dde6f5', path: '#8f93b8', pathEdge: '#62678c', accent: '#c9b6ff', water: '#9fd0ee', waterDeep: '#5a8ac8', foliage: ['#1c2b45', '#2e4a63', '#6a93a8'], trunk: '#3c3346', rock: '#6f7493', pod: '#c9b6ff', roof: ['#5a5f8a'], wall: '#c8cce0' },
    env: 'stars', flowers: ['#bfe8ff', '#ffffff', '#c9b6ff'], decor: ['grass', 'shard', 'grass'], pool: ['#bfeaff', '#7fb0dd'],
  },
  ember: {
    palette: { ground: '#6e4a3a', alternate: '#7c5442', path: '#c9a26e', pathEdge: '#8a6a48', accent: '#ff9a3d', water: '#e2592a', waterDeep: '#a3301a', foliage: ['#2e2220', '#4f3428', '#8f5a34'], trunk: '#2a1e1a', rock: '#5e4c4a', pod: '#ffb347', roof: ['#9a4a2a'], wall: '#dcc4a2' },
    env: 'embers', flowers: ['#ffb347', '#ff7a3d'], decor: ['grass', 'shard', 'shroom'], pool: ['#ff8a3a', '#a3301a'],
  },
};

type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: string; size: number; kind: 'dot' | 'star' | 'leaf' | 'snow' | 'smoke' };
type Ring = { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; width: number; fill?: boolean };
type FloatText = { x: number; y: number; text: string; color: string; life: number; max: number; size: number };
type Telegraph = { x: number; y: number; r: number; until: number; start: number; color: string; kind: 'comet' | 'bloom' };
type Streak = { x0: number; y0: number; x1: number; y1: number; life: number; max: number; color: string };

export type AimPreview = { x: number; y: number; range: number; radius: number; target: string; valid: boolean };

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly client: MatchClient;
  private g: CanvasRenderingContext2D;
  private theme: Theme;
  private ground!: HTMLCanvasElement;
  private groundRes = .5;
  private mini!: HTMLCanvasElement;
  private props: Array<{ o: Obstacle; b: Baked }> = [];
  private bakes = new Map<string, Baked>();
  private cutter = new Cutter();
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: FloatText[] = [];
  private telegraphs: Telegraph[] = [];
  private streaks: Streak[] = [];
  private shake = 0;
  cam = { x: 0, y: 0, scale: 1 };
  private dpr = 1;
  private w = 1; private h = 1;
  private t = 0;
  aim: AimPreview | null = null;
  moveTarget: { x: number; y: number } | null = null;
  /** Effects the HUD cares about (kill feed, notices, gold), passed on after the renderer has seen them. */
  onFx: (f: Fx) => void = () => {};

  constructor(canvas: HTMLCanvasElement, client: MatchClient) {
    this.canvas = canvas;
    this.client = client;
    this.g = canvas.getContext('2d')!;
    this.theme = THEMES[client.map.theme] || THEMES.meadow;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.cutter.quality = small ? .5 : 1;
    this.groundRes = small ? .45 : .6;
  }

  ready = false;
  /** Bakes the ground and scenery. Slow-ish (a few hundred ms), done once while the loading screen shows. */
  prepare() {
    this.resize();
    this.bakeGround();
    const res = Math.min(2, Math.max(1, this.cam.scale * this.dpr));
    for (const so of this.client.map.obstacles) {
      if (so.k === 'pool') continue;
      const o: Obstacle = { x: so.x, y: so.y, r: so.r, kind: so.k as ObstacleKind, seed: so.s / 10000 };
      const rb = Math.round(o.r / 6) * 6, v = Math.floor(o.seed * 3);
      const key = `${o.kind}|${rb}|${v}`;
      let b = this.bakes.get(key);
      if (!b) {
        const r = rb, box: [number, number, number, number] = [-r * 1.8, -r * 3.4, r * 3.6, r * 4.1];
        const oo = { ...o, r, seed: (v + .5) / 3 };
        b = this.cutter.bake(box, res, SCENERY, g => paintProp(g, oo, this.theme.palette, this.theme.env, false), g => propShadow(g, oo));
        this.bakes.set(key, b);
      }
      this.props.push({ o, b });
    }
    for (const team of [1, 2]) {
      this.bakes.set(`tower|${team}`, this.cutter.bake([-52, -175, 104, 205], res, SCENERY, g => paintTower(g, team, false, this.theme.palette)));
      this.bakes.set(`ruin|${team}`, this.cutter.bake([-52, -60, 104, 90], res, SCENERY, g => paintTower(g, team, true, this.theme.palette)));
      this.bakes.set(`core|${team}`, this.cutter.bake([-90, -60, 180, 100], res, SCENERY, g => paintCoreBase(g, team, this.theme.palette)));
    }
    this.ready = true;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    // About 1250×760 world units on screen in landscape, 760 wide in portrait.
    this.cam.scale = this.w >= this.h ? Math.min(this.w / 1250, this.h / 720) : Math.min(this.w / 760, this.h / 1150);
  }

  screenToWorld(px: number, py: number) { return { x: (px - this.w / 2) / this.cam.scale + this.cam.x, y: (py - this.h / 2) / this.cam.scale + this.cam.y }; }
  worldToScreen(x: number, y: number) { return { x: (x - this.cam.x) * this.cam.scale + this.w / 2, y: (y - this.cam.y) * this.cam.scale + this.h / 2 }; }

  // ───────────────────────────── baking

  private bakeGround() {
    const m = this.client.map, P = this.theme.palette, res = this.groundRes;
    const c = document.createElement('canvas'); c.width = Math.ceil(m.w * res); c.height = Math.ceil(m.h * res);
    const g = c.getContext('2d')!;
    g.scale(res, res);
    g.fillStyle = P.ground; g.fillRect(0, 0, m.w, m.h);
    // Lighter and darker sheets of paper scattered over the base.
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 26; i++) {
      const x = rnd() * m.w, y = rnd() * m.h, blobs: Array<[number, number, number]> = [];
      for (let j = 0; j < 5; j++) blobs.push([x + (rnd() - .5) * 260, y + (rnd() - .5) * 140, 60 + rnd() * 90]);
      sheet(g, blobs, i % 3 ? P.alternate : shade(P.ground, -.06), P.ground);
    }
    // The woods are a shade darker than the lane.
    const laneY = (x: number) => { const pts = m.lane; let best = pts[0]; for (const p of pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best[1]; };
    g.save(); g.globalAlpha = .16; g.fillStyle = INK;
    for (let x = 0; x < m.w; x += 40) { const y = laneY(x); g.fillRect(x, 0, 41, y - m.laneWidth / 2 - 60); g.fillRect(x, y + m.laneWidth / 2 + 60, 41, m.h); }
    g.restore();
    // The lane: a strip of card from Core to Core, cobbled plazas at both bases.
    const lanePts = m.lane.map(([x, y]) => ({ x, y }));
    strip(g, [lanePts], P.path, P.ground, m.laneWidth * .72);
    for (const team of [1, 2]) {
      const [sx, sy] = m.spawn[team];
      paving(g, sx + (team === 1 ? 40 : -40), sy, 230, 190, shade(P.path, .05), shade(P.pathEdge, -.1), 34, team * 7);
    }
    // Camps and the objective's pit.
    for (const [x, y] of m.camps) paving(g, x, y, 120, 80, shade(P.ground, -.12), shade(P.ground, -.25), 30, x);
    const [ox, oy] = m.objective;
    paving(g, ox, oy, 170, 120, shade(P.path, -.08), shade(P.pathEdge, -.2), 40, 99);
    g.strokeStyle = alpha(P.accent, .7); g.lineWidth = 4; g.setLineDash([14, 10]); g.beginPath(); g.ellipse(ox, oy, 150, 102, 0, 0, TAU); g.stroke(); g.setLineDash([]);
    // Pools (lava in the Ember Hollow).
    for (const o of m.obstacles) if (o.k === 'pool') {
      ellipse(g, o.x + 6, o.y + 8, o.r + 14, o.r * .7 + 12, alpha(INK, .3));
      ellipse(g, o.x, o.y, o.r + 12, o.r * .7 + 10, shade(this.theme.palette.rock, -.1));
      ellipse(g, o.x, o.y, o.r, o.r * .7, this.theme.pool[1]);
      ellipse(g, o.x - o.r * .15, o.y - o.r * .1, o.r * .7, o.r * .45, this.theme.pool[0]);
    }
    // Little plants painted straight into the ground.
    for (let i = 0; i < 520; i++) {
      const x = rnd() * m.w, y = rnd() * m.h;
      if (Math.abs(y - laneY(x)) < m.laneWidth * .4) continue;
      const kind = this.theme.decor[Math.floor(rnd() * this.theme.decor.length)];
      g.save(); g.translate(x, y); g.scale(.8, .8);
      paintDecor(g, { x, y, kind, seed: rnd(), color: this.theme.flowers[Math.floor(rnd() * this.theme.flowers.length)] }, Math.floor(rnd() * 3), P.foliage, this.theme.env === 'stars', this.theme.env === 'embers');
      g.restore();
    }
    this.ground = c;
    // The minimap's own small copy.
    const mini = document.createElement('canvas'); mini.width = 320; mini.height = Math.round(320 * m.h / m.w);
    const mg = mini.getContext('2d')!;
    mg.drawImage(c, 0, 0, mini.width, mini.height);
    mg.fillStyle = alpha(shade(P.foliage[0], -.1), .75);
    for (const o of m.obstacles) { mg.beginPath(); mg.arc(o.x / m.w * mini.width, o.y / m.h * mini.height, Math.max(1.4, o.r / m.w * mini.width), 0, TAU); mg.fill(); }
    this.mini = mini;
  }

  // ───────────────────────────── the frame

  frame(dt: number) {
    if (!this.ready) return;
    this.t += dt;
    const g = this.g, C = this.client, me = C.myUnit();
    this.consumeFx();
    // Camera: follow our hero; when dead, drift toward our base.
    const focus = me && !(me.st & ST.dead) ? { x: me.rx, y: me.ry } : me ? { x: me.rx, y: me.ry } : { x: C.map.spawn[C.team][0], y: C.map.spawn[C.team][1] };
    if (!this.cam.x) { this.cam.x = focus.x; this.cam.y = focus.y; }
    const k = Math.min(1, dt * 8);
    this.cam.x += (focus.x - this.cam.x) * k; this.cam.y += (focus.y - 20 - this.cam.y) * k;
    const halfW = this.w / 2 / this.cam.scale, halfH = this.h / 2 / this.cam.scale;
    this.cam.x = Math.max(halfW, Math.min(C.map.w - halfW, this.cam.x));
    this.cam.y = Math.max(halfH, Math.min(C.map.h - halfH, this.cam.y));
    if (halfW * 2 > C.map.w) this.cam.x = C.map.w / 2;
    sfx.setListener(this.cam.x, this.cam.y);
    const shake = this.shake > 0 ? (Math.random() - .5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 30);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1d1520'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.cam.scale * this.dpr;
    g.setTransform(s, 0, 0, s, (this.w / 2 - this.cam.x * this.cam.scale + shake) * this.dpr, (this.h / 2 - this.cam.y * this.cam.scale) * this.dpr);
    const view = { x0: this.cam.x - halfW - 120, x1: this.cam.x + halfW + 120, y0: this.cam.y - halfH - 80, y1: this.cam.y + halfH + 240 };
    const inView = (x: number, y: number) => x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1;

    // Ground.
    const r = this.groundRes, sx = Math.max(0, view.x0), sy = Math.max(0, view.y0), sw = Math.min(C.map.w, view.x1) - sx, sh = Math.min(C.map.h, view.y1) - sy;
    if (sw > 0 && sh > 0) g.drawImage(this.ground, sx * r, sy * r, sw * r, sh * r, sx, sy, sw, sh);

    this.drawFloor(g, inView);

    // Everything standing, sorted by where it stands.
    const draws: Array<{ y: number; run: () => void }> = [];
    for (const p of this.props) if (inView(p.o.x, p.o.y)) draws.push({ y: p.o.y, run: () => g.drawImage(p.b.c, p.o.x + p.b.l, p.o.y + p.b.t, p.b.w, p.b.h) });
    for (const u of C.units.values()) {
      if (!inView(u.rx, u.ry)) continue;
      if (u.st & ST.dead && u.k !== 'tower' && u.k !== 'core') continue;
      draws.push({ y: u.ry, run: () => this.drawUnit(g, u) });
    }
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.run();

    this.drawProjectiles(g, inView);
    this.drawEffects(g, dt);
    for (const u of C.units.values()) if (inView(u.rx, u.ry)) this.drawBars(g, u);
    this.drawTexts(g, dt);
  }

  // ───────────────────────────── floor: fountains, plants, zones, telegraphs, aim

  private drawFloor(g: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean) {
    const C = this.client, m = C.map, t = this.t;
    for (const team of [1, 2]) {
      const [x, y] = m.spawn[team];
      if (!inView(x, y)) continue;
      g.strokeStyle = alpha(TEAM_COLOR[team], .55 + Math.sin(t * 2) * .15); g.lineWidth = 5;
      g.setLineDash([18, 12]); g.lineDashOffset = -t * 20;
      g.beginPath(); g.ellipse(x, y, m.fountainRadius, m.fountainRadius * .82, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      // The fountain itself: a basin with a spring of light.
      ellipse(g, x + 4, y + 6, 46, 26, alpha(INK, .3)); ellipse(g, x, y, 46, 26, shade(this.theme.palette.rock, .1)); ellipse(g, x, y - 2, 36, 19, TEAM_COLOR[team]);
      for (let i = 0; i < 5; i++) { const a = t * 2 + i * 1.3; circle(g, x + Math.cos(a) * 14, y - 18 - ((t * 40 + i * 13) % 50), 3, alpha(TEAM_LIGHT[team], .8)); }
    }
    // Healing plants: a moonbloom, closed while it regrows.
    const pa = C.latest?.pa ?? 0;
    m.plants.forEach(([x, y], i) => {
      if (!inView(x, y)) return;
      const open = (pa >> i) & 1;
      ellipse(g, x + 3, y + 4, 26, 12, alpha(INK, .25));
      for (let j = 0; j < 6; j++) { const a = j / 6 * TAU + .3; ellipse(g, x + Math.cos(a) * 16, y + Math.sin(a) * 8, 12, 5, shade(this.theme.palette.foliage[1], -.05), a); }
      if (open) {
        const pulse = 1 + Math.sin(t * 3 + i) * .08;
        for (let j = 0; j < 6; j++) { const a = j / 6 * TAU + t * .3; ellipse(g, x + Math.cos(a) * 9 * pulse, y - 12 + Math.sin(a) * 5 * pulse, 8, 5, j % 2 ? '#fff4f8' : '#f7c5d5', a); }
        circle(g, x, y - 12, 5, '#fff2a1');
        circle(g, x, y - 12, 18, 'rgba(255,240,200,.18)');
      } else { ellipse(g, x, y - 8, 5, 8, shade(this.theme.palette.foliage[2], -.1)); }
    });
    // Zones.
    for (const z of C.latest?.z ?? []) {
      if (!inView(z.x, z.y)) continue;
      const mine = z.tm === C.team;
      switch (z.k) {
        case 'gravity': {
          const grd = g.createRadialGradient(z.x, z.y, 4, z.x, z.y, z.r);
          grd.addColorStop(0, 'rgba(20,6,40,.85)'); grd.addColorStop(.35, 'rgba(90,60,170,.45)'); grd.addColorStop(1, 'rgba(179,156,255,0)');
          g.fillStyle = grd; g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r * .8, 0, 0, TAU); g.fill();
          for (let i = 0; i < 10; i++) { const a = t * 3 + i * .63, d = z.r * (((t * .8 + i * .1) % 1)); circle(g, z.x + Math.cos(a) * (z.r - d), z.y + Math.sin(a) * (z.r - d) * .8, 2.5, '#e8dcff'); }
          break;
        }
        case 'blizzard':
          g.fillStyle = 'rgba(230,246,255,.28)'; g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r * .82, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.stroke();
          if (Math.random() < .9) for (let i = 0; i < 3; i++) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * z.r; this.particles.push({ x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d * .82, z: 120, vx: -20, vy: 0, vz: -260, life: .5, max: .5, color: '#ffffff', size: 3, kind: 'snow' }); }
          break;
        case 'grove':
          g.fillStyle = 'rgba(160,230,120,.2)'; g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r * .82, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(190,240,150,.75)'; g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = t * 12; g.stroke(); g.setLineDash([]);
          for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * .2; const px = z.x + Math.cos(a) * z.r, py = z.y + Math.sin(a) * z.r * .82; for (let j = 0; j < 5; j++) { const b = j / 5 * TAU; ellipse(g, px + Math.cos(b) * 5, py + Math.sin(b) * 5, 5, 3.5, j % 2 ? '#fff4f8' : '#f7c5d5', b); } circle(g, px, py, 2.4, '#fff2a1'); }
          if (Math.random() < .5) { const a = Math.random() * TAU, d = Math.random() * z.r; this.particles.push({ x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d * .8, z: 0, vx: 0, vy: 0, vz: 50, life: 1, max: 1, color: '#c8f0a0', size: 4, kind: 'leaf' }); }
          break;
        case 'spin':
          g.strokeStyle = alpha('#e8eef8', .35); g.lineWidth = 6; g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r * .7, 0, t * 12, t * 12 + 4); g.stroke();
          break;
        default:
          g.strokeStyle = alpha(mine ? TEAM_COLOR[C.team] : '#ff5a5a', .6); g.lineWidth = 3; g.beginPath(); g.ellipse(z.x, z.y, z.r, z.r * .8, 0, 0, TAU); g.stroke();
      }
    }
    // Where comets will land, and where the forest will wake.
    const now = this.t;
    this.telegraphs = this.telegraphs.filter(tg => tg.until > now);
    for (const tg of this.telegraphs) {
      const p = Math.min(1, (now - tg.start) / (tg.until - tg.start));
      g.strokeStyle = alpha(tg.color, .8); g.lineWidth = 3; g.beginPath(); g.ellipse(tg.x, tg.y, tg.r, tg.r * .8, 0, 0, TAU); g.stroke();
      g.fillStyle = alpha(tg.color, .22); g.beginPath(); g.ellipse(tg.x, tg.y, tg.r * p, tg.r * .8 * p, 0, 0, TAU); g.fill();
      if (tg.kind === 'comet') {
        const cx = tg.x + 260 * (1 - p), cy = tg.y - 520 * (1 - p);
        for (let i = 0; i < 6; i++) circle(g, cx + i * 12, cy - i * 24, 12 - i * 1.6, alpha(i ? '#c9b6ff' : '#ffffff', 1 - i * .14));
      }
    }
    // Our aim, while an ability is being aimed.
    const me = C.myUnit(), a = this.aim;
    if (me && a) {
      g.strokeStyle = 'rgba(255,244,222,.5)'; g.lineWidth = 2.5; g.setLineDash([10, 8]);
      if (a.range > 0) { g.beginPath(); g.ellipse(me.rx, me.ry, a.range, a.range * .82, 0, 0, TAU); g.stroke(); }
      g.setLineDash([]);
      const col = a.valid ? 'rgba(255,227,138,.85)' : 'rgba(255,120,120,.8)';
      if (a.target === 'direction') {
        const ang = Math.atan2(a.y - me.ry, a.x - me.rx), len = a.range;
        g.save(); g.translate(me.rx, me.ry); g.rotate(ang);
        g.fillStyle = alpha('#ffe38a', .22); g.fillRect(0, -18, len, 36);
        g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(0, -18, len, 36);
        g.restore();
      } else if (a.target === 'point' || a.target === 'self') {
        const x = a.target === 'self' ? me.rx : a.x, y = a.target === 'self' ? me.ry : a.y, rr = Math.max(40, a.radius);
        g.fillStyle = alpha('#ffe38a', .2); g.beginPath(); g.ellipse(x, y, rr, rr * .82, 0, 0, TAU); g.fill();
        g.strokeStyle = col; g.lineWidth = 2.5; g.stroke();
      } else {
        g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(me.rx, me.ry); g.lineTo(a.x, a.y); g.stroke();
        circle(g, a.x, a.y, 7, col);
      }
    }
    if (this.moveTarget) {
      const p = this.moveTarget;
      g.strokeStyle = 'rgba(160,240,160,.8)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(p.x, p.y, 14 + Math.sin(t * 8) * 2, 9, 0, 0, TAU); g.stroke();
    }
  }

  // ───────────────────────────── units

  private drawUnit(g: CanvasRenderingContext2D, u: ViewUnit) {
    const C = this.client, x = u.rx, y = u.ry, t = this.t;
    const enemy = C.isEnemy(u), dead = !!(u.st & ST.dead);
    const hurt = t - u.hurtT < .12 ? 'rgba(255,90,90,.45)' : undefined;
    const rad = u.f * Math.PI / 180, fx = Math.cos(rad), fy = Math.sin(rad);
    const res = Math.min(2, this.cam.scale * this.dpr);

    if (u.k === 'tower') {
      const b = this.bakes.get(`${dead ? 'ruin' : 'tower'}|${u.tm}`)!;
      g.drawImage(b.c, x + b.l, y + b.t, b.w, b.h);
      if (!dead) {
        const glow = u.st & ST.invulnerable ? '#c8c8d8' : TEAM_LIGHT[u.tm];
        circle(g, x, y - 140 + Math.sin(t * 2) * 3, 16, alpha(glow, .25));
        g.fillStyle = glow; star(g, x, y - 140 + Math.sin(t * 2) * 3, 11, 4, .45, t); g.fill();
        if (u.st & ST.invulnerable) this.drawWard(g, x, y - 60, 70, 110);
      }
      return;
    }
    if (u.k === 'core') {
      const b = this.bakes.get(`core|${u.tm}`)!;
      g.drawImage(b.c, x + b.l, y + b.t, b.w, b.h);
      if (dead) { for (let i = 0; i < 5; i++) { g.fillStyle = shade(TEAM_COLOR[u.tm], -.3); star(g, x - 40 + i * 20, y - 10 + (i % 2) * 8, 10, 4, .5, i); g.fill(); } return; }
      const bob = Math.sin(t * 1.6) * 6, col = TEAM_COLOR[u.tm];
      ellipse(g, x, y - 4, 50, 16, alpha(col, .3));
      g.save(); g.translate(x, y - 105 + bob);
      g.fillStyle = alpha(TEAM_LIGHT[u.tm], .25); g.beginPath(); g.arc(0, 0, 70 + Math.sin(t * 3) * 4, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 3; g.fillStyle = col; star(g, 0, 0, 48, 4, .42, t * .4); g.fill(); g.stroke();
      g.fillStyle = TEAM_LIGHT[u.tm]; star(g, -6, -6, 24, 4, .42, t * .4); g.fill();
      circle(g, 0, 0, 9, '#ffffff');
      g.restore();
      if (u.st & ST.invulnerable) this.drawWard(g, x, y - 70, 95, 120);
      return;
    }
    // A soft shadow and team ring under everything that moves.
    const mine = u.i === C.me?.u;
    const ring = mine ? '#ffe38a' : enemy ? '#ff5a5a' : u.tm === 0 ? '#f2c96a' : '#6fb2ff';
    const size = isHero(u.k) ? 24 : u.k === 'heavy' || u.k === 'boar' ? 26 : u.k === 'warden' ? 52 : 18;
    ellipse(g, x + 3, y + 4, size * 1.05, size * .45, 'rgba(30,18,30,.28)');
    if (isHero(u.k) || u.k === 'warden') { g.strokeStyle = alpha(ring, .9); g.lineWidth = 3; g.beginPath(); g.ellipse(x, y + 2, size + 4, (size + 4) * .45, 0, 0, TAU); g.stroke(); }

    const stealthed = !!(u.st & ST.stealth);
    g.save();
    if (stealthed) g.globalAlpha = .4;
    if (isHero(u.k)) {
      const since = t - u.actT, act = since < .4 ? u.act : '';
      let arm: ArmAction = 'idle', kk = 0;
      if (act) {
        kk = since / .4;
        arm = ['slash', 'charge'].includes(act) ? 'swing' : ['stab', 'shadowstep'].includes(act) ? 'thrust' : act === 'arrow' || act === 'volley' || act === 'leap' ? 'draw' : 'raise';
      }
      const face = act && (u.ax !== x || u.ay !== y) ? facingOf(u.ax - x, u.ay - y) : facingOf(fx, fy);
      const fig = heroFigure(u.k, {});
      const casting = !!(u.st & ST.casting);
      const hooks = heroHooks(u.k, {}, casting ? .8 : act ? 1 - kk : 0, t, { bowDraw: arm === 'draw' ? 1 - kk : 0 });
      const lift = u.st & ST.dashing && u.k === 'wren' ? -30 * Math.sin(Math.min(1, since / .35) * Math.PI) : 0;
      if (u.st & ST.spin) {
        g.save(); g.translate(x, y - 20); g.strokeStyle = 'rgba(232,238,248,.75)'; g.lineWidth = 4;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, 34 + i * 8, t * 14 + i * 2, t * 14 + i * 2 + 1.6); g.stroke(); }
        g.restore();
      }
      this.cutter.stamp(g, x, y + lift, FIGURE_BOX, res, STICKER, gg => {
        if (u.st & ST.spin) gg.rotate(Math.sin(t * 30) * .15);
        drawFigure(gg, fig, { facing: face.facing, dir: face.dir, walk: u.walk, moving: u.moving, t: t + u.i, arm, k: kk, hurt: !!hurt }, hooks);
      }, hurt);
      this.drawStatus(g, u, x, y + lift);
    } else if (u.k === 'fenn' || u.k === 'wolf') {
      const spirit = u.k === 'wolf';
      if (spirit) g.globalAlpha *= .75;
      this.cutter.stamp(g, x, y - 12, [-32, -34, 64, 50], res, STICKER, gg => paintWolf(gg, t + u.i, fx < 0 ? -1 : 1, u.moving), spirit ? 'rgba(140,240,200,.45)' : u.st & ST.frenzy ? 'rgba(255,120,80,.25)' : undefined);
    } else {
      g.save(); g.translate(x, y);
      if (fx < 0) g.scale(-1, 1);
      const since = t - u.actT, swing = since < .3 ? Math.sin(since / .3 * Math.PI) : 0;
      switch (u.k) {
        case 'melee': paintAcorn(g, u.tm, t + u.i, u.moving, swing); break;
        case 'ranged': paintPuffcap(g, u.tm, t + u.i, u.moving, swing); break;
        case 'heavy': paintGolem(g, u.tm, t + u.i, u.moving, swing); break;
        case 'boar': paintBoar(g, this.theme.env, t + u.i, u.moving, swing); break;
        case 'thornling': paintThornling(g, this.theme.env, t + u.i, swing); break;
        case 'warden': paintWarden(g, t, swing); break;
      }
      if (hurt) { g.globalCompositeOperation = 'source-atop'; }
      g.restore();
      if (u.st & ST.blessed) circle(g, x, y - size, size * 1.1, 'rgba(255,227,138,.16)');
      this.drawStatus(g, u, x, y);
    }
    g.restore();
  }

  /** The protective ward over a structure that can't be hurt yet. */
  private drawWard(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
    g.strokeStyle = `rgba(220,230,255,${.35 + Math.sin(this.t * 3) * .12})`; g.lineWidth = 2.5; g.setLineDash([6, 8]);
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.stroke(); g.setLineDash([]);
  }

  /** Stuns, roots, shields and other states drawn over a unit. */
  private drawStatus(g: CanvasRenderingContext2D, u: ViewUnit, x: number, y: number) {
    const t = this.t, st = u.st, top = isHero(u.k) ? y - 84 : u.k === 'warden' ? y - 130 : y - 50;
    if (st & ST.stun) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; g.fillStyle = '#ffe38a'; star(g, x + Math.cos(a) * 16, top + 6 + Math.sin(a) * 5, 5, 5, .45, a); g.fill(); }
    if (st & ST.root) { g.strokeStyle = '#5d8a4c'; g.lineWidth = 4; g.lineCap = 'round'; for (let i = 0; i < 4; i++) { const ox = -18 + i * 12; g.beginPath(); g.moveTo(x + ox, y + 6); g.quadraticCurveTo(x + ox + 8, y - 12, x + ox - 2, y - 26); g.stroke(); } }
    if (st & ST.slow) { g.strokeStyle = 'rgba(159,228,255,.8)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y + 2, 26, 11, 0, 0, TAU); g.stroke(); }
    if (st & ST.shell) {
      g.fillStyle = 'rgba(190,234,255,.55)'; g.strokeStyle = '#eaf8ff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x - 30, y + 8); g.lineTo(x - 34, y - 50); g.lineTo(x - 10, y - 86); g.lineTo(x + 20, y - 80); g.lineTo(x + 34, y - 40); g.lineTo(x + 28, y + 8); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.moveTo(x - 20, y - 60); g.lineTo(x - 6, y - 74); g.stroke();
    }
    if (st & ST.guard) { g.strokeStyle = `rgba(200,215,240,${.7 + Math.sin(t * 10) * .2})`; g.lineWidth = 4; g.beginPath(); g.arc(x, y - 30, 48, 0, TAU); g.stroke(); g.fillStyle = 'rgba(184,200,224,.14)'; g.fill(); }
    if (st & ST.shield && u.sh > 0) { g.strokeStyle = '#c8a46a'; g.lineWidth = 5; g.setLineDash([12, 6]); g.beginPath(); g.ellipse(x, y - 28, 38, 50, 0, 0, TAU); g.stroke(); g.setLineDash([]); }
    if (st & ST.stars && isHero(u.k)) for (let i = 0; i < Math.max(1, u.k === 'mira' ? 3 : 0); i++) { const a = t * 3 + i * TAU / 3; g.fillStyle = '#fff1b8'; star(g, x + Math.cos(a) * 52, y - 26 + Math.sin(a) * 26, 9, 5, .45, a * 2); g.fill(); }
    if (st & ST.marked) { g.save(); g.translate(x, top - 14); g.rotate(t * 2); g.strokeStyle = '#ff6b9a'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.stroke(); star(g, 0, 0, 10, 3, .3); g.stroke(); g.restore(); }
    if (st & ST.blessed && isHero(u.k)) { g.strokeStyle = `rgba(255,227,138,${.5 + Math.sin(t * 4) * .2})`; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y + 2, 34, 15, 0, 0, TAU); g.stroke(); }
    if (st & ST.empowered && isHero(u.k)) { for (let i = 0; i < 2; i++) circle(g, x + (i ? 14 : -14), y - 40 + Math.sin(t * 8 + i) * 4, 3, '#e0c8ff'); }
    if (st & ST.casting) { g.strokeStyle = 'rgba(255,240,180,.85)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y - 30, 40, -Math.PI / 2, -Math.PI / 2 + ((t * 4) % 1) * TAU); g.stroke(); }
  }

  // ───────────────────────────── health bars

  private drawBars(g: CanvasRenderingContext2D, u: ViewUnit) {
    if (u.st & ST.dead || u.hp <= 0) return;
    if (u.k === 'fenn' || u.k === 'wolf') return;
    const C = this.client, mine = u.i === C.me?.u, enemy = C.isEnemy(u);
    const hero = isHero(u.k);
    const w = hero ? 70 : u.k === 'tower' ? 96 : u.k === 'core' ? 130 : u.k === 'warden' ? 110 : u.k === 'heavy' || u.k === 'boar' ? 46 : 34;
    const hgt = hero ? 9 : u.k === 'tower' || u.k === 'core' || u.k === 'warden' ? 10 : 5;
    const top = hero ? u.ry - 96 : u.k === 'tower' ? u.ry - 182 : u.k === 'core' ? u.ry - 190 : u.k === 'warden' ? u.ry - 150 : u.k === 'heavy' || u.k === 'boar' ? u.ry - 62 : u.ry - 46;
    if (!hero && u.hp >= u.mh && u.k !== 'tower' && u.k !== 'core' && u.k !== 'warden') return;
    const x = u.rx - w / 2;
    const col = mine ? '#7fe07a' : u.tm === 0 ? '#f2c96a' : enemy ? '#ff5a5a' : '#5fb0ff';
    rrect(g, x - 2, top - 2, w + 4, hgt + 4, 3, INK);
    rrect(g, x, top, w, hgt, 2, '#3a2a34');
    const f = Math.max(0, Math.min(1, u.hp / u.mh));
    rrect(g, x, top, w * f, hgt, 2, col);
    if (u.sh > 0) { const sf = Math.min(1 - f, u.sh / u.mh); rrect(g, x + w * f, top, w * sf, hgt, 2, '#f4ecd8'); }
    if (hero) {
      // Ticks every 100 health, a level badge and the player's name.
      g.strokeStyle = 'rgba(29,21,32,.55)'; g.lineWidth = 1;
      for (let v = 100; v < u.mh; v += 100) { const tx = x + w * v / u.mh; g.beginPath(); g.moveTo(tx, top); g.lineTo(tx, top + hgt * .6); g.stroke(); }
      circle(g, x - 10, top + hgt / 2, 10, INK); circle(g, x - 10, top + hgt / 2, 8, mine ? '#ffe38a' : enemy ? '#ffb0a8' : '#a8ccff');
      g.font = '800 10px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText(String(u.lv), x - 10, top + hgt / 2 + .5);
      const name = C.hero(u.i)?.name ?? '';
      g.font = '800 12px Nunito, sans-serif'; g.lineWidth = 3; g.strokeStyle = INK; g.strokeText(name, u.rx, top - 9); g.fillStyle = mine ? '#ffe38a' : '#fff4de'; g.fillText(name, u.rx, top - 9);
    }
  }

  // ───────────────────────────── projectiles

  private drawProjectiles(g: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean) {
    const C = this.client, s = C.latest; if (!s) return;
    const since = Math.min(.15, this.sinceSnap());
    const t = this.t;
    for (const p of s.p) {
      const x = p.x + p.vx * since, y = p.y + p.vy * since - 22;
      if (!inView(x, y)) continue;
      const ang = Math.atan2(p.vy, p.vx);
      switch (p.k) {
        case 'spark': case 'star':
          circle(g, x, y, 13, 'rgba(255,227,138,.3)'); g.fillStyle = p.k === 'star' ? '#fff1b8' : '#ffe38a'; star(g, x, y, 8, 5, .45, t * 8); g.fill(); circle(g, x, y, 2.5, '#fff');
          if (Math.random() < .5) this.particles.push({ x, y: y + 22, z: 22, vx: 0, vy: 0, vz: 0, life: .3, max: .3, color: '#ffe38a', size: 2.5, kind: 'dot' });
          break;
        case 'sunfire': {
          const grd = g.createRadialGradient(x, y, 2, x, y, 30); grd.addColorStop(0, '#fff6c8'); grd.addColorStop(.4, '#ffb05c'); grd.addColorStop(1, 'rgba(255,120,40,0)');
          g.fillStyle = grd; g.beginPath(); g.arc(x, y, 30, 0, TAU); g.fill();
          this.particles.push({ x, y: y + 22, z: 22, vx: (Math.random() - .5) * 40, vy: (Math.random() - .5) * 40, vz: 20, life: .4, max: .4, color: '#ff9a3d', size: 4, kind: 'dot' });
          break;
        }
        case 'frostbolt': g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = '#d6f4ff'; g.beginPath(); g.moveTo(14, 0); g.lineTo(-6, -6); g.lineTo(-12, 0); g.lineTo(-6, 6); g.closePath(); g.fill(); g.strokeStyle = '#5a8ac8'; g.lineWidth = 1.5; g.stroke(); g.restore(); break;
        case 'seed': case 'naturebolt': {
          const big = p.k === 'naturebolt';
          g.save(); g.translate(x, y); g.rotate(ang);
          if (big) { g.strokeStyle = '#5d8a4c'; g.lineWidth = 5; g.beginPath(); g.moveTo(-40, 0); g.quadraticCurveTo(-20, Math.sin(t * 20) * 8, 0, 0); g.stroke(); }
          ellipse(g, 0, 0, big ? 16 : 9, big ? 8 : 5, big ? '#8fdc6a' : '#a3c46a'); ellipse(g, -4, -4, 6, 3, '#5d8a4c', -.6);
          g.restore();
          if (Math.random() < (big ? .8 : .3)) this.particles.push({ x, y: y + 22, z: 22, vx: (Math.random() - .5) * 30, vy: (Math.random() - .5) * 30, vz: 10, life: .5, max: .5, color: '#b9e27a', size: 4, kind: 'leaf' });
          break;
        }
        case 'arrow': g.save(); g.translate(x, y); g.rotate(ang); g.strokeStyle = '#6a4a30'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-22, 0); g.lineTo(10, 0); g.stroke(); g.fillStyle = '#d8dce8'; g.beginPath(); g.moveTo(16, 0); g.lineTo(8, -4); g.lineTo(8, 4); g.fill(); g.fillStyle = '#c0392b'; g.fillRect(-24, -3, 6, 6); g.restore(); break;
        case 'knife': g.save(); g.translate(x, y); g.rotate(ang + t * 20); g.fillStyle = '#eef0f8'; g.beginPath(); g.moveTo(10, 0); g.lineTo(-4, -3); g.lineTo(-4, 3); g.fill(); g.fillStyle = '#3a2a26'; g.fillRect(-9, -1.5, 5, 3); g.restore(); break;
        case 'bolt': circle(g, x, y, 7, alpha(TEAM_LIGHT[p.tm], .9)); circle(g, x, y, 3, '#fff'); break;
        case 'thorn': g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = '#6f9a4a'; g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -4); g.lineTo(-6, 4); g.fill(); g.restore(); break;
        case 'towerbolt': {
          const col = '#fff4de';
          circle(g, x, y, 14, 'rgba(255,240,200,.3)'); g.fillStyle = col; star(g, x, y, 9, 4, .4, t * 6); g.fill();
          this.particles.push({ x, y: y + 22, z: 22, vx: 0, vy: 0, vz: 0, life: .25, max: .25, color: '#ffe9a8', size: 3, kind: 'dot' });
          break;
        }
        case 'wardenbolt': circle(g, x, y, 18, 'rgba(201,182,255,.35)'); circle(g, x, y, 10, '#c9b6ff'); circle(g, x, y, 4, '#fff'); break;
        default: circle(g, x, y, 6, '#fff');
      }
    }
  }
  private sinceSnap() { return this.client.lastSnapAt ? performance.now() / 1000 - this.client.lastSnapAt : 0; }

  // ───────────────────────────── effects

  private consumeFx() {
    const C = this.client;
    for (const f of C.takeFx()) {
      this.onFx(f);
      const u = f.u != null ? C.units.get(f.u) : undefined;
      const at = u ? { x: u.rx, y: u.ry } : { x: f.x ?? 0, y: f.y ?? 0 };
      switch (f.e) {
        case 'dmg': {
          if (!u) break;
          const v = f.v ?? 0, crit = f.k === 'crit', mineHit = f.u === C.me?.u;
          if (v <= 0) { this.text(at.x, at.y - 70, 'Absorbed', '#f4ecd8', 13); break; }
          // Show numbers for what we do and what is done to us; skip minion-on-minion noise.
          if (mineHit || isHero(u.k) || crit || (f.k === 'spell')) this.text(at.x + (Math.random() - .5) * 20, at.y - 60, String(v), mineHit ? '#ff6b6b' : crit ? '#ffcf5a' : f.k === 'spell' ? '#c9b6ff' : '#fff4de', crit ? 20 : 15);
          if (isHero(u.k) && v > 20) this.puff(at.x, at.y - 30, 4, '#ffffff', 'dot');
          if (mineHit && v > 40) this.shake = Math.min(10, this.shake + v / 30);
          break;
        }
        case 'heal': if (u && (f.v ?? 0) >= 5) this.text(at.x, at.y - 70, `+${f.v}`, '#8fe08a', 15); break;
        case 'gold': if (f.u === C.me?.u) { this.text(f.x ?? at.x, (f.y ?? at.y) - 40, `+${f.v}g`, '#ffd85c', 14); sfx.play('pickup', { x: f.x ?? 0, y: f.y ?? 0 }, .5); } break;
        case 'atk': {
          const s: Partial<Record<string, Sfx>> = { spark: 'spark', frostbolt: 'orb', seed: 'thornShot', arrow: 'thornShot', slash: 'hit', stab: 'hit', tower: 'voidShot', core: 'voidShot', warden: 'voidShot' };
          const snd = f.k ? s[f.k] : undefined;
          if (snd) sfx.play(snd, at, .6);
          else if (u && (f.k === 'melee' || f.k === 'heavy' || f.k === 'boar')) sfx.play('chop', at, .25);
          break;
        }
        case 'cast': {
          const s: Partial<Record<string, Sfx>> = {
            gravity: 'voidShot', sunfire: 'sunfire', starguard: 'shield', starfall: 'starfall', charge: 'dash', slam: 'slam', guard: 'shield', bladestorm: 'dash',
            blink: 'dash', frostnova: 'shield', iceBlock: 'reflect', blizzard: 'starfall', shadowstep: 'dash', knives: 'dash', stealth: 'flap', deathmark: 'voidShot',
            command: 'howl', volley: 'thornShot', leap: 'flap', wildcall: 'howl', naturebolt: 'leaf', grove: 'leaf', barkskin: 'leaf', awakening: 'learn',
          };
          const snd = f.k ? s[f.k] : undefined;
          if (snd) sfx.play(snd, at);
          break;
        }
        case 'burst': this.burst(f.k || '', f.x ?? at.x, f.y ?? at.y, f.r ?? 80, f.v); break;
        case 'comet': this.telegraphs.push({ x: f.x ?? 0, y: f.y ?? 0, r: f.r ?? 90, start: this.t, until: this.t + (f.v ?? 600) / 1000, color: '#c9b6ff', kind: 'comet' }); break;
        case 'blink': {
          const col = f.k === 'shadow' ? '#b69cff' : '#d6f4ff';
          this.streaks.push({ x0: f.x ?? 0, y0: (f.y ?? 0) - 30, x1: f.x2 ?? 0, y1: (f.y2 ?? 0) - 30, life: .35, max: .35, color: col });
          this.puff(f.x ?? 0, f.y ?? 0, 10, col, f.k === 'shadow' ? 'smoke' : 'snow');
          this.puff(f.x2 ?? 0, f.y2 ?? 0, 10, col, f.k === 'shadow' ? 'smoke' : 'snow');
          break;
        }
        case 'die': {
          const big = isHero(f.k || '') || f.k === 'warden';
          this.puff(at.x, at.y - 20, big ? 26 : 10, f.k === 'tower' || f.k === 'core' ? '#c8b8a8' : '#fff4de', 'smoke');
          if (big) { this.rings.push({ x: at.x, y: at.y, r0: 10, r1: 120, life: .5, max: .5, color: '#fff4de', width: 4 }); sfx.play(f.k === 'warden' ? 'bossDie' : 'kill', at); }
          else if (f.k === 'tower' || f.k === 'core') { this.shake = 16; sfx.play('boom', at); }
          break;
        }
        case 'lvl': if (u) { this.text(at.x, at.y - 110, 'Level up!', '#ffe38a', 17); this.rings.push({ x: at.x, y: at.y, r0: 20, r1: 80, life: .6, max: .6, color: '#ffe38a', width: 4 }); if (f.u === C.me?.u) sfx.play('levelUp'); } break;
        case 'block': if (u) this.text(at.x, at.y - 76, 'Blocked', '#d6e2f5', 13); break;
        case 'reflect': if (u) { this.rings.push({ x: at.x, y: at.y - 30, r0: 20, r1: 60, life: .25, max: .25, color: '#d6e2f5', width: 3 }); sfx.play('reflect', at); } break;
        case 'star': if (u) { this.puff(at.x, at.y - 30, 8, '#fff1b8', 'star'); sfx.play('orb', at); } break;
        case 'plant': this.puff(f.x ?? 0, (f.y ?? 0) - 10, 14, '#f7c5d5', 'leaf'); sfx.play('drink', { x: f.x ?? 0, y: f.y ?? 0 }); break;
        case 'respawn': this.rings.push({ x: at.x, y: at.y, r0: 10, r1: 90, life: .6, max: .6, color: TEAM_LIGHT[C.team], width: 4 }); break;
        case 'struct': this.shake = 20; break;
      }
    }
  }

  private burst(k: string, x: number, y: number, r: number, delayMs?: number) {
    const ring = (color: string, width = 5, fill = false, life = .45) => this.rings.push({ x, y, r0: r * .2, r1: r, life, max: life, color, width, fill });
    switch (k) {
      case 'sunfire': ring('#ffb05c', 6, true); this.puff(x, y, 26, '#ff9a3d', 'dot'); sfx.play('boom', { x, y }, .7); this.shake += 4; break;
      case 'comet': ring('#c9b6ff', 5, true, .35); this.puff(x, y, 12, '#e8dcff', 'star'); sfx.play('boom', { x, y }, .4); break;
      case 'slam': ring('#e0a060', 7, true); this.puff(x, y, 20, '#a8844a', 'smoke'); this.shake += 6; break;
      case 'guard': ring('#b8c8e0', 5); break;
      case 'charge': case 'pounce': ring('#ffd0a0', 4, false, .3); this.puff(x, y, 10, '#d8c4a0', 'smoke'); sfx.play('hit', { x, y }); break;
      case 'frost': case 'frostnova': ring('#9fe4ff', 6, true); this.puff(x, y, 22, '#ffffff', 'snow'); break;
      case 'knives': this.puff(x, y, 6, '#d8d0f0', 'dot'); break;
      case 'stealth': case 'unveil': this.puff(x, y, 18, '#6a5a8a', 'smoke'); break;
      case 'doom': ring('#ff6b9a', 7, true); this.puff(x, y, 22, '#ff6b9a', 'star'); sfx.play('crit', { x, y }); this.shake += 6; break;
      case 'howl': this.puff(x, y, 12, '#9fe8b0', 'smoke'); break;
      case 'barkskin': ring('#c8a46a', 4, false, .4); this.puff(x, y - 20, 10, '#8fae6a', 'leaf'); break;
      case 'bloomcall': this.telegraphs.push({ x, y, r, start: this.t, until: this.t + (delayMs ?? 500) / 1000, color: '#9fe8b0', kind: 'bloom' }); break;
      case 'bloom': ring('#9fe8b0', 7, true, .7); this.puff(x, y, 40, '#f7c5d5', 'leaf'); this.puff(x, y, 20, '#b9e27a', 'leaf'); break;
      case 'shellbreak': this.puff(x, y - 30, 14, '#d6f4ff', 'snow'); sfx.play('reflect', { x, y }); break;
      case 'warden': ring('#c9b6ff', 6, true, .4); sfx.play('slam', { x, y }, .6); break;
      default: ring('#fff4de', 4);
    }
  }

  private puff(x: number, y: number, n: number, color: string, kind: Particle['kind']) {
    if (this.particles.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 40 + Math.random() * 140;
      this.particles.push({ x, y, z: 10 + Math.random() * 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .6, vz: 60 + Math.random() * 140, life: .5 + Math.random() * .4, max: .9, color, size: kind === 'smoke' ? 10 + Math.random() * 8 : 3 + Math.random() * 3, kind });
    }
  }
  private text(x: number, y: number, text: string, color: string, size: number) { if (this.texts.length < 60) this.texts.push({ x, y, text, color, life: .9, max: .9, size }); }

  private drawEffects(g: CanvasRenderingContext2D, dt: number) {
    for (const r of this.rings) {
      r.life -= dt;
      const p = 1 - Math.max(0, r.life) / r.max, rr = r.r0 + (r.r1 - r.r0) * Math.sqrt(p);
      if (r.fill) { g.fillStyle = alpha(r.color, .25 * (1 - p)); g.beginPath(); g.ellipse(r.x, r.y, rr, rr * .8, 0, 0, TAU); g.fill(); }
      g.strokeStyle = alpha(r.color, 1 - p); g.lineWidth = r.width * (1 - p * .5); g.beginPath(); g.ellipse(r.x, r.y, rr, rr * .8, 0, 0, TAU); g.stroke();
    }
    this.rings = this.rings.filter(r => r.life > 0);
    for (const s of this.streaks) {
      s.life -= dt;
      const a = Math.max(0, s.life / s.max);
      g.strokeStyle = alpha(s.color, a * .8); g.lineWidth = 14 * a; g.lineCap = 'round'; g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke();
    }
    this.streaks = this.streaks.filter(s => s.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind !== 'snow') p.vz -= 320 * dt;
      p.vx *= .96; p.vy *= .96;
      if (p.z < 0) { p.z = 0; p.vz *= -.3; }
      const a = Math.max(0, Math.min(1, p.life / p.max * 1.5));
      const y = p.y - p.z;
      switch (p.kind) {
        case 'star': g.fillStyle = alpha(p.color, a); star(g, p.x, y, p.size * 1.5, 5, .45, p.life * 6); g.fill(); break;
        case 'leaf': ellipse(g, p.x, y, p.size * 1.2, p.size * .6, alpha(p.color, a), p.life * 5); break;
        case 'smoke': circle(g, p.x, y, p.size * (1.6 - a * .6), alpha(p.color, a * .45)); break;
        default: circle(g, p.x, y, p.size * a, alpha(p.color, a));
      }
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  private drawTexts(g: CanvasRenderingContext2D, dt: number) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const t of this.texts) {
      t.life -= dt;
      const p = 1 - t.life / t.max, y = t.y - p * 40, a = Math.min(1, t.life / t.max * 2.5);
      g.globalAlpha = a;
      g.font = `900 ${t.size}px Nunito, sans-serif`;
      g.lineWidth = 3.5; g.strokeStyle = INK; g.strokeText(t.text, t.x, y);
      g.fillStyle = t.color; g.fillText(t.text, t.x, y);
    }
    g.globalAlpha = 1;
    this.texts = this.texts.filter(t => t.life > 0);
  }

  // ───────────────────────────── minimap

  drawMinimap(mc: HTMLCanvasElement) {
    if (!this.ready) return;
    const C = this.client, m = C.map, g = mc.getContext('2d')!;
    const W = mc.width, H = mc.height, sx = W / m.w, sy = H / m.h;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.mini, 0, 0, W, H);
    g.strokeStyle = alpha(this.theme.palette.path, .9); g.lineWidth = Math.max(3, m.laneWidth * sy * .5); g.lineCap = 'round';
    g.beginPath(); m.lane.forEach(([x, y], i) => i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy)); g.stroke();
    const dot = (x: number, y: number, r: number, c: string, ring = INK) => { g.fillStyle = ring; g.beginPath(); g.arc(x * sx, y * sy, r + 1.5, 0, TAU); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(x * sx, y * sy, r, 0, TAU); g.fill(); };
    for (const [x, y] of m.camps) dot(x, y, 3, '#c8a46a');
    const [ox, oy] = m.objective;
    if ((C.latest?.ob ?? 1) === 0) dot(ox, oy, 5, '#c9b6ff'); else dot(ox, oy, 3, '#6a5a8a');
    for (const u of C.units.values()) {
      if (u.k === 'tower' || u.k === 'core') { if (!(u.st & ST.dead)) { g.fillStyle = INK; g.fillRect(u.x * sx - 5, u.y * sy - 5, 10, 10); g.fillStyle = TEAM_COLOR[u.tm]; g.fillRect(u.x * sx - 3.5, u.y * sy - 3.5, 7, 7); } continue; }
      if (u.k === 'melee' || u.k === 'ranged' || u.k === 'heavy') dot(u.rx, u.ry, 1.8, TEAM_LIGHT[u.tm], 'rgba(0,0,0,0)');
    }
    for (const u of C.units.values()) {
      if (!isHero(u.k) || u.st & ST.dead) continue;
      const mine = u.i === C.me?.u;
      dot(u.rx, u.ry, mine ? 5.5 : 4.5, mine ? '#ffe38a' : TEAM_COLOR[u.tm], mine ? '#fff' : INK);
    }
    const halfW = this.w / 2 / this.cam.scale, halfH = this.h / 2 / this.cam.scale;
    g.strokeStyle = 'rgba(255,244,222,.8)'; g.lineWidth = 1.5;
    g.strokeRect((this.cam.x - halfW) * sx, (this.cam.y - halfH) * sy, halfW * 2 * sx, halfH * 2 * sy);
  }
}

// ───────────────────────────── painters for structures, minions and monsters (original to Mini Rift)

function paintTower(g: CanvasRenderingContext2D, team: number, ruined: boolean, P: Palette) {
  const stone = shade(P.rock, .25), dark = shade(P.rock, -.1), col = TEAM_COLOR[team];
  if (ruined) {
    g.fillStyle = dark; g.beginPath(); g.moveTo(-40, 10); g.lineTo(-36, -30); g.lineTo(-18, -44); g.lineTo(-4, -26); g.lineTo(14, -48); g.lineTo(30, -24); g.lineTo(40, 10); g.closePath(); g.fill();
    for (let i = 0; i < 5; i++) rrect(g, -44 + i * 18, 0 + (i % 2) * 6, 14, 10, 3, stone);
    g.fillStyle = col; g.fillRect(-6, -36, 3, 30); g.beginPath(); g.moveTo(-3, -36); g.lineTo(14, -30); g.lineTo(-3, -24); g.fill();
    return;
  }
  ellipse(g, 0, 6, 46, 16, dark);
  // The stone body, slightly tapered, with courses of stone.
  g.fillStyle = stone; g.beginPath(); g.moveTo(-34, 4); g.lineTo(-26, -100); g.lineTo(26, -100); g.lineTo(34, 4); g.quadraticCurveTo(0, 14, -34, 4); g.fill();
  g.fillStyle = shade(stone, -.15); g.beginPath(); g.moveTo(10, -100); g.lineTo(26, -100); g.lineTo(34, 4); g.quadraticCurveTo(22, 9, 12, 10); g.closePath(); g.fill();
  g.strokeStyle = shade(stone, -.28); g.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) { const y = -10 - i * 19; g.beginPath(); g.moveTo(-32 + i * 1.5, y); g.quadraticCurveTo(0, y + 4, 32 - i * 1.5, y); g.stroke(); }
  // A window, a banner in the team colour and a pointed roof.
  rrect(g, -7, -78, 14, 20, 7, '#2a2030'); rrect(g, -4, -74, 8, 12, 4, '#ffe9a8');
  g.fillStyle = col; g.beginPath(); g.moveTo(-20, -60); g.lineTo(-6, -60); g.lineTo(-6, -24); g.lineTo(-13, -32); g.lineTo(-20, -24); g.closePath(); g.fill();
  g.fillStyle = TEAM_LIGHT[team]; star(g, -13, -48, 4, 4, .45); g.fill();
  rrect(g, -32, -108, 64, 12, 3, shade(stone, .1));
  for (let i = 0; i < 4; i++) rrect(g, -32 + i * 18, -118, 10, 12, 2, shade(stone, .1));
  g.fillStyle = col; g.beginPath(); g.moveTo(-30, -118); g.lineTo(0, -168); g.lineTo(30, -118); g.closePath(); g.fill();
  g.fillStyle = shade(col, -.2); g.beginPath(); g.moveTo(0, -168); g.lineTo(30, -118); g.lineTo(8, -118); g.closePath(); g.fill();
}

function paintCoreBase(g: CanvasRenderingContext2D, team: number, P: Palette) {
  const stone = shade(P.rock, .3);
  ellipse(g, 0, 14, 84, 30, shade(P.rock, -.1));
  ellipse(g, 0, 6, 76, 26, stone);
  ellipse(g, 0, 0, 60, 18, shade(stone, .12));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; rrect(g, Math.cos(a) * 62 - 6, Math.sin(a) * 20 - 30, 12, 30, 4, shade(stone, -.08)); circle(g, Math.cos(a) * 62, Math.sin(a) * 20 - 32, 5, TEAM_COLOR[team]); }
  ellipse(g, 0, 0, 40, 12, mix(TEAM_COLOR[team], '#ffffff', .4));
}

const outline = (g: CanvasRenderingContext2D) => { g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); };

/** Acorn Guard: a little acorn soldier with a team tabard and a wooden sword. */
function paintAcorn(g: CanvasRenderingContext2D, team: number, t: number, moving: boolean, swing: number) {
  const bob = moving ? Math.abs(Math.sin(t * 10)) * 3 : Math.sin(t * 2) * .8, col = TEAM_COLOR[team];
  g.translate(0, -bob);
  const step = moving ? Math.sin(t * 10) * 4 : 0;
  rrect(g, -7 + step, -6, 5, 8, 2, '#5a3e28'); rrect(g, 2 - step, -6, 5, 8, 2, '#5a3e28');
  g.fillStyle = col; g.beginPath(); g.ellipse(0, -14, 11, 11, 0, 0, TAU); g.fill(); outline(g);
  g.fillStyle = TEAM_LIGHT[team]; g.fillRect(-2, -22, 4, 14);
  g.fillStyle = '#c08a52'; g.beginPath(); g.ellipse(0, -30, 10, 10, 0, 0, TAU); g.fill(); outline(g);
  g.fillStyle = '#6a4a30'; g.beginPath(); g.ellipse(0, -35, 12, 7, 0, Math.PI, TAU); g.closePath(); g.fill(); outline(g);
  g.fillStyle = '#6a4a30'; g.fillRect(-1, -45, 2, 5);
  circle(g, 4, -29, 1.6, INK); circle(g, -1, -29, 1.6, INK);
  g.save(); g.translate(9, -16); g.rotate(-1 + swing * 2);
  g.fillStyle = '#d8c4a0'; g.fillRect(-1.5, -20, 3, 20); g.strokeStyle = INK; g.lineWidth = 1.2; g.strokeRect(-1.5, -20, 3, 20);
  g.fillStyle = '#6a4a30'; g.fillRect(-4, -2, 8, 3);
  g.restore();
}

/** Puffcap Caster: a mushroom with a team-coloured cap who flings spores. */
function paintPuffcap(g: CanvasRenderingContext2D, team: number, t: number, moving: boolean, swing: number) {
  const bob = moving ? Math.abs(Math.sin(t * 9)) * 3 : Math.sin(t * 2.2) * 1, col = TEAM_COLOR[team];
  g.translate(0, -bob);
  g.fillStyle = '#efe4c8'; g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(-9, -16, -6, -22); g.lineTo(6, -22); g.quadraticCurveTo(9, -16, 8, 0); g.closePath(); g.fill(); outline(g);
  circle(g, 3, -14, 1.6, INK); circle(g, -2, -14, 1.6, INK);
  g.fillStyle = col; g.beginPath(); g.ellipse(0, -24, 17, 12, 0, Math.PI, TAU); g.quadraticCurveTo(0, -18, -17, -24); g.fill(); outline(g);
  for (const [dx, dy] of [[-8, -28], [2, -32], [9, -27]]) circle(g, dx, dy, 2.6, '#fff4dc');
  g.save(); g.translate(9, -10); g.rotate(-.4 - swing * 1.2);
  g.fillStyle = '#6a4a30'; g.fillRect(-1, -16, 2.4, 16); circle(g, 0, -17, 3.5, TEAM_LIGHT[team]);
  g.restore();
}

/** Mossback Golem: a slow, sturdy heap of stones with a glowing team rune. */
function paintGolem(g: CanvasRenderingContext2D, team: number, t: number, moving: boolean, swing: number) {
  const bob = moving ? Math.abs(Math.sin(t * 6)) * 3 : 0, col = TEAM_COLOR[team];
  g.translate(0, -bob);
  rrect(g, -16, -10, 12, 12, 4, '#7a7a80'); rrect(g, 4, -10, 12, 12, 4, '#7a7a80');
  g.fillStyle = '#8c8f80'; g.beginPath(); g.ellipse(0, -28, 22, 20, 0, 0, TAU); g.fill(); outline(g);
  g.fillStyle = '#5d8a4c'; g.beginPath(); g.ellipse(-4, -44, 16, 6, -.2, 0, TAU); g.fill();
  g.fillStyle = '#9a9d8e'; g.beginPath(); g.ellipse(4, -54, 12, 10, 0, 0, TAU); g.fill(); outline(g);
  circle(g, 8, -55, 2.4, TEAM_LIGHT[team]); circle(g, 2, -55, 2.4, TEAM_LIGHT[team]);
  g.fillStyle = col; star(g, 0, -28, 7, 4, .4, t); g.fill();
  g.save(); g.translate(20, -34); g.rotate(-.3 + swing * 1.4); rrect(g, -6, 0, 12, 22, 5, '#7a7a80'); g.restore();
}

function paintBoar(g: CanvasRenderingContext2D, env: string, t: number, moving: boolean, swing: number) {
  const fur = env === 'stars' ? '#e8eef8' : env === 'embers' ? '#5a3a30' : '#7a5a3f', bob = moving ? Math.abs(Math.sin(t * 9)) * 3 : 0;
  g.translate(swing * 8, -bob);
  for (const lx of [-14, -4, 8, 16]) rrect(g, lx - 2.5, -10, 5, 11, 2, shade(fur, -.3));
  g.fillStyle = fur; g.beginPath(); g.ellipse(0, -20, 26, 15, 0, 0, TAU); g.fill(); outline(g);
  g.fillStyle = shade(fur, -.2); for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-16 + i * 7, -33); g.lineTo(-12 + i * 7, -42); g.lineTo(-8 + i * 7, -33); g.fill(); }
  g.fillStyle = fur; g.beginPath(); g.ellipse(24, -18, 11, 10, 0, 0, TAU); g.fill(); outline(g);
  ellipse(g, 32, -15, 5, 4, '#e8b0a0'); circle(g, 26, -22, 2, INK);
  g.fillStyle = '#fff4dc'; g.beginPath(); g.moveTo(28, -11); g.quadraticCurveTo(36, -14, 34, -22); g.lineTo(31, -12); g.fill();
}

function paintThornling(g: CanvasRenderingContext2D, env: string, t: number, swing: number) {
  const body = env === 'stars' ? '#9fd0ee' : env === 'embers' ? '#c8642a' : '#6f9a4a';
  g.translate(0, -Math.abs(Math.sin(t * 3)) * 2 - swing * 4);
  g.fillStyle = shade(body, -.2);
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 10, -18 + Math.sin(a) * 10); g.lineTo(Math.cos(a + .17) * 21, -18 + Math.sin(a + .17) * 21); g.lineTo(Math.cos(a + .34) * 10, -18 + Math.sin(a + .34) * 10); g.fill(); }
  g.fillStyle = body; g.beginPath(); g.arc(0, -18, 13, 0, TAU); g.fill(); outline(g);
  circle(g, 5, -20, 3, '#fff4dc'); circle(g, -2, -20, 3, '#fff4dc'); circle(g, 5.5, -20, 1.5, INK); circle(g, -1.5, -20, 1.5, INK);
}

/** The Star Warden: an old guardian of stone and starlight that sleeps at the heart of the woods. */
function paintWarden(g: CanvasRenderingContext2D, t: number, swing: number) {
  const bob = Math.sin(t * 1.4) * 3;
  g.translate(0, -bob);
  rrect(g, -30, -24, 20, 26, 6, '#5a5a70'); rrect(g, 10, -24, 20, 26, 6, '#5a5a70');
  g.fillStyle = '#6f7493'; g.beginPath(); g.ellipse(0, -60, 44, 42, 0, 0, TAU); g.fill(); outline(g);
  g.fillStyle = '#5a5f80'; g.beginPath(); g.ellipse(14, -54, 26, 34, 0, 0, TAU); g.fill();
  for (const side of [-1, 1]) { g.save(); g.translate(side * 44, -70); g.rotate(side * (.3 + swing * .8)); rrect(g, -10, 0, 20, 44, 8, '#6f7493'); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-10, 0, 20, 44); g.restore(); }
  g.fillStyle = '#7a80a3'; g.beginPath(); g.ellipse(0, -108, 26, 22, 0, 0, TAU); g.fill(); outline(g);
  g.fillStyle = '#c9b6ff'; star(g, 0, -110, 14, 5, .45, t * .6); g.fill();
  circle(g, 0, -110, 26, 'rgba(201,182,255,.22)');
  for (let i = 0; i < 5; i++) { const a = t + i * 1.25; circle(g, Math.cos(a) * 50, -70 + Math.sin(a) * 18, 3, '#e8dcff'); }
  void hash;
}
