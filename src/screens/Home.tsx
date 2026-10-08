import { useEffect, useMemo, useState } from 'react';
import { net, type NetStatus } from '../net/connection';
import type { Catalog, LeaderRow, MapInfo, MatchType, Profile, Quest, QueueStatus, RoomListing } from '../net/protocol';
import { HEROES } from '../game/heroes';
import { avatarArt } from '../game/art/avatar';
import { MapPreview } from '../ui/MapPreview';
import { HeroStage } from '../ui/HeroStage';
import { Fit } from '../ui/Fit';
import { Coins, RankBadge, XpBar } from '../ui/Bits';
import { SettingsButton } from '../ui/Settings';
import { Collection } from './Collection';
import { ProfilePage } from './ProfilePage';
import { Friends } from './Friends';
import { social, useSocial } from '../net/social';
import { sfx } from '../game/audio';
import type { HeroId } from '../game/types';

/** How a map is described next to its name. */
export const laneLabel = (m: MapInfo) => m.type === 'duel' ? 'Arena' : m.lanes === 1 ? '1 lane' : `${m.lanes} lanes`;
export const fmtWait = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Tab = 'play' | 'custom' | 'heroes' | 'friends' | 'profile' | 'ladder';
const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: 'play', icon: '⚔', label: 'Play' },
  { id: 'custom', icon: '✦', label: 'Custom' },
  { id: 'heroes', icon: '♛', label: 'Heroes' },
  { id: 'friends', icon: '❤', label: 'Friends' },
  { id: 'profile', icon: '☺', label: 'Profile' },
  { id: 'ladder', icon: '☰', label: 'Ladder' },
];

type Props = { status: NetStatus; catalog: Catalog | null; profile: Profile | null; queue: QueueStatus; initialCode: string; onRetry: () => void };

export function Home({ status, catalog, profile, queue, initialCode, onRetry }: Props) {
  const [tab, setTab] = useState<Tab>(initialCode ? 'custom' : 'play');
  const online = status === 'connected';
  const go = (t: Tab) => { setTab(t); sfx.play('page'); };
  useSocial();
  const badge = (t: Tab) => t === 'friends' ? (profile?.requests ?? 0) + social.unreadTotal() : 0;

  return (
    // One fixed size for the whole menu (from the screen's height, not the tab's content): switching tabs never
    // resizes the navigation or the text, and a long tab scrolls inside its panel.
    <Fit className="screen" height={HOME_HEIGHT}>
      <div className="home">
        <header className="topbar">
          <div className="brand"><b>Mini Rift</b><small>Starfall Grove</small></div>
          {profile ? (
            <button className="me-chip card" onClick={() => go('profile')}>
              <img className="me-av" src={avatarArt(profile.avatar)} alt="" />
              <span className="me-name"><b>{profile.name}</b><XpBar level={profile.level} xp={profile.xp} next={profile.xpNext} /></span>
            </button>
          ) : <div className="me-chip card ghosted">{online ? 'Signing in…' : 'Offline'}</div>}
          <div className="topbar-right">
            {profile && <Coins value={profile.coins} big />}
            <SettingsButton />
          </div>
        </header>

        <div className="home-body">
          <nav className="home-tabs">
            {TABS.map(t => (
              <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => go(t.id)}>
                <i>{t.icon}</i><span>{t.label}</span>
                {badge(t.id) > 0 && <em className="badge">{badge(t.id)}</em>}
              </button>
            ))}
            <div className={`net-status ${status}`}>
              {status === 'connected' ? '● Online' : status === 'connecting' ? '◌ Connecting…' : status === 'reconnecting' ? '◌ Reconnecting…' : <>● Offline <button className="link" onClick={onRetry}>Retry</button></>}
            </div>
          </nav>
          <section className="home-panel">
            {tab === 'play' && <PlayTab catalog={catalog} profile={profile} queue={queue} online={online} />}
            {tab === 'custom' && <CustomTab catalog={catalog} initialCode={initialCode} online={online} />}
            {tab === 'heroes' && (catalog && profile ? <Collection catalog={catalog} profile={profile} /> : <Waiting online={online} />)}
            {tab === 'friends' && <Friends online={online} />}
            {tab === 'profile' && (catalog && profile ? <ProfilePage catalog={catalog} profile={profile} /> : <Waiting online={online} />)}
            {tab === 'ladder' && <LadderTab online={online} />}
          </section>
        </div>
      </div>
    </Fit>
  );
}

function Waiting({ online }: { online: boolean }) {
  return <div className="panel-empty parchment"><p>{online ? 'Loading your profile…' : 'Connect to the server to see this.'}</p></div>;
}

/** The hero shown on the play screen: the one played most, else the first owned. */
/** The height the menu is designed for: shorter screens (phones held sideways) show it scaled down to fit. */
const HOME_HEIGHT = 430;

