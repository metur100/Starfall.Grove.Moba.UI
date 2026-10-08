import { useEffect, useRef, useState } from 'react';
import { net } from '../net/connection';
import { social, useSocial } from '../net/social';
import type { ChatMsg } from '../net/protocol';
import { sfx } from '../game/audio';

// Chat: the log of messages and the line to write in, for rooms, hero select, matches and private messages. Tapping a
// player's name opens a small menu to add them as a friend, block them or report them (and the message).

const QUICK = ['Good luck, have fun!', 'Well played!', 'Help me!', 'On my way', 'Fall back!', 'Push now!', 'Good game!'];

/** The menu for a player in the chat: add as friend, block, report. */
export function PlayerMenu({ id, name, message, onClose }: { id: string; name: string; message?: string; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const [reporting, setReporting] = useState(false);
  const run = async (fn: () => Promise<string | null>, done: string) => { const e = await fn(); setMsg(e ?? done); sfx.play(e ? 'nope' : 'ui'); };
  const reasons = ['Offensive name', 'Offensive chat', 'Cheating', 'Leaving matches', 'Spam'];
  return (
    <div className="player-menu card" onClick={e => e.stopPropagation()}>
      <header><b>{name}</b><button className="close light" onClick={onClose}>✕</button></header>
      {reporting ? (
        <div className="pm-reasons">
          <small>What's wrong?</small>
          {reasons.map(r => <button key={r} className="pm-btn" onClick={() => run(() => net.report(id, r, message), 'Thanks — we will look into it.').then(() => setReporting(false))}>{r}</button>)}
          <button className="pm-btn ghost" onClick={() => setReporting(false)}>Back</button>
        </div>
      ) : (
        <div className="pm-actions">
          <button className="pm-btn" onClick={() => run(() => net.addFriend(name), 'Friend request sent.')}>＋ Add friend</button>
          <button className="pm-btn" onClick={() => run(() => net.block(id, true), `${name} is blocked. You won't see their messages.`)}>⦸ Block</button>
          <button className="pm-btn danger" onClick={() => setReporting(true)}>⚑ Report</button>
        </div>
      )}
      {msg && <p className="pm-msg">{msg}</p>}
    </div>
  );
}

function Line({ m, onName }: { m: ChatMsg; onName: (m: ChatMsg) => void }) {
  const mine = m.fromId === net.profile?.id;
  return (
    <div className={`chat-line ${m.scope} ${mine ? 'mine' : ''}`}>
      {m.scope === 'team' && <em>[team]</em>}
      <button className="chat-name" disabled={mine} onClick={() => onName(m)}>{m.from}:</button>
      <span>{m.text}</span>
    </div>
  );
}

type Props = {
  /** Which messages to show and where to send: the room or match, or one friend's private thread. */
  mode: 'room' | 'friend';
  friendId?: string;
  /** In a match: "all" or "team" can be chosen; elsewhere it is always "all". */
  teamChat?: boolean;
  /** Overlay: messages fade after a while and the input opens on demand (the match). */
  overlay?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSent?: () => void;
};

export function ChatBox({ mode, friendId, teamChat = false, overlay = false, placeholder, autoFocus, onSent }: Props) {
  const s = useSocial();
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'all' | 'team'>(teamChat ? 'team' : 'all');
  const [err, setErr] = useState('');
  const [menu, setMenu] = useState<ChatMsg | null>(null);
  const [quick, setQuick] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const list = mode === 'friend' ? (s.threads[friendId ?? ''] ?? []) : s.room;
  const now = Date.now();
  const shown = overlay ? list.filter(m => now - m.at < 12000).slice(-6) : list;
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [list.length]);
  useEffect(() => { if (mode === 'friend' && friendId) { social.openThread(friendId); return () => social.openThread(null); } }, [mode, friendId]);
  // The overlay fades old lines: re-render now and then.
  const [, tick] = useState(0);
  useEffect(() => { if (!overlay) return; const id = window.setInterval(() => tick(n => n + 1), 1000); return () => window.clearInterval(id); }, [overlay]);

  const send = async (t = text) => {
    const v = t.trim();
    if (!v) return;
    const e = mode === 'friend' ? await net.chat('friend', v, friendId) : await net.chat(scope, v);
    if (e) { setErr(e); sfx.play('nope'); } else { setErr(''); setText(''); setQuick(false); onSent?.(); }
  };

  return (
    <div className={`chat ${overlay ? 'overlay-chat' : 'panel-chat'}`}>
      <div className="chat-log" ref={log} aria-live="polite">
        {shown.length === 0 && !overlay && <p className="chat-empty">{mode === 'friend' ? 'Say hello!' : 'No messages yet.'}</p>}
        {shown.map(m => <Line key={m.id} m={m} onName={setMenu} />)}
      </div>
      {!overlay && <>
      <form className="chat-input" onSubmit={e => { e.preventDefault(); void send(); }}>
        {teamChat && <button type="button" className={`chat-scope ${scope}`} onClick={() => setScope(x => x === 'team' ? 'all' : 'team')} title="Who reads it">{scope === 'team' ? 'Team' : 'All'}</button>}
        {mode === 'room' && <button type="button" className="chat-quick-btn" onClick={() => setQuick(q => !q)} title="Quick messages">☰</button>}
        <input value={text} maxLength={200} placeholder={placeholder ?? 'Say something…'} autoFocus={autoFocus} onChange={e => setText(e.target.value)} onKeyDown={e => e.stopPropagation()} />
        <button type="submit" className="chat-send" disabled={!text.trim()}>➤</button>
      </form>
      {quick && <div className="chat-quick">{QUICK.map(q => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>}
      {err && <p className="chat-err">{err}</p>}
      </>}
      {menu && <div className="pm-wrap" onClick={() => setMenu(null)}><PlayerMenu id={menu.fromId} name={menu.from} message={menu.text} onClose={() => setMenu(null)} /></div>}
    </div>
  );
}
