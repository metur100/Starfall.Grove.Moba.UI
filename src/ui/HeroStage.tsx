import { useEffect, useRef } from 'react';
import { Cutter, STICKER } from '../game/art/cutout';
import { drawFigure, FIGURE_BOX, type ArmAction } from '../game/art/rig';
import { heroHooks } from '../game/art/heroes';
import { paintWolf } from '../game/art/animals';
import { skinFigure, skinGear, skinLook } from '../game/skins';
import type { HeroId } from '../game/types';

/** A hero standing on a little paper stage, in a skin if given: idling, and now and then showing off an attack. A
 *  skin's aura glows at the hero's feet and its motes drift up around them. */
export function HeroStage({ hero, skin, size = 220 }: { hero: HeroId; skin?: string | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const g = c.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr; c.height = size * dpr;
    const cutter = new Cutter();
    const fig = skinFigure(hero, skin), gear = skinGear(skin), look = skinLook(skin);
    let raf = 0; const start = performance.now();
    const motes: Array<{ x: number; y: number; v: number; life: number }> = [];
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
      const k = size / 120 * dpr;
      g.setTransform(k, 0, 0, k, c.width / 2, c.height * .8);
      if (look?.aura) {
        const a = .35 + Math.sin(t * 2.4) * .12, gr = g.createRadialGradient(0, 18, 2, 0, 18, 46);
        gr.addColorStop(0, look.aura); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.ellipse(0, 18, 46, 16, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      }
      g.fillStyle = 'rgba(40,24,40,.25)'; g.beginPath(); g.ellipse(4, 24, 30, 9, 0, 0, Math.PI * 2); g.fill();
      if (hero === 'wren') cutter.stamp(g, -34, 12, [-32, -34, 64, 50], k, STICKER, gg => paintWolf(gg, t, 1));
      const cyc = t % 4, acting = cyc > 3, kk = acting ? (cyc - 3) : 0;
      const arm: ArmAction = !acting ? 'idle' : hero === 'kael' ? 'swing' : hero === 'riven' ? 'thrust' : hero === 'wren' ? 'draw' : 'raise';
      cutter.stamp(g, 0, 0, FIGURE_BOX, k, STICKER, gg => drawFigure(gg, fig, { facing: 'front', dir: 1, walk: 0, moving: false, t, arm, k: kk }, heroHooks(hero, gear, acting ? 1 - kk : 0, t, { bowDraw: arm === 'draw' ? 1 - kk : 0 })));
      if (look?.trail || look?.aura) {
        if (Math.random() < .2) motes.push({ x: (Math.random() - .5) * 50, y: 18, v: 14 + Math.random() * 16, life: 1 });
        const col = look.trail?.color ?? look.aura!;
        for (const m of motes) { m.life -= 1 / 60; m.y -= m.v / 60; g.globalAlpha = Math.max(0, m.life) * .9; g.fillStyle = col; g.beginPath(); g.arc(m.x + Math.sin(m.y * .1) * 3, m.y, 1.6, 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1;
        while (motes.length && motes[0].life <= 0) motes.shift();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [hero, skin, size]);
  return <canvas ref={ref} className="hero-stage" style={{ width: size, height: size }} />;
}
