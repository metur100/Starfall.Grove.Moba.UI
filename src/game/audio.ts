// Synthesized sound effects, from Starfall Grove's audio engine (no audio files needed).
export type Sfx =
  | 'spark' | 'sunfire' | 'boom' | 'leaf' | 'shield' | 'reflect' | 'starfall' | 'dash' | 'hit' | 'crit' | 'kill' | 'pickup' | 'key'
  | 'orb' | 'hurt' | 'roar' | 'learn' | 'pod' | 'bossDie' | 'victory' | 'slam' | 'talk' | 'nope' | 'levelUp' | 'chest' | 'quest'
  | 'questDone' | 'discover' | 'drink' | 'rest' | 'page' | 'flap' | 'splash' | 'squeak' | 'thornShot' | 'voidShot' | 'ui' | 'chop' | 'hammer' | 'howl';
type Settings = { master: number; sfx: number; muted: boolean };

const SETTINGS_KEY = 'minirift-audio-v1';
const settings: Settings = (() => {
  const base: Settings = { master: .8, sfx: .8, muted: false };
  try { const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') as Partial<Settings> | null; if (raw) return { ...base, ...raw }; } catch { /* defaults */ }
  return base;
})();
const persist = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } };


type Core = { ac: AudioContext; master: GainNode; sfx: GainNode; reverb: GainNode; white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };
let core: Core | null = null;

function makeNoise(ac: AudioContext, kind: 'white' | 'pink' | 'brown') {
  const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {
      b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856;
      b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
    } else { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
  }
  return buf;
}
function makeImpulse(ac: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ac.sampleRate * seconds), buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return buf;
}

/** Shared audio graph. Created lazily after a user gesture. */
export function audioCore(): Core | null {
  if (!core) {
    try {
      const ac = new AudioContext({ latencyHint: 'interactive' });
      const master = ac.createGain(), comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = .004; comp.release.value = .22;
      master.connect(comp); comp.connect(ac.destination);
      const sfx = ac.createGain(), reverb = ac.createGain();
      const conv = ac.createConvolver(); conv.buffer = makeImpulse(ac, 2.2, 3.2);
      const wet = ac.createGain(); wet.gain.value = .45;
      reverb.connect(conv); conv.connect(wet); wet.connect(master);
      sfx.connect(master);
      core = { ac, master, sfx, reverb, white: makeNoise(ac, 'white'), pink: makeNoise(ac, 'pink'), brown: makeNoise(ac, 'brown') };
      applyVolumes();
    } catch { return null; }
  }
  if (core.ac.state === 'suspended') void core.ac.resume();
  return core;
}
function applyVolumes() {
  if (!core) return;
  const t = core.ac.currentTime;
  core.master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, .05);
  core.sfx.gain.setTargetAtTime(settings.sfx, t, .05);
}

// ───────────────────────────── building blocks
type Out = { node: AudioNode; t: number };
let listener = { x: 0, y: 0 };
let voices = 0;
const MAX_VOICES = 20;

