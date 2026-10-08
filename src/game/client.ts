import { ST, type Fx, type MapData, type MatchHero, type MatchInit, type Me, type ServerObstacle, type Snapshot, type UnitSnap } from '../net/protocol';

// What the client knows about a running match. The server is the authority: other units are drawn a little in the
// past, smoothly between the last two snapshots, and only the player's own hero is predicted ahead (so moving feels
// instant) and gently pulled back toward where the server says it is.

/** How far behind the server other units are drawn, so there are always two snapshots to blend between. */
const INTERP_DELAY = .11;

export type ViewUnit = UnitSnap & {
  /** Drawn position. */
  rx: number; ry: number;
  /** Seconds of walking (for the stride) and whether it moved this frame. */
  walk: number; moving: boolean;
  /** Last attack or cast: when (client seconds), what, and toward where. */
  actT: number; act: string; ax: number; ay: number;
  /** A windup under way (for the cast bar): when it started, how long it takes, and what is being cast. */
  castT: number; castDur: number; castK: string;
  /** When a Doom Sigil was first seen on it. */
  markAt: number;
  /** Damage flash. */
  hurtT: number;
};

type Stored = { s: Snapshot; at: number };

export class MatchClient {
  readonly init: MatchInit;
  readonly map: MapData;
  readonly team: number;
  readonly heroes = new Map<number, MatchHero>();
  me: Me | null = null;
  latest: Snapshot | null = null;
  readonly units = new Map<number, ViewUnit>();
  /** Effects not yet handed to the renderer and HUD. */
  readonly fx: Fx[] = [];
  /** The player's own hero, predicted. */
  pred = { x: 0, y: 0, ok: false };
  private snaps: Stored[] = [];
  private offset = NaN;
  lastSnapAt = 0;
  private grid = new Map<string, ServerObstacle[]>();
  now = 0;

  constructor(init: MatchInit) {
    this.init = init;
    this.map = init.map;
    this.team = init.team;
    for (const h of init.heroes) this.heroes.set(h.u, h);
    for (const o of init.map.obstacles) {
      const key = `${Math.floor(o.x / 160)},${Math.floor(o.y / 160)}`;
      let list = this.grid.get(key);
      if (!list) this.grid.set(key, list = []);
      list.push(o);
    }
  }

  get myUnitId() { return this.init.heroes.find(h => h.playerId === this.init.you)?.u ?? 0; }

  onSnapshot(s: Snapshot, me: Me) {
    const at = performance.now() / 1000;
    const sample = at - s.t;
    // The offset between our clock and the server's: track the smallest delay seen, drifting slowly so a clock that
    // wanders doesn't break it.
    if (Number.isNaN(this.offset) || sample < this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * .02;
    this.snaps.push({ s, at });
    if (this.snaps.length > 12) this.snaps.shift();
    this.latest = s;
    this.me = me;
    this.lastSnapAt = at;
    for (const f of s.fx) this.fx.push(f);
    for (const f of s.fx) {
      if ((f.e === 'atk' || f.e === 'cast') && f.u != null) {
        const v = this.units.get(f.u);
        if (v) {
          v.actT = this.now; v.act = f.k || ''; v.ax = f.x ?? v.x; v.ay = f.y ?? v.y;
          if ((f.v ?? 0) >= 200) { v.castT = this.now; v.castDur = (f.v ?? 0) / 1000; v.castK = f.k || ''; }
        }
      }
      if (f.e === 'dmg' && f.u != null && (f.v ?? 0) > 0) { const v = this.units.get(f.u); if (v) v.hurtT = this.now; }
      if (f.e === 'respawn' && f.u === me.u) this.pred.ok = false;
      if (f.e === 'blink' && f.u === me.u) this.pred.ok = false;
    }
    if (!this.pred.ok) {
      const mine = s.u.find(u => u.i === me.u);
      if (mine) this.pred = { x: mine.x, y: mine.y, ok: true };
    }
  }

  /** Advances the view: blends other units and moves the predicted hero by the player's input. */
  update(dt: number, move: { x: number; y: number }, ping: number) {
    this.now += dt;
    if (this.snaps.length === 0) return;
    const t = performance.now() / 1000 - this.offset - INTERP_DELAY;
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = 0; i < this.snaps.length - 1; i++) {
      if (this.snaps[i].s.t <= t && this.snaps[i + 1].s.t >= t) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    }
    const span = b.s.t - a.s.t, k = span > 0 ? Math.max(0, Math.min(1, (t - a.s.t) / span)) : 1;
    const before = new Map(a.s.u.map(u => [u.i, u]));
    const seen = new Set<number>();
    for (const u of b.s.u) {
      seen.add(u.i);
      const p = before.get(u.i);
      let x = u.x, y = u.y;
      // Blend unless it jumped (a respawn, a blink): then show it where it is now.
      if (p && Math.abs(p.x - u.x) + Math.abs(p.y - u.y) < 220) { x = p.x + (u.x - p.x) * k; y = p.y + (u.y - p.y) * k; }
      let v = this.units.get(u.i);
      if (!v) { v = { ...u, rx: x, ry: y, walk: 0, moving: false, actT: -9, act: '', ax: x, ay: y, hurtT: -9, castT: -9, castDur: 0, castK: '', markAt: -9 }; this.units.set(u.i, v); }
      const dx = x - v.rx, dy = y - v.ry, moved = Math.hypot(dx, dy);
      Object.assign(v, u);
      if (u.st & ST.marked) { if (v.markAt < 0) v.markAt = this.now; } else v.markAt = -9;
      // A stun breaks a windup.
      if (u.st & ST.stun) v.castT = -9;
      v.moving = moved > 20 * dt;
      if (v.moving) v.walk += dt * 10;
      v.rx = x; v.ry = y;
    }
    for (const id of [...this.units.keys()]) if (!seen.has(id)) this.units.delete(id);

    // Our own hero: move by input now, then ease toward the server's position (projected ahead by the round trip).
    const me = this.me, mine = this.units.get(me?.u ?? -1), latestMine = this.latest?.u.find(u => u.i === me?.u);
    if (!me || !mine || !latestMine) return;
    const blocked = ST.stun | ST.root | ST.shell | ST.dashing | ST.casting | ST.dead;
    if (latestMine.st & ST.dead) { this.pred = { x: latestMine.x, y: latestMine.y, ok: true }; }
    else {
      if (!this.pred.ok) this.pred = { x: latestMine.x, y: latestMine.y, ok: true };
      const len = Math.hypot(move.x, move.y);
      if (len > .01 && !(latestMine.st & blocked)) {
        const s = Math.min(1, len);
        this.pred.x += move.x / len * s * me.sp * dt;
        this.pred.y += move.y / len * s * me.sp * dt;
        this.collide(this.pred, 24);
      }
      const lead = Math.max(0, Math.min(.3, ping / 2000 + (performance.now() / 1000 - this.lastSnapAt)));
      const tx = latestMine.x + me.vx * lead, ty = latestMine.y + me.vy * lead;
      const ex = tx - this.pred.x, ey = ty - this.pred.y, err = Math.hypot(ex, ey);
      if (err > 180 || latestMine.st & ST.dashing) { this.pred.x = latestMine.x; this.pred.y = latestMine.y; }
      else { const c = Math.min(1, dt * (len > .01 ? 4 : 9)); this.pred.x += ex * c; this.pred.y += ey * c; }
    }
    const dx = this.pred.x - mine.rx, dy = this.pred.y - mine.ry;
    mine.moving = Math.hypot(dx, dy) > 1 && Math.hypot(move.x, move.y) > .01;
    if (mine.moving) { mine.f = Math.atan2(move.y, move.x) * 180 / Math.PI; }
    mine.rx = this.pred.x; mine.ry = this.pred.y;
  }

