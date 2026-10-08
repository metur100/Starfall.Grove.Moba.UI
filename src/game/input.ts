import { net } from '../net/connection';
import { ST, type AbilityDef, type HeroDef } from '../net/protocol';
import type { MatchClient } from './client';
import type { Renderer } from './render';
import { isHero } from './heroes';

// Turns keys, mouse and touch into intentions for the server: which way to walk, whether to attack, what to cast where.
//
// PC: WASD or arrows to walk (or right-click to walk to a spot), Space or left mouse to attack, Q E R F (or 1–4) to
// cast at the mouse, C for the charm, H to recall. Phone: a thumbstick anywhere on the left half; tap an ability to
// cast it at the best target in range, or drag from it to aim, and let go to cast (or drop it on ✕ to cancel).

export const CAST_KEYS: Record<string, number> = { q: 1, e: 2, r: 3, f: 4, '1': 1, '2': 2, '3': 3, '4': 4 };
export const KEY_LABELS = ['Space', 'Q', 'E', 'R', 'F', 'C'];
/** The charm is aimed and cast like a sixth ability. */
export const CHARM_SLOT = 5;
const CHARM_DEF: AbilityDef = { id: 'charm', name: 'Charm', slot: CHARM_SLOT, cooldown: 0, cost: 0, range: 260, radius: 0, power: 0, duration: 0, cc: 0, speed: 0, windup: 0, target: 'point', toggle: false, effects: '' };

export class Input {
  private keys = new Set<string>();
  stick = { x: 0, y: 0 };
  attackHeld = false;
  private mouseAttack = false;
  private mouse: { x: number; y: number } | null = null;
  private aiming: { slot: number; dx: number; dy: number } | null = null;
  private detach: Array<() => void> = [];
  onError: (msg: string) => void = () => {};
  onUpgradeKey: () => void = () => {};
  onLearn: (slot: number) => void = () => {};
  onScoreKey: (down: boolean) => void = () => {};
  onChatKey: () => void = () => {};
  /** The last direction the player walked in, for a tapped Flash. */
  private lastMove = { x: 0, y: 0 };

  private client: MatchClient;
  private renderer: Renderer;
  private hero: HeroDef;

  constructor(client: MatchClient, renderer: Renderer, hero: HeroDef) {
    this.client = client;
    this.renderer = renderer;
    this.hero = hero;
  }

