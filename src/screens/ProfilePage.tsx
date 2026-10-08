import { useState, type FormEvent } from 'react';
import { net } from '../net/connection';
import type { Catalog, Profile } from '../net/protocol';
import { HERO_ORDER, isHero } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { Coins, RankBadge, XpBar } from '../ui/Bits';
import { sfx } from '../game/audio';
import { avatarArt } from '../game/art/avatar';
import { AvatarPicker } from '../ui/AvatarPicker';
import { LegalLinks } from '../ui/Settings';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};

/** The player's page: account, level, ranks, stats and recent matches, with logging out and deleting the account. */
export function ProfilePage({ catalog, profile: p }: { catalog: Catalog; profile: Profile }) {
  const [msg, setMsg] = useState('');
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(0);
  const del = async () => {
    if (deleting < 1) { setDeleting(1); return; }
    const e = await net.deleteProfile();
    setDeleting(0); setMsg(e ?? 'Your profile was deleted. You start fresh.'); sfx.play(e ? 'nope' : 'page');
  };

  // Changing the username: an inline field under the account row.
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameErr, setRenameErr] = useState('');
  const [busy, setBusy] = useState(false);
  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const err = await net.changeUsername(newName.trim());
    setBusy(false);
    if (err) { setRenameErr(err); sfx.play('nope'); return; }
    setRenaming(false); setRenameErr(''); setMsg('Your username is changed. Log in with the new one from now on.'); sfx.play('page');
  };
  const [sent, setSent] = useState('');
  const resend = async () => {
    const err = await net.resendConfirmation();
    setSent(err ?? `A new link is on its way to ${p.email}. Check your inbox (and spam).`); sfx.play(err ? 'nope' : 'page');
  };

  const kda = p.games ? `${(p.kills / p.games).toFixed(1)} / ${(p.deaths / p.games).toFixed(1)} / ${(p.assists / p.games).toFixed(1)}` : '—';
  const heroName = (id: string) => catalog.heroes.find(h => h.id === id)?.name ?? id;

  return (
    <div className="profile-page">
      {picking && <AvatarPicker catalog={catalog} profile={p} onClose={() => setPicking(false)} />}
      <section className="parchment prof-main">
        <div className="prof-account">
          <button className="prof-av" title="Change your picture" onClick={() => { setPicking(true); sfx.play('page'); }}><img src={avatarArt(p.avatar)} alt="Your picture" /><em>✎</em></button>
          <span><small>Username</small><b>{p.username}</b></span>
          {!renaming && <button className="link rename-link" onClick={() => { setRenaming(true); setNewName(p.username ?? ''); setRenameErr(''); setMsg(''); }}>✎ Change</button>}
          <span><small>Email</small><b>{p.email}</b></span>
          <button className="btn small" onClick={() => { sfx.play('page'); void net.logout(); }}>Log out</button>
        </div>
        {renaming && (
          <form className="rename-form" onSubmit={rename}>
            <label className="field compact"><span>New username (3 to 16 letters, digits or _)</span>
              <input value={newName} onChange={e => { setNewName(e.target.value); setRenameErr(''); }} maxLength={16} autoFocus autoComplete="username"
                autoCapitalize="none" spellCheck={false} pattern="[A-Za-z0-9_]{3,16}" required />
            </label>
            <div className="rename-actions">
              <button className="btn small primary" disabled={busy || newName.trim() === p.username}>{busy ? <span className="spinner" /> : null}Save</button>
              <button type="button" className="link" onClick={() => setRenaming(false)}>Cancel</button>
            </div>
            {renameErr && <p className="err">{renameErr}</p>}
          </form>
        )}
        {!p.emailConfirmed && (
          <div className="confirm-banner">
            <span className="ico" aria-hidden="true">✉</span>
            <span><b>Please confirm your email</b><small>We sent a link to {p.email} when you signed up. It keeps your account safe and lets you reset your password.</small></span>
            <button className="btn small" onClick={resend}>Send again</button>
            {sent && <p className="sent">{sent}</p>}
          </div>
        )}
        <div className="prof-level"><XpBar level={p.level} xp={p.xp} next={p.xpNext} /><small>{p.xp} / {p.xpNext} XP · next level pays <Coins value={(p.level + 1) % 5 === 0 ? 400 : 100} /></small></div>
        <div className="prof-ranks">
          <div><small>⚔ Battle</small><RankBadge rank={p.rank.battle} rating={p.rating.battle} /></div>
          <div><small>✦ Duel</small><RankBadge rank={p.rank.duel} rating={p.rating.duel} /></div>
        </div>
        <div className="prof-stats">
          <span><b>{p.games}</b><small>Games</small></span>
          <span><b>{p.games ? Math.round(p.wins / p.games * 100) : 0}%</b><small>Wins</small></span>
          <span><b>{kda}</b><small>K / D / A</small></span>
          <span><b>{p.heroes.length}/{HERO_ORDER.length}</b><small>Heroes</small></span>
          <span><b>{p.skins.length}/{catalog.shop.skins.length}</b><small>Skins</small></span>
        </div>
        <p className="hint dark">Play on any device: log in there with your username and password. Forgot it? Log out and use “Forgot password?”.</p>
        <div className="prof-delete">
          <button className={`link ${deleting ? 'danger-link' : ''}`} onClick={del}>{deleting ? 'Tap again: delete my account, coins, heroes, skins and friends for good' : 'Delete my profile'}</button>
          {deleting > 0 && <button className="link" onClick={() => setDeleting(0)}>Keep it</button>}
        </div>
        {msg && <p className="ok-msg">{msg}</p>}
        <LegalLinks />
      </section>
      <section className="parchment prof-recent">
        <h3>Recent matches</h3>
        {p.recent.length === 0 ? <p className="hint dark">No matches yet. Hit Play!</p> : (
          <div className="recent-rows">
            {p.recent.map((r, i) => (
              <div key={i} className={`recent-row ${r.won ? 'won' : 'lost'}`}>
                {isHero(r.hero) && <img src={heroBust(r.hero, p.equipped[r.hero])} alt="" />}
                <span className="res">{r.won ? 'Victory' : 'Defeat'}<small>{r.type === 'duel' ? '✦ Duel' : '⚔ Battle'} {r.mode}v{r.mode}{r.ranked ? ' · ranked' : ''}</small></span>
                <span className="kda">{r.k}/{r.d}/{r.a}<small>{heroName(r.hero)}</small></span>
                <span className="gain"><Coins value={r.coins} delta /><small>{ago(r.at)}</small></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