  private collide(p: { x: number; y: number }, r: number) {
    const cx = Math.floor(p.x / 160), cy = Math.floor(p.y / 160);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (const o of this.grid.get(`${gx},${gy}`) || []) {
        const min = r + o.r * .8, dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
        if (d < min && d > .01) { p.x = o.x + dx / d * min; p.y = o.y + dy / d * min; }
      }
    }
    for (const u of this.units.values()) {
      if ((u.k !== 'tower' && u.k !== 'core') || u.st & ST.dead || u.hp <= 0) continue;
      const min = r + (u.k === 'core' ? 70 : 46), dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
      if (d < min && d > .01) { p.x = u.x + dx / d * min; p.y = u.y + dy / d * min; }
    }
    p.x = Math.max(50, Math.min(this.map.w - 50, p.x));
    p.y = Math.max(50, Math.min(this.map.h - 50, p.y));
  }

  /** Whether nothing blocks the straight line between two points, as the server decides it: stones, pillars and tree
   *  trunks block sight (pools don't). */
  sees(ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
    if (lenSq < 1) return true;
    const steps = Math.floor(Math.sqrt(lenSq) / 120) + 1;
    for (let i = 0; i <= steps; i++) {
      const px = ax + dx * i / steps, py = ay + dy * i / steps;
      const cx = Math.floor(px / 160), cy = Math.floor(py / 160);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const o of this.grid.get(`${gx},${gy}`) || []) {
          if (o.k === 'pool') continue;
          const r = o.r * .7, k = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.y - ay) * dy) / lenSq));
          const qx = ax + dx * k - o.x, qy = ay + dy * k - o.y;
          if (qx * qx + qy * qy < r * r) return false;
        }
      }
    }
    return true;
  }

  takeFx() { return this.fx.splice(0); }
  hero(uid: number) { return this.heroes.get(uid); }
  myUnit() { return this.units.get(this.me?.u ?? -1); }
  isEnemy(u: { tm: number }) { return u.tm !== 0 && u.tm !== this.team; }

  /**
   * Fog of war: the enemy units this team can see right now. An enemy hero or minion shows only while one of the
   * team's heroes, minions, towers or its Core is close enough to see it; towers and Cores always show. Null in a
   * duel (a small arena: nothing to hide).
   */
  vision(): Set<number> | null {
    if (this.map.type === 'duel') return null;
    const eyes: Array<[number, number, number]> = [];
    for (const u of this.units.values()) {
      if (u.tm !== this.team || u.st & ST.dead) continue;
      const r = this.heroes.has(u.i) ? SIGHT.hero : SIGHT[u.k] ?? SIGHT.other;
      eyes.push([u.rx, u.ry, r * r]);
    }
    const seen = new Set<number>();
    for (const u of this.units.values()) {
      if (!this.isEnemy(u)) continue;
      if (u.k === 'tower' || u.k === 'core') { seen.add(u.i); continue; }
      for (const [x, y, r2] of eyes) { const dx = u.rx - x, dy = u.ry - y; if (dx * dx + dy * dy <= r2) { seen.add(u.i); break; } }
    }
    return seen;
  }
}

/** How far each kind of unit sees, in world units (heroes: SIGHT.hero; summons and the rest: SIGHT.other). */
const SIGHT: Record<string, number> = { hero: 760, tower: 800, core: 900, melee: 520, ranged: 560, heavy: 520, other: 420 };
