import type { AbilityDef, HeroDef, Me } from '../net/protocol';

// What an upgrade changes, in numbers ("Damage 182 → 218"), computed the way the server does (Catalog.cs Mods and
// Hero.ModsFor), for the hero's current level and upgrades.

export type Change = { label: string; from: string; to: string };

type Mods = { power: number; cd: number; reach: number; dur: number; cost: number };

function modsOf(a: AbilityDef, picks: string[]): Mods {
  const m: Mods = { power: 1, cd: 1, reach: 1, dur: 1, cost: 1 };
  for (const p of picks)
    switch (p) {
      case 'power20': m.power *= 1.2; break;
      case 'power30': m.power *= 1.3; break;
      case 'dmg15': m.power *= 1.15; break;
      case 'dmg20': m.power *= 1.2; break;
      case 'haste15': m.cd *= .85; break;
      case 'aspd15': m.cd /= 1.15; break;
      case 'reach20': m.reach *= 1.2; break;
      case 'endure35': m.dur *= 1.35; break;
      case 'flow': m.cost *= .6; m.cd *= .9; break;
    }
  if (a.slot > 0) {
    if (picks.includes('reach20') && noReach(a)) { m.reach = 1; m.power *= 1.15; }
    if (picks.includes('endure35') && noDuration(a)) { m.dur = 1; m.power *= 1.15; }
  }
  return m;
}
const noReach = (a: AbilityDef) => a.range <= 0 && a.radius <= 0;
const noDuration = (a: AbilityDef) => (a.duration <= 0 && a.cc <= 0) || a.id === 'deathmark';

/** What "power" means for each ability that isn't plain damage. */
const POWER_LABEL: Record<string, string> = {
  gravity: 'Damage per pulse', blizzard: 'Damage per pulse', bladestorm: 'Damage per spin hit', grove: 'Healing per pulse',
  iceBlock: 'Healing', barkskin: 'Shield', starguard: 'Star damage', wildcall: 'Wolf bite', awakening: 'Healing',
  shadowstep: 'Next hit', stealth: 'Next hit', guard: 'Shove damage',
};
const levelScale = (lv: number) => 1 + .06 * (lv - 1);
const f0 = (v: number) => String(Math.round(v));
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const sec = (v: number) => `${f1(v)}s`;

function powerText(a: AbilityDef, power: number) {
  if (a.id === 'shadowstep' || a.id === 'stealth') return `×${(Math.round(power * 100) / 100).toFixed(2)} crit`;
  return f0(power);
}

/** The changes picking <paramref name="option"/> would make to ability <paramref name="slot"/>. */
export function describeUpgrade(def: HeroDef, me: Me, slot: number, option: string, maxHp: number): Change[] {
  const a = def.abilities[slot];
  const picks = me.up[slot] ?? [];
  const now = modsOf(a, picks), next = modsOf(a, [...picks, option]);
  const out: Change[] = [];
  const power = (m: Mods) => slot === 0 ? me.ad / now.power * m.power : a.power * m.power * levelScale(me.lv);

  if (next.power !== now.power) {
    const label = slot === 0 ? 'Attack damage' : POWER_LABEL[a.id] ?? 'Damage';
    out.push({ label, from: powerText(a, power(now)), to: powerText(a, power(next)) });
  }
  if (next.cd !== now.cd) {
    if (slot === 0) out.push({ label: 'Attacks per second', from: f1(1 / (a.cooldown * now.cd)), to: f1(1 / (a.cooldown * next.cd)) });
    else out.push({ label: 'Cooldown', from: sec(a.cooldown * now.cd), to: sec(a.cooldown * next.cd) });
  }
  if (next.cost !== now.cost) out.push({ label: 'Cost', from: f0(a.cost * now.cost), to: f0(a.cost * next.cost) });
  if (next.reach !== now.reach) {
    if (a.range > 0) out.push({ label: 'Range', from: f0(a.range * now.reach), to: f0(a.range * next.reach) });
    if (a.radius > 0) out.push({ label: 'Area', from: f0(a.radius * now.reach), to: f0(a.radius * next.reach) });
  }
  if (next.dur !== now.dur) {
    const e = a.effects;
    const cc = e.includes('stun') ? 'Stun' : e.includes('root') ? 'Root' : e.includes('slow') ? 'Slow' : '';
    if (a.cc > 0 && cc) out.push({ label: cc, from: sec(a.cc * now.dur), to: sec(a.cc * next.dur) });
    if (a.duration > 0) out.push({ label: 'Lasts', from: sec(a.duration * now.dur), to: sec(a.duration * next.dur) });
  }
  switch (option) {
    case 'crit10': { const c = def.crit + (picks.includes('crit10') ? .1 : 0); out.push({ label: 'Critical chance', from: `${Math.round(c * 100)}%`, to: `${Math.round((c + .1) * 100)}%` }); break; }
    case 'hp12': out.push({ label: 'Max health', from: f0(maxHp), to: f0(maxHp * 1.12) }); break;
    case 'move8': out.push({ label: 'Move speed', from: f0(me.sp), to: f0(me.sp * 1.08) }); break;
  }
  return out;
}
