import { TAU, alpha, circle, ellipse, mix, rrect, shade, star } from './art/color';
import { BOSS, Cutter, INK, SCENERY, STICKER, type Baked, type CutStyle } from './art/cutout';
import { drawFigure, facingOf, FIGURE_BOX, type ArmAction, type Figure, type Joints } from './art/rig';
import { heroHooks, staffTip } from './art/heroes';
import { skinFigure, skinGear, skinLook, type SkinLook } from './skins';
import { prefs } from './settings';
import { paintProp, propShadow } from './art/props';
import { paintDecor, paving, sheet, strip } from './art/ground';
import { paintWolf } from './art/animals';
import * as CR from './art/creatures';
import { sfx, type Sfx } from './audio';
import { ST, type Fx } from '../net/protocol';
import type { MatchClient, ViewUnit } from './client';
import type { HeroId, Look, Obstacle, ObstacleKind, Palette } from './types';
import { HEROES, isHero } from './heroes';

// Draws a match in Starfall Grove's storybook style: the baked battlefield, everything standing on it sorted by depth
// (paper puppets for heroes, the valley's own creatures for minions and monsters), then projectiles, spell effects,
// health and cast bars and numbers.
//
// Heroes move like puppets on a stage: they lean into a walk and kick up dust, lunge into a sword blow and recoil from
// a shot, squash a little on every strike, crouch over a rune while a spell winds up, leave afterimages when they dash,
// topple when they fall and pop back up when they return. Skins recolour the puppet and add an aura and trail. Big
// moments (your kill, your critical hit) hold the frame for an instant and punch the camera in.
//
// Speed: the ground and scenery are baked once; every creature animation frame is baked once and reused; each hero
// is re-cut only a limited number of times a second (more often for your own hero, and on stronger devices); glows
// come from cached sprites, never gradients made per frame.

export const TEAM_COLOR = ['#f2c96a', '#4f8ad8', '#d8564f'];
const TEAM_LIGHT = ['#ffe9a8', '#a8ccff', '#ffb0a8'];
const glow = CR.glow;
/** Each ability's colour, from the heroes' presentation. */
const ABILITY_COLOR: Record<string, string> = Object.fromEntries(Object.values(HEROES).flatMap(h => Object.entries(h.abilities).map(([id, a]) => [id, a.color])));
const star4 = (g: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) => star(g, x, y, r, 4, .38, rot);

type Theme = { palette: Palette; env: string; flowers: string[]; decor: Array<'grass' | 'flower' | 'fern' | 'shard' | 'shroom'>; pool: [string, string]; wolf: string };
const THEMES: Record<string, Theme> = {
  meadow: {
    palette: { ground: '#7fa05a', alternate: '#8fb065', path: '#d8c48e', pathEdge: '#a8915f', accent: '#f5cd5c', water: '#58a7b4', waterDeep: '#3d7f8f', foliage: ['#35593f', '#5d8a4c', '#a3c46a'], trunk: '#6f5337', rock: '#8c8f80', pod: '#f2b84b', roof: ['#b85a44'], wall: '#efe0bf' },
    env: 'petals', flowers: ['#f7c5d5', '#fff4f8', '#f2d27a', '#c9b6ff'], decor: ['grass', 'grass', 'flower', 'fern'], pool: ['#58a7b4', '#3d7f8f'], wolf: 'shadewolf',
  },
  summit: {
    palette: { ground: '#c9d4e8', alternate: '#dde6f5', path: '#8f93b8', pathEdge: '#62678c', accent: '#c9b6ff', water: '#9fd0ee', waterDeep: '#5a8ac8', foliage: ['#1c2b45', '#2e4a63', '#6a93a8'], trunk: '#3c3346', rock: '#6f7493', pod: '#c9b6ff', roof: ['#5a5f8a'], wall: '#c8cce0' },
    env: 'stars', flowers: ['#bfe8ff', '#ffffff', '#c9b6ff'], decor: ['grass', 'shard', 'grass'], pool: ['#bfeaff', '#7fb0dd'], wolf: 'snowfang',
  },
  ember: {
    palette: { ground: '#6e4a3a', alternate: '#7c5442', path: '#c9a26e', pathEdge: '#8a6a48', accent: '#ff9a3d', water: '#e2592a', waterDeep: '#a3301a', foliage: ['#2e2220', '#4f3428', '#8f5a34'], trunk: '#2a1e1a', rock: '#5e4c4a', pod: '#ffb347', roof: ['#9a4a2a'], wall: '#dcc4a2' },
    env: 'embers', flowers: ['#ffb347', '#ff7a3d'], decor: ['grass', 'shard', 'shroom'], pool: ['#ff8a3a', '#a3301a'], wolf: 'cinderhound',
  },
};
/** A map theme's colours (meadow when unknown), for things drawn outside a match, like map previews. */
export const paletteOf = (theme: string) => (THEMES[theme] ?? THEMES.meadow).palette;

type PKind = 'dot' | 'star' | 'leaf' | 'snow' | 'smoke' | 'shard' | 'ember';
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: string; size: number; kind: PKind; rot: number; glow: boolean };
type Ring = { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; width: number; fill?: boolean };
type FloatText = { x: number; y: number; text: string; color: string; life: number; max: number; size: number };
type Telegraph = { x: number; y: number; r: number; until: number; start: number; color: string; kind: 'comet' | 'area' };
type Streak = { x0: number; y0: number; x1: number; y1: number; life: number; max: number; color: string };
type Slash = { x: number; y: number; angle: number; reach: number; life: number; max: number; narrow: boolean; color: string };

export type AimPreview = { x: number; y: number; range: number; radius: number; target: string; valid: boolean };

/** Which of the valley's creatures stands in for each minion and monster, and how big it is. */
type Mob = { paint: (g: CanvasRenderingContext2D, en: CR.Creature, t: number, look: CR.Look, flash: boolean) => void; kind: string; r: number; style: CutStyle };
const withTrem = (f: (g: CanvasRenderingContext2D, en: CR.Creature, t: number, look: CR.Look, flash: boolean, trem: number) => void) =>
  (g: CanvasRenderingContext2D, en: CR.Creature, t: number, look: CR.Look, flash: boolean) => f(g, en, t, look, flash, 0);

/** How each map ping looks: its glyph, colour and words. */
export const SIGNAL_LOOK: Record<string, { icon: string; color: string; text: string }> = {
  attack: { icon: '⚔', color: '#ff6b5a', text: 'Attack!' },
  danger: { icon: '!', color: '#ffb347', text: 'Fall back!' },
  omw: { icon: '➜', color: '#7ec8ff', text: 'On my way' },
  help: { icon: '✚', color: '#8be08b', text: 'Need help!' },
  go: { icon: '◎', color: '#ffe38a', text: 'Go here' },
};

export class Renderer {
  /** Teammates' map pings, shown for a few seconds where they were placed. */
  private signals: Array<{ kind: string; x: number; y: number; at: number }> = [];
  addSignal(kind: string, x: number, y: number) {
    this.signals = [...this.signals.filter(s => performance.now() - s.at < 4000).slice(-5), { kind, x, y, at: performance.now() }];
  }
  readonly canvas: HTMLCanvasElement;
  readonly client: MatchClient;
  private g: CanvasRenderingContext2D;
  private theme: Theme;
  private ground!: HTMLCanvasElement;
  private groundRes = .5;
  private mini!: HTMLCanvasElement;
  private props: Array<{ o: Obstacle; b: Baked }> = [];
  private bakes = new Map<string, Baked>();
  private mobs = new Map<string, { b: Baked; glows: CR.GlowMark[] }>();
  private heroes = new Map<number, { b: Baked | null; at: number; joints: Joints | null; k: number }>();
  /** Each hero's look: the skinned figure, its weapon, and the skin's aura and trail. */
  private looks = new Map<number, { fig: Figure; gear: Look; skin: SkinLook | null }>();
  /** When each unit last died or came back (for the fall and the pop), and whether it is down now. */
  private life = new Map<number, { dead: boolean; at: number }>();
  /** Recent positions of dashing heroes, for afterimages. */
  private echoes = new Map<number, Array<{ x: number; y: number; t: number }>>();
  private nextStep = new Map<number, number>();
  /** Recalls under way: when they started and how long they take. */
  private recalls = new Map<number, { at: number; dur: number }>();
  /** What your hero last attacked, for the ring under it. */
  private myTarget = { id: 0, at: -9 };
  /** A brief freeze of everything but the camera (hit-stop), and the camera's punch-in. */
  private hitstop = 0;
  private zoom = 0;
  private cutter = new Cutter();
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: FloatText[] = [];
  private telegraphs: Telegraph[] = [];
  private streaks: Streak[] = [];
  private slashes: Slash[] = [];
  private shake = 0;
  /** A full-screen flash (gold for a kill, red when you fall) fading out. */
  private flash = { color: '#ffffff', a: 0 };
  /** Drifting motes that make the map feel alive: pollen, snow or embers, by theme. */
  private motes: Array<{ x: number; y: number; vx: number; vy: number; ph: number }> = [];
  cam = { x: 0, y: 0, scale: 1 };
  private dpr = 1;
  private w = 1; private h = 1;
  private t = 0;
  /** 1 on a desktop; less on phones and tablets (fewer particles, heroes re-cut less often). */
  private quality = 1;
  ready = false;
  aim: AimPreview | null = null;
  moveTarget: { x: number; y: number } | null = null;
  /** Effects the HUD cares about (kill feed, notices, gold), passed on after the renderer has seen them. */
  onFx: (f: Fx) => void = () => {};

  constructor(canvas: HTMLCanvasElement, client: MatchClient) {
    this.canvas = canvas;
    this.client = client;
    this.g = canvas.getContext('2d')!;
    this.theme = THEMES[client.map.theme] || THEMES.meadow;
    const small = !prefs.rich();
    this.quality = small ? .6 : 1;
    this.cutter.quality = small ? .5 : 1;
    this.groundRes = small ? .5 : .65;
  }

  private get duel() { return this.client.map.type === 'duel'; }