function favourite(p: Profile): HeroId {
  const best = Object.entries(p.heroStats).sort((a, b) => b[1][0] - a[1][0])[0]?.[0];
  return (best && best in HEROES ? best : p.heroes.find(h => h in HEROES) ?? 'mira') as HeroId;
}

// ───────────────────────────── play: matchmaking

function PlayTab({ catalog, profile, queue, online }: { catalog: Catalog | null; profile: Profile | null; queue: QueueStatus; online: boolean }) {
  const [type, setType] = useState<MatchType>(() => (localStorage.getItem('minirift-type') as MatchType) || 'battle');
  const [mode, setMode] = useState(() => Number(localStorage.getItem('minirift-mode')) || 3);
  const [err, setErr] = useState('');
  useEffect(() => { try { localStorage.setItem('minirift-type', type); localStorage.setItem('minirift-mode', String(mode)); } catch { /* private */ } }, [type, mode]);
  const hero = profile ? favourite(profile) : 'mira';
  const searching = queue.state !== 'idle';

  const find = async (bots = false) => {
    setErr('');
    const e = await (bots ? net.playBots(type, mode) : net.findMatch(type, mode));
    if (e) { setErr(e); sfx.play('nope'); } else sfx.play('ui');
  };

  return (
    <div className="play">
      <div className="play-stage">
        <HeroStage hero={hero} skin={profile?.equipped[hero]} size={190} />
        <div className="play-stage-foot">
          <b>{HEROES[hero] && catalog?.heroes.find(h => h.id === hero)?.name}</b>
          {profile?.quests?.length ? <Quests quests={profile.quests} /> : null}
          {profile && <span className={`first-win ${profile.firstWinReady ? 'ready' : ''}`}>{profile.firstWinReady ? <>First win of the day: <Coins value={catalog?.shop.firstWinBonus ?? 150} /></> : 'First-win bonus collected · back tomorrow'}</span>}
        </div>
      </div>
      <div className="play-pick parchment">
        <h3>Find a match</h3>
        <div className="type-pick">
          <button className={type === 'battle' ? 'on' : ''} disabled={searching} onClick={() => setType('battle')}><b>⚔ Battle</b><small>Lanes, towers, minions. Break the enemy Core.</small></button>
          <button className={type === 'duel' ? 'on' : ''} disabled={searching} onClick={() => { setType('duel'); if (mode === 3) setMode(1); }}><b>✦ Duel</b><small>Heroes only, in a ring. First to 3 rounds.</small></button>
        </div>
        <div className="seg big">{[1, 2, 3].map(m => <button key={m} disabled={searching} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m}v{m}</button>)}</div>
        {profile && <div className="play-rank"><RankBadge rank={profile.rank[type]} rating={profile.rating[type]} /><small>{type === 'duel' ? 'Duel' : 'Battle'} rating · goes up when you win matchmade games</small></div>}

        {searching ? (
          <button className="btn danger big find" onClick={() => void net.cancelMatch()}>
            <span className="spinner" /> {queue.state === 'found' ? 'Match found!' : `Searching ${fmtWait(queue.waited)}`} <small>Cancel</small>
          </button>
        ) : (
          <div className="find-row">
            <button className="btn primary big find" disabled={!online || !profile} onClick={() => find()}>Find match <b>→</b></button>
            <button className="btn find-bots" disabled={!online || !profile} onClick={() => find(true)} title="Practice against bots: starts at once, unranked, ¾ coins"><b>🤖</b><span>vs Bots</span></button>
          </div>
        )}
        <p className="hint">{searching && queue.state === 'searching'
          ? queue.searching > 1 ? `${queue.searching} players looking for ${queue.mode}v${queue.mode} ${queue.type}.` : queue.offerIn > 0 ? `Looking for rivals near your rank… (bots on offer in ${queue.offerIn}s)` : 'Still looking for rivals…'
          : 'Matched with players near your rating. vs Bots starts a practice match at once (unranked, ¾ coins).'}</p>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  );
}

