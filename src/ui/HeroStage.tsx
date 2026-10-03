import { useEffect, useRef } from 'react';
import { Cutter, STICKER } from '../game/art/cutout';
import { drawFigure, FIGURE_BOX, type ArmAction } from '../game/art/rig';
import { heroFigure, heroHooks } from '../game/art/heroes';
import { paintWolf } from '../game/art/animals';
import type { HeroId } from '../game/types';

/** A hero standing on a little paper stage: idling, and now and then showing off an attack. */
export function HeroStage({ hero, size = 220 }: { hero: HeroId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const g = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const cutter = new Cutter();
    let raf = 0; const start = performance.now();
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
      const k = size / 120 * dpr;
      g.setTransform(k, 0, 0, k, c.width / 2, c.height * .8);
      g.fillStyle = 'rgba(40,24,40,.25)'; g.beginPath(); g.ellipse(4, 24, 30, 9, 0, 0, Math.PI * 2); g.fill();
      if (hero === 'wren') cutter.stamp(g, -34, 12, [-32, -34, 64, 50], k, STICKER, gg => paintWolf(gg, t, 1));
      const cyc = t % 4, acting = cyc > 3, kk = acting ? (cyc - 3) : 0;
      const arm: ArmAction = !acting ? 'idle' : hero === 'kael' ? 'swing' : hero === 'riven' ? 'thrust' : hero === 'wren' ? 'draw' : 'raise';
      cutter.stamp(g, 0, 0, FIGURE_BOX, k, STICKER, gg => drawFigure(gg, heroFigure(hero, {}), { facing: 'front', dir: 1, walk: 0, moving: false, t, arm, k: kk }, heroHooks(hero, {}, acting ? 1 - kk : 0, t, { bowDraw: arm === 'draw' ? 1 - kk : 0 })));
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [hero, size]);
  return <canvas ref={ref} className="hero-stage" style={{ width: size, height: size }} />;
}
