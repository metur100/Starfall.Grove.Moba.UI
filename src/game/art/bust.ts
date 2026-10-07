// Portraits cut from the same paper figures as the battlefield: head and shoulders of a hero (in a skin, if any),
// rendered once into an image and reused by the menus, the HUD and the scoreboard.
import { Cutter, STICKER } from './cutout';
import { drawFigure } from './rig';
import { heroHooks } from './heroes';
import { skinFigure, skinGear } from '../skins';
import type { HeroId } from '../types';

const cache = new Map<string, string>();
let cutter: Cutter | null = null;

export function heroBust(hero: HeroId, skin?: string | null): string {
  const key = `${hero}|${skin ?? ''}`;
  const hit = cache.get(key); if (hit) return hit;
  if (typeof document === 'undefined') return '';
  cutter ??= new Cutter();
  const S = 160, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const k = 2.9;
  g.translate(S / 2, S * .5 + 27 * k); g.scale(k, k);
  cutter.stamp(g, 0, 0, [-34, -80, 68, 108], k, STICKER, gg => drawFigure(gg, skinFigure(hero, skin), { facing: 'front', dir: 1, walk: 0, moving: false, t: 1.7, arm: 'idle', blink: false }, heroHooks(hero, skinGear(skin), 0, 1.7)));
  const url = c.toDataURL('image/png');
  cache.set(key, url); return url;
}
