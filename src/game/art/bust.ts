// Portraits cut from the same paper figures as the battlefield: head and shoulders of a hero, rendered once into an
// image and reused by the hero select screen, the HUD and the scoreboard.
import { Cutter, STICKER } from './cutout';
import { drawFigure } from './rig';
import { heroFigure, heroHooks } from './heroes';
import type { HeroId } from '../types';

const cache = new Map<string, string>();
let cutter: Cutter | null = null;

export function heroBust(hero: HeroId): string {
  const hit = cache.get(hero); if (hit) return hit;
  if (typeof document === 'undefined') return '';
  cutter ??= new Cutter();
  const S = 160, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const k = 2.9;
  g.translate(S / 2, S * .5 + 27 * k); g.scale(k, k);
  cutter.stamp(g, 0, 0, [-34, -80, 68, 108], k, STICKER, gg => drawFigure(gg, heroFigure(hero, {}), { facing: 'front', dir: 1, walk: 0, moving: false, t: 1.7, arm: 'idle', blink: false }, heroHooks(hero, {}, 0, 1.7)));
  const url = c.toDataURL('image/png');
  cache.set(hero, url); return url;
}
