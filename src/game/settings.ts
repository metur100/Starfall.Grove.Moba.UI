// Player settings kept in this browser: graphics quality and vibration. Sound lives with the audio engine.

export type Quality = 'auto' | 'high' | 'low';
type Settings = { quality: Quality; haptics: boolean };

const KEY = 'minirift-settings-v1';
const settings: Settings = (() => {
  const base: Settings = { quality: 'auto', haptics: true };
  try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Settings> | null; if (raw) return { ...base, ...raw }; } catch { /* defaults */ }
  return base;
})();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ } };

export const prefs = {
  get quality() { return settings.quality; },
  set quality(q: Quality) { settings.quality = q; persist(); },
  get haptics() { return settings.haptics; },
  set haptics(v: boolean) { settings.haptics = v; persist(); },
  /** Whether to draw at full detail: chosen, or (auto) guessed from the screen and the processor. */
  rich() {
    if (settings.quality !== 'auto') return settings.quality === 'high';
    return !(Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4);
  },
};

/** A short buzz on phones that can (Android); silently nothing elsewhere. */
export function buzz(pattern: number | number[]) {
  if (!settings.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* not allowed */ }
}
