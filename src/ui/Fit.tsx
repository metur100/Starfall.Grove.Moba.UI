import { useLayoutEffect, useRef, type ReactNode } from 'react';

type Props = { children: ReactNode; className?: string; onBackdrop?: () => void };

/**
 * Fills the screen (or its positioned parent) and shows its content centred: at full size when it fits, scaled down
 * just enough when it doesn't. Screens never scroll, whatever the window or phone. When it scales down it also lays
 * the content out wider (by the same factor), so a short, wide phone screen uses its whole width.
 *
 * The scale is found in one go before the browser paints (after every render, and when the window changes size), so
 * the screen never visibly jumps or flickers while it settles.
 */
export function Fit({ children, className = '', onBackdrop }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const applied = useRef(-1);
  const last = useRef({ w: 0, h: 0, content: 0 });

  const fit = () => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const W = o.clientWidth, H = o.clientHeight;
    if (!W || !H) return;
    // Nothing changed since the last fit (the usual case when the screen re-renders): keep it.
    const l = last.current;
    if (l.w === W && l.h === H && l.content === i.offsetHeight) return;
    // Laid out at width W / s, does the content fit in H once scaled by s? (Reading offsetHeight lays it out now.)
    const fits = (s: number) => { i.style.width = s < 1 ? `${W / s}px` : ''; return i.offsetHeight * s <= H + .5; };
    let s = 1;
    if (!fits(1)) {
      let lo = .25, hi = 1;
      for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      s = lo;
      fits(s);
    }
    last.current = { w: W, h: H, content: i.offsetHeight };
    if (Math.abs(s - applied.current) < .002) return;
    applied.current = s;
    i.style.transform = s < 1 ? `scale(${s})` : '';
  };

  // After every render: the content may have changed size.
  useLayoutEffect(fit);
  // The window changing size, and web fonts arriving late.
  useLayoutEffect(() => {
    const o = outer.current;
    if (!o) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(o);
    void document.fonts?.ready.then(() => fit());
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={outer} className={`fit ${className}`} onClick={onBackdrop ? e => { if (e.target === e.currentTarget || e.target === inner.current) onBackdrop(); } : undefined}>
      <div ref={inner} className="fit-in">{children}</div>
    </div>
  );
}