  attach(canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.detach.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', e => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); this.onScoreKey(true); return; }
      if (k === 'enter') { e.preventDefault(); this.keys.clear(); this.onChatKey(); return; }
      if (k === 'b' || k === 'u') { this.onUpgradeKey(); return; }
      if (k === ' ') e.preventDefault();
      const atMouse = () => this.mouse ? this.renderer.screenToWorld(this.mouse.x, this.mouse.y) : undefined;
      if (!e.repeat && CAST_KEYS[k]) { this.cast(CAST_KEYS[k], atMouse()); return; }
      if (!e.repeat && k === 'c') { this.cast(CHARM_SLOT, atMouse()); return; }
      if (!e.repeat && k === 'h') { void this.recall(); return; }
      this.keys.add(k);
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) this.renderer.moveTarget = null;
    });
    on(window, 'keyup', e => { const k = e.key.toLowerCase(); this.keys.delete(k); if (k === 'tab') this.onScoreKey(false); });
    on(window, 'blur', () => { this.keys.clear(); this.mouseAttack = false; });
    on(canvas, 'mousemove', e => { const r = canvas.getBoundingClientRect(); this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    on(canvas, 'mouseleave', () => { this.mouse = null; this.mouseAttack = false; });
    on(canvas, 'mousedown', e => {
      const r = canvas.getBoundingClientRect();
      const w = this.renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      if (e.button === 2) this.renderer.moveTarget = w;
      if (e.button === 0) this.mouseAttack = true;
    });
    on(window, 'mouseup', e => { if (e.button === 0) this.mouseAttack = false; });
    on(canvas, 'contextmenu', e => e.preventDefault());
  }

  dispose() { this.detach.forEach(d => d()); this.detach = []; }

  /** Called every frame: works out the movement and sends it. Returns the movement for prediction. */
  update(): { x: number; y: number } {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; }
    else if (this.stick.x || this.stick.y) { x = this.stick.x; y = this.stick.y; this.renderer.moveTarget = null; }
    else if (this.renderer.moveTarget) {
      const me = this.client.myUnit(), t = this.renderer.moveTarget;
      if (me) {
        const dx = t.x - me.rx, dy = t.y - me.ry, d = Math.hypot(dx, dy);
        if (d < 18) this.renderer.moveTarget = null; else { x = dx / d; y = dy / d; }
      }
    }
    const attack = this.attackHeld || this.mouseAttack || k.has(' ');
    net.input(x, y, attack);
    if (x || y) this.lastMove = { x, y };
    // Keep the aim preview following the drag.
    if (this.aiming) this.renderer.aim = this.preview(this.aiming.slot, this.aimPoint(this.aiming.slot, this.aiming.dx, this.aiming.dy));
    return { x, y };
  }

  def(slot: number): AbilityDef {
    if (slot !== CHARM_SLOT) return this.hero.abilities[slot];
    // Only Flash goes somewhere; the other charms are cast on yourself.
    return this.charmId() === 'flash' ? CHARM_DEF : { ...CHARM_DEF, range: 0, target: 'self' };
  }
  charmId() { return this.client.me?.ch ?? 'flash'; }

  // ───────────────────────────── touch aiming (driven by the ability buttons)

  beginAim(slot: number) {
    const aimable = this.learned(slot) && (slot !== CHARM_SLOT || this.charmId() === 'flash');
    this.aiming = aimable ? { slot, dx: 0, dy: 0 } : null;
    if (!this.aiming) void this.cast(slot);
  }
  /** dx, dy: the drag from the button, -1…1 of its reach. */
  moveAim(dx: number, dy: number) { if (this.aiming) { this.aiming.dx = dx; this.aiming.dy = dy; } }
  endAim(cancel: boolean) {
    const a = this.aiming; this.aiming = null; this.renderer.aim = null;
    if (!a || cancel) return;
    const dragged = Math.hypot(a.dx, a.dy) > .18;
    this.cast(a.slot, dragged ? this.aimPoint(a.slot, a.dx, a.dy) : undefined);
  }

  private aimPoint(slot: number, dx: number, dy: number) {
    const me = this.client.myUnit(), d = this.def(slot);
    if (!me) return { x: 0, y: 0 };
    const len = Math.min(1, Math.hypot(dx, dy));
    if (len < .18) return this.autoAim(slot);
    const reach = Math.max(d.range, d.radius, 150);
    const dist = d.target === 'direction' ? reach : reach * Math.max(.2, len);
    return { x: me.rx + dx / (Math.hypot(dx, dy) || 1) * dist, y: me.ry + dy / (Math.hypot(dx, dy) || 1) * dist };
  }

  private preview(slot: number, p: { x: number; y: number }) {
    const d = this.def(slot);
    return { x: p.x, y: p.y, range: d.target === 'self' ? 0 : d.range, radius: d.radius, target: d.target, valid: true };
  }

  /** The best place to cast an ability when the player just taps it. */
  autoAim(slot: number): { x: number; y: number } {
    const C = this.client, me = C.myUnit(), d = this.def(slot);
    if (!me) return { x: 0, y: 0 };
    const range = Math.max(d.range, d.radius, 200);
    if (d.target === 'self') return { x: me.rx, y: me.ry };
    // A tapped Flash goes the way the hero is walking (or facing).
    if (slot === CHARM_SLOT) {
      const m = this.lastMove, mv = Math.hypot(m.x, m.y) > .1 && (this.stick.x || this.stick.y || this.keys.size) ? m : null, a = me.f * Math.PI / 180;
      const dx = mv ? m.x / Math.hypot(m.x, m.y) : Math.cos(a), dy = mv ? m.y / Math.hypot(m.x, m.y) : Math.sin(a);
      return { x: me.rx + dx * d.range, y: me.ry + dy * d.range };
    }
    if (d.target === 'ally') {
      let best = me, score = me.hp / me.mh;
      for (const u of C.units.values()) {
        if (u.tm !== C.team || !isHero(u.k) || u.st & ST.dead) continue;
        if (Math.hypot(u.rx - me.rx, u.ry - me.ry) > range) continue;
        const s = u.hp / u.mh; if (s < score) { score = s; best = u; }
      }
      return { x: best.rx, y: best.ry };
    }
    let best: { x: number; y: number } | null = null, bestScore = Infinity;
    for (const u of C.units.values()) {
      if (!C.isEnemy(u) || u.st & ST.dead || u.k === 'fenn' || u.k === 'wolf') continue;
      if ((u.k === 'tower' || u.k === 'core') && d.target === 'enemy') continue;
      const dist = Math.hypot(u.rx - me.rx, u.ry - me.ry);
      if (dist > range + 60) continue;
      // Prefer what we can see: a stone in between blocks the spell.
      const hidden = u.k !== 'tower' && u.k !== 'core' && !C.sees(me.rx, me.ry, u.rx, u.ry);
      const s = dist + (isHero(u.k) ? -1000 : u.k === 'tower' || u.k === 'core' ? 500 : 0) + (hidden ? 5000 : 0);
      if (s < bestScore) { bestScore = s; best = { x: u.rx, y: u.ry }; }
    }
    if (!best) {
      for (const u of C.units.values()) {
        if (u.tm !== 0 || u.st & ST.dead) continue;
        const dist = Math.hypot(u.rx - me.rx, u.ry - me.ry);
        if (dist < range && dist < bestScore) { bestScore = dist; best = { x: u.rx, y: u.ry }; }
      }
    }
    if (best) return best;
    const a = me.f * Math.PI / 180;
    return { x: me.rx + Math.cos(a) * range * .7, y: me.ry + Math.sin(a) * range * .7 };
  }

  /** Whether the hero has learned this ability yet (battles: one per level). */
  learned(slot: number) { const me = this.client.me; return !me || slot === 0 || slot === CHARM_SLOT || !!(me.ln & (1 << slot)); }

  async recall() {
    const err = await net.recall();
    if (err) this.onError(err);
  }

  async cast(slot: number, at?: { x: number; y: number }) {
    if (slot === CHARM_SLOT) {
      const p = at && this.def(slot).target !== 'self' ? at : this.autoAim(slot);
      const err = await net.charm(p.x, p.y);
      if (err) this.onError(err);
      return;
    }
    // Not learned yet: spend a spell point on it, if there is one.
    if (!this.learned(slot)) {
      const me = this.client.me!;
      if (me.lp <= 0) { this.onError('unlearned'); return; }
      const err = await net.learn(slot);
      if (err) this.onError(err); else this.onLearn(slot);
      return;
    }
    const p = at ?? this.autoAim(slot);
    const err = await net.cast(slot, p.x, p.y);
    if (err) this.onError(err);
  }
}