/** Output chain for one sound: optional stereo pan and distance attenuation, plus a reverb send. */
function output(a: Core, vol: number, rev: number, delay = 0, pos?: { x: number; y: number }): Out | null {
  let gain = vol, pan = 0;
  if (pos) {
    const dx = pos.x - listener.x, dy = pos.y - listener.y, d = Math.hypot(dx, dy);
    if (d > 1500) return null;
    gain *= 1 / (1 + (d / 420) ** 2);
    pan = Math.max(-.85, Math.min(.85, dx / 700));
    rev += Math.min(.35, d / 2500);
  }
  if (gain < .002) return null;
  const g = a.ac.createGain(); g.gain.value = gain;
  let node: AudioNode = g;
  if (pan && a.ac.createStereoPanner) { const p = a.ac.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
  node.connect(a.sfx);
  if (rev > 0) { const s = a.ac.createGain(); s.gain.value = rev; node.connect(s); s.connect(a.reverb); }
  return { node: g, t: a.ac.currentTime + delay };
}

type ToneOpts = { type?: OscillatorType; to?: number; vol?: number; delay?: number; attack?: number; detune?: number; vibrato?: number; filter?: number; q?: number };
function tone(o: Out, freq: number, dur: number, { type = 'sine', to, vol = .3, delay = 0, attack = .005, detune = 0, vibrato = 0, filter, q = 1 }: ToneOpts = {}) {
  const a = core!; const t = o.t + delay;
  const osc = a.ac.createOscillator(), g = a.ac.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.detune.value = detune;
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  if (vibrato) { const l = a.ac.createOscillator(), lg = a.ac.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * vibrato; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + .05); }
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  let src: AudioNode = osc;
  if (filter) { const f = a.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; f.Q.value = q; osc.connect(f); src = f; }
  src.connect(g); g.connect(o.node); osc.start(t); osc.stop(t + dur + .05);
}
type NoiseOpts = { vol?: number; freq?: number; to?: number; q?: number; delay?: number; type?: BiquadFilterType; color?: 'white' | 'pink' | 'brown'; attack?: number; rate?: number };
function noise(o: Out, dur: number, { vol = .3, freq = 1200, to, q = .8, delay = 0, type = 'lowpass', color = 'white', attack = .002, rate = 1 }: NoiseOpts = {}) {
  const a = core!; const t = o.t + delay;
  const src = a.ac.createBufferSource(), f = a.ac.createBiquadFilter(), g = a.ac.createGain();
  src.buffer = a[color]; src.playbackRate.value = rate;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (to) f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(o.node);
  src.start(t, Math.random() * 1.5, dur + .1);
}
/** A struck bell / chime: inharmonic partials with long decay. */
function bell(o: Out, freq: number, dur: number, vol = .2, delay = 0) {
  const partials: Array<[number, number]> = [[1, 1], [2.76, .45], [5.4, .25], [8.93, .12]];
  for (const [m, v] of partials) tone(o, freq * m, dur / Math.sqrt(m), { vol: vol * v, delay, attack: .002 });
}
/** A voiced creature cry: buzzy source through two moving formant filters. */
function voice(o: Out, from: number, to: number, dur: number, formants: [number, number], vol = .25, delay = 0, type: OscillatorType = 'sawtooth') {
  const a = core!; const t = o.t + delay;
  const osc = a.ac.createOscillator(), g = a.ac.createGain();
  osc.type = type; osc.frequency.setValueAtTime(from, t); osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  for (const fr of formants) { const f = a.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(fr, t); f.frequency.linearRampToValueAtTime(fr * .8, t + dur); f.Q.value = 6; osc.connect(f); f.connect(g); }
  g.connect(o.node); osc.start(t); osc.stop(t + dur + .05);
}
const r = (a: number, b: number) => a + Math.random() * (b - a);

