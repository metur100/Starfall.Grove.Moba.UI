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

/** The Mini Rift app (iOS and Android) offers real haptics to the page; in a browser there is only `vibrate`. */
type AppBridge = { platform?: string; haptic?: (kind: 'light' | 'medium' | 'heavy' | 'success' | 'error') => void };
const app = () => (window as unknown as { MiniRiftApp?: AppBridge }).MiniRiftApp;

/** A short buzz: through the app's haptics when inside it, else on phones that can vibrate (Android browsers). */
export function buzz(pattern: number | number[]) {
  if (!settings.haptics) return;
  const a = app();
  if (a?.haptic) {
    const total = Array.isArray(pattern) ? pattern.reduce((s, v, i) => s + (i % 2 ? 0 : v), 0) : pattern;
    a.haptic(Array.isArray(pattern) && pattern.length >= 5 ? 'success' : total >= 150 ? 'heavy' : total >= 50 ? 'medium' : 'light');
    return;
  }
  try { navigator.vibrate?.(pattern); } catch { /* not allowed */ }
}
