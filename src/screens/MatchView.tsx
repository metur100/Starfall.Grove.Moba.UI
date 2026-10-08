import { useEffect, useMemo, useRef, useState } from 'react';
import { net } from '../net/connection';
import { ST, type Catalog, type Fx, type SignalKind, type Vote, type HeroDef, type MatchEnd, type MatchHero, type MatchType, type Rewards, type RoomView } from '../net/protocol';
import type { GameState } from '../state/machine';
import { MatchClient } from '../game/client';
import { Renderer, SIGNAL_LOOK, TEAM_COLOR } from '../game/render';
import { CHARM_SLOT, Input, KEY_LABELS } from '../game/input';
import { CHARM_LOOK, HEROES, isHero } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { sfx } from '../game/audio';
import { buzz } from '../game/settings';
import type { HeroId } from '../game/types';
import { Fit } from '../ui/Fit';
import { Coins, RankBadge } from '../ui/Bits';
import { SettingsButton } from '../ui/Settings';
import { ChatBox } from '../ui/Chat';
import { describeUpgrade } from '../game/upgrades';

type Props = {
  state: GameState; client: MatchClient; room: RoomView | null; result: MatchEnd | null; rewards: Rewards | null; catalog: Catalog;
  onLoaded: () => void; onLeave: () => void; onLobby: () => void; onPlayAgain: (type: MatchType, mode: number, practice: boolean) => void;
};
type Feed = { id: number; killer?: MatchHero; victim?: MatchHero; text: string; tone: 'ally' | 'enemy' | 'neutral'; at: number };
/** A big kill announcement: who beat whom, and what it means (a double kill, a shutdown…). */
type Announce = { id: number; killer?: MatchHero; victim?: MatchHero; title: string; tone: 'good' | 'bad' | 'info'; at: number };
type Recap = { by: string; rows: Array<{ name: string; dmg: number; hero?: MatchHero }> };
type RoundSummary = { round: number; winner: number; rows: Array<{ hero: MatchHero; dmg: number }> };

const TEAM_NAME = ['Neutral', 'Blue', 'Red'];
const fmtK = (n: number) => n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const MULTI = ['', '', 'Double kill!', 'Triple kill!', 'Quadra kill!', 'Penta kill!'];
const STREAK: Record<number, string> = { 3: 'is on a killing spree!', 5: 'is on a rampage!', 7: 'is unstoppable!', 9: 'is godlike!' };

