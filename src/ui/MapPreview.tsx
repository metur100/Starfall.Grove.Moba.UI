import { useEffect, useState } from 'react';
import { API_URL } from '../net/connection';
import { paletteOf, TEAM_COLOR } from '../game/render';

/** A map's layout as the server sends it for previews (whole map units). */
type Preview = {
  id: string; theme: string; type: 'battle' | 'duel'; w: number; h: number; laneWidth: number; lanes: [number, number][][];
  obstacles: [number, number, number, number][]; cores: [number, number, number][]; towers: [number, number, number][];
  camps: [number, number][]; objective: [number, number] | null; center: [number, number]; arenaRadius: number;
};

// Fetched once for all maps, then each preview is drawn once and kept as an image.
let previews: Promise<Record<string, Preview>> | null = null;
const load = () => previews ??= fetch(`${API_URL}/api/maps/preview`).then(r => r.json() as Promise<Preview[]>)
  .then(list => Object.fromEntries(list.map(p => [p.id, p]))).catch((): Record<string, Preview> => { previews = null; return {}; });
const images = new Map<string, string>();

const W = 240, H = 120;
function draw(p: Preview): string {
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d')!, pal = paletteOf(p.theme);
  g.scale(2, 2);
  g.fillStyle = pal.ground; g.fillRect(0, 0, W, H);
  // The whole map, fitted inside the card and centred.
  const s = Math.min(W / p.w, H / p.h) * .94, ox = (W - p.w * s) / 2, oy = (H - p.h * s) / 2;
  const X = (x: number) => ox + x * s, Y = (y: number) => oy + y * s;
  g.fillStyle = pal.alternate; g.beginPath(); g.roundRect(X(0), Y(0), p.w * s, p.h * s, 8); g.fill();
  if (p.type === 'duel') {
    g.fillStyle = pal.path; g.beginPath(); g.ellipse(X(p.center[0]), Y(p.center[1]), p.arenaRadius * s, p.arenaRadius * s * .95, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = pal.pathEdge; g.lineWidth = 2; g.stroke();
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [col, wid] of [[pal.pathEdge, p.laneWidth * s * .62], [pal.path, p.laneWidth * s * .5]] as const) {
    g.strokeStyle = col; g.lineWidth = Math.max(2, wid);
    for (const lane of p.lanes) { g.beginPath(); lane.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.stroke(); }
  }
  for (const [x, y, r, pool] of p.obstacles) {
    g.fillStyle = pool ? pal.water : pal.foliage[(x + y) % pal.foliage.length];
    g.beginPath(); g.arc(X(x), Y(y), Math.max(1.4, r * s * .8), 0, Math.PI * 2); g.fill();
  }
  const dot = (x: number, y: number, r: number, fill: string) => { g.fillStyle = '#2f2330'; g.beginPath(); g.arc(X(x), Y(y), r + 1.2, 0, Math.PI * 2); g.fill(); g.fillStyle = fill; g.beginPath(); g.arc(X(x), Y(y), r, 0, Math.PI * 2); g.fill(); };
  for (const [x, y] of p.camps) dot(x, y, 2.2, '#c8a46a');
  if (p.objective) dot(p.objective[0], p.objective[1], 3.4, '#c9b6ff');
  for (const [x, y, t] of p.towers) { g.fillStyle = '#2f2330'; g.fillRect(X(x) - 3.4, Y(y) - 3.4, 6.8, 6.8); g.fillStyle = TEAM_COLOR[t]; g.fillRect(X(x) - 2.2, Y(y) - 2.2, 4.4, 4.4); }
  for (const [x, y, t] of p.cores) dot(x, y, 4.6, TEAM_COLOR[t]);
  return c.toDataURL('image/png');
}

/** A small drawing of a map: its lanes, trees and rocks, towers, Cores, camps and the Warden. */
export function MapPreview({ id }: { id: string }) {
  const [src, setSrc] = useState(() => images.get(id) ?? '');
  useEffect(() => {
    if (images.has(id)) { setSrc(images.get(id)!); return; }
    let live = true;
    void load().then(all => { const p = all[id]; if (!p || !live) return; const url = draw(p); images.set(id, url); setSrc(url); });
    return () => { live = false; };
  }, [id]);
  return src ? <img className="map-preview" src={src} alt="" width={W} height={H} /> : <span className="map-preview empty" />;
}