  /** Bakes the ground and scenery. Slow-ish (a few hundred ms), done once while the loading screen shows. */
  prepare() {
    this.resize();
    this.bakeGround();
    const res = this.res(2);
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

  /** Device pixels per world unit for a baked piece, capped (bigger costs memory and buys nothing on a phone). */
  private res(cap: number) { return Math.min(cap, Math.max(1, this.cam.scale * this.dpr)); }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(this.quality >= 1 ? 2 : 1.5, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    // Close in on the hero: about 1000×540 world units in landscape, 600 wide when the phone is upright.
    this.cam.scale = this.w >= this.h ? Math.min(this.w / 1000, this.h / 540) : Math.min(this.w / 600, this.h / 1000);
  }

  /** World-to-screen scale including the camera's punch-in. */
  private get scale() { return this.cam.scale * (1 + this.zoom); }
  screenToWorld(px: number, py: number) { return { x: (px - this.w / 2) / this.scale + this.cam.x, y: (py - this.h / 2) / this.scale + this.cam.y }; }

  // ───────────────────────────── baking the battlefield

  private laneDist(x: number, y: number) {
    let best = Infinity;
    for (const lane of this.client.map.lanes) for (let i = 1; i < lane.length; i++) {
      const [ax, ay] = lane[i - 1], [bx, by] = lane[i], abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / l2)), dx = x - ax - abx * t, dy = y - ay - aby * t;
      best = Math.min(best, dx * dx + dy * dy);
    }
    return Math.sqrt(best);
  }

  private bakeGround() {
    const m = this.client.map, P = this.theme.palette, res = this.groundRes;
    const c = document.createElement('canvas'); c.width = Math.ceil(m.w * res); c.height = Math.ceil(m.h * res);
    const g = c.getContext('2d')!;
    g.scale(res, res);
    g.fillStyle = P.ground; g.fillRect(0, 0, m.w, m.h);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < Math.round(m.w * m.h / 200000); i++) {
      const x = rnd() * m.w, y = rnd() * m.h, blobs: Array<[number, number, number]> = [];
      for (let j = 0; j < 5; j++) blobs.push([x + (rnd() - .5) * 260, y + (rnd() - .5) * 140, 60 + rnd() * 90]);
      sheet(g, blobs, i % 3 ? P.alternate : shade(P.ground, -.06), P.ground);
    }
    // The woods are a shade darker than the lanes (in a duel: everything outside the ring).
    const dark = (x: number, y: number) => this.duel
      ? Math.hypot(x - m.center[0], (y - m.center[1]) / .95) > m.arenaRadius + 40
      : this.laneDist(x, y) > m.laneWidth / 2 + 60;
    // Painted one pixel per 40 units, then stretched with smoothing: soft edges instead of squares.
    const cols = Math.ceil(m.w / 40), rows = Math.ceil(m.h / 40), mask = document.createElement('canvas');
    mask.width = cols; mask.height = rows;
    const mg0 = mask.getContext('2d')!; mg0.fillStyle = INK;
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) if (dark(cx * 40 + 20, cy * 40 + 20)) mg0.fillRect(cx, cy, 1, 1);
    g.save(); g.globalAlpha = .16; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(mask, 0, 0, cols, rows, 0, 0, cols * 40, rows * 40);
    g.restore();
    if (this.duel) {
      // A ring of paving stones with a rune circle, and the duellists' marks at either side.
      const [cx, cy] = m.center;
      paving(g, cx, cy, m.arenaRadius, m.arenaRadius * .95, shade(P.path, .05), shade(P.pathEdge, -.12), 46, 31);
      g.strokeStyle = alpha(P.accent, .75); g.lineWidth = 5; g.setLineDash([22, 12]);
      g.beginPath(); g.ellipse(cx, cy, m.arenaRadius * .55, m.arenaRadius * .52, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      for (const team of [1, 2]) { const [sx, sy] = m.spawn[team]; ellipse(g, sx, sy, 70, 46, alpha(TEAM_COLOR[team], .35)); g.strokeStyle = TEAM_COLOR[team]; g.lineWidth = 3; g.beginPath(); g.ellipse(sx, sy, 70, 46, 0, 0, TAU); g.stroke(); }
    } else {
      strip(g, m.lanes.map(l => l.map(([x, y]) => ({ x, y }))), P.path, P.ground, m.laneWidth * .72);
      for (const team of [1, 2]) { const [sx, sy] = m.spawn[team]; paving(g, sx + (team === 1 ? 40 : -40), sy, 230, 190, shade(P.path, .05), shade(P.pathEdge, -.1), 34, team * 7); }
    }
    for (const [x, y] of m.camps) paving(g, x, y, 120, 80, shade(P.ground, -.12), shade(P.ground, -.25), 30, x);
    if (m.objective) {
      const [ox, oy] = m.objective;
      paving(g, ox, oy, 170, 120, shade(P.path, -.08), shade(P.pathEdge, -.2), 40, 99);
      g.strokeStyle = alpha(P.accent, .7); g.lineWidth = 4; g.setLineDash([14, 10]); g.beginPath(); g.ellipse(ox, oy, 150, 102, 0, 0, TAU); g.stroke(); g.setLineDash([]);
    }
    for (const o of m.obstacles) if (o.k === 'pool') {
      ellipse(g, o.x + 6, o.y + 8, o.r + 14, o.r * .7 + 12, alpha(INK, .3));
      ellipse(g, o.x, o.y, o.r + 12, o.r * .7 + 10, shade(P.rock, -.1));
      ellipse(g, o.x, o.y, o.r, o.r * .7, this.theme.pool[1]);
      ellipse(g, o.x - o.r * .15, o.y - o.r * .1, o.r * .7, o.r * .45, this.theme.pool[0]);
    }
    const plants = Math.round(m.w * m.h / 10000);
    for (let i = 0; i < plants; i++) {
      const x = rnd() * m.w, y = rnd() * m.h;
      if (this.duel ? Math.hypot(x - m.center[0], y - m.center[1]) < m.arenaRadius * .9 : this.laneDist(x, y) < m.laneWidth * .4) continue;
      const kind = this.theme.decor[Math.floor(rnd() * this.theme.decor.length)];
      g.save(); g.translate(x, y); g.scale(.8, .8);
      paintDecor(g, { x, y, kind, seed: rnd(), color: this.theme.flowers[Math.floor(rnd() * this.theme.flowers.length)] }, Math.floor(rnd() * 3), P.foliage, this.theme.env === 'stars', this.theme.env === 'embers');
      g.restore();
    }
    this.ground = c;
    const mini = document.createElement('canvas'); mini.width = 320; mini.height = Math.round(320 * m.h / m.w);
    const mg = mini.getContext('2d')!;
    mg.drawImage(c, 0, 0, mini.width, mini.height);
    mg.fillStyle = alpha(shade(P.foliage[0], -.1), .75);
    for (const o of m.obstacles) { mg.beginPath(); mg.arc(o.x / m.w * mini.width, o.y / m.h * mini.height, Math.max(1.4, o.r / m.w * mini.width), 0, TAU); mg.fill(); }
    this.mini = mini;
  }

  // ───────────────────────────── the frame

  /** The ally the camera follows while you are knocked out of a duel round. */
  spectating: number = 0;

  frame(realDt: number) {
    if (!this.ready) return;
    // Hit-stop: effects nearly freeze for a moment. The clock itself follows the match client's, which stamps every
    // attack and cast, so animations stay in step with it.
    let dt = realDt;
    if (this.hitstop > 0) { this.hitstop -= realDt; dt *= .15; }
    this.zoom *= Math.pow(.004, realDt);
    this.t = this.client.now;
    const g = this.g, C = this.client, me = C.myUnit();
    this.consumeFx();
    for (const u of C.units.values()) this.trackLife(u);
    // Fog of war: enemies nobody on the team can see aren't drawn (here or on the minimap).
    this.seen = C.vision();
    const shown = (u: ViewUnit) => this.isShown(u);
    // Knocked out of a duel round: watch a teammate who is still fighting.
    this.spectating = 0;
    if (me && me.st & ST.dead && this.duel) {
      const ally = [...C.units.values()].find(u => isHero(u.k) && u.tm === C.team && u.i !== me.i && !(u.st & ST.dead));
      if (ally) this.spectating = ally.i;
    }
    const watched = this.spectating ? C.units.get(this.spectating) : me;
    const focus = watched ? { x: watched.rx, y: watched.ry } : { x: C.map.spawn[C.team][0], y: C.map.spawn[C.team][1] };
    if (!this.cam.x) { this.cam.x = focus.x; this.cam.y = focus.y; }
    const k = Math.min(1, realDt * 9);
    this.cam.x += (focus.x - this.cam.x) * k; this.cam.y += (focus.y - 24 - this.cam.y) * k;
    const halfW = this.w / 2 / this.scale, halfH = this.h / 2 / this.scale;
    this.cam.x = halfW * 2 > C.map.w ? C.map.w / 2 : Math.max(halfW, Math.min(C.map.w - halfW, this.cam.x));
    this.cam.y = halfH * 2 > C.map.h ? C.map.h / 2 : Math.max(halfH, Math.min(C.map.h - halfH, this.cam.y));
    sfx.setListener(this.cam.x, this.cam.y);
    const shake = this.shake > 0 ? (Math.random() - .5) * this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 30);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1d1520'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const sc = this.scale, s = sc * this.dpr;
    g.setTransform(s, 0, 0, s, (this.w / 2 - this.cam.x * sc + shake) * this.dpr, (this.h / 2 - this.cam.y * sc) * this.dpr);
    const view = { x0: this.cam.x - halfW - 120, x1: this.cam.x + halfW + 120, y0: this.cam.y - halfH - 80, y1: this.cam.y + halfH + 240 };
    const inView = (x: number, y: number) => x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1;

    const r = this.groundRes, sx = Math.max(0, view.x0), sy = Math.max(0, view.y0), sw = Math.min(C.map.w, view.x1) - sx, sh = Math.min(C.map.h, view.y1) - sy;
    if (sw > 0 && sh > 0) g.drawImage(this.ground, sx * r, sy * r, sw * r, sh * r, sx, sy, sw, sh);

    this.drawFloor(g, inView);
    if (me && !(me.st & ST.dead)) this.drawDanger(g, me);

    const draws: Array<{ y: number; run: () => void }> = [];
    for (const p of this.props) if (inView(p.o.x, p.o.y)) draws.push({ y: p.o.y, run: () => g.drawImage(p.b.c, p.o.x + p.b.l, p.o.y + p.b.t, p.b.w, p.b.h) });
    for (const u of C.units.values()) {
      if (!inView(u.rx, u.ry) || !shown(u)) continue;
      if (u.st & ST.dead && u.k !== 'tower' && u.k !== 'core') {
        // A fallen hero topples and fades before it is gone.
        if (isHero(u.k) && this.t - (this.life.get(u.i)?.at ?? -9) < 1.6) draws.push({ y: u.ry, run: () => this.drawDeath(g, u) });
        continue;
      }
      draws.push({ y: u.ry, run: () => this.drawUnit(g, u) });
    }
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.run();

    this.drawProjectiles(g, inView);
    this.drawSlashes(g, dt);
    this.drawEffects(g, dt);
    for (const u of C.units.values()) if (inView(u.rx, u.ry) && shown(u)) { this.drawBars(g, u); this.drawCastBar(g, u); }
    this.drawMotes(g, dt, view);
    this.drawTexts(g, dt);
    this.drawSignals(g);
    this.drawOverlay(g, dt, me);
  }

  private drawSignals(g: CanvasRenderingContext2D) {
    const now = performance.now();
    for (const s of this.signals) {
      const age = (now - s.at) / 1000;
      if (age > 4) continue;
      const look = SIGNAL_LOOK[s.kind] ?? SIGNAL_LOOK.go, fade = Math.min(1, (4 - age) * 2);
      g.globalAlpha = fade;
      // Two rings rippling out, a pin above, and the glyph in it.
      for (let i = 0; i < 2; i++) {
        const p = (age * 1.4 + i * .5) % 1;
        g.strokeStyle = alpha(look.color, (1 - p) * .9); g.lineWidth = 4 * (1 - p) + 1;
        g.beginPath(); g.ellipse(s.x, s.y, 20 + p * 70, (20 + p * 70) * .6, 0, 0, TAU); g.stroke();
      }
      const bob = Math.sin(age * 6) * 4, y = s.y - 70 + bob, pop = backOut(Math.min(1, age * 4));
      g.save(); g.translate(s.x, y); g.scale(pop, pop);
      g.fillStyle = INK; g.beginPath(); g.moveTo(-10, 18); g.lineTo(0, 40); g.lineTo(10, 18); g.closePath(); g.fill();
      circle(g, 0, 0, 25, INK); circle(g, 0, 0, 21, look.color);
      g.fillStyle = '#fff'; g.font = '900 24px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 4; g.strokeStyle = INK; g.strokeText(look.icon, 0, 1); g.fillText(look.icon, 0, 1);
      g.restore();
      g.globalAlpha = 1;
    }
  }

  /** Notices a unit going down or coming back, for the fall and the pop. */
  private trackLife(u: ViewUnit) {
    const dead = !!(u.st & ST.dead), l = this.life.get(u.i);
    if (!l) this.life.set(u.i, { dead, at: -9 });
    else if (l.dead !== dead) { l.dead = dead; l.at = this.t; }
  }

  /** A hero falling: the last cut of the puppet topples over and fades, and a mote of light drifts up from it. */
  private drawDeath(g: CanvasRenderingContext2D, u: ViewUnit) {
    const c = this.heroes.get(u.i), at = this.life.get(u.i)?.at ?? -9;
    if (!c?.b) return;
    const k = Math.min(1, (this.t - at) / 1.6), fall = Math.min(1, k * 3), dir = Math.cos(u.f * Math.PI / 180) < 0 ? 1 : -1;
    g.save(); g.translate(u.rx, u.ry + 4); g.rotate(dir * fall * fall * 1.4); g.globalAlpha = 1 - Math.max(0, (k - .4) / .6);
    g.drawImage(c.b.c, c.b.l, c.b.t, c.b.w, c.b.h);
    g.restore();
    if (k > .15) { const a = 1 - k; glow(g, u.rx, u.ry - 30 - k * 110, 26, TEAM_LIGHT[u.tm] || '#fff', a); circle(g, u.rx, u.ry - 30 - k * 110, 4, alpha('#ffffff', a)); }
  }

  /** A red ring round an enemy tower or Core that can shoot you, when you come near it. */
  private drawDanger(g: CanvasRenderingContext2D, me: ViewUnit) {
    for (const u of this.client.units.values()) {
      if ((u.k !== 'tower' && u.k !== 'core') || u.st & ST.dead || !this.client.isEnemy(u)) continue;
      if (u.k === 'core' && u.st & ST.invulnerable) continue;
      const range = (u.k === 'core' ? 450 : 520) + 24, d = Math.hypot(me.rx - u.rx, me.ry - u.ry);
      if (d > range + 260) continue;
      const inside = d < range, a = inside ? .55 + Math.sin(this.t * 8) * .2 : .35 * (1 - (d - range) / 260);
      g.save();
      g.setLineDash([18, 12]); g.lineDashOffset = -this.t * 40;
      g.strokeStyle = alpha('#ff5a4a', a); g.lineWidth = inside ? 5 : 3;
      g.beginPath(); g.ellipse(u.rx, u.ry, range, range * .62, 0, 0, TAU); g.stroke();
      g.restore();
      if (inside) { g.fillStyle = alpha('#ff5a4a', .06); g.beginPath(); g.ellipse(u.rx, u.ry, range, range * .62, 0, 0, TAU); g.fill(); }
    }
  }

  private drawMotes(g: CanvasRenderingContext2D, dt: number, view: { x0: number; x1: number; y0: number; y1: number }) {
    const want = Math.round(28 * this.quality), theme = this.client.map.theme;
    const col = theme === 'ember' ? '#ffb05c' : theme === 'summit' ? '#ffffff' : '#fff2a1';
    const fall = theme === 'summit' ? 26 : theme === 'ember' ? -22 : -6;
    while (this.motes.length < want) this.motes.push({ x: view.x0 + Math.random() * (view.x1 - view.x0), y: view.y0 + Math.random() * (view.y1 - view.y0), vx: (Math.random() - .5) * 18, vy: fall + (Math.random() - .5) * 10, ph: Math.random() * TAU });
    const w = view.x1 - view.x0, h = view.y1 - view.y0;
    for (const m of this.motes) {
      m.ph += dt; m.x += (m.vx + Math.sin(m.ph * 1.3) * 12) * dt; m.y += m.vy * dt;
      // Wrap round the view, so there are always some on screen.
      if (m.x < view.x0) m.x += w; else if (m.x > view.x1) m.x -= w;
      if (m.y < view.y0) m.y += h; else if (m.y > view.y1) m.y -= h;
      const a = .35 + Math.sin(m.ph * 2.2) * .25;
      glow(g, m.x, m.y, theme === 'summit' ? 6 : 9, col, a);
      circle(g, m.x, m.y, theme === 'summit' ? 2 : 1.6, alpha(col, Math.min(1, a + .3)));
    }
  }

  /** Screen-space touches: a flash for big moments, and a red pulse at the edges when you are nearly down. */
  private drawOverlay(g: CanvasRenderingContext2D, dt: number, me: ViewUnit | undefined) {
    const W = this.canvas.width, H = this.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (me && !(me.st & ST.dead) && me.hp / me.mh < .3) {
      const k = (1 - me.hp / me.mh / .3) * (.55 + Math.sin(this.t * 6) * .2);
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .7);
      v.addColorStop(0, 'rgba(200,30,40,0)'); v.addColorStop(1, 'rgba(200,30,40,' + (k * .55).toFixed(3) + ')');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }
    if (this.flash.a > 0) {
      g.globalAlpha = this.flash.a; g.fillStyle = this.flash.color; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      this.flash.a = Math.max(0, this.flash.a - dt * 1.6);
    }
  }

  // ───────────────────────────── floor: fountains, plants, zones, telegraphs, aim, the duel ring

  private drawFloor(g: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean) {
    const C = this.client, m = C.map, t = this.t;
    if (!this.duel) for (const team of [1, 2]) {
      const [x, y] = m.spawn[team];
      if (!inView(x, y)) continue;
      g.strokeStyle = alpha(TEAM_COLOR[team], .55 + Math.sin(t * 2) * .15); g.lineWidth = 5;
      g.setLineDash([18, 12]); g.lineDashOffset = -t * 20;
      g.beginPath(); g.ellipse(x, y, m.fountainRadius, m.fountainRadius * .62, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      ellipse(g, x + 4, y + 6, 46, 26, alpha(INK, .3)); ellipse(g, x, y, 46, 26, shade(this.theme.palette.rock, .1)); ellipse(g, x, y - 2, 36, 19, TEAM_COLOR[team]);
      glow(g, x, y - 20, 50, TEAM_LIGHT[team], .5);
      for (let i = 0; i < 5; i++) { const a = t * 2 + i * 1.3; circle(g, x + Math.cos(a) * 14, y - 18 - ((t * 40 + i * 13) % 50), 3, alpha(TEAM_LIGHT[team], .8)); }
    }
    const pa = C.latest?.pa ?? 0;
    m.plants.forEach(([x, y], i) => {
      if (!inView(x, y)) return;
      const open = (pa >> i) & 1;
      ellipse(g, x + 3, y + 4, 26, 12, alpha(INK, .25));
      for (let j = 0; j < 6; j++) { const a = j / 6 * TAU + .3; ellipse(g, x + Math.cos(a) * 16, y + Math.sin(a) * 8, 12, 5, shade(this.theme.palette.foliage[1], -.05), a); }
      if (open) {
        const pulse = 1 + Math.sin(t * 3 + i) * .08;
        glow(g, x, y - 12, 34, '#f7c5d5', .55);
        for (let j = 0; j < 6; j++) { const a = j / 6 * TAU + t * .3; ellipse(g, x + Math.cos(a) * 9 * pulse, y - 12 + Math.sin(a) * 5 * pulse, 8, 5, j % 2 ? '#fff4f8' : '#f7c5d5', a); }
        circle(g, x, y - 12, 5, '#fff2a1');
      } else ellipse(g, x, y - 8, 5, 8, shade(this.theme.palette.foliage[2], -.1));
    });
    for (const z of C.latest?.z ?? []) if (inView(z.x, z.y)) this.drawZone(g, z.k, z.x, z.y, z.r, z.t / 1000);
    // Telegraphs: where a spell being wound up will land, inked like a warning in a storybook's margin.
    this.telegraphs = this.telegraphs.filter(tg => tg.until > t);
    for (const tg of this.telegraphs) {
      const p = Math.min(1, (t - tg.start) / Math.max(.01, tg.until - tg.start));
      this.hatched(g, tg.x, tg.y, tg.r, tg.color, p);
      if (tg.kind === 'comet') {
        const q = p * p, fx = tg.x + 220 * (1 - q), fy = tg.y - 520 * (1 - q);
        g.strokeStyle = alpha(tg.color, .85); g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(fx + 60, fy - 130); g.lineTo(fx, fy); g.stroke();
        glow(g, fx, fy, 40, tg.color, 1); g.fillStyle = '#fff'; star(g, fx, fy, 11, 5, .45, p * 8); g.fill();
      }
    }
    if (this.duel && C.latest && C.latest.rr > 0) this.drawRing(g, C.latest.rr);
    if (this.duel && C.latest?.ss) this.drawShard(g, m.center[0], m.center[1]);
    // The ring under whatever your hero is hitting.
    const tg = this.myTarget.id ? C.units.get(this.myTarget.id) : undefined;
    if (tg && !(tg.st & ST.dead) && t - this.myTarget.at < 2.5 && inView(tg.rx, tg.ry)) {
      const r = (isHero(tg.k) ? 30 : tg.k === 'tower' ? 56 : tg.k === 'core' ? 80 : tg.k === 'warden' ? 60 : 24) + Math.sin(t * 8) * 2, fade = Math.min(1, (2.5 - (t - this.myTarget.at)) * 2);
      g.save(); g.translate(tg.rx, tg.ry + 3); g.scale(1, .42);
      g.strokeStyle = alpha('#ff6b5a', .85 * fade); g.lineWidth = 3.5; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      g.fillStyle = alpha('#ff6b5a', .9 * fade);
      for (let i = 0; i < 4; i++) { const a = t * 1.8 + i * TAU / 4; g.save(); g.rotate(a); g.beginPath(); g.moveTo(r + 3, 0); g.lineTo(r + 14, -6); g.lineTo(r + 14, 6); g.closePath(); g.fill(); g.restore(); }
      g.restore();
    }
    const me = C.myUnit(), a = this.aim;
    if (me && a) {
      g.strokeStyle = 'rgba(255,244,222,.55)'; g.lineWidth = 2.5; g.setLineDash([10, 8]);
      if (a.range > 0) { g.beginPath(); g.ellipse(me.rx, me.ry, a.range, a.range * .62, 0, 0, TAU); g.stroke(); }
      g.setLineDash([]);
      const col = a.valid ? 'rgba(255,227,138,.9)' : 'rgba(255,120,120,.85)';
      if (a.target === 'direction') {
        const ang = Math.atan2(a.y - me.ry, a.x - me.rx);
        g.save(); g.translate(me.rx, me.ry); g.rotate(ang);
        g.fillStyle = alpha('#ffe38a', .2); g.fillRect(0, -18, a.range, 36);
        g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(0, -18, a.range, 36);
        g.restore();
      } else if (a.target === 'point' || a.target === 'self') {
        const x = a.target === 'self' ? me.rx : a.x, y = a.target === 'self' ? me.ry : a.y;
        this.hatched(g, x, y, Math.max(40, a.radius), '#ffe38a', .3);
      } else {
        g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(me.rx, me.ry); g.lineTo(a.x, a.y); g.stroke();
        circle(g, a.x, a.y, 7, col);
      }
    }
    if (this.moveTarget) { const p = this.moveTarget; g.strokeStyle = 'rgba(160,240,160,.85)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(p.x, p.y, 14 + Math.sin(t * 8) * 2, 9, 0, 0, TAU); g.stroke(); }
  }

  /** An inked dashed ring with hatching inside, filling as `p` goes 0 → 1. */
  private hatched(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string, p: number) {
    const ink = mix(c, INK, .3);
    g.save(); g.translate(x, y); g.scale(1, .62);
    g.fillStyle = alpha(c, .1 + p * .12); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    if (this.quality >= 1) { g.save(); g.clip(); g.strokeStyle = alpha(ink, .2 + p * .2); g.lineWidth = 2; g.beginPath(); for (let k = -r * 2; k < r * 2; k += 14) { g.moveTo(k, -r); g.lineTo(k + r, r); } g.stroke(); g.restore(); }
    g.fillStyle = alpha(c, .28); g.beginPath(); g.arc(0, 0, r * p, 0, TAU); g.fill();
    g.strokeStyle = alpha(ink, .7 + p * .3); g.lineWidth = 2.5 + p * 1.5; g.setLineDash([12, 7]); g.lineDashOffset = -this.t * 50;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.setLineDash([]);
    g.restore();
  }

  private drawZone(g: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, left: number) {
    const t = this.t;
    switch (kind) {
      case 'gravity': {
        // Mira's Gravity Well: a black star with a glowing rim, arms of starlight spiralling in.
        const k = Math.min(1, left * 5);
        g.save(); g.translate(x, y); g.scale(1, .62); g.globalAlpha = k;
        g.fillStyle = 'rgba(40,20,90,.35)'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
        g.fillStyle = 'rgba(10,4,24,.55)'; g.beginPath(); g.arc(0, 0, r * .35, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(200,180,255,.6)'; g.lineWidth = 2; g.setLineDash([10, 12]); g.lineDashOffset = t * 50; g.beginPath(); g.arc(0, 0, r - 6, 0, TAU); g.stroke(); g.setLineDash([]);
        g.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          g.strokeStyle = i % 2 ? 'rgba(255,241,184,.55)' : 'rgba(179,156,255,.75)'; g.lineWidth = 3; g.beginPath();
          for (let s = 0; s <= 20; s++) { const f = s / 20, rr = r * (1 - f) * .95, a = -t * 3 + i * TAU / 4 + f * 4.2; s ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          g.stroke();
        }
        circle(g, 0, 0, 16 + Math.sin(t * 9) * 2, '#08030f');
        g.strokeStyle = 'rgba(255,241,184,.9)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 18 + Math.sin(t * 9) * 2, 0, TAU); g.stroke();
        g.restore();
        glow(g, x, y, 70, '#b39cff', .5 * k);
        break;
      }
      case 'blizzard': {
        // Lyra's Whiteout: a ring of frost on the ground and snow clouds rolling over it, ice falling through.
        const k = Math.min(1, left * 3);
        g.save(); g.translate(x, y); g.scale(1, .62);
        g.fillStyle = `rgba(210,240,255,${.16 * k})`; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
        g.strokeStyle = `rgba(230,250,255,${.6 * k})`; g.lineWidth = 3; g.setLineDash([14, 10]); g.lineDashOffset = -t * 60; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.setLineDash([]);
        g.restore();
        for (let i = 0; i < 5; i++) { const a = t * .6 + i * 1.3; g.fillStyle = `rgba(235,245,255,${.2 * k})`; g.beginPath(); g.ellipse(x + Math.cos(a) * r * .45, y - 220 + Math.sin(a * 1.3) * 18, r * .6, 38, 0, 0, TAU); g.fill(); }
        if (Math.random() < .9 * this.quality) for (let i = 0; i < 2; i++) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r; this.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * .62, z: 200, vx: -30, vy: 0, vz: -380, life: .55, max: .55, color: '#f2fbff', size: 3.2, kind: 'shard', rot: Math.random() * 6, glow: false }); }
        break;
      }
      case 'grove': {
        // Elara's Healing Grove: a ring of blossoms, soft green light and drifting leaves.
        const k = Math.min(1, left * 3);
        g.save(); g.translate(x, y); g.scale(1, .62);
        g.fillStyle = `rgba(160,230,120,${.18 * k})`; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
        g.strokeStyle = `rgba(190,240,150,${.8 * k})`; g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = t * 12; g.stroke(); g.setLineDash([]);
        g.restore();
        glow(g, x, y, r * .8, '#9fe8b0', .35 * k);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * .2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * .62; for (let j = 0; j < 5; j++) { const b = j / 5 * TAU; ellipse(g, px + Math.cos(b) * 5, py + Math.sin(b) * 5, 5, 3.5, j % 2 ? '#fff4f8' : '#f7c5d5', b); } circle(g, px, py, 2.4, '#fff2a1'); }
        if (Math.random() < .5 * this.quality) { const a = Math.random() * TAU, d = Math.random() * r; this.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * .62, z: 0, vx: (Math.random() - .5) * 20, vy: 0, vz: 50, life: 1.1, max: 1.1, color: '#c8f0a0', size: 5, kind: 'leaf', rot: Math.random() * 6, glow: false }); }
        break;
      }
    }
  }

  /** The duel's Starshard: a falling star crystal in the middle of the ring, waiting for whoever gets there first. */
  private drawShard(g: CanvasRenderingContext2D, x: number, y: number) {
    const t = this.t, bob = Math.sin(t * 2.6) * 6;
    g.save(); g.translate(x, y); g.scale(1, .5);
    g.strokeStyle = alpha('#ffe38a', .55 + Math.sin(t * 5) * .2); g.lineWidth = 3; g.setLineDash([10, 8]); g.lineDashOffset = -t * 40;
    g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.stroke(); g.setLineDash([]);
    g.restore();
    glow(g, x, y - 40 + bob, 70, '#ffe38a', .6 + Math.sin(t * 4) * .15);
    g.strokeStyle = alpha('#fff6d8', .5); g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const a = t * .8 + i * TAU / 6; g.beginPath(); g.moveTo(x + Math.cos(a) * 16, y - 40 + bob + Math.sin(a) * 16); g.lineTo(x + Math.cos(a) * 34, y - 40 + bob + Math.sin(a) * 34); g.stroke(); }
    g.save(); g.translate(x, y - 40 + bob); g.rotate(Math.sin(t) * .2);
    g.fillStyle = '#ffd65c'; g.beginPath(); g.moveTo(0, -22); g.lineTo(11, 0); g.lineTo(0, 22); g.lineTo(-11, 0); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#fff6d8'; g.beginPath(); g.moveTo(0, -22); g.lineTo(-11, 0); g.lineTo(0, 0); g.closePath(); g.fill();
    g.restore();
    if (Math.random() < .4 * this.quality) this.push({ x: x + (Math.random() - .5) * 60, y: y + (Math.random() - .5) * 20, z: 0, vx: 0, vy: 0, vz: 60 + Math.random() * 50, life: .9, max: .9, color: '#ffe38a', size: 2.4, kind: 'star', rot: Math.random() * 6, glow: true });
  }

  /** The duel's closing ring of starfire: the world outside it dims and burns. */
  private drawRing(g: CanvasRenderingContext2D, rr: number) {
    const m = this.client.map, [cx, cy] = m.center, t = this.t;
    if (rr >= m.arenaRadius + 39) return;
    g.save();
    g.beginPath(); g.rect(0, 0, m.w, m.h); g.ellipse(cx, cy, rr, rr * .95, 0, 0, TAU, true);
    g.fillStyle = 'rgba(120,28,60,.32)'; g.fill('evenodd');
    g.strokeStyle = 'rgba(255,154,107,.95)'; g.lineWidth = 6; g.setLineDash([20, 12]); g.lineDashOffset = t * 60;
    g.beginPath(); g.ellipse(cx, cy, rr, rr * .95, 0, 0, TAU); g.stroke(); g.setLineDash([]);
    g.restore();
    if (Math.random() < this.quality) for (let i = 0; i < 2; i++) { const a = Math.random() * TAU; this.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * .95, z: 4, vx: 0, vy: 0, vz: 60 + Math.random() * 60, life: .8, max: .8, color: '#ffb347', size: 2.6, kind: 'ember', rot: 0, glow: true }); }
  }

  // ───────────────────────────── units

  private drawUnit(g: CanvasRenderingContext2D, u: ViewUnit) {
    const C = this.client, x = u.rx, y = u.ry, t = this.t;
    const dead = !!(u.st & ST.dead);
    if (u.k === 'tower') {
      const b = this.bakes.get(`${dead ? 'ruin' : 'tower'}|${u.tm}`)!;
      const hurt = t - u.hurtT < .16 ? (1 - (t - u.hurtT) / .16) : 0, jx = hurt ? Math.sin(t * 90) * 3 * hurt : 0;
      if (!dead) { const pulse = .5 + Math.sin(t * 2.4 + u.i) * .15; ellipse(g, x, y + 4, 64, 22, alpha(TEAM_COLOR[u.tm], .18 * pulse + .08)); }
      g.drawImage(b.c, x + jx + b.l, y + b.t, b.w, b.h);
      if (!dead) {
        const warded = !!(u.st & ST.invulnerable), col = warded ? '#c8c8d8' : TEAM_LIGHT[u.tm], by = y - 140 + Math.sin(t * 2) * 3;
        const fire = Math.max(0, 1 - (t - u.actT) / .35);
        glow(g, x + jx, by, 34 + fire * 40, col, .7 + fire * .3);
        if (!warded) { g.strokeStyle = alpha(col, .55); g.lineWidth = 2; g.beginPath(); g.ellipse(x + jx, by, 22 + fire * 8, 8 + fire * 3, 0, t * 2, t * 2 + Math.PI * 1.4); g.stroke(); }
        g.fillStyle = col; star4(g, x + jx, by, 12 + fire * 6, t * (1 + fire * 4)); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
        if (hurt) glow(g, x + jx, y - 70, 70, '#ffffff', .35 * hurt);
        if (warded) this.drawWard(g, x, y - 60, 70, 110);
      }
      return;
    }
    if (u.k === 'core') {
      const b = this.bakes.get(`core|${u.tm}`)!;
      g.drawImage(b.c, x + b.l, y + b.t, b.w, b.h);
      if (dead) { for (let i = 0; i < 5; i++) { g.fillStyle = shade(TEAM_COLOR[u.tm], -.3); star(g, x - 40 + i * 20, y - 10 + (i % 2) * 8, 10, 4, .5, i); g.fill(); } return; }
      const bob = Math.sin(t * 1.6) * 6, col = TEAM_COLOR[u.tm];
      ellipse(g, x, y - 4, 50, 16, alpha(col, .3));
      glow(g, x, y - 105 + bob, 90, TEAM_LIGHT[u.tm], .55);
      g.save(); g.translate(x, y - 105 + bob);
      g.strokeStyle = INK; g.lineWidth = 3; g.fillStyle = col; star(g, 0, 0, 48, 4, .42, t * .4); g.fill(); g.stroke();
      g.fillStyle = TEAM_LIGHT[u.tm]; star(g, -6, -6, 24, 4, .42, t * .4); g.fill();
      circle(g, 0, 0, 9, '#ffffff');
      g.restore();
      if (u.st & ST.invulnerable) this.drawWard(g, x, y - 70, 95, 120);
      return;
    }
    const hero = isHero(u.k), mine = u.i === C.me?.u, enemy = C.isEnemy(u);
    const size = hero ? 24 : u.k === 'heavy' || u.k === 'boar' ? 28 : u.k === 'warden' ? 56 : 18;
    ellipse(g, x + 3, y + 5, size * 1.05, size * .42, 'rgba(40,24,40,.26)');
    if (hero || u.k === 'warden') {
      const ring = mine ? '#ffe38a' : enemy ? '#ff5a5a' : u.tm === 0 ? '#f2c96a' : '#6fb2ff';
      g.strokeStyle = alpha(ring, .9); g.lineWidth = 3; g.beginPath(); g.ellipse(x, y + 3, size + 6, (size + 6) * .42, 0, 0, TAU); g.stroke();
    } else if (u.tm) {
      // Minions wear their team's colour as a ring of light at their feet.
      g.strokeStyle = alpha(TEAM_COLOR[u.tm], .85); g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y + 3, size + 3, (size + 3) * .42, 0, 0, TAU); g.stroke();
    }
    const jolt = t - u.hurtT < .12 ? (1 - (t - u.hurtT) / .12) * 3.5 : 0;
    if (jolt) { g.save(); g.translate(Math.sin(t * 80 + u.i) * jolt, 0); }
    if (hero) { this.drawHero(g, u, mine); if (jolt) g.restore(); return; }
    if (u.k === 'fenn' || u.k === 'wolf') {
      const spirit = u.k === 'wolf';
      g.save(); if (spirit) { g.globalAlpha = .8; glow(g, x, y - 14, 40, '#9fe8b0', .5); }
      if (u.st & ST.frenzy) glow(g, x, y - 14, 36, '#ffd35c', .45);
      this.cutter.stamp(g, x, y - 12, [-32, -34, 64, 50], this.res(1.5), STICKER, gg => paintWolf(gg, t + u.i, Math.cos(u.f * Math.PI / 180) < 0 ? -1 : 1, u.moving), spirit ? 'rgba(140,240,200,.45)' : undefined);
      g.restore();
      return;
    }
    this.drawMob(g, u);
    this.drawStatus(g, u, x, y, false);
    if (jolt) g.restore();
  }

  private mobFor(u: ViewUnit): Mob | null {
    const team = u.tm;
    switch (u.k) {
      case 'melee': return { paint: withTrem(CR.drawThornling), kind: team === 1 ? 'rimeling' : 'briarling', r: 18, style: STICKER };
      case 'ranged': return { paint: withTrem(CR.drawSporecap), kind: team === 1 ? 'mirecap' : 'sporecap', r: 19, style: STICKER };
      case 'heavy': return team === 1
        ? { paint: withTrem(CR.drawGolem), kind: 'cragGolem', r: 25, style: STICKER }
        : { paint: withTrem(CR.drawHulk), kind: 'magmaHulk', r: 25, style: STICKER };
      case 'boar': return { paint: withTrem(CR.drawBoar), kind: 'bristleboar', r: 28, style: STICKER };
      case 'wolf': return { paint: withTrem(CR.drawWolf), kind: this.theme.wolf, r: 22, style: STICKER };
      case 'warden': return { paint: (g, en, t, look, flash) => CR.drawWarden(g, en, t, look, flash), kind: 'brambleWarden', r: 46, style: BOSS };
    }
    return null;
  }

  /** A minion or monster: one of the valley's creatures, from a cache of baked animation frames. */
  private drawMob(g: CanvasRenderingContext2D, u: ViewUnit) {
    const m = this.mobFor(u); if (!m) return;
    const t = this.t, dir = Math.cos(u.f * Math.PI / 180) < 0 ? -1 : 1;
    const attacking = t - u.actT < .35, aggro = u.moving || attacking;
    const frame = Math.floor(t * 9.5 + u.i * .37) % 10;
    const key = `${u.k}|${m.kind}|${dir}|${aggro ? 1 : 0}|${attacking ? 1 : 0}|${frame}`;
    let hit = this.mobs.get(key);
    if (!hit) {
      const r = m.r, res = this.res(1.5), en: CR.Creature = {
        kind: m.kind, r, elite: false, rage: 0, windup: attacking ? .35 : 0, aggro, lunge: 0, chargeX: dir, action: null, actionT: 0, phase: 1, burrowT: 0, angle: frame, x: 0, y: 0,
      };
      let glows: CR.GlowMark[] = [];
      const b = this.cutter.bake([-r * 2.4, -r * 3.2, r * 4.8, r * 4.4], res, m.style, gg => {
        CR.beginGlows(gg, res);
        m.paint(gg, en, frame * .1047 + 1, { x: dir * .8, y: .2 }, false);
        glows = CR.endGlows();
      });
      hit = { b, glows };
      this.mobs.set(key, hit);
    }
    const lift = attacking && (u.k === 'melee' || u.k === 'wolf' || u.k === 'boar') ? Math.sin((t - u.actT) / .35 * Math.PI) * 6 : 0;
    const x = u.rx + lift * dir, y = u.ry;
    g.drawImage(hit.b.c, x + hit.b.l, y + hit.b.t, hit.b.w, hit.b.h);
    for (const [gx, gy, gr, gc, ga] of hit.glows) glow(g, x + gx, y + gy, gr, gc, ga);
    if (t - u.hurtT < .12) glow(g, x, y - m.r * .6, m.r * 1.8, '#ffffff', .6);
    if (u.st & ST.blessed) glow(g, x, y - m.r, m.r * 2.2, '#ffd35c', .35);
  }

  private lookOf(u: ViewUnit, id: HeroId) {
    let l = this.looks.get(u.i);
    if (!l) { const skin = this.client.hero(u.i)?.skin ?? null; l = { fig: skinFigure(id, skin), gear: skinGear(skin), skin: skinLook(skin) }; this.looks.set(u.i, l); }
    return l;
  }

  /** A hero as a paper puppet, re-cut a limited number of times a second, and moved about as a whole between cuts. */
  private drawHero(g: CanvasRenderingContext2D, u: ViewUnit, mine: boolean) {
    const t = this.t, x = u.rx, y = u.ry, id = u.k as HeroId, L = this.lookOf(u, id), skin = L.skin;
    const since = t - u.actT, castLeft = u.castT >= 0 ? u.castDur - (t - u.castT) : -1, casting = castLeft > 0;
    const actDur = .38, acting = since < actDur && !!u.act;
    let arm: ArmAction = id === 'wren' || id === 'mira' || id === 'lyra' || id === 'elara' ? 'hold' : 'idle', k = 0;
    if (casting) { k = 1 - castLeft / Math.max(.01, u.castDur); arm = id === 'kael' ? 'swing' : id === 'riven' ? 'thrust' : id === 'wren' ? 'draw' : 'raise'; }
    else if (acting) { k = since / actDur; arm = id === 'kael' ? 'swing' : id === 'riven' ? 'thrust' : id === 'wren' ? 'draw' : 'raise'; }
    if (u.st & ST.spin) { arm = 'swing'; k = (t * 3.5) % 1; }
    const face = (acting || casting) && (u.ax !== x || u.ay !== y) ? facingOf(u.ax - x, u.ay - y) : facingOf(Math.cos(u.f * Math.PI / 180), Math.sin(u.f * Math.PI / 180));
    const stealth = !!(u.st & ST.stealth), flash = t - u.hurtT < .1 && Math.floor(t * 16) % 2 === 0;
    const lift = u.st & ST.dashing && id === 'wren' ? -30 : 0;
    const rich = this.quality >= 1;

    // On the ground beneath: the skin's aura, a spell's rune, a recall's light, the whirlwind.
    if (skin?.aura && !stealth) {
      const p = .5 + Math.sin(t * 2.4 + u.i) * .25;
      glow(g, x, y + 2, 44 + p * 8, skin.aura, .22 + p * .2);
      if (rich) { g.save(); g.translate(x, y + 3); g.scale(1, .4); g.strokeStyle = alpha(skin.aura, .35 + p * .25); g.lineWidth = 2; g.setLineDash([6, 9]); g.lineDashOffset = -t * 18; g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.stroke(); g.setLineDash([]); g.restore(); }
    }
    if (casting) this.drawCastRune(g, x, y, k, ABILITY_COLOR[u.castK] || '#ffe38a');
    if (u.st & ST.recall) this.drawRecall(g, u, x, y);
    if (u.st & ST.spin) this.drawBladestorm(g, x, y);
    if (u.st & ST.haste && u.moving) {
      const a = u.f * Math.PI / 180, bx = -Math.cos(a), by = -Math.sin(a);
      g.strokeStyle = alpha('#ffffff', .55); g.lineWidth = 2; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const off = (i - 1) * 14, ph = (t * 6 + i * .3) % 1, ox = x - by * off + bx * (20 + ph * 30), oy = y - 30 + bx * off * .5 + by * (20 + ph * 30); g.globalAlpha = 1 - ph; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + bx * 22, oy + by * 22); g.stroke(); }
      g.globalAlpha = 1;
    }

    const fps = mine ? (this.quality >= 1 ? 60 : 40) : (this.quality >= 1 ? 30 : 20);
    let c = this.heroes.get(u.i);
    if (!c) this.heroes.set(u.i, c = { b: null, at: -1, joints: null, k: 0 });
    if (!c.b || t - c.at >= 1 / fps - .001) {
      const cc = c;
      const hooks = heroHooks(id, L.gear, casting || acting ? k : 0, t, { bowDraw: arm === 'draw' ? Math.sin(Math.min(1, k) * Math.PI) : 0 });
      c.b = this.cutter.rebake(c.b, FIGURE_BOX, this.res(2), STICKER, gg => {
        if (u.st & ST.spin) gg.rotate(Math.sin(t * 30) * .15);
        cc.joints = drawFigure(gg, L.fig, { facing: face.facing, dir: face.dir, walk: u.walk, moving: u.moving, t: t + u.i, arm, k }, hooks);
      }, flash ? 'rgba(255,255,255,.72)' : undefined);
      c.at = t; c.k = casting || acting ? k : 0;
    }

    // The puppet as a whole: lunge into a blow (or recoil from a shot), squash on the strike, lean into a walk,
    // crouch through a wind-up, pop up when coming back.
    let ox = 0, oy = 0, sx = 1, sy = 1, rot = 0;
    if (acting && !(u.st & ST.spin)) {
      const s = Math.sin(Math.min(1, since / actDur) * Math.PI), ang = Math.atan2(u.ay - y, u.ax - x);
      const push = id === 'kael' || id === 'riven' ? 11 * s : -4 * s;
      ox += Math.cos(ang) * push; oy += Math.sin(ang) * push * .6;
      sx += s * .07; sy -= s * .06;
    }
    if (casting) { const p = Math.sin(k * Math.PI); sx += p * .03; sy -= p * .05; }
    if (u.moving && !acting && !casting) rot = Math.cos(u.f * Math.PI / 180) * .07;
    const l = this.life.get(u.i), born = l && l.at > 0 && !l.dead ? t - l.at : 9;
    if (born < .45) { const e = backOut(born / .45); sx *= e; sy *= e; }

    // Afterimages while dashing.
    let echo = this.echoes.get(u.i);
    if (u.st & ST.dashing) { if (!echo) this.echoes.set(u.i, echo = []); echo.push({ x, y, t }); if (echo.length > 6) echo.shift(); }
    if (echo?.length) {
      for (const e of echo) { const a = 1 - (t - e.t) / .25; if (a <= 0) continue; g.globalAlpha = a * .35; g.drawImage(c.b.c, e.x + c.b.l, e.y + lift + c.b.t, c.b.w, c.b.h); }
      g.globalAlpha = 1;
      if (t - echo[echo.length - 1].t > .25) this.echoes.delete(u.i);
    }

    g.save();
    g.translate(x + ox, y + oy + lift); if (rot) g.rotate(rot); if (sx !== 1 || sy !== 1) g.scale(sx, sy);
    if (stealth) {
      // Nightveil: barely there, two ghost copies wavering apart over a faint violet shadow.
      const w = Math.sin(t * 5) * 1.8;
      glow(g, 0, -6, 46, '#6a4bd6', .22);
      g.globalAlpha = .3; g.drawImage(c.b.c, w + c.b.l, c.b.t, c.b.w, c.b.h);
      g.globalAlpha = .2; g.drawImage(c.b.c, -w + c.b.l, c.b.t, c.b.w, c.b.h);
    } else g.drawImage(c.b.c, c.b.l, c.b.t, c.b.w, c.b.h);
    g.restore();
    if (born < .45) glow(g, x, y - 30, 60, TEAM_LIGHT[u.tm] || '#fff', 1 - born / .45);

    // Staff heads glow (in the skin's colour), brighter while a spell is being cast.
    if (c.joints && (id === 'mira' || id === 'lyra' || id === 'elara') && c.joints.facing !== 'back' && !stealth) {
      const tip = staffTip(c.joints, c.k), col = skin?.weapon.color ?? (id === 'mira' ? '#ffe38a' : id === 'lyra' ? '#9fe4ff' : '#b9e27a');
      glow(g, x + ox + tip.x, y + oy + lift + tip.y, 16 + (casting ? 24 : 0), casting ? ABILITY_COLOR[u.castK] || col : col, .85);
      if (casting && Math.random() < .5) this.push({ x: x + tip.x + (Math.random() - .5) * 8, y: y + tip.y, z: 0, vx: (Math.random() - .5) * 30, vy: -20, vz: 0, life: .6, max: .6, color: ABILITY_COLOR[u.castK] || col, size: 2.2, kind: 'dot', rot: 0, glow: true });
    }
    if (u.moving && !stealth && !lift) {
      // Dust at the heels, and a legendary skin's trail.
      if (t >= (this.nextStep.get(u.i) ?? 0)) {
        this.nextStep.set(u.i, t + (rich ? .22 : .34));
        const dust = this.client.map.theme === 'summit' ? '#ffffff' : this.client.map.theme === 'ember' ? '#9a8878' : '#e0d0a8';
        this.push({ x: x + (Math.random() - .5) * 12, y: y + 6, z: 2, vx: (Math.random() - .5) * 30, vy: 0, vz: 18, life: .45, max: .45, color: dust, size: 5 + Math.random() * 3, kind: 'smoke', rot: 0, glow: false });
      }
      if (skin?.trail && Math.random() < .55 * this.quality) this.push({ x: x + (Math.random() - .5) * 26, y: y + (Math.random() - .5) * 8, z: 6 + Math.random() * 30, vx: 0, vy: 0, vz: 30 + Math.random() * 30, life: .7, max: .7, color: skin.trail.color, size: 2.6, kind: skin.trail.kind, rot: Math.random() * 6, glow: skin.trail.kind === 'star' || skin.trail.kind === 'ember' });
    }
    this.drawStatus(g, u, x, y + lift, true);
  }

  /** A rune circle under a hero winding up a spell, filling as the spell gets ready. */
  private drawCastRune(g: CanvasRenderingContext2D, x: number, y: number, p: number, col: string) {
    p = Math.max(0, Math.min(1, p));
    const t = this.t, r = 30 + p * 12;
    glow(g, x, y, 34 + p * 26, col, .2 + p * .35);
    g.save(); g.translate(x, y + 3); g.scale(1, .45);
    g.strokeStyle = alpha(col, .55 + p * .4); g.lineWidth = 2.5; g.setLineDash([9, 6]); g.lineDashOffset = -t * 70;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.setLineDash([]);
    g.strokeStyle = alpha(col, .9); g.lineWidth = 3.5; g.beginPath(); g.arc(0, 0, r - 7, -Math.PI / 2, -Math.PI / 2 + TAU * p); g.stroke();
    g.rotate(t * 1.6); g.fillStyle = alpha(col, .8);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; star4(g, Math.cos(a) * (r + 6), Math.sin(a) * (r + 6), 4, a); g.fill(); }
    g.restore();
  }

  /** A recall home: a column of light thickening round the hero and a ring filling at their feet. */
  private drawRecall(g: CanvasRenderingContext2D, u: ViewUnit, x: number, y: number) {
    const t = this.t, mine = u.i === this.client.me?.u, r = this.recalls.get(u.i);
    const total = r?.dur ?? 4.5, p = mine && this.client.me ? Math.max(0, Math.min(1, 1 - this.client.me.rc / total)) : r ? Math.min(1, (t - r.at) / r.dur) : .5;
    const col = TEAM_LIGHT[u.tm] || '#ffffff';
    g.fillStyle = alpha(col, .1 + p * .2); g.fillRect(x - 26 + p * 6, y - 170, 52 - p * 12, 170);
    glow(g, x, y - 40, 50 + p * 30, col, .3 + p * .4);
    g.save(); g.translate(x, y + 3); g.scale(1, .42);
    g.strokeStyle = alpha(col, .35); g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 38, 0, TAU); g.stroke();
    g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 38, -Math.PI / 2, -Math.PI / 2 + TAU * p); g.stroke();
    g.restore();
    if (Math.random() < .5 * this.quality) this.push({ x: x + (Math.random() - .5) * 40, y, z: 0, vx: 0, vy: 0, vz: 120 + Math.random() * 80, life: .8, max: .8, color: col, size: 2.4, kind: 'star', rot: 0, glow: true });
  }

  /** Steel Cyclone: a ring of steel whirling around Kael. */
  private drawBladestorm(g: CanvasRenderingContext2D, x: number, y: number) {
    const spin = this.t * 22;
    g.save(); g.translate(x, y - 6); g.scale(1, .62);
    g.strokeStyle = 'rgba(255,214,170,.3)'; g.lineWidth = 26; g.beginPath(); g.arc(0, 0, 150, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,244,222,.85)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 154, spin, spin + 2.4); g.stroke();
    g.beginPath(); g.arc(0, 0, 154, spin + Math.PI, spin + Math.PI + 2.4); g.stroke();
    g.restore();
  }

  /** The protective ward over a structure that can't be hurt yet. */
  private drawWard(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
    g.strokeStyle = `rgba(220,230,255,${.35 + Math.sin(this.t * 3) * .12})`; g.lineWidth = 2.5; g.setLineDash([6, 8]);
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.stroke(); g.setLineDash([]);
  }

  /** Stuns, roots, shields, shells and the rest, drawn over a unit. */
  private drawStatus(g: CanvasRenderingContext2D, u: ViewUnit, x: number, y: number, hero: boolean) {
    const t = this.t, st = u.st, top = hero ? y - 84 : u.k === 'warden' ? y - 140 : y - 52, r = hero ? 24 : 20;
    if (st & ST.stun) for (let i = 0; i < 3; i++) { const a = t * 6 + i * TAU / 3; g.fillStyle = '#bfefff'; star4(g, x + Math.cos(a) * r * .9, top + 6 + Math.sin(a) * 5, 5, t * 4); g.fill(); }
    if (st & ST.root) { g.strokeStyle = '#5d8a4c'; g.lineWidth = 4; g.lineCap = 'round'; for (let i = 0; i < 4; i++) { const ox = -18 + i * 12; g.beginPath(); g.moveTo(x + ox, y + 6); g.quadraticCurveTo(x + ox + 8, y - 12, x + ox - 2, y - 26); g.stroke(); circle(g, x + ox - 2, y - 26, 3, '#8fbf5a'); } }
    if (st & ST.slow) glow(g, x, y - r * .5, r * 1.8, '#9fe4ff', .35);
    if (st & ST.blessed && hero) glow(g, x, y - 20, 56, '#ffd35c', .3 + Math.sin(t * 4) * .1);
    if (st & ST.shield && u.sh > 0) {
      g.strokeStyle = '#c8a46a'; g.lineWidth = 5; g.setLineDash([12, 6]); g.beginPath(); g.ellipse(x, y - 28, 38, 52, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      for (let i = 0; i < 4; i++) { const a = t + i * TAU / 4; ellipse(g, x + Math.cos(a) * 38, y - 28 + Math.sin(a) * 52, 6, 3, '#8fae6a', a); }
    }
    if (st & ST.guard) {
      // Bulwark: a dome of steel plates.
      glow(g, x, y - 14, 76, '#b8c8e0', .45);
      g.strokeStyle = 'rgba(235,242,255,.85)'; g.lineWidth = 3.5; g.beginPath(); g.ellipse(x, y - 14, 48 + Math.sin(t * 10) * 2, 50, 0, 0, TAU); g.stroke();
      for (let i = 0; i < 6; i++) { const a = t * 1.2 + i * TAU / 6; g.save(); g.translate(x + Math.cos(a) * 48, y - 14 + Math.sin(a) * 48); g.rotate(a); g.fillStyle = 'rgba(200,215,240,.8)'; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, -2); g.lineTo(0, 9); g.lineTo(-6, -2); g.closePath(); g.fill(); g.strokeStyle = 'rgba(47,35,48,.6)'; g.lineWidth = 1.2; g.stroke(); g.restore(); }
    }
    if (st & ST.shell) this.drawIceBlock(g, x, y);
    if (u.n > 0) {
      // Guardian Stars: golden stars circling with little trails.
      for (let i = 0; i < u.n; i++) {
        const pos = (j: number) => { const a = t * 3 + i * TAU / 3 - j * .18; return { x: x + Math.cos(a) * 60, y: y - 20 + Math.sin(a) * 30 }; };
        for (let j = 1; j <= 4; j++) { const q = pos(j); circle(g, q.x, q.y, 5.5 - j, `rgba(255,227,138,${.6 - j * .12})`); }
        const p = pos(0);
        glow(g, p.x, p.y, 30, '#ffe38a', .9);
        g.fillStyle = '#ffd65c'; star(g, p.x, p.y, 11, 5, .45, t * 3 + i); g.fill();
        g.fillStyle = '#fff'; star(g, p.x, p.y, 6, 5, .45, t * 3 + i); g.fill();
      }
    }
    if (st & ST.marked && u.markAt >= 0) {
      // Doom Sigil: a ring counting down over the target.
      const k = Math.min(1, (t - u.markAt) / 2), my = top - 14, pulse = 1 + Math.sin(t * (8 + k * 14)) * .12;
      glow(g, x, my, 26 * pulse, '#ff6b9a', .7 + k * .3);
      g.strokeStyle = 'rgba(255,107,154,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(x, my, 15, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
      circle(g, x, my, 8 * pulse, '#2a1838'); g.fillStyle = '#ff9ac0'; g.font = '900 11px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('☠', x, my + 1);
      g.save(); g.translate(x, y); g.scale(1, .6); g.strokeStyle = `rgba(255,107,154,${.35 + k * .4})`; g.lineWidth = 2; g.setLineDash([6, 6]); g.lineDashOffset = t * 40; g.beginPath(); g.arc(0, 0, r + 16, 0, TAU); g.stroke(); g.setLineDash([]); g.restore();
    }
    if (st & ST.empowered && hero && Math.random() < .4) this.push({ x: x + (Math.random() - .5) * 30, y: y - 6, z: 0, vx: (Math.random() - .5) * 16, vy: -24, vz: 0, life: .5, max: .5, color: '#e0c8ff', size: 1.8, kind: 'dot', rot: 0, glow: true });
  }

  /** Glacier Shell: a clear block of ice with frosted edges and glints. */
  private drawIceBlock(g: CanvasRenderingContext2D, x: number, y: number) {
    const t = this.t, W = 32, top = y - 72, bottom = y + 27;
    glow(g, x, y - 20, 86, '#9fe4ff', .45);
    g.fillStyle = 'rgba(240,252,255,.55)'; g.beginPath(); g.moveTo(x - W, top + 4); g.lineTo(x - W + 10, top - 9); g.lineTo(x + W + 10, top - 9); g.lineTo(x + W, top + 4); g.closePath(); g.fill();
    g.fillStyle = 'rgba(110,180,230,.45)'; g.beginPath(); g.moveTo(x + W, top + 4); g.lineTo(x + W + 10, top - 9); g.lineTo(x + W + 10, bottom - 12); g.lineTo(x + W, bottom); g.closePath(); g.fill();
    g.fillStyle = 'rgba(170,225,255,.42)'; g.beginPath(); g.roundRect(x - W, top, W * 2, bottom - top, 7); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.roundRect(x - W, top, W * 2, bottom - top, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - W + 6, top + 14); g.lineTo(x - W + 14, top + 30); g.lineTo(x - W + 9, top + 44); g.moveTo(x + W - 8, bottom - 10); g.lineTo(x + W - 16, bottom - 26); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x - W + 5, top + 6, 4, (bottom - top) * .55);
    const s = (t * .6) % 1; g.fillStyle = `rgba(255,255,255,${.5 * (1 - s)})`; g.fillRect(x - W + 4 + s * W * 1.6, top + 4, 3, bottom - top - 8);
    g.fillStyle = '#fff'; star4(g, x + W - 6, top + 8, 4 + Math.sin(t * 6) * 1.5, t); g.fill();
  }

  // ───────────────────────────── bars

  private drawBars(g: CanvasRenderingContext2D, u: ViewUnit) {
    if (u.st & ST.dead || u.hp <= 0 || u.k === 'fenn' || u.k === 'wolf') return;
    const C = this.client, mine = u.i === C.me?.u, enemy = C.isEnemy(u), hero = isHero(u.k);
    const w = hero ? 70 : u.k === 'tower' ? 96 : u.k === 'core' ? 130 : u.k === 'warden' ? 110 : u.k === 'heavy' || u.k === 'boar' ? 46 : 34;
    const hgt = hero ? 9 : u.k === 'tower' || u.k === 'core' || u.k === 'warden' ? 10 : 5;
    const top = hero ? u.ry - 98 : u.k === 'tower' ? u.ry - 182 : u.k === 'core' ? u.ry - 190 : u.k === 'warden' ? u.ry - 170 : u.k === 'heavy' || u.k === 'boar' ? u.ry - 70 : u.ry - 54;
    if (!hero && u.hp >= u.mh && u.k !== 'tower' && u.k !== 'core' && u.k !== 'warden') return;
    const x = u.rx - w / 2;
    // Last hits: an enemy minion (or monster) your next basic attack would finish is marked in gold.
    const ad = C.me?.ad ?? 0, mob = (u.k === 'melee' || u.k === 'ranged' || u.k === 'heavy' || u.k === 'boar' || u.k === 'wolf') && (enemy || u.tm === 0);
    const lastHit = mob && ad > 0 && u.hp <= ad;
    const col = lastHit ? '#ffd35c' : mine ? '#7fe07a' : u.tm === 0 ? '#f2c96a' : enemy ? '#ff5a5a' : '#5fb0ff';
    rrect(g, x - 2, top - 2, w + 4, hgt + 4, 3, lastHit ? '#fff1b8' : INK);
    rrect(g, x, top, w, hgt, 2, '#3a2a34');
    const f = Math.max(0, Math.min(1, u.hp / u.mh));
    rrect(g, x, top, w * f, hgt, 2, col);
    if (mob && ad > 0 && !lastHit && ad < u.mh) { g.fillStyle = 'rgba(255,241,184,.9)'; g.fillRect(x + w * ad / u.mh - .75, top - 1, 1.5, hgt + 2); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 1, top + 1, Math.max(0, w * f - 2), 2);
    if (u.sh > 0) { const sf = Math.min(1 - f, u.sh / u.mh); rrect(g, x + w * f, top, w * sf, hgt, 2, '#f4ecd8'); }
    if (hero) {
      g.strokeStyle = 'rgba(29,21,32,.55)'; g.lineWidth = 1;
      const step = u.mh > 1600 ? 500 : 100;
      for (let v = step; v < u.mh; v += step) { const tx = x + w * v / u.mh; g.beginPath(); g.moveTo(tx, top); g.lineTo(tx, top + hgt * .6); g.stroke(); }
      circle(g, x - 10, top + hgt / 2, 10, INK); circle(g, x - 10, top + hgt / 2, 8, mine ? '#ffe38a' : enemy ? '#ffb0a8' : '#a8ccff');
      g.font = '800 10px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK; g.fillText(String(u.lv), x - 10, top + hgt / 2 + .5);
      const name = C.hero(u.i)?.name ?? '';
      g.font = '800 12px Nunito, sans-serif'; g.lineWidth = 3; g.strokeStyle = INK; g.strokeText(name, u.rx, top - 9); g.fillStyle = mine ? '#ffe38a' : '#fff4de'; g.fillText(name, u.rx, top - 9);
    }
  }

  /** A small bar above the head while a spell (or a slow attack) winds up, filling in the spell's colour. */
  private drawCastBar(g: CanvasRenderingContext2D, u: ViewUnit) {
    if (u.castT < 0 || u.st & ST.dead || !isHero(u.k)) return;
    const k = (this.t - u.castT) / Math.max(.01, u.castDur);
    if (k >= 1) return;
    const W = 56, H = 7, x = u.rx - W / 2, y = u.ry - 122;
    g.fillStyle = INK; g.beginPath(); g.roundRect(x - 2, y - 2, W + 4, H + 4, 5); g.fill();
    g.fillStyle = 'rgba(255,244,222,.25)'; g.beginPath(); g.roundRect(x, y, W, H, 3); g.fill();
    g.fillStyle = ABILITY_COLOR[u.castK] || '#ffe38a'; g.beginPath(); g.roundRect(x, y, Math.max(3, W * k), H, 3); g.fill();
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x + 2, y + 1, Math.max(0, W * k - 4), 2);
  }

  // ───────────────────────────── projectiles

  private drawProjectiles(g: CanvasRenderingContext2D, inView: (x: number, y: number) => boolean) {
    const s = this.client.latest; if (!s) return;
    const since = Math.min(.15, this.client.lastSnapAt ? performance.now() / 1000 - this.client.lastSnapAt : 0), t = this.t;
    for (const p of s.p) {
      const x = p.x + p.vx * since, y = p.y + p.vy * since - 24;
      if (!inView(x, y)) continue;
      const a = Math.atan2(p.vy, p.vx), spin = t * 8 + p.i;
      switch (p.k) {
        case 'spark': case 'star': {
          const c = p.k === 'star' ? '#ffe38a' : '#fff1a8';
          glow(g, x, y, 34, c, 1);
          g.fillStyle = '#fff8d8'; star4(g, x, y, 10, spin); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.3; g.stroke();
          if (Math.random() < .4 * this.quality) this.push({ x, y: y + 24, z: 24, vx: 0, vy: 0, vz: 0, life: .35, max: .35, color: c, size: 2.4, kind: 'star', rot: spin, glow: false });
          break;
        }
        case 'sunfire': {
          const fl = 1 + Math.sin(t * 40) * .1, r = 18;
          glow(g, x, y, r * 4 * fl, '#ff9a4a', 1);
          circle(g, x, y, r * 1.2 * fl + 1.4, INK); circle(g, x, y, r * 1.2 * fl, '#ffb347'); circle(g, x - 2, y - 2, r * .75 * fl, '#ffe38a'); circle(g, x - 3, y - 3, r * .35, '#fff6d8');
          g.strokeStyle = 'rgba(255,220,150,.8)'; g.lineWidth = 2;
          for (let i = 0; i < 6; i++) { const b = spin + i * TAU / 6; g.beginPath(); g.moveTo(x + Math.cos(b) * r * 1.2, y + Math.sin(b) * r * 1.2); g.lineTo(x + Math.cos(b) * r * 1.8, y + Math.sin(b) * r * 1.8); g.stroke(); }
          if (Math.random() < .6 * this.quality) this.push({ x, y: y + 24, z: 24, vx: (Math.random() - .5) * 40, vy: (Math.random() - .5) * 40, vz: 20, life: .4, max: .4, color: '#ff9a3d', size: 3, kind: 'ember', rot: 0, glow: true });
          break;
        }
        case 'frostbolt': {
          const r = 9;
          g.save(); g.translate(x, y); g.rotate(a);
          g.fillStyle = 'rgba(159,228,255,.35)'; g.fillRect(-34, -3, 34, 6);
          glow(g, 0, 0, r * 3.2, '#9fe4ff', .9);
          g.fillStyle = '#f2fbff'; g.beginPath(); g.moveTo(r * 2, 0); g.lineTo(-r * .6, -r * .8); g.lineTo(-r * 1.4, 0); g.lineTo(-r * .6, r * .8); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
          g.fillStyle = '#9fe4ff'; g.beginPath(); g.moveTo(r * 2, 0); g.lineTo(-r * .6, r * .8); g.lineTo(-r * .2, 0); g.closePath(); g.fill();
          g.restore();
          break;
        }
        case 'seed': case 'thorn': {
          const own = p.k === 'seed';
          g.save(); g.translate(x, y); g.rotate(a);
          glow(g, 0, 0, 18, own ? '#9fe8b0' : '#ff9a6b', .6);
          g.fillStyle = own ? '#9fe8b0' : '#c9e07a'; g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -5); g.lineTo(-4, 0); g.lineTo(-8, 5); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke();
          g.restore();
          if (own && Math.random() < .3 * this.quality) this.push({ x, y: y + 24, z: 24, vx: (Math.random() - .5) * 20, vy: 0, vz: 10, life: .5, max: .5, color: '#b9e27a', size: 4, kind: 'leaf', rot: Math.random() * 6, glow: false });
          break;
        }
        case 'naturebolt': {
          g.save(); g.translate(x, y); g.rotate(a);
          g.strokeStyle = '#5d8a4c'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-44, 0); g.quadraticCurveTo(-22, Math.sin(t * 20) * 9, 0, 0); g.stroke();
          glow(g, 0, 0, 34, '#8fdc6a', .9);
          g.fillStyle = '#c8f0a0'; g.beginPath(); g.moveTo(18, 0); g.lineTo(-6, -8); g.lineTo(-2, 0); g.lineTo(-6, 8); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
          g.restore();
          if (Math.random() < .8 * this.quality) this.push({ x, y: y + 24, z: 24, vx: (Math.random() - .5) * 30, vy: (Math.random() - .5) * 30, vz: 10, life: .6, max: .6, color: Math.random() < .5 ? '#b9e27a' : '#f7c5d5', size: 4.5, kind: 'leaf', rot: Math.random() * 6, glow: false });
          break;
        }
        case 'arrow':
          g.save(); g.translate(x, y); g.rotate(a);
          g.strokeStyle = 'rgba(255,245,210,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-34, 0); g.lineTo(-14, 0); g.stroke();
          g.fillStyle = INK; g.fillRect(-14.8, -1.8, 23.6, 3.6); g.fillStyle = '#c09660'; g.fillRect(-14, -1, 22, 2);
          g.strokeStyle = INK; g.lineWidth = 1.1;
          g.fillStyle = '#e8ecf4'; g.beginPath(); g.moveTo(14, 0); g.lineTo(7, -3.5); g.lineTo(7, 3.5); g.closePath(); g.fill(); g.stroke();
          g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(-14, 0); g.lineTo(-19, -4); g.lineTo(-11, 0); g.lineTo(-19, 4); g.closePath(); g.fill(); g.stroke();
          g.restore();
          break;
        case 'knife':
          g.save(); g.translate(x, y); g.rotate(spin * 2 + Math.PI / 2);
          glow(g, 0, 0, 14, '#e0c8ff', .6);
          g.fillStyle = '#3a2a26'; g.fillRect(-1.5, 2, 3, 5); g.fillStyle = '#eef0f8'; g.beginPath(); g.moveTo(-2.5, 2); g.lineTo(0, -10); g.lineTo(2.5, 2); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
          g.restore();
          break;
        case 'bolt': {
          // A minion's shot: a little orb in its team's colour.
          const c = TEAM_LIGHT[p.tm] || '#fff';
          glow(g, x, y, 22, c, .9);
          circle(g, x, y, 6.3, INK); circle(g, x, y, 5, c); circle(g, x - 1.5, y - 1.5, 2, '#fff');
          break;
        }
        case 'towerbolt': {
          const c = TEAM_LIGHT[p.tm] || '#fff';
          glow(g, x, y, 40, c, 1);
          g.fillStyle = '#fff8e6'; star4(g, x, y, 12, spin); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
          if (Math.random() < .5 * this.quality) this.push({ x, y: y + 24, z: 24, vx: 0, vy: 0, vz: 0, life: .3, max: .3, color: c, size: 3, kind: 'dot', rot: 0, glow: true });
          break;
        }
        case 'wardenbolt':
          glow(g, x, y, 40, '#a78bfa', .9);
          circle(g, x, y, 11.3, '#e0d4ff'); circle(g, x, y, 10, '#1a1030');
          g.strokeStyle = '#e0d4ff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 10, spin, spin + 4); g.stroke();
          break;
        default: glow(g, x, y, 20, '#ffffff', .8); circle(g, x, y, 5, '#fff');
      }
    }
  }

  /** Sword swings: a bright crescent that sweeps and fades; dagger thrusts: two quick streaks. */
  private drawSlashes(g: CanvasRenderingContext2D, dt: number) {
    for (const sl of this.slashes) {
      sl.life -= dt;
      const k = Math.max(0, sl.life / sl.max), sweep = 1 - k;
      g.save(); g.translate(sl.x, sl.y); g.lineCap = 'round';
      if (sl.narrow) {
        g.rotate(sl.angle);
        for (const off of [-7, 7]) { const len = sl.reach * Math.min(1, sweep * 2 + .3); g.strokeStyle = alpha(sl.color, .8 * k); g.lineWidth = 5; g.beginPath(); g.moveTo(18, off); g.lineTo(len, off * .4); g.stroke(); g.strokeStyle = `rgba(255,255,255,${k})`; g.lineWidth = 1.5; g.stroke(); }
      } else {
        g.scale(1, .8);
        const a0 = sl.angle - 1.25, a1 = a0 + 2.5 * Math.min(1, sweep * 1.8 + .25);
        for (const [w, c, r] of [[22, `rgba(255,180,110,${.25 * k})`, sl.reach * .8], [10, `rgba(255,230,200,${.75 * k})`, sl.reach * .82], [3, `rgba(255,255,255,${k})`, sl.reach * .86]] as Array<[number, string, number]>) {
          g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, a0, a1); g.stroke();
        }
      }
      g.restore();
    }
    this.slashes = this.slashes.filter(s => s.life > 0);
  }

  // ───────────────────────────── effects from the server's events

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
          // Sparks fly from a hit, away from whoever struck; your own critical hits hold the frame for an instant.
          const src = f.u2 ? C.units.get(f.u2) : undefined;
          if (src && v > 0) {
            const d = Math.hypot(at.x - src.rx, at.y - src.ry) || 1, dx = (at.x - src.rx) / d, dy = (at.y - src.ry) / d, n = Math.round((crit ? 7 : 3) * this.quality);
            for (let i = 0; i < n; i++) { const sp = 160 + Math.random() * 200, j = (Math.random() - .5) * 1.2; this.push({ x: at.x, y: at.y - 26, z: 20, vx: (dx * Math.cos(j) - dy * Math.sin(j)) * sp, vy: (dy * Math.cos(j) + dx * Math.sin(j)) * sp * .6, vz: 40 + Math.random() * 80, life: .28, max: .28, color: crit ? '#ffd35c' : f.k === 'spell' ? '#e0d4ff' : '#fff4de', size: 2.2, kind: 'dot', rot: 0, glow: crit }); }
            if (crit && f.u2 === C.me?.u) this.hitstop = Math.max(this.hitstop, .05);
          }
          if (v <= 0) { this.text(at.x, at.y - 70, 'Absorbed', '#f4ecd8', 13); break; }
          if (mineHit || isHero(u.k) || crit || f.k === 'spell') this.text(at.x + (Math.random() - .5) * 20, at.y - 62, String(v), mineHit ? '#ff6b6b' : crit ? '#ffcf5a' : f.k === 'spell' ? '#c9b6ff' : '#fff4de', crit ? 21 : 15);
          if (v > 15) this.puff(at.x, at.y - 26, crit ? 8 : 4, crit ? '#ffd35c' : '#fff4de', crit ? 'star' : 'dot');
          if (mineHit && v > 40) this.shake = Math.min(10, this.shake + v / 30);
          break;
        }
        case 'heal': if (u && (f.v ?? 0) >= 5) { this.text(at.x, at.y - 72, `+${f.v}`, '#8fe08a', 15); if ((f.v ?? 0) > 30) this.puff(at.x, at.y - 30, 5, '#b9f2a0', 'leaf'); } break;
        case 'gold': if (f.u === C.me?.u) { this.text(f.x ?? at.x, (f.y ?? at.y) - 40, `+${f.v}g`, '#ffd85c', 14); sfx.play('pickup', { x: f.x ?? 0, y: f.y ?? 0 }, .5); } break;
        case 'atk': {
          if (u && f.u === C.me?.u && f.u2) this.myTarget = { id: f.u2, at: this.t };
          if (u && f.k === 'slash') this.slashes.push({ x: u.rx, y: u.ry - 20, angle: Math.atan2((f.y ?? u.ry) - u.ry, (f.x ?? u.rx) - u.rx), reach: 120, life: .28, max: .28, narrow: false, color: '#ffd0a0' });
          if (u && f.k === 'stab') this.slashes.push({ x: u.rx, y: u.ry - 20, angle: Math.atan2((f.y ?? u.ry) - u.ry, (f.x ?? u.rx) - u.rx), reach: 90, life: .18, max: .18, narrow: true, color: '#e0c8ff' });
          if (u && (f.k === 'tower' || f.k === 'core')) {
            const top = u.ry - (f.k === 'core' ? 105 : 140);
            this.streaks.push({ x0: u.rx, y0: top, x1: f.x ?? u.rx, y1: (f.y ?? u.ry) - 24, life: .14, max: .14, color: TEAM_LIGHT[u.tm] });
            this.puff(u.rx, top + 20, 5, TEAM_LIGHT[u.tm], 'star');
          }
          const s: Partial<Record<string, Sfx>> = { spark: 'spark', frostbolt: 'orb', seed: 'thornShot', arrow: 'thornShot', slash: 'hit', stab: 'hit', tower: 'voidShot', core: 'voidShot', warden: 'voidShot' };
          const snd = f.k ? s[f.k] : undefined;
          if (snd) sfx.play(snd, at, .6);
          else if (u && (f.k === 'melee' || f.k === 'heavy' || f.k === 'boar' || f.k === 'wolf')) sfx.play('chop', at, .25);
          break;
        }
        case 'crit': if (u) this.puff(u.rx, u.ry - 30, 8, '#ffd35c', 'star'); break;
        case 'cast': {
          const s: Partial<Record<string, Sfx>> = {
            gravity: 'voidShot', sunfire: 'sunfire', starguard: 'shield', starfall: 'starfall', charge: 'dash', slam: 'slam', guard: 'shield', bladestorm: 'dash',
            blink: 'dash', frostnova: 'shield', iceBlock: 'reflect', blizzard: 'starfall', shadowstep: 'dash', knives: 'dash', stealth: 'flap', deathmark: 'voidShot',
            command: 'howl', volley: 'thornShot', leap: 'flap', wildcall: 'howl', naturebolt: 'leaf', grove: 'leaf', barkskin: 'leaf', awakening: 'learn',
          };
          const snd = f.k ? s[f.k] : undefined;
          if (snd) sfx.play(snd, at);
          // Spells wound up onto a spot show where they will land.
          const area: Record<string, [number, string]> = { gravity: [170, '#b39cff'], blizzard: [260, '#dff6ff'], grove: [200, '#9fe8b0'], awakening: [300, '#9fe8b0'] };
          if (f.k && area[f.k] && (f.v ?? 0) > 0) this.telegraphs.push({ x: f.x ?? 0, y: f.y ?? 0, r: area[f.k][0], start: this.t, until: this.t + (f.v ?? 0) / 1000 + (f.k === 'awakening' ? .5 : 0), color: area[f.k][1], kind: 'area' });
          if (u && f.k === 'charge') this.puff(u.rx, u.ry - 10, 10, '#ffd0a0', 'smoke');
          if (u && (f.k === 'slam' || f.k === 'frostnova') && (f.v ?? 0) > 0) this.telegraphs.push({ x: u.rx, y: u.ry, r: f.k === 'slam' ? 210 : 220, start: this.t, until: this.t + (f.v ?? 0) / 1000, color: f.k === 'slam' ? '#e0a060' : '#7fd0ff', kind: 'area' });
          break;
        }
        case 'burst': this.burst(f.k || '', f.x ?? at.x, f.y ?? at.y, f.r ?? 80); break;
        case 'comet': this.telegraphs.push({ x: f.x ?? 0, y: f.y ?? 0, r: f.r ?? 90, start: this.t, until: this.t + (f.v ?? 600) / 1000, color: '#c9b6ff', kind: 'comet' }); break;
        case 'blink': {
          const col = f.k === 'shadow' ? '#b69cff' : f.k === 'flash' ? '#ffe38a' : '#d6f4ff', kind: PKind = f.k === 'shadow' ? 'smoke' : f.k === 'flash' ? 'star' : 'snow';
          this.streaks.push({ x0: f.x ?? 0, y0: (f.y ?? 0) - 30, x1: f.x2 ?? 0, y1: (f.y2 ?? 0) - 30, life: .35, max: .35, color: col });
          this.puff(f.x ?? 0, f.y ?? 0, 10, col, kind);
          this.puff(f.x2 ?? 0, f.y2 ?? 0, 10, col, kind);
          if (f.k === 'flash') { this.rings.push({ x: f.x2 ?? 0, y: f.y2 ?? 0, r0: 10, r1: 70, life: .35, max: .35, color: col, width: 4 }); sfx.play('dash', { x: f.x2 ?? 0, y: f.y2 ?? 0 }); }
          break;
        }
        case 'charm': if (u && f.k !== 'flash') sfx.play(f.k === 'heal' ? 'drink' : f.k === 'ghost' ? 'flap' : 'shield', at); break;
        case 'recall':
          if (f.k === 'start' && f.u) this.recalls.set(f.u, { at: this.t, dur: (f.v ?? 4500) / 1000 });
          else if (f.u) this.recalls.delete(f.u);
          if (f.k === 'cancel' && u) this.puff(at.x, at.y - 30, 6, TEAM_LIGHT[u.tm] || '#fff', 'smoke');
          if (f.k === 'done') {
            const col = TEAM_LIGHT[u?.tm ?? C.team] || '#fff';
            this.streaks.push({ x0: f.x ?? 0, y0: f.y ?? 0, x1: f.x ?? 0, y1: (f.y ?? 0) - 380, life: .5, max: .5, color: col });
            this.rings.push({ x: f.x2 ?? 0, y: f.y2 ?? 0, r0: 10, r1: 100, life: .55, max: .55, color: col, width: 4 });
            this.puff(f.x2 ?? 0, (f.y2 ?? 0) - 30, 14, col, 'star');
            if (f.u === C.me?.u) sfx.play('learn');
          }
          break;
        case 'shard': {
          const x = f.x ?? at.x, y = f.y ?? at.y, col = TEAM_LIGHT[f.tm ?? 0] || '#ffe38a';
          this.rings.push({ x, y, r0: 20, r1: 160, life: .6, max: .6, color: '#ffe38a', width: 6, fill: true });
          this.streaks.push({ x0: x, y0: y, x1: x, y1: y - 400, life: .45, max: .45, color: col });
          this.puff(x, y - 40, 22, '#ffe38a', 'star');
          sfx.play('questDone', { x, y });
          break;
        }
        case 'die': {
          const big = isHero(f.k || '') || f.k === 'warden';
          this.puff(at.x, at.y - 20, big ? 24 : 9, f.k === 'tower' || f.k === 'core' ? '#c8b8a8' : '#fff4de', 'smoke');
          this.puff(at.x, at.y - 20, big ? 14 : 5, '#e8d8c8', 'shard');
          if (big) {
            const col = TEAM_LIGHT[f.tm ?? 0] || '#fff4de';
            this.rings.push({ x: at.x, y: at.y, r0: 10, r1: 130, life: .55, max: .55, color: '#fff4de', width: 5 });
            this.rings.push({ x: at.x, y: at.y, r0: 30, r1: 190, life: .8, max: .8, color: col, width: 3 });
            this.puff(at.x, at.y - 30, 12, col, 'star');
            this.shake = Math.max(this.shake, 6);
            sfx.play(f.k === 'warden' ? 'bossDie' : 'kill', at);
          } else if (f.k === 'tower' || f.k === 'core') {
            const col = TEAM_LIGHT[f.tm ?? 0] || '#fff4de', core = f.k === 'core';
            this.shake = core ? 26 : 18;
            for (let i = 0; i < 3; i++) this.rings.push({ x: at.x, y: at.y, r0: 20 + i * 30, r1: (core ? 320 : 230) + i * 50, life: .6 + i * .2, max: .6 + i * .2, color: i === 1 ? col : '#ffd9a0', width: 7 - i * 2, fill: i === 0 });
            this.puff(at.x, at.y - 80, core ? 40 : 26, '#ffb05c', 'ember');
            this.puff(at.x, at.y - 60, core ? 30 : 20, '#8c7f72', 'shard');
            this.puff(at.x, at.y - 100, 16, col, 'star');
            this.streaks.push({ x0: at.x, y0: at.y, x1: at.x, y1: at.y - 420, life: .5, max: .5, color: col });
            sfx.play('boom', at); sfx.play('bossDie', at, .5);
          }
          break;
        }
        case 'lvl': if (u) { this.streaks.push({ x0: at.x, y0: at.y, x1: at.x, y1: at.y - 260, life: .45, max: .45, color: '#ffe38a' }); this.text(at.x, at.y - 116, 'Level up!', '#ffe38a', 17); this.rings.push({ x: at.x, y: at.y, r0: 20, r1: 80, life: .6, max: .6, color: '#ffe38a', width: 4 }); this.puff(at.x, at.y - 30, 12, '#ffe38a', 'star'); if (f.u === C.me?.u) sfx.play('levelUp'); } break;
        case 'block': if (u) this.text(at.x, at.y - 78, 'Blocked', '#d6e2f5', 13); break;
        case 'reflect': if (u) { this.rings.push({ x: at.x, y: at.y - 30, r0: 20, r1: 60, life: .25, max: .25, color: '#d6e2f5', width: 3 }); sfx.play('reflect', at); } break;
        case 'star': if (u) { this.puff(at.x, at.y - 30, 8, '#fff1b8', 'star'); sfx.play('orb', at); } break;
        case 'plant': this.puff(f.x ?? 0, (f.y ?? 0) - 10, 14, '#f7c5d5', 'leaf'); sfx.play('drink', { x: f.x ?? 0, y: f.y ?? 0 }); break;
        case 'respawn': this.rings.push({ x: at.x, y: at.y, r0: 10, r1: 90, life: .6, max: .6, color: TEAM_LIGHT[C.team], width: 4 }); this.puff(at.x, at.y - 30, 12, TEAM_LIGHT[u?.tm ?? C.team], 'star'); break;
        case 'struct': this.shake = 20; this.flash = { color: '#fff4de', a: .22 }; this.zoom = Math.max(this.zoom, .05); break;
        case 'kill':
          if (f.u === C.me?.u) { this.flash = { color: '#ffd35c', a: .28 }; this.hitstop = .1; this.zoom = .08; }
          else if (f.u2 === C.me?.u) { this.flash = { color: '#c81e28', a: .4 }; this.hitstop = .12; }
          break;
        case 'learn': if (u) { this.rings.push({ x: at.x, y: at.y, r0: 10, r1: 70, life: .5, max: .5, color: '#ffe38a', width: 4 }); this.puff(at.x, at.y - 40, 10, '#ffe38a', 'star'); } break;
        case 'upgrade': if (u) { this.rings.push({ x: at.x, y: at.y, r0: 10, r1: 60, life: .45, max: .45, color: '#c9b6ff', width: 3 }); this.puff(at.x, at.y - 40, 8, '#e8dcff', 'star'); } break;
        case 'round': if (f.k === 'fight') { for (const team of [1, 2]) { const [x, y] = C.map.spawn[team]; this.rings.push({ x, y, r0: 20, r1: 160, life: .7, max: .7, color: TEAM_COLOR[team], width: 5 }); } sfx.play('roar'); } break;
      }
    }
  }

  private burst(k: string, x: number, y: number, r: number) {
    const ring = (color: string, width = 5, fill = false, life = .45) => this.rings.push({ x, y, r0: r * .2, r1: r, life, max: life, color, width, fill });
    switch (k) {
      case 'sunfire': ring('#ffb05c', 7, true); this.puff(x, y, 26, '#ff9a3d', 'ember'); this.puff(x, y, 10, '#ffe38a', 'star'); sfx.play('boom', { x, y }, .7); this.shake += 4; break;
      case 'comet': ring('#c9b6ff', 5, true, .35); this.puff(x, y, 12, '#e8dcff', 'star'); sfx.play('boom', { x, y }, .4); break;
      case 'slam': ring('#e0a060', 8, true); this.puff(x, y, 20, '#a8844a', 'smoke'); this.puff(x, y, 14, '#8c8f80', 'shard'); this.shake += 6; break;
      case 'guard': ring('#b8c8e0', 5); this.puff(x, y - 20, 8, '#e8eef8', 'star'); break;
      case 'charge': case 'pounce': ring('#ffd0a0', 4, false, .3); this.puff(x, y, 10, '#d8c4a0', 'smoke'); sfx.play('hit', { x, y }); break;
      case 'frost': case 'frostnova': ring('#9fe4ff', 7, true); this.puff(x, y, 22, '#ffffff', 'snow'); this.puff(x, y, 12, '#d6f4ff', 'shard'); break;
      case 'knives': this.puff(x, y - 20, 6, '#d8d0f0', 'dot'); break;
      case 'stealth': case 'unveil': this.puff(x, y - 20, 18, '#6a5a8a', 'smoke'); break;
      case 'doom': ring('#ff6b9a', 8, true); this.puff(x, y, 22, '#ff6b9a', 'star'); this.puff(x, y, 10, '#2a1838', 'shard'); sfx.play('crit', { x, y }); this.shake += 6; break;
      case 'howl': this.puff(x, y - 10, 14, '#9fe8b0', 'smoke'); break;
      case 'barkskin': ring('#c8a46a', 4, false, .4); this.puff(x, y - 20, 12, '#8fae6a', 'leaf'); break;
      case 'bloomcall': break;
      case 'thud': this.puff(x, y - 14, 6, '#b8ab98', 'smoke'); this.puff(x, y - 14, 5, '#8c8478', 'shard'); break;
      case 'bloom': ring('#9fe8b0', 8, true, .7); this.puff(x, y, 40, '#f7c5d5', 'leaf'); this.puff(x, y, 24, '#b9e27a', 'leaf'); this.puff(x, y, 10, '#fff2a1', 'star'); break;
      case 'shellbreak': this.puff(x, y - 30, 16, '#d6f4ff', 'shard'); sfx.play('reflect', { x, y }); break;
      case 'warden': ring('#c9b6ff', 6, true, .4); this.puff(x, y, 10, '#a78bfa', 'star'); sfx.play('slam', { x, y }, .6); break;
      case 'heal': ring('#8fe08a', 5, true, .45); this.puff(x, y - 20, 12, '#b9f2a0', 'leaf'); this.puff(x, y - 30, 6, '#ffffff', 'star'); break;
      case 'ghost': ring('#e8f4ff', 3, false, .35); this.puff(x, y - 20, 12, '#e8f4ff', 'smoke'); break;
      case 'barrier': ring('#ffe9a8', 6, true, .45); this.puff(x, y - 30, 10, '#fff1b8', 'star'); break;
      default: ring('#fff4de', 4);
    }
  }

  private push(p: Particle) { if (this.particles.length < 500 * this.quality) this.particles.push(p); }
  private puff(x: number, y: number, n: number, color: string, kind: PKind) {
    const count = Math.max(1, Math.round(n * this.quality));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, sp = 40 + Math.random() * 140;
      this.push({ x, y, z: 10 + Math.random() * 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .6, vz: 60 + Math.random() * 140, life: .5 + Math.random() * .4, max: .9, color, size: kind === 'smoke' ? 10 + Math.random() * 8 : 3 + Math.random() * 3, kind, rot: Math.random() * 6, glow: kind === 'star' || kind === 'ember' });
    }
  }
  private text(x: number, y: number, text: string, color: string, size: number) { if (this.texts.length < 60) this.texts.push({ x, y, text, color, life: .9, max: .9, size }); }

  private drawEffects(g: CanvasRenderingContext2D, dt: number) {
    for (const r of this.rings) {
      r.life -= dt;
      const k = Math.max(0, r.life) / r.max, p = 1 - k, rr = r.r0 + (r.r1 - r.r0) * Math.sqrt(p);
      if (r.fill) { g.fillStyle = alpha(r.color, .25 * k); g.beginPath(); g.ellipse(r.x, r.y, rr, rr * .62, 0, 0, TAU); g.fill(); }
      g.strokeStyle = alpha(r.color, k * .9); g.lineWidth = 2 + k * r.width; g.beginPath(); g.ellipse(r.x, r.y, rr, rr * .62, 0, 0, TAU); g.stroke();
      if (k > .6) glow(g, r.x, r.y, rr * .9, r.color, k * .4);
    }
    this.rings = this.rings.filter(r => r.life > 0);
    for (const s of this.streaks) {
      s.life -= dt;
      const a = Math.max(0, s.life / s.max);
      g.strokeStyle = alpha(s.color, a * .8); g.lineWidth = 14 * a; g.lineCap = 'round'; g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke();
    }
    this.streaks = this.streaks.filter(s => s.life > 0);
    const rich = this.quality >= 1;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += dt * 6;
      if (p.kind !== 'snow' && p.kind !== 'shard' && p.kind !== 'ember' && p.kind !== 'leaf') p.vz -= 320 * dt;
      if (p.kind === 'leaf') { p.vz -= 60 * dt; p.vx += Math.sin(p.rot) * 20 * dt; }
      p.vx *= .96; p.vy *= .96;
      if (p.z < 0) { p.z = 0; p.vz *= -.3; }
      const k = Math.max(0, Math.min(1, p.life / p.max * 1.5)), y = p.y - p.z;
      g.globalAlpha = k;
      switch (p.kind) {
        case 'star': if (rich) glow(g, p.x, y, p.size * 4, p.color, k); g.fillStyle = p.color; star4(g, p.x, y, p.size * (.6 + k * .6), p.rot); g.fill(); break;
        case 'leaf': g.save(); g.translate(p.x, y); g.rotate(p.rot); g.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * .8 + .2); ellipse(g, 0, 0, p.size, p.size * .45, p.color); g.restore(); break;
        case 'smoke': g.globalAlpha = k * .45; circle(g, p.x, y, p.size * (1.6 - k * .6), p.color); break;
        case 'shard': { const flip = Math.cos(p.rot * 1.7); g.save(); g.translate(p.x, y); g.rotate(p.rot); g.scale(1, flip * .8 + (flip >= 0 ? .2 : -.2)); g.fillStyle = p.color; g.beginPath(); g.moveTo(-p.size * .6, -p.size * .4); g.lineTo(p.size * .6, -p.size * .2); g.lineTo(-p.size * .1, p.size * .5); g.closePath(); g.fill(); g.restore(); break; }
        case 'ember': if (rich) glow(g, p.x, y, p.size * 3.5 * k + 2, p.color, k); circle(g, p.x, y, p.size * k * .6 + .5, '#fff6d8'); break;
        case 'snow': circle(g, p.x, y, p.size * .8, p.color); break;
        default: if (p.glow && rich) glow(g, p.x, y, p.size * 3, p.color, k); circle(g, p.x, y, p.size * (.4 + k * .6), p.color);
      }
      g.globalAlpha = 1;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  private drawTexts(g: CanvasRenderingContext2D, dt: number) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const t of this.texts) {
      t.life -= dt;
      const k = t.life / t.max, p = 1 - k, y = t.y - p * 40, pop = k > .8 ? 1 + (k - .8) * 2 : 1;
      g.globalAlpha = Math.min(1, k * 2.5);
      g.font = `900 ${Math.round(t.size * pop)}px Nunito, sans-serif`;
      g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = INK; g.strokeText(t.text, t.x, y);
      g.fillStyle = t.color; g.fillText(t.text, t.x, y);
    }
    g.globalAlpha = 1;
    this.texts = this.texts.filter(t => t.life > 0);
  }

  /** The enemies this team can see this frame (null: everything shows, as in a duel). */
  private seen: Set<number> | null = null;
  private isShown(u: ViewUnit) { return !this.seen || !this.client.isEnemy(u) || this.seen.has(u.i); }

  // ───────────────────────────── minimap

  drawMinimap(mc: HTMLCanvasElement) {
    if (!this.ready) return;
    const C = this.client, m = C.map, g = mc.getContext('2d')!;
    const W = mc.width, H = mc.height, sx = W / m.w, sy = H / m.h;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.mini, 0, 0, W, H);
    g.strokeStyle = alpha(this.theme.palette.path, .9); g.lineWidth = Math.max(3, m.laneWidth * sy * .5); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const lane of m.lanes) { g.beginPath(); lane.forEach(([x, y], i) => i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy)); g.stroke(); }
    const dot = (x: number, y: number, r: number, c: string, ring = INK) => { g.fillStyle = ring; g.beginPath(); g.arc(x * sx, y * sy, r + 1.5, 0, TAU); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(x * sx, y * sy, r, 0, TAU); g.fill(); };
    if (this.duel && C.latest) { g.strokeStyle = '#ff9a6b'; g.lineWidth = 2; g.beginPath(); g.ellipse(m.center[0] * sx, m.center[1] * sy, C.latest.rr * sx, C.latest.rr * .95 * sy, 0, 0, TAU); g.stroke(); }
    for (const [x, y] of m.camps) dot(x, y, 3, '#c8a46a');
    if (m.objective) { const [ox, oy] = m.objective; if ((C.latest?.ob ?? 1) === 0) dot(ox, oy, 5, '#c9b6ff'); else dot(ox, oy, 3, '#6a5a8a'); }
    for (const u of C.units.values()) {
      if (u.k === 'tower' || u.k === 'core') { if (!(u.st & ST.dead)) { g.fillStyle = INK; g.fillRect(u.x * sx - 5, u.y * sy - 5, 10, 10); g.fillStyle = TEAM_COLOR[u.tm]; g.fillRect(u.x * sx - 3.5, u.y * sy - 3.5, 7, 7); } continue; }
      if ((u.k === 'melee' || u.k === 'ranged' || u.k === 'heavy') && this.isShown(u)) dot(u.rx, u.ry, 1.8, TEAM_LIGHT[u.tm], 'rgba(0,0,0,0)');
    }
    for (const u of C.units.values()) {
      if (!isHero(u.k) || u.st & ST.dead || !this.isShown(u)) continue;
      const mine = u.i === C.me?.u;
      dot(u.rx, u.ry, mine ? 5.5 : 4.5, mine ? '#ffe38a' : TEAM_COLOR[u.tm], mine ? '#fff' : INK);
    }
    const now = performance.now();
    for (const s of this.signals) {
      const age = (now - s.at) / 1000;
      if (age > 4) continue;
      const look = SIGNAL_LOOK[s.kind] ?? SIGNAL_LOOK.go, p = (age * 1.5) % 1;
      g.strokeStyle = alpha(look.color, 1 - p); g.lineWidth = 2;
      g.beginPath(); g.arc(s.x * sx, s.y * sy, 4 + p * 12, 0, TAU); g.stroke();
      g.fillStyle = look.color; g.beginPath(); g.arc(s.x * sx, s.y * sy, 4, 0, TAU); g.fill();
    }
    const halfW = this.w / 2 / this.scale, halfH = this.h / 2 / this.scale;
    g.strokeStyle = 'rgba(255,244,222,.8)'; g.lineWidth = 1.5;
    g.strokeRect((this.cam.x - halfW) * sx, (this.cam.y - halfH) * sy, halfW * 2 * sx, halfH * 2 * sy);
  }
}