export function MatchView({ state, client, room, result, rewards, catalog, onLoaded, onLeave, onLobby, onPlayAgain }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef<Input | null>(null);
  const [, setTick] = useState(0);
  const [book, setBook] = useState(false);
  const [board, setBoard] = useState(false);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [announce, setAnnounce] = useState<Announce | null>(null);
  const [banner, setBanner] = useState<{ text: string; tone: string; at: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const anyKill = useRef(false);
  /** Damage taken lately, by whoever dealt it (unit id → [amount, time]), for the death recap. */
  const hurt = useRef(new Map<number, Array<[number, number]>>());
  /** Each player's hero damage when the duel round began, for the round summary. */
  const roundStart = useRef(new Map<string, number>());
  const [vote, setVote] = useState<Vote | null>(null);
  const [pings, setPings] = useState(false);
  /** The team that gave up, if the match ended by surrender. */
  const [surrendered, setSurrendered] = useState(0);
  const myHero = client.init.heroes.find(h => h.playerId === client.init.you)!;
  const def: HeroDef = useMemo(() => catalog.heroes.find(h => h.id === myHero.hero)!, [catalog, myHero.hero]);
  const duel = client.map.type === 'duel';

  // Set up the renderer and input once; bake the battlefield, then tell the server we're ready.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new Renderer(canvas, client);
    rendererRef.current = r;
    const input = new Input(client, r, def);
    inputRef.current = input;
    input.attach(canvas);
    input.onError = e => {
      const words: Record<string, string> = {
        cooldown: 'Not ready yet', mana: `Not enough ${def.resource.toLowerCase()}`, target: 'No target in range', locked: `Unlocks at level ${catalog.ultLevel}`, busy: 'Can’t do that now',
        rooted: 'Rooted!', wait: 'Wait for the round to start', sight: 'Not in sight — something is in the way', unlearned: 'Not learned yet — you get a spell point every level',
        points: 'No spell point left — level up first', picked: 'Already picked for this round', home: 'You’re already home', duel: 'No recalling in a duel',
      };
      if (words[e]) { setToast({ text: words[e], at: performance.now() }); sfx.play('nope'); }
    };
    input.onUpgradeKey = () => { if (!duel) setBook(b => !b); };
    input.onLearn = slot => { sfx.play('learn'); buzz(25); setBanner({ text: `Learned ${def.abilities[slot].name}!`, tone: 'good', at: performance.now() }); };
    input.onScoreKey = down => setBoard(down);
    input.onChatKey = () => setChatOpen(true);
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
    // Teammates' pings and the team's surrender vote.
    const offSignal = net.on('signal', s => {
      r.addSignal(s.kind, s.x, s.y);
      const from = client.hero(s.u);
      const look = SIGNAL_LOOK[s.kind];
      if (look && from) setFeed(list => [...list.slice(-4), { id: Math.random(), text: `${look.icon} ${from.name}: ${look.text}`, tone: 'ally', at: performance.now() }]);
      sfx.play('ui'); buzz(15);
    });
    const offVote = net.on('vote', v => {
      setVote(v.active ? v : null);
      if (v.result === 'failed') setToast({ text: 'Surrender vote failed — fight on!', at: performance.now() });
    });
    return () => { window.clearTimeout(id); cancelAnimationFrame(raf); window.clearInterval(hud); window.removeEventListener('resize', onResize); input.dispose(); offSignal(); offVote(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const nameOf = (uid?: number) => { if (!uid) return ''; const h = client.hero(uid); if (h) return h.name; const u = client.units.get(uid); return u ? (u.k === 'tower' ? 'a Tower' : u.k === 'core' ? 'a Core' : u.k === 'warden' ? 'the Star Warden' : u.k === 'fenn' || u.k === 'wolf' ? 'a wolf' : u.tm === 0 ? 'a monster' : 'minions') : 'something'; };
  const onFx = (f: Fx) => {
    const team = client.team, me = client.me?.u, now = performance.now();
    const push = (text: string, tone: Feed['tone'], killer?: MatchHero, victim?: MatchHero) => setFeed(list => [...list.slice(-4), { id: Math.random(), text, tone, at: now, killer, victim }]);
    const say = (text: string, tone = 'info') => setBanner({ text, tone, at: now });
    switch (f.e) {
      case 'dmg':
        if (f.u === me && f.u2 && (f.v ?? 0) > 0) { const list = hurt.current.get(f.u2) ?? []; list.push([f.v ?? 0, now]); hurt.current.set(f.u2, list); }
        break;
      case 'kill': {
        const killer = f.u ? client.hero(f.u) : undefined, victim = f.u2 ? client.hero(f.u2) : undefined;
        const killerName = killer?.name ?? (f.u ? nameOf(f.u) : 'the battlefield'), victimName = victim?.name ?? nameOf(f.u2);
        const ours = f.tm === team;
        push(`${killerName} ⚔ ${victimName}`, ours ? 'ally' : 'enemy', killer, victim);
        // The headline: a multikill beats a shutdown beats a streak beats first blood.
        const multi = MULTI[Math.min(5, f.v ?? 0)] ?? '';
        let title = multi || (f.s === 'shutdown' ? 'Shutdown!' : '') || (f.n && STREAK[f.n] ? `${killerName} ${STREAK[f.n]}` : '') || (!anyKill.current && !duel ? 'First blood!' : '');
        if (f.u2 === me) {
          title ||= 'You were defeated';
          const cutoff = now - 12000, rows: Recap['rows'] = [];
          for (const [src, hits] of hurt.current) { const dmg = hits.filter(h => h[1] >= cutoff).reduce((s, h) => s + h[0], 0); if (dmg > 0) rows.push({ name: nameOf(src), dmg, hero: client.hero(src) }); }
          rows.sort((a, b) => b.dmg - a.dmg);
          setRecap({ by: killerName, rows: rows.slice(0, 4) });
          hurt.current.clear();
          sfx.play('hurt'); buzz([90, 50, 90]);
        } else if (f.u === me) {
          title ||= `You defeated ${victimName}!`;
          sfx.play((f.v ?? 0) >= 2 ? 'roar' : 'crit'); buzz((f.v ?? 0) >= 2 ? [30, 30, 30, 30, 60] : [25, 30, 45]);
        }
        if (title && (killer || victim)) setAnnounce({ id: now, killer, victim, title, tone: f.u2 === me ? 'bad' : ours ? 'good' : 'bad', at: now });
        anyKill.current = true;
        break;
      }
      case 'struct': {
        const what = f.k === 'tower1' ? 'Tower 1' : f.k === 'tower2' ? 'Tower 2' : 'Core';
        if (f.k !== 'core') { say(`${TEAM_NAME[f.tm ?? 0]} ${what} destroyed!`, f.tm === team ? 'bad' : 'good'); push(`${TEAM_NAME[f.tm ?? 0]} ${what} fell`, f.tm === team ? 'enemy' : 'ally'); }
        if (f.k === 'tower2') say(`${TEAM_NAME[f.tm ?? 0]} Core is now open to attack!`, f.tm === team ? 'bad' : 'good');
        buzz(40);
        break;
      }
      case 'notice': {
        const fav = f.tm === team ? 'Your team has' : 'The enemy has';
        const words: Record<string, string> = {
          minions: 'Minions are marching!', warden: 'The Star Warden has woken in the woods',
          blessed: f.tm === team ? 'Your team is blessed by the Star Warden!' : 'The enemy is blessed by the Star Warden',
          sudden1: `Sudden death — structures crumble faster. ${fav} the Star’s favour`, sudden2: `The Star blazes — ${fav.toLowerCase()} its favour`,
          sudden3: 'Every defence falls silent: all structures can be attacked!',
          ring: 'The ring of starfire is closing in!',
          shard: 'A Starshard falls into the ring — grab it!',
          ace: f.tm === team ? 'Ace! The whole enemy team is down' : 'Ace — your whole team is down',
        };
        if (f.k && words[f.k]) say(words[f.k], f.k === 'blessed' || f.k === 'ace' ? (f.tm === team ? 'good' : 'bad') : 'info');
        if (f.k === 'shard') sfx.play('discover');
        break;
      }
      case 'shard':
        say(f.u === me ? 'You took the Starshard — empowered!' : `${nameOf(f.u)} took the Starshard`, f.tm === team ? 'good' : 'bad');
        if (f.u === me) buzz([30, 30, 50]);
        break;
      case 'respawn': if (f.u === me) { setRecap(null); hurt.current.clear(); } break;
      case 'surrender':
        setSurrendered(f.tm ?? 0); setVote(null);
        say(f.tm === team ? 'Your team surrendered' : 'The enemy surrendered!', f.tm === team ? 'bad' : 'good');
        break;
      case 'lvl':
        if (f.u === me && !duel) {
          say(f.v === catalog.ultLevel ? `Level ${f.v} — learn your ultimate: ${def.abilities[4].name}!` : (f.v ?? 0) < catalog.ultLevel ? `Level ${f.v} — learn a new spell!` : `Level ${f.v}!`, 'good');
          sfx.play('levelUp'); buzz(30);
        }
        break;
      case 'round': {
        const s = client.latest;
        if (f.k === 'start') {
          setSummary(null); setRecap(null); hurt.current.clear();
          roundStart.current = new Map((s?.ps ?? []).map(p => [p.id, p.dm]));
          const point = s && (s.rw[0] === 2 || s.rw[1] === 2);
          say(`Round ${f.v}${f.v && f.v > 1 ? ' · everyone grows a level' : ''}${point ? ' · match point!' : ''}`, 'info');
        } else if (f.k === 'fight') { say('Fight!', 'good'); buzz(40); }
        else if (f.k === 'won' || f.k === 'draw') {
          if (f.k === 'won') { say(f.tm === team ? 'You win the round!' : 'Round lost', f.tm === team ? 'good' : 'bad'); sfx.play(f.tm === team ? 'questDone' : 'nope'); push(`${TEAM_NAME[f.tm ?? 0]} won round ${f.v}`, f.tm === team ? 'ally' : 'enemy'); }
          else say('Both sides fell: a draw!', 'info');
          const rows = client.init.heroes.map(h => ({ hero: h, dmg: Math.max(0, (s?.ps.find(p => p.id === h.playerId)?.dm ?? 0) - (roundStart.current.get(h.playerId) ?? 0)) }));
          setSummary({ round: f.v ?? 0, winner: f.k === 'won' ? f.tm ?? 0 : 0, rows });
        }
        break;
      }
    }
  };

  const me = client.me, snap = client.latest, myUnit = client.myUnit();
  const mine = client.team, theirs = 3 - client.team;
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
  const spectating = rendererRef.current?.spectating ? client.hero(rendererRef.current.spectating) : undefined;

  const [leaving, setLeaving] = useState(false);
  const sendPing = (kind: SignalKind, x?: number, y?: number) => {
    setPings(false);
    const u = client.myUnit();
    if (x == null || y == null) { if (!u) return; x = u.rx; y = u.ry; }
    void net.signal(kind, x, y).then(e => { if (e === 'slow') setToast({ text: 'Easy — one ping at a time', at: performance.now() }); });
  };
  /** Tapping the minimap pings "go here" at that spot. */
  const pingMinimap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    sendPing('go', (e.clientX - b.left) / b.width * client.map.w, (e.clientY - b.top) / b.height * client.map.h);
  };
  // Surrendering asks "are you sure?" first.
  const [askSurrender, setAskSurrender] = useState(false);
  const surrender = async (yes: boolean) => {
    const e = await net.surrender(yes);
    if (e) { setToast({ text: e, at: performance.now() }); sfx.play('nope'); }
  };
  const [chatOpen, setChatOpen] = useState(false);
  const picking = duel && state === 'PLAYING' && snap?.rp === 0 && !!me && me.dq.length > 0;

  return (
    <div className={`match ${coarse ? 'touch' : 'mouse'}`}>
      <canvas ref={canvasRef} className="match-canvas" />
      {coarse && <Joystick input={inputRef} />}

      {/* Top: score and time */}
      <div className="hud-top">
        {duel ? (
          <div className="score card duel">
            <span className="team-blue">{snap?.rw[0] ?? 0}</span>
            <div className="score-mid"><b>Round {snap?.rd ?? 1}</b><small>First to 3 · {client.map.name}</small></div>
            <span className="team-red">{snap?.rw[1] ?? 0}</span>
          </div>
        ) : (
          <div className="score card">
            <span className="team-blue">{snap?.sc[0] ?? 0}</span>
            <div className="score-mid"><b>{fmtTime(time)}</b><small>{client.map.name}</small></div>
            <span className="team-red">{snap?.sc[1] ?? 0}</span>
          </div>
        )}
        {!duel && snap && snap.sd > 0 && <div className={`sudden card ${snap.fv === client.team ? 'good' : 'bad'}`}>☄ Sudden death {snap.sd === 3 ? '· no defences' : ''}</div>}
        {!duel && snap && snap.ob > 0 && snap.ob < 99 && <div className="warden-timer card">Warden in {snap.ob}s</div>}
        {duel && snap && snap.rp === 2 && <div className="warden-timer card">Next round in {Math.ceil(snap.rt)}s</div>}
        {spectating && <div className="warden-timer card spectate">👁 Watching {spectating.name}</div>}
      </div>
      <div className="hud-tl">
        <div className="minimap-wrap">
          <canvas ref={miniRef} width={240} height={120} className="minimap card" onPointerDown={pingMinimap} title="Tap to ping “go here” for your team" />
          <span className="ping">{net.ping} ms</span>
        </div>
        <div className="hud-buttons">
          <button className="icon-btn card" onClick={() => setBoard(b => !b)} title="Scoreboard (Tab)">☰</button>
          <button className={`icon-btn card ${chatOpen ? 'on' : ''}`} onClick={() => setChatOpen(o => !o)} title="Chat (Enter)">💬</button>
          <button className={`icon-btn card ${pings ? 'on' : ''}`} onClick={() => setPings(o => !o)} title="Ping your team">📍</button>
          <SettingsButton />
          {!duel && <button className={`icon-btn card ${askSurrender ? 'on' : ''}`} onClick={() => { setAskSurrender(a => !a); sfx.play('ui'); }} title="Surrender (vote, after 5 minutes)">🏳</button>}
          <button className="icon-btn card" onClick={() => setLeaving(true)} title="Leave">⏏</button>
        </div>
        {pings && (
          <div className="ping-menu card">
            {(['attack', 'danger', 'omw', 'help'] as const).map(k => (
              <button key={k} style={{ ['--c' as string]: SIGNAL_LOOK[k].color }} onClick={() => sendPing(k)}><b>{SIGNAL_LOOK[k].icon}</b><span>{SIGNAL_LOOK[k].text}</span></button>
            ))}
            <small>or tap the map to say “go here”</small>
          </div>
        )}
      </div>
      {askSurrender && !(vote && vote.active) && (
        <div className="vote card ask">
          <b>🏳 Surrender this match?</b>
          <small>Your team votes on it. If enough of you agree, the match ends as a loss.</small>
          <div className="vote-actions">
            <button className="btn small danger" onClick={() => { setAskSurrender(false); void surrender(true); }}>Yes, surrender</button>
            <button className="btn small" onClick={() => setAskSurrender(false)}>Keep fighting</button>
          </div>
        </div>
      )}
      {vote && vote.active && (
        <div className="vote card">
          <b>🏳 {vote.by} wants to surrender</b>
          <span className="vote-count">{vote.yes} / {vote.needed} needed{vote.no ? ` · ${vote.no} no` : ''}</span>
          {vote.you == null ? (
            <div className="vote-actions">
              <button className="btn small danger" onClick={() => void surrender(true)}>Surrender</button>
              <button className="btn small" onClick={() => void surrender(false)}>Fight on</button>
            </div>
          ) : <small>You voted {vote.you ? 'to surrender' : 'to fight on'}</small>}
        </div>
      )}
      <div className="feed">
        {feed.filter(f => now - f.at < 7000).map(f => (
          <div key={f.id} className={`feed-row card ${f.tone}`}>
            {f.killer && f.victim ? <><img src={heroBust(f.killer.hero as HeroId, f.killer.skin)} alt="" /><i>⚔</i><img src={heroBust(f.victim.hero as HeroId, f.victim.skin)} alt="" /></> : null}
            <span>{f.text}</span>
          </div>
        ))}
      </div>
      {announce && now - announce.at < 2800 && (
        <div className={`announce ${announce.tone}`} key={announce.id}>
          <b>{announce.title}</b>
          <div className="announce-busts">
            {announce.killer && <span className={`ab t${announce.killer.team}`}><img src={heroBust(announce.killer.hero as HeroId, announce.killer.skin)} alt="" /></span>}
            {announce.killer && announce.victim && <i>⚔</i>}
            {announce.victim && <span className={`ab t${announce.victim.team} down`}><img src={heroBust(announce.victim.hero as HeroId, announce.victim.skin)} alt="" /></span>}
          </div>
        </div>
      )}
      {banner && now - banner.at < 3500 && (!announce || now - announce.at > 2800) && <div className={`banner ${banner.tone}`} key={banner.at}>{banner.text}</div>}
      {toast && now - toast.at < 1200 && <div className="toast" key={toast.at}>{toast.text}</div>}

      {/* Bottom left: our hero */}
      {me && (
        <div className="vitals card">
          <div className="vitals-portrait">
            <img src={heroBust(myHero.hero as HeroId, myHero.skin)} alt="" />
            <span className="lvl">{me.lv}</span>
          </div>
          <div className="vitals-bars">
            <div className="bar hp"><i style={{ width: `${myUnit ? myUnit.hp / myUnit.mh * 100 : 0}%` }} />{myUnit && myUnit.sh > 0 && <i className="sh" style={{ width: `${Math.min(100, myUnit.sh / myUnit.mh * 100)}%` }} />}<b>{myUnit?.hp ?? 0} / {myUnit?.mh ?? 0}</b></div>
            <div className="bar mp"><i style={{ width: `${me.mp / me.mm * 100}%` }} /><b>{me.mp} {def.resource}</b></div>
            <div className="bar xp"><i style={{ width: `${me.xn ? me.xp / me.xn * 100 : 100}%` }} /></div>
          </div>
          {!duel && (
            <>
              <button className={`recall-btn ${me.rc > 0 ? 'on' : ''}`} style={{ ['--p' as string]: `${me.rc > 0 ? (1 - me.rc / 4.5) * 360 : 0}deg` }} onClick={() => void inputRef.current?.recall()} title="Recall home (H)">
                <span>⌂</span>{!coarse && <kbd>H</kbd>}
              </button>
              <button className={`gold-btn ${anyBuy ? 'can' : ''}`} onClick={() => setBook(b => !b)} title="Spell upgrades (B)">
                <span>◉ {gold}</span><small>{anyBuy ? 'Upgrade!' : 'Upgrades'}</small>
              </button>
            </>
          )}
        </div>
      )}

      {/* Bottom right: attack, abilities and the charm */}
      {me && <Abilities def={def} me={me} input={inputRef} catalog={catalog} />}
      {me && !duel && me.lp > 0 && state === 'PLAYING' && !dead && (
        <div className="learn-hint" key={me.lv}>✦ {coarse ? 'Tap a glowing spell to learn it' : 'Click a glowing spell (or press its key) to learn it'}{me.lp > 1 ? ` · ${me.lp} points` : ''}</div>
      )}

      {dead && state === 'PLAYING' && !duel && (
        <div className="respawn"><b>Respawning in {Math.ceil(me?.rs ?? 0)}</b><small>Spend your gold in the Spellbook while you wait.</small>{recap && <DeathRecap recap={recap} />}</div>
      )}
      {dead && state === 'PLAYING' && duel && snap?.rp === 1 && (
        <div className="respawn"><b>Knocked out</b><small>{spectating ? 'Cheer on your team — you’re back next round.' : 'Back next round.'}</small>{recap && <DeathRecap recap={recap} />}</div>
      )}
      {duel && state === 'PLAYING' && snap?.rp === 2 && summary && <RoundCard summary={summary} team={client.team} you={client.init.you} />}
      {picking && me && snap && <DuelPicks def={def} me={me} round={snap.rd} timeLeft={snap.rt} maxHp={myUnit?.mh ?? 0} />}
      {duel && state === 'PLAYING' && snap?.rp === 0 && !picking && (
        <div className="overlay countdown round">
          <small>Round {snap.rd} · <span style={{ color: TEAM_COLOR[mine] }}>{snap.rw[mine - 1]}</span> – <span style={{ color: TEAM_COLOR[theirs] }}>{snap.rw[theirs - 1]}</span>{(snap.rw[0] === 2 || snap.rw[1] === 2) ? ' · match point' : ''}</small>
          <b key={Math.ceil(snap.rt)}>{Math.max(1, Math.ceil(snap.rt))}</b>
          <p>Get ready!</p>
          {me && <span className="round-picks">{def.duelSlots.map(sl => <em key={sl}>{HEROES[def.id as HeroId].abilities[def.abilities[sl].id]?.icon} {def.abilities[sl].name} {'★'.repeat(me.up[sl]?.length ?? 0)}</em>)}</span>}
        </div>
      )}
      {book && me && !duel && <UpgradeBook def={def} me={me} catalog={catalog} maxHp={myUnit?.mh ?? 0} onClose={() => setBook(false)} />}
      {leaving && (
        <div className="modal-wrap">
          <Fit onBackdrop={() => setLeaving(false)}>
            <div className="confirm parchment">
              <h3>Leave the match?</h3>
              <p>A bot will take over your hero for the rest of the {duel ? 'duel' : 'battle'}. Leaving early earns no coins{client.init.matchmade ? ' and counts as a loss' : ''}.</p>
              <div className="confirm-actions">
                <button className="btn" onClick={() => setLeaving(false)}>Stay</button>
                <button className="btn danger" onClick={() => { setLeaving(false); onLeave(); }}>Leave match</button>
              </div>
            </div>
          </Fit>
        </div>
      )}
      {board && <Scoreboard client={client} onClose={() => setBoard(false)} />}
      <div className={`match-chat ${chatOpen ? 'open' : ''}`}><ChatBox mode="room" teamChat overlay={!chatOpen} autoFocus={chatOpen && !coarse} placeholder="Message (Enter to send)…" onSent={() => { if (!coarse) setChatOpen(false); }} /></div>

      {state === 'LOADING' && (
        <div className="overlay loading">
          <h2>{client.map.name}</h2>
          <p>{ready ? 'Waiting for the other players…' : 'Unfolding the battlefield…'}</p>
          <div className="loading-teams">
            {[1, 2].map(team => (
              <div key={team} className={`loading-team t${team}`}>
                {client.init.heroes.filter(h => h.team === team).map(h => (
                  <div key={h.playerId} className="loading-hero">
                    <img src={heroBust(h.hero as HeroId, h.skin)} alt="" />
                    <b>{h.name}</b>
                    <small>{catalog.heroes.find(x => x.id === h.hero)?.name}{h.level > 1 ? ` · Lv ${h.level}` : ''}</small>
                    {h.skin && <em>{catalog.shop.skins.find(s => s.id === h.skin)?.name}</em>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {state === 'MATCH_START' && (
        <div className="overlay countdown">
          <b key={room?.timer}>{Math.max(1, room?.timer ?? 3)}</b>
          <p>{duel ? 'Win 3 rounds to take the duel!' : 'Destroy the enemy Core!'}</p>
          <small>You are on the <span style={{ color: TEAM_COLOR[client.team] }}>{TEAM_NAME[client.team]}</span> team</small>
        </div>
      )}
      {(state === 'VICTORY' || state === 'DEFEAT') && result && (
        <Result state={state} result={result} rewards={rewards} client={client} onLobby={onLobby} onLeave={onLeave}
          surrendered={surrendered}
          onPlayAgain={() => onPlayAgain(client.map.type, room?.mode ?? client.init.heroes.filter(h => h.team === 1).length, !!room?.practice)} />
      )}
    </div>
  );
}

function DeathRecap({ recap }: { recap: Recap }) {
  const max = Math.max(1, ...recap.rows.map(r => r.dmg));
  return (
    <div className="recap card">
      <small>Defeated by <b>{recap.by}</b></small>
      {recap.rows.map(r => (
        <div key={r.name} className="recap-row">
          {r.hero ? <img src={heroBust(r.hero.hero as HeroId, r.hero.skin)} alt="" /> : <span className="recap-dot" />}
          <span className="recap-name">{r.name}</span>
          <span className="recap-bar"><i style={{ width: `${r.dmg / max * 100}%` }} /></span>
          <em>{fmtK(r.dmg)}</em>
        </div>
      ))}
    </div>
  );
}

/** Duels, between rounds: who won it and who did the damage. */
function RoundCard({ summary, team, you }: { summary: RoundSummary; team: number; you: string }) {
  const best = [...summary.rows].sort((a, b) => b.dmg - a.dmg)[0];
  return (
    <div className={`round-card card ${summary.winner === team ? 'good' : summary.winner ? 'bad' : ''}`}>
      <b>{summary.winner ? (summary.winner === team ? `Round ${summary.round} won` : `Round ${summary.round} lost`) : `Round ${summary.round}: a draw`}</b>
      <div className="round-rows">
        {[1, 2].map(t => (
          <div key={t} className={`round-team t${t}`}>
            {summary.rows.filter(r => r.hero.team === t).map(r => (
              <span key={r.hero.playerId} className={r.hero.playerId === you ? 'me' : ''}>
                <img src={heroBust(r.hero.hero as HeroId, r.hero.skin)} alt="" />{r.hero === best?.hero && r.dmg > 0 ? '★ ' : ''}{fmtK(r.dmg)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── ability buttons

function Abilities({ def, me, input, catalog }: { def: HeroDef; me: NonNullable<MatchClient['me']>; input: React.RefObject<Input | null>; catalog: Catalog }) {
  const look = HEROES[def.id as HeroId];
  const cancelRef = useRef<HTMLDivElement>(null);
  const [aiming, setAiming] = useState(false);
  const [overCancel, setOverCancel] = useState(false);
  const charm = CHARM_LOOK[me.ch] ?? CHARM_LOOK.flash;
  const charmName = catalog.shop.charms.find(c => c.id === me.ch)?.name ?? 'Charm';
  const aim = { cancelRef, setAiming, setOverCancel };
  return (
    <div className={`abilities ${coarse ? 'touch' : ''}`}>
      {aiming && coarse && <div ref={cancelRef} className={`aim-cancel ${overCancel ? 'over' : ''}`}>✕</div>}
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
        const learned = !!(me.ln & (1 << slot));
        const learnable = !learned && me.lp > 0 && (slot !== 4 || me.lv >= catalog.ultLevel);
        const cd = me.cd[slot], max = me.cm[slot] || 1, poor = learned && me.mp < me.mc[slot];
        return <AbilityButton key={slot} slot={slot} name={a.name} icon={l?.icon} color={l?.color} cd={learned ? cd : 0} max={max} learned={learned} learnable={learnable} poor={poor} cost={learned ? me.mc[slot] : 0} stars={me.up[slot]?.length ?? 0} input={input} aim={aim} />;
      })}
      <AbilityButton slot={CHARM_SLOT} name={charmName} icon={charm.icon} color={charm.color} cd={me.chc} max={me.chm || 1} learned learnable={false} poor={false} cost={0} stars={0} input={input} aim={aim} />
    </div>
  );
}

type AimHooks = { cancelRef: React.RefObject<HTMLDivElement | null>; setAiming: (v: boolean) => void; setOverCancel: (v: boolean) => void };

function AbilityButton({ slot, name, icon, color, cd, max, learned, learnable, poor, cost, stars, input, aim }: { slot: number; name: string; icon?: string; color?: string; cd: number; max: number; learned: boolean; learnable: boolean; poor: boolean; cost: number; stars: number; input: React.RefObject<Input | null>; aim: AimHooks }) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  // A short flash when the ability comes off cooldown.
  const [flash, setFlash] = useState(0);
  const prevCd = useRef(cd);
  useEffect(() => { if (prevCd.current > .05 && cd <= 0) setFlash(performance.now()); prevCd.current = cd; }, [cd]);
  const reach = 70;
  const overCancel = (x: number, y: number) => { const r = aim.cancelRef.current?.getBoundingClientRect(); return !!r && x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10; };
  const stop = (cancel: boolean) => { origin.current = null; setDrag(null); aim.setAiming(false); aim.setOverCancel(false); input.current?.endAim(cancel); };
  return (
    <button
      className={`ability a${slot} ${cd > 0 ? 'cooling' : ''} ${learned ? '' : 'unlearned'} ${learnable ? 'learnable' : ''} ${poor ? 'poor' : ''} ${flash && performance.now() - flash < 500 ? 'ready' : ''}`}
      style={{ ['--c' as string]: color, ['--cd' as string]: `${Math.min(1, cd / max) * 360}deg` }}
      title={learnable ? `Learn ${name}` : name}
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
        if (Math.hypot(dx, dy) > .25) aim.setAiming(true);
        aim.setOverCancel(overCancel(e.clientX, e.clientY));
      }}
      onPointerUp={e => stop(overCancel(e.clientX, e.clientY))}
      onPointerCancel={() => stop(true)}
    >
      <span className="ab-icon">{icon}</span>
      {learnable && <span className="ab-learn">+</span>}
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

function UpgradeBook({ def, me, catalog, maxHp, onClose }: { def: HeroDef; me: NonNullable<MatchClient['me']>; catalog: Catalog; maxHp: number; onClose: () => void }) {
  const look = HEROES[def.id as HeroId];
  const [err, setErr] = useState('');
  const buy = async (slot: number, choice: number) => {
    const e = await net.upgrade(slot, choice);
    if (e) { setErr(e === 'gold' ? 'Not enough gold.' : e === 'locked' ? `The ultimate unlocks at level ${catalog.ultLevel}.` : e === 'unlearned' ? 'Learn that spell first (one per level).' : e); sfx.play('nope'); }
    else { setErr(''); sfx.play('learn'); buzz(20); }
  };
  return (
    <div className="book-wrap">
      <Fit onBackdrop={onClose}>
        <div className="book parchment">
          <header>
            <h3>Spellbook</h3>
            <span className="gold">◉ {me.g}</span>
            <button className="close" onClick={onClose}>✕</button>
          </header>
          <p className="book-hint">{err ? <b className="book-err">{err}</b> : 'Every ability has three steps; at each, choose one of two paths.'}</p>
          <div className="book-rows">
            {def.abilities.map((a, slot) => {
              const tiers = slot === 0 ? catalog.basicTiers : catalog.abilityTiers;
              const costs = slot === 0 ? catalog.basicCost : slot === 4 ? catalog.ultCost : catalog.abilityCost;
              const picks = me.up[slot] ?? [];
              const tier = picks.length;
              const locked = !(me.ln & (1 << slot));
              const l = look.abilities[a.id];
              return (
                <div key={slot} className="book-row">
                  <div className="book-ability" style={{ ['--c' as string]: l?.color }}>
                    <span className="ab-icon">{l?.icon}</span>
                    <div><b>{a.name}</b><small>{KEY_LABELS[slot]}{slot === 4 ? ' · Ultimate' : slot === 0 ? ' · Attack' : ''}</small></div>
                  </div>
                  <div className="book-picks">
                    {[0, 1, 2].map(t => {
                      const o = tiers[t]?.find(x => x.id === picks[t]);
                      return <span key={t} className={`chip ${o ? 'done' : ''}`} title={o?.text}>{o ? o.name : '·'}</span>;
                    })}
                  </div>
                  <div className="book-next">
                    {tier >= tiers.length ? <span className="book-done">★ Mastered</span>
                      : locked ? <span className="book-done">{slot === 4 && me.lv < catalog.ultLevel ? `Learn it from level ${catalog.ultLevel}` : 'Learn this spell first'}</span>
                      : tiers[tier].map((o, choice) => (
                        <button key={o.id} className={`opt ${me.g >= costs[tier] ? 'can' : ''}`} onClick={() => buy(slot, choice)}>
                          <b>{o.name} <em>{costs[tier]}g</em></b><small>{changeText(describeUpgrade(def, me, slot, o.id, maxHp)) || o.text}</small>
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Fit>
    </div>
  );
}

const changeText = (cs: { label: string; from: string; to: string }[]) => cs.map(c => `${c.label} ${c.from} → ${c.to}`).join(' · ');

/** Duels, before each round: a free upgrade for each of the hero's two duel spells, with what it changes in numbers. */
function DuelPicks({ def, me, round, timeLeft, maxHp }: { def: HeroDef; me: NonNullable<MatchClient['me']>; round: number; timeLeft: number; maxHp: number }) {
  const look = HEROES[def.id as HeroId];
  const [busy, setBusy] = useState(false);
  const pick = async (slot: number, choice: number) => {
    if (busy) return;
    setBusy(true);
    const e = await net.upgrade(slot, choice);
    setBusy(false);
    sfx.play(e ? 'nope' : 'learn');
    if (!e) buzz(20);
  };
  const secs = Math.max(0, Math.ceil(timeLeft));
  return (
    <div className="picks-wrap">
      <Fit>
        <div className="picks">
          <header className="picks-head">
            <div>
              <small>Round {round} · free upgrades</small>
              <h2>Power up your two duel spells</h2>
              <p>Pick one path for each. They last for the rest of the duel, and can win it.</p>
            </div>
            <div className={`picks-time ${secs <= 5 ? 'hurry' : ''}`}><b>{secs}</b><small>seconds</small></div>
          </header>
          <div className="picks-cards">
            {def.duelSlots.map(slot => {
              const a = def.abilities[slot], l = look.abilities[a.id];
              const picks = me.up[slot] ?? [];
              const waiting = me.dq.includes(slot);
              return (
                <section key={slot} className={`pick-card ${waiting ? '' : 'done'}`} style={{ ['--c' as string]: l?.color }}>
                  <div className="pick-card-head">
                    <span className="ab-icon">{l?.icon}</span>
                    <div>
                      <b>{a.name}</b>
                      <small>{KEY_LABELS[slot]}{slot === 0 ? ' · basic attack' : ''} · upgrade {Math.min(3, picks.length + (waiting ? 1 : 0))} of 3</small>
                    </div>
                  </div>
                  <p className="pick-card-text">{l?.text}</p>
                  {waiting ? <PickOptions def={def} me={me} slot={slot} maxHp={maxHp} onPick={c => pick(slot, c)} /> : <div className="pick-card-done">✓ {(slot === 0 ? net.catalog?.basicTiers : net.catalog?.abilityTiers)?.[picks.length - 1]?.find(o => o.id === picks[picks.length - 1])?.name ?? 'Ready'}<small>chosen for this round</small></div>}
                </section>
              );
            })}
          </div>
          <p className="picks-foot">{me.dq.length === 2 ? 'Choose both before the time runs out — otherwise the left path is picked for you.' : 'One more to go!'}</p>
        </div>
      </Fit>
    </div>
  );
}

function PickOptions({ def, me, slot, maxHp, onPick }: { def: HeroDef; me: NonNullable<MatchClient['me']>; slot: number; maxHp: number; onPick: (choice: number) => void }) {
  const cat = net.catalog!;
  const tiers = slot === 0 ? cat.basicTiers : cat.abilityTiers;
  const tier = me.up[slot]?.length ?? 0;
  const opts = tiers[tier] ?? [];
  return (
    <div className="pick-opts">
      {opts.map((o, choice) => {
        const changes = describeUpgrade(def, me, slot, o.id, maxHp);
        return (
          <button key={o.id} className="pick-opt" onClick={() => onPick(choice)}>
            <b>{o.name}</b>
            <ul>{changes.length ? changes.map(c => <li key={c.label}><span>{c.label}</span><em>{c.from}</em><i>→</i><strong>{c.to}</strong></li>) : <li><span>{o.text}</span></li>}</ul>
          </button>
        );
      })}
    </div>
  );
}

// ───────────────────────────── scoreboard and result

function Scoreboard({ client, onClose }: { client: MatchClient; onClose: () => void }) {
  const ps = client.latest?.ps ?? [];
  return (
    <div className="board-wrap">
      <Fit onBackdrop={onClose}>
        <div className="board parchment" onClick={onClose}>
          {[1, 2].map(team => (
            <table key={team} className={`t${team}`}>
              <thead><tr><th>{TEAM_NAME[team]}</th><th>Lv</th><th>K</th><th>D</th><th>A</th><th title="Damage dealt to enemy heroes">Dmg</th><th title="Healing given to allies">Heal</th></tr></thead>
              <tbody>
                {client.init.heroes.filter(h => h.team === team).map(h => {
                  const s = ps.find(p => p.id === h.playerId);
                  return (
                    <tr key={h.playerId} className={h.playerId === client.init.you ? 'me' : ''}>
                      <td><img src={heroBust(h.hero as HeroId, h.skin)} alt="" /> {h.name}{s && s.rs > 0 ? <em> ({s.rs}s)</em> : null}</td>
                      <td>{s?.lv ?? 1}</td><td>{s?.k ?? 0}</td><td>{s?.d ?? 0}</td><td>{s?.a ?? 0}</td><td className="num">{fmtK(s?.dm ?? 0)}</td><td className="num">{fmtK(s?.hl ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        </div>
      </Fit>
    </div>
  );
}

function Result({ state, result, rewards, client, surrendered, onLobby, onLeave, onPlayAgain }: { state: GameState; result: MatchEnd; rewards: Rewards | null; client: MatchClient; surrendered: number; onLobby: () => void; onLeave: () => void; onPlayAgain: () => void }) {
  const win = state === 'VICTORY';
  useEffect(() => { sfx.play(win ? 'victory' : 'bossDie'); buzz(win ? [40, 40, 40, 40, 120] : [120]); }, [win]);
  const best = [...result.players].sort((a, b) => (b.k * 3 + b.a + (b.heroDamage ?? 0) / 1000) - (a.k * 3 + a.a + (a.heroDamage ?? 0) / 1000))[0];
  const skinOf = (id: string) => client.init.heroes.find(h => h.playerId === id)?.skin;
  const [waited, setWaited] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setWaited(true), 2500); return () => window.clearTimeout(id); }, []);
  return (
    <div className={`overlay result ${win ? 'win' : 'lose'}`}>
      <Fit>
        <div className="result-body">
          <h1>{win ? 'Victory' : 'Defeat'}</h1>
          <p>{surrendered ? `${TEAM_NAME[surrendered]} team surrendered after ${fmtTime(result.duration)}` : `${TEAM_NAME[result.winner]} team ${client.map.type === 'duel' ? 'won the duel' : 'destroyed the enemy Core'} in ${fmtTime(result.duration)}`}</p>
          <div className="result-cols">
            <div className="result-table parchment">
              <table>
                <thead><tr><th>Player</th><th>Hero</th><th>Lv</th><th>K / D / A</th><th title="Damage dealt to enemy heroes">Hero dmg</th><th>Healing</th></tr></thead>
                <tbody>
                  {[...result.players].sort((a, b) => a.team - b.team).map(p => (
                    <tr key={p.id} className={`t${p.team} ${p.id === client.init.you ? 'me' : ''}`}>
                      <td>{p.id === best?.id ? '★ ' : ''}{p.name}</td>
                      <td>{isHero(p.hero) ? <img src={heroBust(p.hero, skinOf(p.id))} alt="" /> : null}</td>
                      <td>{p.lv}</td><td>{p.k} / {p.d} / {p.a}</td><td>{(p.heroDamage ?? 0).toLocaleString()}</td><td>{p.healing.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rewards ? <RewardsCard r={rewards} /> : !waited && net.profile ? <div className="rewards parchment pending"><p>Counting your rewards…</p></div> : null}
          </div>
          <div className="result-actions">
            {client.init.matchmade
              ? <button className="btn primary" onClick={onPlayAgain}>Play again <b>↻</b></button>
              : <button className="btn primary" onClick={onLobby}>Back to the lobby <b>→</b></button>}
            <button className="btn ghost" onClick={onLeave}>Main menu</button>
          </div>
        </div>
      </Fit>
    </div>
  );
}

/** What the match paid: coins line by line (counting up), the level bar filling (with any level-ups) and the rating. */
function RewardsCard({ r }: { r: Rewards }) {
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);
  const leveled = r.levelTo > r.levelFrom;
  useEffect(() => {
    const ids = [window.setTimeout(() => setStep(1), 350), window.setTimeout(() => setStep(2), 1350)];
    if (leveled) ids.push(window.setTimeout(() => { sfx.play('levelUp'); buzz([30, 40, 60]); }, 1300));
    const start = performance.now();
    const tick = window.setInterval(() => { const k = Math.min(1, (performance.now() - start) / 1100); setShown(Math.round(r.coins * k)); if (k >= 1) window.clearInterval(tick); }, 30);
    sfx.play('pickup');
    return () => { ids.forEach(window.clearTimeout); window.clearInterval(tick); };
  }, [r, leveled]);
  // The bar: from where it was, to full (when a level was gained), then from empty to where it is now.
  const width = step === 0 ? r.xpFrom / r.xpNextFrom : step === 1 ? (leveled ? 1 : r.xpTo / r.xpNextTo) : r.xpTo / r.xpNextTo;
  const level = step < 2 ? r.levelFrom : r.levelTo;
  return (
    <div className="rewards parchment">
      <div className="rewards-total"><Coins value={shown} big delta /><small>+{r.xp} XP</small></div>
      <ul className="rewards-lines">{r.lines.map((l, i) => <li key={i} style={{ animationDelay: `${i * .12}s` }}><span>{l.label}</span><em className={l.coins < 0 ? 'neg' : ''}>{l.coins > 0 ? '+' : ''}{l.coins}</em></li>)}</ul>
      <div className={`rewards-level ${step === 2 && leveled ? 'up' : ''}`}>
        <b>Lv {level}</b>
        <span className="rewards-bar"><i key={step === 2 ? 'b' : 'a'} style={{ width: `${Math.min(100, width * 100)}%` }} className={step === 2 && leveled ? 'from0' : ''} /></span>
        {step === 2 && leveled && <em>Level up!</em>}
      </div>
      {r.ranked && (
        <div className="rewards-rank">
          <RankBadge rank={r.rank} rating={r.rating} small />
          <em className={r.ratingDelta >= 0 ? 'up' : 'down'}>{r.ratingDelta >= 0 ? '▲' : '▼'} {Math.abs(r.ratingDelta)}</em>
          {r.rank !== r.rankFrom && <small>{r.ratingDelta > 0 ? 'Promoted!' : 'Demoted'}</small>}
        </div>
      )}
    </div>
  );
}
