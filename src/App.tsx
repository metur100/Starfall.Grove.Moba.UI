import { useCallback, useEffect, useRef, useState } from 'react';
import { net, type NetStatus } from './net/connection';
import type { MatchEnd, MatchFound, MatchType, Profile, QueueStatus, Rewards, RoomView } from './net/protocol';
import { transition, type GameState } from './state/machine';
import { MatchClient } from './game/client';
import { sfx } from './game/audio';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { HeroSelect } from './screens/HeroSelect';
import { MatchView } from './screens/MatchView';
import { MatchFoundDialog, QueuePill } from './ui/Queue';
import { Auth } from './screens/Auth';
import { social, useSocial } from './net/social';

const MATCH_STATES: GameState[] = ['LOADING', 'MATCH_START', 'PLAYING', 'VICTORY', 'DEFEAT'];

/** On phones and tablets, use the whole screen (no browser bars) and hold it sideways, where the game is laid out.
 *  Browsers only allow this after a tap, and some (iPhone Safari) not at all; then the page still fits the screen. */
function goFullscreen() {
  if (!matchMedia('(pointer: coarse)').matches || document.fullscreenElement) return;
  const el = document.documentElement;
  el.requestFullscreen?.({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => { /* not allowed here */ });
}

export default function App() {
  const [state, setState] = useState<GameState>('MAIN_MENU');
  const stateRef = useRef(state);
  const go = useCallback((to: GameState) => setState(s => { const n = transition(s, to); stateRef.current = n; return n; }), []);
  const [status, setStatus] = useState<NetStatus>(net.status);
  const [room, setRoom] = useState<RoomView | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const [client, setClient] = useState<MatchClient | null>(null);
  const clientRef = useRef<MatchClient | null>(null);
  const [result, setResult] = useState<MatchEnd | null>(null);
  const resultRef = useRef<MatchEnd | null>(null);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [catalog, setCatalog] = useState(net.catalog);
  const [profile, setProfile] = useState<Profile | null>(net.profile);
  const [queue, setQueue] = useState<QueueStatus>(net.queue);
  const [found, setFound] = useState<MatchFound | null>(null);
  const initialCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  // A password reset link from the email: ?reset=<code>.
  const [resetCode, setResetCode] = useState(() => new URLSearchParams(location.search).get('reset') ?? '');
  const endReset = () => { setResetCode(''); history.replaceState(null, '', location.pathname); };
  const s = useSocial();

  /** Which screen a room's phase belongs on. */
  const follow = useCallback((r: RoomView) => {
    const c = clientRef.current;
    switch (r.phase) {
      case 'lobby': clientRef.current = null; setClient(null); resultRef.current = null; setResult(null); go('LOBBY'); break;
      case 'heroSelect': go('HERO_SELECT'); break;
      case 'loading': if (c) go('LOADING'); break;
      case 'starting': if (c) go(stateRef.current === 'LOADING' ? 'MATCH_START' : stateRef.current === 'PLAYING' ? 'PLAYING' : 'MATCH_START'); break;
      case 'playing': if (c) go('PLAYING'); break;
      case 'ended': {
        const res = resultRef.current;
        if (c && res) go(res.winner === c.team ? 'VICTORY' : 'DEFEAT');
        else if (!c) go(r.matchmade ? 'MAIN_MENU' : 'LOBBY');
        break;
      }
    }
  }, [go]);

  useEffect(() => {
    const offs = [
      net.on('status', s => {
        setStatus(s);
        if ((s === 'reconnecting' || s === 'disconnected') && stateRef.current !== 'MAIN_MENU') go('DISCONNECTED');
      }),
      net.on('room', r => { roomRef.current = r; setRoom(r); setFound(null); follow(r); }),
      net.on('matchStart', init => {
        const c = new MatchClient(init);
        clientRef.current = c; setClient(c);
        resultRef.current = null; setResult(null); setRewards(null);
        go('LOADING');
        // Reconnecting mid-match: the room is already past loading.
        const r = roomRef.current;
        if (r && (r.phase === 'starting' || r.phase === 'playing')) follow(r);
      }),
      net.on('snap', ({ s, me }) => clientRef.current?.onSnapshot(s, me)),
      net.on('matchEnd', res => {
        resultRef.current = res; setResult(res);
        const c = clientRef.current;
        if (c) go(res.winner === c.team ? 'VICTORY' : 'DEFEAT');
      }),
      net.on('rewards', setRewards),
      net.on('profile', setProfile),
      net.on('signedOut', () => { setProfile(null); clientRef.current = null; setClient(null); setRoom(null); go('MAIN_MENU'); }),
      net.on('queue', q => { setQueue(q); if (q.state !== 'found') setFound(null); }),
      net.on('matchFound', setFound),
    ];
    void (async () => {
      if (await net.connect()) { setCatalog(net.catalog); setProfile(net.profile); await net.rejoin(); }
    })();
    return () => offs.forEach(o => o());
  }, [follow, go]);

  useEffect(() => {
    const unlock = () => { sfx.unlock(); goFullscreen(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const retry = async () => { if (await net.connect()) { setCatalog(net.catalog); setProfile(net.profile); const r = await net.rejoin(); if (!r?.ok && stateRef.current === 'DISCONNECTED') go('MAIN_MENU'); } };
  const leave = async () => {
    await net.leave();
    clientRef.current = null; setClient(null); setRoom(null); setResult(null); resultRef.current = null; setRewards(null);
    go('MAIN_MENU');
  };
  /** After a match: straight back into the queue for the same kind of game. */
  const playAgain = async (type: MatchType, mode: number) => { await leave(); await net.findMatch(type, mode); };

  const inMatch = client && catalog && (MATCH_STATES.includes(state) || (state === 'DISCONNECTED' && clientRef.current));
  // Playing needs an account: until this device is signed in, the menu is the sign-in screen.
  const signedIn = !!profile?.username && !resetCode;
  const joinInvite = async () => { const i = s.invite; social.clearInvite(); if (i) await net.joinRoom(i.code, profile?.name ?? ''); };
  return (
    <div className="app">
      {state === 'MAIN_MENU' && !signedIn && <Auth status={status} guest={profile} resetCode={resetCode} onRetry={retry} onResetDone={endReset} />}
      {state === 'MAIN_MENU' && signedIn && <Home status={status} catalog={catalog} profile={profile} queue={queue} initialCode={initialCode} onRetry={retry} />}
      {s.invite && signedIn && (state === 'MAIN_MENU' || state === 'LOBBY') && (
        <div className="invite-toast card">
          <span><b>{s.invite.from}</b> invites you to a {s.invite.type === 'duel' ? 'duel' : 'battle'} ({s.invite.mode}v{s.invite.mode})</span>
          <button className="btn small primary" onClick={joinInvite}>Join</button>
          <button className="link" onClick={() => social.clearInvite()}>Later</button>
        </div>
      )}
      {state === 'LOBBY' && room && <Lobby room={room} catalog={catalog} onLeave={leave} />}
      {state === 'HERO_SELECT' && room && catalog && <HeroSelect room={room} catalog={catalog} profile={profile} />}
      {inMatch && (
        <MatchView
          key={client.init.you + client.init.map.id + client.init.heroes.map(h => h.u).join()}
          state={state} client={client} room={room} result={result} rewards={rewards} catalog={catalog}
          onLoaded={() => void net.loaded()} onLeave={leave} onLobby={() => void net.backToLobby()} onPlayAgain={playAgain}
        />
      )}
      {(state === 'MAIN_MENU' || state === 'LOBBY') && <QueuePill queue={queue} />}
      {found && queue.state === 'found' && !inMatch && <MatchFoundDialog found={found} />}
      <div className="rotate-hint"><b>⟳</b><p>Turn your phone sideways to play</p></div>
      {state === 'DISCONNECTED' && (
        <div className="overlay disconnected">
          <h2>{status === 'reconnecting' || status === 'connecting' ? 'Reconnecting…' : 'Connection lost'}</h2>
          <p>{status === 'reconnecting' ? 'Hold on — your seat is kept for you. A bot steps in if you are gone for long.' : 'We couldn’t reach the server.'}</p>
          <div className="result-actions">
            {status !== 'reconnecting' && <button className="btn primary" onClick={retry}>Try again <b>↻</b></button>}
            <button className="btn ghost" onClick={leave}>Main menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