/** Eases 0 → 1 overshooting a little at the end: a pop. */
const backOut = (p: number) => { const c = 1.7, q = Math.min(1, Math.max(0, p)) - 1; return 1 + (c + 1) * q * q * q + c * q * q; };

// ───────────────────────────── structures (original to Mini Rift)

function paintTower(g: CanvasRenderingContext2D, team: number, ruined: boolean, P: Palette) {
  const stone = shade(P.rock, .25), dark = shade(P.rock, -.1), col = TEAM_COLOR[team];
  if (ruined) {
    g.fillStyle = dark; g.beginPath(); g.moveTo(-40, 10); g.lineTo(-36, -30); g.lineTo(-18, -44); g.lineTo(-4, -26); g.lineTo(14, -48); g.lineTo(30, -24); g.lineTo(40, 10); g.closePath(); g.fill();
    for (let i = 0; i < 5; i++) rrect(g, -44 + i * 18, 0 + (i % 2) * 6, 14, 10, 3, stone);
    g.fillStyle = col; g.fillRect(-6, -36, 3, 30); g.beginPath(); g.moveTo(-3, -36); g.lineTo(14, -30); g.lineTo(-3, -24); g.fill();
    return;
  }
  ellipse(g, 0, 6, 46, 16, dark);
  g.fillStyle = stone; g.beginPath(); g.moveTo(-34, 4); g.lineTo(-26, -100); g.lineTo(26, -100); g.lineTo(34, 4); g.quadraticCurveTo(0, 14, -34, 4); g.fill();
  g.fillStyle = shade(stone, -.15); g.beginPath(); g.moveTo(10, -100); g.lineTo(26, -100); g.lineTo(34, 4); g.quadraticCurveTo(22, 9, 12, 10); g.closePath(); g.fill();
  g.strokeStyle = shade(stone, -.28); g.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) { const y = -10 - i * 19; g.beginPath(); g.moveTo(-32 + i * 1.5, y); g.quadraticCurveTo(0, y + 4, 32 - i * 1.5, y); g.stroke(); }
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
