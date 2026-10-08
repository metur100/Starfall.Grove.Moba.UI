import { useEffect, useState } from 'react';
import { net } from '../net/connection';
import { social, useSocial } from '../net/social';
import type { Friend } from '../net/protocol';
import { ChatBox, PlayerMenu } from '../ui/Chat';
import { RankBadge } from '../ui/Bits';
import { sfx } from '../game/audio';
import { avatarArt } from '../game/art/avatar';

/** Friends: add one by username, answer requests, see who is online and what they're doing, and message them. */
export function Friends({ online }: { online: boolean }) {
  const s = useSocial();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);
  const [talk, setTalk] = useState<Friend | null>(null);
  const [menu, setMenu] = useState<Friend | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);
  useEffect(() => { if (!online) return; void social.refreshFriends(); const id = window.setInterval(() => void social.refreshFriends(), 15000); return () => window.clearInterval(id); }, [online]);
  const f = s.friends;

  const add = async () => {
    const e = await net.addFriend(name.trim());
    setMsg(e ? { text: e, good: false } : { text: `Friend request sent to ${name.trim()}.`, good: true });
    sfx.play(e ? 'nope' : 'ui');
    if (!e) { setName(''); void social.refreshFriends(); }
  };
  const answer = async (id: string, yes: boolean) => { await net.answerFriend(id, yes); sfx.play(yes ? 'questDone' : 'page'); void social.refreshFriends(); };
  const remove = async (fr: Friend) => { await net.removeFriend(fr.id); setMenu(null); if (talk?.id === fr.id) setTalk(null); void social.refreshFriends(); };

  return (
    <div className="friends">
      <section className="parchment friends-list">
        <form className="friend-add" onSubmit={e => { e.preventDefault(); if (name.trim()) void add(); }}>
          <label className="field compact"><span>Add a friend by username</span><input value={name} maxLength={16} autoCapitalize="none" spellCheck={false} onChange={e => setName(e.target.value)} /></label>
          <button className="btn small" type="submit" disabled={!online || !name.trim()}>Add</button>
        </form>
        {msg && <p className={msg.good ? 'ok-msg' : 'err'}>{msg.text}</p>}
        {f && f.requests.length > 0 && (
          <div className="friend-group">
            <h4>Requests</h4>
            {f.requests.map(r => (
              <div key={r.id} className="friend-row request">
                <img className="av-mini" src={avatarArt(r.avatar)} alt="" />
                <span className="fr-name"><b>{r.name}</b><small>Lv {r.level}</small></span>
                <button className="btn small primary" onClick={() => answer(r.id, true)}>Accept</button>
                <button className="link" onClick={() => answer(r.id, false)}>Decline</button>
              </div>
            ))}
          </div>
        )}
        <div className="friend-group">
          <h4>Friends {f ? <small>· {f.friends.filter(x => x.online).length} online</small> : null}</h4>
          {!f ? <p className="hint dark">Loading…</p> : f.friends.length === 0 ? <p className="hint dark">No friends yet. Add someone by their username, or tap a name in a match chat.</p> : f.friends.map(fr => (
            <div key={fr.id} className={`friend-row ${fr.online ? 'on' : 'off'} ${talk?.id === fr.id ? 'sel' : ''}`}>
              <span className="fr-av"><img className="av-mini" src={avatarArt(fr.avatar)} alt="" /><i className="dot" /></span>
              <button className="fr-name" onClick={() => { setTalk(fr); sfx.play('page'); }}>
                <b>{fr.name}</b><small>{fr.status} · Lv {fr.level}</small>
              </button>
              <RankBadge rank={fr.rank} small />
              {(s.unread[fr.id] ?? 0) > 0 && <em className="badge">{s.unread[fr.id]}</em>}
              <button className="icon-mini" title="More" onClick={() => setMenu(fr)}>⋯</button>
            </div>
          ))}
        </div>
        {f && f.blocked.length > 0 && (
          <div className="friend-group">
            <button className="link" onClick={() => setShowBlocked(b => !b)}>{showBlocked ? 'Hide' : 'Show'} blocked players ({f.blocked.length})</button>
            {showBlocked && f.blocked.map(b => (
              <div key={b.id} className="friend-row off"><span className="fr-name"><b>{b.name}</b></span><button className="link" onClick={async () => { await net.block(b.id, false); void social.refreshFriends(); }}>Unblock</button></div>
            ))}
          </div>
        )}
      </section>
      <section className="parchment friends-talk">
        {talk ? (
          <>
            <header><h3>{talk.name}</h3><small>{talk.online ? talk.status : 'Offline — messages reach online friends only'}</small></header>
            <ChatBox key={talk.id} mode="friend" friendId={talk.id} placeholder={`Message ${talk.name}…`} />
          </>
        ) : <p className="hint dark friends-empty">Pick a friend to send them a message. In a custom room's lobby you can invite online friends to play.</p>}
      </section>
      {menu && (
        <div className="pm-wrap" onClick={() => setMenu(null)}>
          <div onClick={e => e.stopPropagation()}>
            <PlayerMenu id={menu.id} name={menu.name} onClose={() => setMenu(null)} />
            <button className="btn small danger remove-friend" onClick={() => remove(menu)}>Remove friend</button>
          </div>
        </div>
      )}
    </div>
  );
}
