import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Props = { children: ReactNode; className?: string; onBackdrop?: () => void };

/**
 * Fills the screen (or its positioned parent) and shows its content centred: at full size when it fits, scaled down
 * just enough when it doesn't. Screens never scroll, whatever the window or phone. When it scales down it also lays
 * the content out wider (by the same factor), so a short, wide phone screen uses its whole width.
 */
export function Fit({ children, className = '', onBackdrop }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    let s = 1, tries = 0, lastW = 0, lastH = 0;
    const measure = () => {
      // A new window size: start over.
      if (o.clientWidth !== lastW || o.clientHeight !== lastH) { lastW = o.clientWidth; lastH = o.clientHeight; tries = 0; }
      // offsetHeight ignores the transform, so this is the content's natural height at its current (widened) width.
      const h = i.offsetHeight;
      if (!h) return;
      const want = Math.min(1, o.clientHeight / h);
      let next = s;
      if (want < s - .002) next = want; // too tall: shrink to fit
      else if (want > s + .02 && tries++ < 6) next = want > .98 ? 1 : (s + want) / 2; // room to spare: grow a little
      if (next === s) return;
      s = next;
      i.style.width = s < 1 ? `${o.clientWidth / s}px` : '';
      setScale(s);
    };
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(o); ro.observe(i);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className={`fit ${className}`} onClick={onBackdrop ? e => { if (e.target === e.currentTarget || e.target === inner.current) onBackdrop(); } : undefined}>
      <div ref={inner} className="fit-in" style={{ transform: scale < 1 ? `scale(${scale})` : undefined }}>{children}</div>
    </div>
  );
}
