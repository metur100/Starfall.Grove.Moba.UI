import { useEffect, useMemo, useRef, useState } from 'react';
import { net } from '../net/connection';
import { ST, type Catalog, type Fx, type HeroDef, type MatchEnd, type RoomView } from '../net/protocol';
import type { GameState } from '../state/machine';
import { MatchClient } from '../game/client';
import { Renderer, TEAM_COLOR } from '../game/render';
import { Input, KEY_LABELS } from '../game/input';
import { HEROES, isHero } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { sfx } from '../game/audio';
import type { HeroId } from '../game/types';

type Props = { state: GameState; client: MatchClient; room: RoomView | null; result: MatchEnd | null; catalog: Catalog; onLoaded: () => void; onLeave: () => void; onLobby: () => void };
type Feed = { id: number; text: string; tone: 'ally' | 'enemy' | 'neutral'; at: number };

const TEAM_NAME = ['Neutral', 'Blue', 'Red'];
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export function MatchView({ state, client, room, result, catalog, onLoaded, onLeave, onLobby }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef<Input | null>(null);
  const [, setTick] = useState(0);
  const [book, setBook] = useState(false);
  const [board, setBoard] = useState(false);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [banner, setBanner] = useState<{ text: string; tone: string; at: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [ready, setReady] = useState(false);
  const myHero = client.init.heroes.find(h => h.playerId === client.init.you)!;
  const def: HeroDef = useMemo(() => catalog.heroes.find(h => h.id === myHero.hero)!, [catalog, myHero.hero]);

  // Set up the renderer and input once; bake the battlefield, then tell the server we're ready.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new Renderer(canvas, client);
    rendererRef.current = r;
    const input = new Input(client, r, def);
    inputRef.current = input;
    input.attach(canvas);
    input.onError = e => {
      const words: Record<string, string> = { cooldown: 'Not ready yet', mana: `Not enough ${def.resource.toLowerCase()}`, target: 'No target in range', locked: `Unlocks at level ${catalog.ultLevel}`, busy: 'Can’t do that now', rooted: 'Rooted!' };
      if (words[e]) { setToast({ text: words[e], at: performance.now() }); sfx.play('nope'); }
    };
    input.onUpgradeKey = () => setBook(b => !b);
    input.onScoreKey = down => setBoard(down);
    r.onFx = f => onFx(f);
    // Give the browser a frame to show the loading screen before the bake.
    const id = window.setTimeout(() => { r.prepare(); setReady(true); onLoaded(); }, 60);
    const onResize = () => r.resize();
    window.addEventListener('resize', onResize);
    let raf = 0, last = performance.now();
    const loop = () => {
      const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
      const move = input.update();
      client.update(dt, move, net.ping);
      try { r.frame(dt); } catch (e) { console.error(e); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const hud = window.setInterval(() => {
      setTick(t => t + 1);
      if (miniRef.current) r.drawMinimap(miniRef.current);
    }, 100);
    return () => { window.clearTimeout(id); cancelAnimationFrame(raf); window.clearInterval(hud); window.removeEventListener('resize', onResize); input.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const nameOf = (uid?: number) => { if (!uid) return ''; const h = client.hero(uid); if (h) return h.name; const u = client.units.get(uid); return u ? (u.k === 'tower' ? 'a Tower' : u.k === 'core' ? 'a Core' : u.k === 'warden' ? 'the Star Warden' : 'minions') : 'something'; };
  const onFx = (f: Fx) => {
    const team = client.team;
    const push = (text: string, tone: Feed['tone']) => setFeed(list => [...list.slice(-4), { id: Math.random(), text, tone, at: performance.now() }]);
    const say = (text: string, tone = 'info') => setBanner({ text, tone, at: performance.now() });
    switch (f.e) {
      case 'kill': {
        const killer = f.u ? client.hero(f.u)?.name ?? nameOf(f.u) : 'the battlefield';
        const victim = nameOf(f.u2);
        push(`${killer} defeated ${victim}`, f.tm === team ? 'ally' : 'enemy');
        if (f.u2 === client.me?.u) say('You were defeated', 'bad');
        else if (f.u === client.me?.u) { say(`You defeated ${victim}!`, 'good'); sfx.play('crit'); }
        break;
      }
      case 'struct': {
        const what = f.k === 'tower1' ? 'Tower 1' : f.k === 'tower2' ? 'Tower 2' : 'Core';
        if (f.k !== 'core') { say(`${TEAM_NAME[f.tm ?? 0]} ${what} destroyed!`, f.tm === team ? 'bad' : 'good'); push(`${TEAM_NAME[f.tm ?? 0]} ${what} fell`, f.tm === team ? 'enemy' : 'ally'); }
        if (f.k === 'tower2') say(`${TEAM_NAME[f.tm ?? 0]} Core is now open to attack!`, f.tm === team ? 'bad' : 'good');
        break;
      }
      case 'notice': {
        const fav = f.tm === team ? 'Your team has' : 'The enemy has';
        const words: Record<string, string> = {
          minions: 'Minions are marching!', warden: 'The Star Warden has woken in the woods',
          blessed: f.tm === team ? 'Your team is blessed by the Star Warden!' : 'The enemy is blessed by the Star Warden',
          sudden1: `Sudden death — structures crumble faster. ${fav} the Star’s favour`, sudden2: `The Star blazes — ${fav.toLowerCase()} its favour`,
          sudden3: 'Every defence falls silent: all structures can be attacked!',
        };
        if (f.k && words[f.k]) say(words[f.k], f.k === 'blessed' ? (f.tm === team ? 'good' : 'bad') : 'info');
        break;
      }
      case 'lvl': if (f.u === client.me?.u && f.v === catalog.ultLevel) say(`Ultimate unlocked: ${def.abilities[4].name}!`, 'good'); break;
    }
  };

  const me = client.me, snap = client.latest, myUnit = client.myUnit();
  const dead = !!(myUnit && myUnit.st & ST.dead);
  const time = snap?.t ?? 0;
  const gold = me?.g ?? 0;
  const canBuy = (slot: number) => {
    if (!me) return false;
    const tier = me.up[slot]?.length ?? 0;
    if (tier >= 3 || (slot === 4 && me.lv < catalog.ultLevel)) return false;
    const cost = (slot === 0 ? catalog.basicCost : slot === 4 ? catalog.ultCost : catalog.abilityCost)[tier];
    return gold >= cost;
  };
  const anyBuy = [0, 1, 2, 3, 4].some(canBuy);
  const now = performance.now();

  return (
    <div className="match">
      <canvas ref={canvasRef} className="match-canvas" />
      {coarse && <Joystick input={inputRef} />}

      {/* Top: score and time */}
      <div className="hud-top">
        <div className="score card">
          <span className="team-blue">{snap?.sc[0] ?? 0}</span>
          <div className="score-mid"><b>{fmtTime(time)}</b><small>{client.map.name}</small></div>
          <span className="team-red">{snap?.sc[1] ?? 0}</span>
        </div>
        {snap && snap.sd > 0 && <div className={`sudden card ${snap.fv === client.team ? 'good' : 'bad'}`}>☄ Sudden death {snap.sd === 3 ? '· no defences' : ''}</div>}
        {snap && snap.ob > 0 && snap.ob < 99 && <div className="warden-timer card">Warden in {snap.ob}s</div>}
      </div>
      <div className="hud-tl">
        <canvas ref={miniRef} width={240} height={120} className="minimap card" />
        <div className="hud-buttons">
          <button className="icon-btn card" onClick={() => setBoard(b => !b)} title="Scoreboard (Tab)">☰</button>
          <button className="icon-btn card" onClick={() => { const m = !sfx.isMuted(); sfx.setMuted(m); setTick(t => t + 1); }} title="Sound">{sfx.isMuted() ? '🔇' : '🔊'}</button>
          <button className="icon-btn card" onClick={() => { if (confirm('Leave the match? A bot will take over your hero.')) onLeave(); }} title="Leave">⏏</button>
          <span className="ping">{net.ping} ms</span>
        </div>
      </div>
      <div className="feed">
        {feed.filter(f => now - f.at < 7000).map(f => <div key={f.id} className={`feed-row card ${f.tone}`}>{f.text}</div>)}
      </div>
      {banner && now - banner.at < 3500 && <div className={`banner ${banner.tone}`} key={banner.at}>{banner.text}</div>}
      {toast && now - toast.at < 1200 && <div className="toast" key={toast.at}>{toast.text}</div>}

      {/* Bottom left: our hero */}
      {me && (
        <div className="vitals card">
          <div className="vitals-portrait">
            <img src={heroBust(myHero.hero as HeroId)} alt="" />
            <span className="lvl">{me.lv}</span>
          </div>
          <div className="vitals-bars">
            <div className="bar hp"><i style={{ width: `${myUnit ? myUnit.hp / myUnit.mh * 100 : 0}%` }} />{myUnit && myUnit.sh > 0 && <i className="sh" style={{ width: `${Math.min(100, myUnit.sh / myUnit.mh * 100)}%` }} />}<b>{myUnit?.hp ?? 0} / {myUnit?.mh ?? 0}</b></div>
            <div className="bar mp"><i style={{ width: `${me.mp / me.mm * 100}%` }} /><b>{me.mp} {def.resource}</b></div>
            <div className="bar xp"><i style={{ width: `${me.xn ? me.xp / me.xn * 100 : 100}%` }} /></div>
          </div>
          <button className={`gold-btn ${anyBuy ? 'can' : ''}`} onClick={() => setBook(b => !b)} title="Spell upgrades (B)">
            <span>◉ {gold}</span><small>{anyBuy ? 'Upgrade!' : 'Upgrades'}</small>
          </button>
        </div>
      )}

      {/* Bottom right: attack and abilities */}
      {me && <Abilities def={def} me={me} input={inputRef} catalog={catalog} />}

      {dead && state === 'PLAYING' && <div className="respawn"><b>Respawning in {Math.ceil(me?.rs ?? 0)}</b><small>Spend your gold on upgrades while you wait.</small></div>}
      {book && me && <UpgradeBook def={def} me={me} catalog={catalog} onClose={() => setBook(false)} />}
      {board && <Scoreboard client={client} onClose={() => setBoard(false)} />}

      {state === 'LOADING' && (
        <div className="overlay loading">
          <h2>{client.map.name}</h2>
          <p>{ready ? 'Waiting for the other players…' : 'Unfolding the battlefield…'}</p>
          <div className="loading-teams">
            {[1, 2].map(team => (
              <div key={team} className={`loading-team t${team}`}>
                {client.init.heroes.filter(h => h.team === team).map(h => (
                  <div key={h.playerId} className="loading-hero"><img src={heroBust(h.hero as HeroId)} alt="" /><b>{h.name}</b><small>{catalog.heroes.find(x => x.id === h.hero)?.name}</small></div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {state === 'MATCH_START' && (
        <div className="overlay countdown">
          <b key={room?.timer}>{Math.max(1, room?.timer ?? 3)}</b>
          <p>Destroy the enemy Core!</p>
          <small>You are on the <span style={{ color: TEAM_COLOR[client.team] }}>{TEAM_NAME[client.team]}</span> team</small>
        </div>
      )}
      {(state === 'VICTORY' || state === 'DEFEAT') && result && <Result state={state} result={result} client={client} onLobby={onLobby} onLeave={onLeave} />}
    </div>
  );
}

// ───────────────────────────── ability buttons

function Abilities({ def, me, input, catalog }: { def: HeroDef; me: NonNullable<MatchClient['me']>; input: React.RefObject<Input | null>; catalog: Catalog }) {
  const look = HEROES[def.id as HeroId];
  return (
    <div className={`abilities ${coarse ? 'touch' : ''}`}>
      <button
        className="ability attack"
        style={{ ['--c' as string]: look.abilities[def.abilities[0].id]?.color }}
        onPointerDown={e => { e.preventDefault(); if (input.current) input.current.attackHeld = true; }}
        onPointerUp={() => { if (input.current) input.current.attackHeld = false; }}
        onPointerLeave={() => { if (input.current) input.current.attackHeld = false; }}
        onPointerCancel={() => { if (input.current) input.current.attackHeld = false; }}
      >
        <span className="ab-icon">{look.abilities[def.abilities[0].id]?.icon}</span>
        {!coarse && <kbd>{KEY_LABELS[0]}</kbd>}
      </button>
      {[1, 2, 3, 4].map(slot => {
        const a = def.abilities[slot], l = look.abilities[a.id];
        const cd = me.cd[slot], max = me.cm[slot] || 1, locked = slot === 4 && me.lv < catalog.ultLevel, poor = me.mp < me.mc[slot];
        return <AbilityButton key={slot} slot={slot} name={a.name} icon={l?.icon} color={l?.color} cd={cd} max={max} locked={locked} poor={poor} cost={me.mc[slot]} stars={me.up[slot]?.length ?? 0} input={input} />;
      })}
    </div>
  );
}

function AbilityButton({ slot, name, icon, color, cd, max, locked, poor, cost, stars, input }: { slot: number; name: string; icon?: string; color?: string; cd: number; max: number; locked: boolean; poor: boolean; cost: number; stars: number; input: React.RefObject<Input | null> }) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const reach = 70;
  return (
    <button
      className={`ability a${slot} ${cd > 0 ? 'cooling' : ''} ${locked ? 'locked' : ''} ${poor ? 'poor' : ''}`}
      style={{ ['--c' as string]: color, ['--cd' as string]: `${Math.min(1, cd / max) * 360}deg` }}
      title={name}
      onPointerDown={e => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        origin.current = { x: e.clientX, y: e.clientY };
        input.current?.beginAim(slot);
      }}
      onPointerMove={e => {
        if (!origin.current) return;
        const dx = (e.clientX - origin.current.x) / reach, dy = (e.clientY - origin.current.y) / reach;
        input.current?.moveAim(dx, dy);
        setDrag({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
      }}
      onPointerUp={() => { origin.current = null; setDrag(null); input.current?.endAim(false); }}
      onPointerCancel={() => { origin.current = null; setDrag(null); input.current?.endAim(true); }}
    >
      <span className="ab-icon">{locked ? '🔒' : icon}</span>
      {cd > 0 && <span className="ab-cd">{cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)}</span>}
      {cost > 0 && <span className="ab-cost">{cost}</span>}
      {stars > 0 && <span className="ab-stars">{'★'.repeat(stars)}</span>}
      {!coarse && <kbd>{KEY_LABELS[slot]}</kbd>}
      {drag && <span className="ab-drag" style={{ transform: `translate(${drag.x * 34}px, ${drag.y * 34}px)` }} />}
    </button>
  );
}

function Joystick({ input }: { input: React.RefObject<Input | null> }) {
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const id = useRef<number | null>(null);
  const R = 56;
  return (
    <div
      className="stick-zone"
      onPointerDown={e => { id.current = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setKnob({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 }); }}
      onPointerMove={e => {
        if (id.current !== e.pointerId || !knob) return;
        let dx = e.clientX - knob.ox, dy = e.clientY - knob.oy; const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        setKnob({ ...knob, x: dx, y: dy });
        if (input.current) input.current.stick = d < 8 ? { x: 0, y: 0 } : { x: dx / R, y: dy / R };
      }}
      onPointerUp={() => { id.current = null; setKnob(null); if (input.current) input.current.stick = { x: 0, y: 0 }; }}
      onPointerCancel={() => { id.current = null; setKnob(null); if (input.current) input.current.stick = { x: 0, y: 0 }; }}
    >
      {knob && <div className="stick" style={{ left: knob.ox, top: knob.oy }}><i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} /></div>}
      {!knob && <div className="stick-hint">Drag here to move</div>}
    </div>
  );
}

// ───────────────────────────── upgrade book

function UpgradeBook({ def, me, catalog, onClose }: { def: HeroDef; me: NonNullable<MatchClient['me']>; catalog: Catalog; onClose: () => void }) {
  const look = HEROES[def.id as HeroId];
  const [err, setErr] = useState('');
  const buy = async (slot: number, choice: number) => {
    const e = await net.upgrade(slot, choice);
    if (e) { setErr(e === 'gold' ? 'Not enough gold.' : e === 'locked' ? `The ultimate unlocks at level ${catalog.ultLevel}.` : e); sfx.play('nope'); }
    else { setErr(''); sfx.play('learn'); }
  };
  return (
    <div className="book-wrap" onClick={onClose}>
      <div className="book parchment" onClick={e => e.stopPropagation()}>
        <header><h3>Spellbook</h3><span className="gold">◉ {me.g} gold</span><button className="close" onClick={onClose}>✕</button></header>
        <p className="book-hint">Each ability has three upgrades. At every step, choose one of two paths — your build is your choices.</p>
        {err && <p className="book-err">{err}</p>}
        <div className="book-rows">
          {def.abilities.map((a, slot) => {
            const tiers = slot === 0 ? catalog.basicTiers : catalog.abilityTiers;
            const costs = slot === 0 ? catalog.basicCost : slot === 4 ? catalog.ultCost : catalog.abilityCost;
            const picks = me.up[slot] ?? [];
            const locked = slot === 4 && me.lv < catalog.ultLevel;
            const l = look.abilities[a.id];
            return (
              <div key={slot} className="book-row">
                <div className="book-ability" style={{ ['--c' as string]: l?.color }}>
                  <span className="ab-icon">{l?.icon}</span>
                  <div><b>{a.name}</b><small>{KEY_LABELS[slot]}{slot === 4 ? ' · Ultimate' : slot === 0 ? ' · Basic attack' : ''}</small></div>
                </div>
                <div className="book-tiers">
                  {tiers.map((opts, tier) => {
                    const bought = picks[tier];
                    const next = tier === picks.length;
                    return (
                      <div key={tier} className={`tier ${bought ? 'done' : next ? 'next' : 'later'}`}>
                        {opts.map((o, choice) => {
                          const chosen = bought === o.id;
                          const can = next && !locked && me.g >= costs[tier];
                          return (
                            <button key={o.id} className={`opt ${chosen ? 'chosen' : ''} ${bought && !chosen ? 'skipped' : ''}`} disabled={!next || locked} onClick={() => buy(slot, choice)}>
                              <b>{o.name}</b><small>{o.text}</small>
                              {next && <em className={can ? 'ok' : ''}>{costs[tier]}g</em>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── scoreboard and result

function Scoreboard({ client, onClose }: { client: MatchClient; onClose: () => void }) {
  const ps = client.latest?.ps ?? [];
  return (
    <div className="board-wrap" onClick={onClose}>
      <div className="board parchment">
        {[1, 2].map(team => (
          <table key={team} className={`t${team}`}>
            <thead><tr><th>{TEAM_NAME[team]}</th><th>Lv</th><th>K</th><th>D</th><th>A</th></tr></thead>
            <tbody>
              {client.init.heroes.filter(h => h.team === team).map(h => {
                const s = ps.find(p => p.id === h.playerId);
                return (
                  <tr key={h.playerId} className={h.playerId === client.init.you ? 'me' : ''}>
                    <td><img src={heroBust(h.hero as HeroId)} alt="" /> {h.name}{s && s.rs > 0 ? <em> ({s.rs}s)</em> : null}</td>
                    <td>{s?.lv ?? 1}</td><td>{s?.k ?? 0}</td><td>{s?.d ?? 0}</td><td>{s?.a ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}

function Result({ state, result, client, onLobby, onLeave }: { state: GameState; result: MatchEnd; client: MatchClient; onLobby: () => void; onLeave: () => void }) {
  const win = state === 'VICTORY';
  useEffect(() => { sfx.play(win ? 'victory' : 'bossDie'); }, [win]);
  const best = [...result.players].sort((a, b) => (b.k * 3 + b.a + b.damage / 2000) - (a.k * 3 + a.a + a.damage / 2000))[0];
  return (
    <div className={`overlay result ${win ? 'win' : 'lose'}`}>
      <h1>{win ? 'Victory' : 'Defeat'}</h1>
      <p>{TEAM_NAME[result.winner]} team destroyed the enemy Core in {fmtTime(result.duration)}</p>
      <div className="result-table parchment">
        <table>
          <thead><tr><th>Player</th><th>Hero</th><th>Lv</th><th>K / D / A</th><th>Damage</th><th>Healing</th></tr></thead>
          <tbody>
            {[...result.players].sort((a, b) => a.team - b.team).map(p => (
              <tr key={p.id} className={`t${p.team} ${p.id === client.init.you ? 'me' : ''}`}>
                <td>{p.id === best?.id ? '★ ' : ''}{p.name}</td>
                <td>{isHero(p.hero) ? <img src={heroBust(p.hero)} alt="" /> : null}</td>
                <td>{p.lv}</td><td>{p.k} / {p.d} / {p.a}</td><td>{p.damage.toLocaleString()}</td><td>{p.healing.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="result-actions">
        <button className="btn primary" onClick={onLobby}>Back to the lobby <b>→</b></button>
        <button className="btn ghost" onClick={onLeave}>Main menu</button>
      </div>
    </div>
  );
}
