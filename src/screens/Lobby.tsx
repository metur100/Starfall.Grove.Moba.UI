import { useState } from 'react';
import { net } from '../net/connection';
import type { Catalog, RoomView } from '../net/protocol';
import { laneLabel } from './Home';
import { Fit } from '../ui/Fit';
import { ChatBox } from '../ui/Chat';
import { social, useSocial } from '../net/social';
import { useEffect } from 'react';

type Props = { room: RoomView; catalog: Catalog | null; onLeave: () => void };

export function Lobby({ room, catalog, onLeave }: Props) {
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const me = room.players.find(p => p.id === room.you);
  const host = room.hostId === room.you;
  const act = async (p: Promise<string | null>) => { const e = await p; setErr(e || ''); };
  const copy = async (what: 'code' | 'link') => {
    const text = what === 'code' ? room.code : `${location.origin}${location.pathname}?room=${room.code}`;
    try {
      if (what === 'link' && navigator.share) await navigator.share({ title: 'Mini Rift', text: `Join my Mini Rift room: ${room.code}`, url: text });
      else await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* not allowed, or the share was dismissed */ }
  };
  const full = (t: number) => room.players.filter(p => p.team === t).length >= room.mode;
  const humansReady = room.players.filter(p => !p.bot && p.id !== room.hostId).every(p => p.ready);
  const teamsFull = full(1) && full(2);

  return (
    <Fit className="screen">
      <div className="lobby">
        <header className="lobby-head">
          <button className="btn ghost small" onClick={onLeave}>← Leave</button>
          <div className="room-code card">
            <small>Room code</small>
            <b>{room.code}</b>
            <span className="code-links">{copied ? <em>Copied!</em> : <><button className="link" onClick={() => copy('code')}>Copy code</button><button className="link" onClick={() => copy('link')}>Invite link</button></>}</span>
          </div>
          <div className="lobby-mode card">
            <small>{room.type === 'duel' ? 'Duel' : 'Battle'} · {catalog?.maps.find(m => m.id === room.map)?.name ?? room.map}</small>
            <b>{room.mode}v{room.mode}</b>
          </div>
        </header>

        {host && (
          <div className="host-bar parchment">
            <div className="seg">{[1, 2, 3].map(m => <button key={m} className={room.mode === m ? 'on' : ''} onClick={() => act(net.setMode(m))}>{m}v{m}</button>)}</div>
            <div className="seg">{(['battle', 'duel'] as const).map(t => <button key={t} className={room.type === t ? 'on' : ''} onClick={() => { const first = catalog?.maps.find(m => m.type === t); if (first && room.type !== t) act(net.setMap(first.id)); }}>{t === 'battle' ? '⚔ Battle' : '✦ Duel'}</button>)}</div>
            <div className="seg">{(catalog?.maps ?? []).filter(m => m.type === room.type).map(m => <button key={m.id} className={room.map === m.id ? 'on' : ''} onClick={() => act(net.setMap(m.id))}>{m.name} <small>{laneLabel(m)}</small></button>)}</div>
            <div className="seg">{[false, true].map(v => <button key={String(v)} className={room.public === v ? 'on' : ''} onClick={() => act(net.setPublic(v))}>{v ? '◎ Public' : '🔒 Private'}</button>)}</div>
          </div>
        )}

        <div className="teams">
          {[1, 2].map(team => {
            const players = room.players.filter(p => p.team === team);
            return (
              <section key={team} className={`team-col t${team} parchment`}>
                <h3>
                  {team === 1 ? 'Blue team' : 'Red team'}
                  {me && me.team !== team && !full(team) && <button className="link" onClick={() => act(net.switchTeam())}>Switch here</button>}
                  {me && me.team !== team && full(team) && players.some(p => p.bot) && <button className="link" onClick={() => act(net.switchTeam())}>Swap with a bot</button>}
                </h3>
                {players.map(p => (
                  <div key={p.id} className={`seat ${p.id === room.you ? 'me' : ''} ${!p.connected ? 'off' : ''}`}>
                    <span className="seat-lvl">{p.level}</span>
                    <span className="seat-name">{p.id === room.hostId ? '♛ ' : ''}{p.name}{p.id === room.you ? ' (you)' : ''}</span>
                    <span className={`seat-state ${p.ready || p.bot || p.id === room.hostId ? 'ok' : ''}`}>{!p.connected ? 'reconnecting…' : p.bot ? 'bot' : p.id === room.hostId ? 'host' : p.ready ? 'ready' : 'not ready'}</span>
                    {host && p.id !== room.you && <button className="x" title="Remove" onClick={() => act(net.removePlayer(p.id))}>✕</button>}
                  </div>
                ))}
                {Array.from({ length: Math.max(0, room.mode - players.length) }, (_, i) => (
                  <div key={i} className="seat empty">
                    <span>Open seat</span>
                    {host && <button className="link" onClick={() => act(net.addBot(team))}>+ Add bot</button>}
                  </div>
                ))}
                {/* Always three rows, so the lobby keeps its size when the mode changes. */}
                {Array.from({ length: Math.max(0, 3 - Math.max(room.mode, players.length)) }, (_, i) => <div key={`g${i}`} className="seat ghost" aria-hidden />)}
              </section>
            );
          })}
        </div>

        <div className="lobby-social">
          <section className="parchment lobby-chat"><h4>Room chat</h4><ChatBox mode="room" placeholder="Say hello to the room…" /></section>
          <InviteFriends />
        </div>

        {err && <p className="err center">{err}</p>}
        <footer className="lobby-foot">
          {host ? (
            <>
              {!teamsFull && <button className="btn" onClick={() => act(net.fillBots())}>Fill empty seats with bots</button>}
              <button className="btn primary" disabled={!teamsFull || !humansReady} onClick={() => act(net.startMatch())}>
                {!teamsFull ? `Need ${room.mode}v${room.mode}` : !humansReady ? 'Waiting for ready…' : 'Choose heroes'} <b>→</b>
              </button>
            </>
          ) : (
            <button className={`btn ${me?.ready ? '' : 'primary'}`} onClick={() => act(net.setReady(!me?.ready))}>{me?.ready ? 'Not ready' : 'Ready!'}</button>
          )}
          <p className="hint">Share the code or invite link with friends{room.public ? ' — this room is listed under Custom → Open rooms' : ''}, or fill the seats with bots and practise.</p>
        </footer>
      </div>
    </Fit>
  );
}

/** Online friends, with a button to invite each one to this room. */
function InviteFriends() {
  const s = useSocial();
  const [sent, setSent] = useState<Record<string, string>>({});
  useEffect(() => { void social.refreshFriends(); }, []);
  const online = (s.friends?.friends ?? []).filter(f => f.online);
  const invite = async (id: string) => { const e = await net.inviteFriend(id); setSent(x => ({ ...x, [id]: e ?? 'Invited!' })); };
  return (
    <section className="parchment lobby-invite">
      <h4>Invite friends</h4>
      {online.length === 0 ? <p className="hint dark">None of your friends is online. Share the code or the invite link instead.</p> : online.map(f => (
        <div key={f.id} className="friend-row on">
          <i className="dot" /><span className="fr-name"><b>{f.name}</b><small>{f.status}</small></span>
          {sent[f.id] ? <em className="sent">{sent[f.id]}</em> : <button className="btn small" onClick={() => invite(f.id)}>Invite</button>}
        </div>
      ))}
    </section>
  );
}