// ───────────────────────────── the sound library
type Recipe = { vol: number; rev: number; play: (o: Out) => void };
const SOUNDS: Record<Sfx, Recipe> = {
  spark: { vol: .5, rev: .25, play: o => { const f = r(1300, 1600); tone(o, f, .16, { type: 'triangle', to: f * 1.9, vol: .18 }); tone(o, f * 2.01, .12, { vol: .08 }); noise(o, .09, { vol: .12, freq: 6000, type: 'highpass' }); } },
  sunfire: { vol: .7, rev: .3, play: o => { noise(o, .55, { vol: .5, freq: 400, to: 2400, q: 1.2, type: 'bandpass', color: 'pink', attack: .08 }); noise(o, .4, { vol: .25, freq: 900, color: 'brown', attack: .02 }); tone(o, 180, .45, { type: 'sawtooth', to: 90, vol: .08, filter: 700 }); for (let i = 0; i < 5; i++) noise(o, .02, { vol: .2, freq: 3000, type: 'highpass', delay: r(.05, .4) }); } },
  boom: { vol: .9, rev: .45, play: o => { tone(o, 110, .6, { to: 34, vol: .9, attack: .003 }); noise(o, .9, { vol: .8, freq: 1400, to: 90, color: 'brown' }); noise(o, .06, { vol: .5, freq: 2500, type: 'highpass' }); for (let i = 0; i < 6; i++) noise(o, .03, { vol: .18, freq: 2500, type: 'bandpass', q: 3, delay: r(.1, .7) }); } },
  leaf: { vol: .6, rev: .3, play: o => { noise(o, .6, { vol: .45, freq: 600, to: 3200, q: 2, type: 'bandpass', color: 'pink', attack: .12 }); for (let i = 0; i < 14; i++) noise(o, .03, { vol: .16, freq: r(2500, 6000), type: 'bandpass', q: 4, delay: r(0, .5) }); tone(o, 660, .4, { type: 'triangle', vol: .05, delay: .05 }); } },
  shield: { vol: .6, rev: .55, play: o => { [392, 494, 587, 784].forEach((f, i) => bell(o, f, 1.4, .12, i * .05)); noise(o, .7, { vol: .2, freq: 300, to: 1200, type: 'bandpass', q: 3, color: 'pink', attack: .2 }); } },
  reflect: { vol: .5, rev: .35, play: o => { bell(o, 1760, .4, .18); tone(o, 2400, .12, { type: 'square', to: 3600, vol: .04, filter: 5000 }); } },
  starfall: { vol: .65, rev: .7, play: o => { [1568, 1319, 1175, 988, 880, 784].forEach((f, i) => bell(o, f, 1.2, .1, i * .07)); noise(o, 1.2, { vol: .25, freq: 5000, to: 900, type: 'bandpass', q: 1.5, color: 'pink', attack: .3 }); } },
  dash: { vol: .6, rev: .15, play: o => { noise(o, .32, { vol: .6, freq: 500, to: 2600, q: 1.6, type: 'bandpass', color: 'pink', attack: .05 }); noise(o, .22, { vol: .2, freq: 2500, to: 700, type: 'bandpass', q: 1, delay: .12 }); } },
  hit: { vol: .6, rev: .12, play: o => { tone(o, r(160, 200), .12, { to: 70, vol: .5 }); noise(o, .1, { vol: .45, freq: 1800, to: 400, color: 'brown' }); noise(o, .02, { vol: .35, freq: 3000, type: 'highpass' }); } },
  crit: { vol: .7, rev: .2, play: o => { tone(o, 220, .18, { to: 60, vol: .6 }); noise(o, .16, { vol: .5, freq: 2400, to: 500, color: 'pink' }); noise(o, .03, { vol: .5, freq: 4500, type: 'highpass' }); bell(o, 2093, .35, .12, .02); } },
  kill: { vol: .6, rev: .4, play: o => { noise(o, .5, { vol: .4, freq: 3000, to: 400, type: 'bandpass', q: 1.2, color: 'pink' }); [880, 1319, 1760].forEach((f, i) => bell(o, f, .6, .07, .04 + i * .05)); voice(o, r(500, 650), 180, .3, [900, 2200], .08); } },
  pickup: { vol: .5, rev: .35, play: o => { bell(o, 1319, .5, .14); bell(o, 1976, .6, .1, .07); } },
  key: { vol: .7, rev: .6, play: o => { [523, 659, 784, 1047, 1319].forEach((f, i) => bell(o, f, 1.3, .12, i * .08)); noise(o, 1, { vol: .12, freq: 6000, type: 'highpass', attack: .4 }); } },
  orb: { vol: .35, rev: .3, play: o => bell(o, r(1500, 2000), .3, .12) },
  hurt: { vol: .75, rev: .15, play: o => { tone(o, 140, .2, { to: 55, vol: .6 }); noise(o, .18, { vol: .5, freq: 1400, to: 300, color: 'brown' }); voice(o, 330, 210, .22, [800, 1250], .22, .01); } },
  // A wolf's howl: a rising call that holds, wavers and falls away, with a second wolf answering.
  howl: { vol: .6, rev: .8, play: o => { tone(o, 380, .7, { type: 'triangle', to: 560, vol: .45, attack: .2 }); tone(o, 560, 1.6, { type: 'triangle', to: 330, vol: .45, delay: .68, vibrato: 14 }); tone(o, 470, .6, { type: 'sine', to: 640, vol: .18, delay: .5, attack: .2 }); tone(o, 640, 1.3, { type: 'sine', to: 400, vol: .18, delay: 1.08, vibrato: 18 }); noise(o, 2, { vol: .05, freq: 1400, type: 'bandpass', q: 3, attack: .4 }); } },
  roar: { vol: .9, rev: .5, play: o => { voice(o, 95, 60, 1.3, [420, 900], .5, 0); voice(o, 140, 80, 1.1, [600, 1400], .25, .05); noise(o, 1.2, { vol: .4, freq: 500, to: 180, color: 'brown', attack: .15 }); tone(o, 48, 1.2, { vol: .5, attack: .2 }); } },
  learn: { vol: .7, rev: .7, play: o => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => bell(o, f, 1.6, .1, i * .09)); noise(o, 1.4, { vol: .15, freq: 7000, type: 'highpass', attack: .5 }); } },
  pod: { vol: .6, rev: .25, play: o => { noise(o, .12, { vol: .5, freq: 1600, to: 500, q: 2, type: 'bandpass' }); tone(o, 520, .18, { type: 'triangle', to: 240, vol: .15 }); for (let i = 0; i < 6; i++) bell(o, r(2000, 3200), .25, .04, r(.02, .15)); } },
  bossDie: { vol: 1, rev: .8, play: o => { tone(o, 70, 2, { to: 25, vol: .8 }); noise(o, 2.2, { vol: .7, freq: 1800, to: 60, color: 'brown' }); voice(o, 120, 40, 1.8, [500, 1100], .35); [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => bell(o, f, 2, .09, .6 + i * .12)); } },
  victory: { vol: .7, rev: .6, play: o => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => { bell(o, f, 1.1, .1, i * .13); tone(o, f / 2, .5, { type: 'triangle', vol: .05, delay: i * .13 }); }); } },
  slam: { vol: 1, rev: .4, play: o => { tone(o, 75, .7, { to: 28, vol: 1 }); noise(o, .8, { vol: .8, freq: 700, to: 60, color: 'brown' }); for (let i = 0; i < 10; i++) noise(o, .05, { vol: .2, freq: r(800, 2400), type: 'bandpass', q: 3, delay: r(.05, .5), color: 'pink' }); } },
  talk: { vol: .3, rev: .05, play: o => voice(o, r(260, 340), r(220, 300), .07, [r(600, 900), r(1300, 1900)], .3, 0, 'triangle') },
  nope: { vol: .4, rev: .05, play: o => { tone(o, 220, .1, { type: 'square', vol: .1, filter: 1200 }); tone(o, 165, .16, { type: 'square', vol: .1, delay: .09, filter: 1200 }); } },
  levelUp: { vol: .8, rev: .7, play: o => { [392, 494, 587, 784, 988, 1175, 1568].forEach((f, i) => bell(o, f, 1.6, .11, i * .07)); tone(o, 196, 1.4, { type: 'triangle', vol: .12, attack: .05 }); noise(o, 1.4, { vol: .2, freq: 5000, to: 12000, type: 'highpass', attack: .6 }); } },
  chest: { vol: .7, rev: .3, play: o => { voice(o, 90, 140, .45, [500, 1200], .25, 0, 'sawtooth'); noise(o, .08, { vol: .5, freq: 900, color: 'brown', delay: .42 }); [1047, 1319, 1568, 2093].forEach((f, i) => bell(o, f, .8, .09, .5 + i * .06)); } },
  quest: { vol: .6, rev: .5, play: o => { bell(o, 659, 1, .13); bell(o, 988, 1.2, .12, .12); } },
  questDone: { vol: .8, rev: .6, play: o => { [523, 659, 784, 1047].forEach((f, i) => bell(o, f, 1.4, .12, i * .1)); tone(o, 262, 1, { type: 'triangle', vol: .1, delay: .3 }); tone(o, 392, 1, { type: 'triangle', vol: .08, delay: .3 }); } },
  discover: { vol: .6, rev: .7, play: o => { [587, 880, 1175].forEach((f, i) => bell(o, f, 1.8, .1, i * .18)); } },
  drink: { vol: .5, rev: .2, play: o => { for (let i = 0; i < 4; i++) { tone(o, r(300, 500), .08, { to: r(700, 900), vol: .12, delay: i * .14 }); noise(o, .06, { vol: .1, freq: 1200, type: 'bandpass', q: 5, delay: i * .14 }); } } },
  rest: { vol: .5, rev: .6, play: o => { [392, 523, 659].forEach((f, i) => bell(o, f, 1.8, .08, i * .2)); noise(o, 1.4, { vol: .15, freq: 900, color: 'pink', attack: .5 }); } },
  page: { vol: .5, rev: .1, play: o => { noise(o, .18, { vol: .35, freq: 3500, to: 1500, q: 1, type: 'bandpass', color: 'pink', attack: .03 }); noise(o, .1, { vol: .2, freq: 5000, type: 'highpass', delay: .12 }); } },
  flap: { vol: .5, rev: .15, play: o => { for (let i = 0; i < 5; i++) noise(o, .06, { vol: .3 - i * .04, freq: 700, to: 300, q: 1.5, type: 'bandpass', color: 'pink', delay: i * .075 }); } },
  splash: { vol: .5, rev: .25, play: o => { noise(o, .35, { vol: .45, freq: 2500, to: 600, q: .8, color: 'pink' }); for (let i = 0; i < 5; i++) tone(o, r(600, 1400), .06, { to: r(1500, 2500), vol: .06, delay: r(.03, .25) }); } },
  squeak: { vol: .4, rev: .1, play: o => voice(o, r(900, 1200), r(1400, 1800), .12, [1500, 3000], .2, 0, 'triangle') },
  thornShot: { vol: .4, rev: .1, play: o => { noise(o, .12, { vol: .35, freq: 1800, to: 4000, type: 'bandpass', q: 3 }); tone(o, 500, .06, { type: 'triangle', to: 300, vol: .08 }); } },
  voidShot: { vol: .4, rev: .3, play: o => { tone(o, 300, .25, { type: 'sine', to: 900, vol: .15, vibrato: .05 }); noise(o, .2, { vol: .12, freq: 800, to: 2000, type: 'bandpass', q: 4 }); } },
  ui: { vol: .35, rev: .05, play: o => bell(o, 1175, .18, .12) },
  chop: { vol: .5, rev: .2, play: o => { noise(o, .07, { vol: .5, freq: 1400, q: 2, type: 'bandpass', color: 'pink' }); tone(o, 240, .09, { type: 'triangle', to: 150, vol: .2 }); } },
  hammer: { vol: .45, rev: .25, play: o => { bell(o, r(1900, 2300), .35, .12); noise(o, .03, { vol: .4, freq: 4000, type: 'highpass' }); } },
};
const lastPlayed = new Map<Sfx, number>();

export const sfx = {
  /** Plays a sound; with a world position it is panned and quieter the further it is from your hero. */
  play(name: Sfx, pos?: { x: number; y: number }, volume = 1) {
    if (settings.muted) return;
    if (!core && !audioCore()) return;
    if (!core) return;
    const now = performance.now();
    // The same sound at most every 70 ms, and 20 at once: a spell hitting a crowd would otherwise start dozens of voices
    // in one frame, which a phone feels.
    if (now - (lastPlayed.get(name) || 0) < 70) return;
    if (voices >= MAX_VOICES) return;
    lastPlayed.set(name, now);
    try {
      const rec = SOUNDS[name], o = output(core, rec.vol * volume, rec.rev, 0, pos);
      if (!o) return;
      voices++; window.setTimeout(() => { voices--; }, 700);
      rec.play(o);
    } catch { /* audio is optional */ }
  },
  setListener(x: number, y: number) { listener = { x, y }; },
  unlock() { audioCore(); },
  isMuted: () => settings.muted,
  setMuted(value: boolean) { settings.muted = value; persist(); applyVolumes(); },
};