/** Today's three quests: what to do, how far along, and what each pays. */
function Quests({ quests }: { quests: Quest[] }) {
  const left = useMemo(() => { const d = new Date(); const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); return Math.max(1, Math.round((end - d.getTime()) / 3600000)); }, []);
  return (
    <div className="quests">
      <header><b>Daily quests</b><small>new in {left}h</small></header>
      {quests.map(q => {
        const done = q.progress >= q.goal;
        return (
          <div key={q.id} className={`quest ${done ? 'done' : ''}`}>
            <span className="quest-text">{done ? '✓ ' : ''}{q.text}</span>
            <span className="quest-bar"><i style={{ width: `${Math.min(100, q.progress / q.goal * 100)}%` }} /></span>
            <em>{done ? 'Done' : q.goal >= 1000 ? `${Math.floor(q.progress / 100) / 10}k/${q.goal / 1000}k` : `${q.progress}/${q.goal}`}</em>
            <Coins value={q.coins} />
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── custom rooms

function CustomTab({ catalog, initialCode, online }: { catalog: Catalog | null; initialCode: string; online: boolean }) {
  const [code, setCode] = useState(initialCode);
  const [mode, setMode] = useState(3);
  const [map, setMap] = useState('glade');
  const [type, setType] = useState<MatchType>('battle');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rooms, setRooms] = useState<RoomListing[] | null>(null);
  const allMaps: MapInfo[] = catalog?.maps ?? [{ id: 'glade', name: 'Starfall Glade', theme: 'meadow', type: 'battle', lanes: 1, blurb: '' }];
  const maps = allMaps.filter(m => m.type === type);
  const pickType = (t: MatchType) => {
    setType(t);
    const first = allMaps.find(m => m.type === t);
    if (first) setMap(first.id);
    if (t === 'duel' && mode === 3) setMode(1);
  };
  const refresh = async () => setRooms(await net.listRooms());
  useEffect(() => { if (online) void refresh(); const id = window.setInterval(() => { if (online) void refresh(); }, 5000); return () => window.clearInterval(id); }, [online]);

  const run = async (fn: () => Promise<{ ok: boolean; error: string | null }>) => {
    setBusy(true); setErr('');
    try { const r = await fn(); if (!r.ok) setErr(r.error || 'Could not join.'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach the server.'); }
    finally { setBusy(false); }
  };
  const name = net.profile?.name || net.name || 'Wanderer';
  const mapName = useMemo(() => Object.fromEntries(allMaps.map(m => [m.id, m.name])), [allMaps]);

  return (
    <div className="custom">
      <section className="parchment custom-create">
        <h3>Create a room</h3>
        <div className="create-opts">
          <div className="type-pick">
            <button className={type === 'battle' ? 'on' : ''} onClick={() => pickType('battle')}><b>⚔ Battle</b></button>
            <button className={type === 'duel' ? 'on' : ''} onClick={() => pickType('duel')}><b>✦ Duel</b></button>
          </div>
          <div className="seg">{[1, 2, 3].map(m => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m}v{m}</button>)}</div>
        </div>
        <div className="maps">
          {maps.map(m => (
            <button key={m.id} className={`map-pick ${m.theme} ${map === m.id ? 'on' : ''}`} onClick={() => setMap(m.id)} title={m.blurb}>
              <MapPreview id={m.id} />
              <span className="map-name"><b>{m.name}</b><em>{laneLabel(m)}</em></span>
            </button>
          ))}
        </div>
        <button className="btn primary" disabled={!online || busy} onClick={() => run(() => net.createRoom(name, mode, map))}>Create room <b>→</b></button>
        <p className="hint dark">Friends join with the room code. Fill empty seats with bots. Custom games pay ¾ of the usual coins and don't change your rating.</p>
      </section>
      <section className="parchment custom-join">
        <h3>Join a room</h3>
        <label className="field">
          <span>Room code</span>
          <input className="code-input" value={code} maxLength={5} placeholder="ABCDE" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        </label>
        <button className="btn" disabled={!online || busy || code.length < 5} onClick={() => run(() => net.joinRoom(code, name))}>Join room <b>→</b></button>
        {err && <p className="err">{err}</p>}
        <h4 className="rooms-head">Open rooms <button className="link" onClick={refresh}>↻</button></h4>
        <div className="room-list">
          {rooms === null ? <p className="hint dark">Looking…</p> : rooms.length === 0 ? <p className="hint dark">No open rooms right now. Make one and tick “Public” in its lobby.</p> : rooms.map(r => (
            <button key={r.code} className="room-row" disabled={busy} onClick={() => run(() => net.joinRoom(r.code, name))}>
              <b>{r.host}</b><span>{r.type === 'duel' ? '✦' : '⚔'} {r.mode}v{r.mode} · {mapName[r.map] ?? r.map}</span><em>{r.players}/{r.seats}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ───────────────────────────── ladder

function LadderTab({ online }: { online: boolean }) {
  const [type, setType] = useState<MatchType>('battle');
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => { setRows(null); if (online) void net.leaderboard(type).then(setRows); }, [type, online]);
  const me = net.profile?.name;
  return (
    <div className="ladder parchment">
      <header><h3>Ladder</h3><div className="seg">{(['battle', 'duel'] as const).map(t => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t === 'battle' ? '⚔ Battle' : '✦ Duel'}</button>)}</div></header>
      <div className="ladder-rows">
        {rows === null ? <p className="hint dark">Loading…</p> : rows.length === 0 ? <p className="hint dark">Nobody has played a ranked {type} yet. Be the first!</p> : rows.map((r, i) => (
          <div key={i} className={`ladder-row ${r.name === me ? 'me' : ''}`}>
            <span className="pos">{i + 1}</span><img className="av-mini" src={avatarArt(r.avatar)} alt="" /><b>{r.name}</b><small>Lv {r.level}</small><RankBadge rank={r.rank} rating={r.rating} small /><em>{r.wins}W · {Math.round(r.wins / Math.max(1, r.games) * 100)}%</em>
          </div>
        ))}
      </div>
    </div>
  );
}

