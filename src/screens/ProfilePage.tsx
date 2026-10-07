import { useState } from 'react';
import { net } from '../net/connection';
import type { Catalog, Profile } from '../net/protocol';
import { HERO_ORDER, isHero } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { Coins, RankBadge, XpBar } from '../ui/Bits';
import { sfx } from '../game/audio';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 90 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};

/** The player's page: name, level, ranks, stats, recent matches, and the account key that carries the profile to
 *  another device. */
export function ProfilePage({ catalog, profile: p }: { catalog: Catalog; profile: Profile }) {
  const [name, setName] = useState(p.name);
  const [msg, setMsg] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [key, setKey] = useState('');
  const saveName = async () => { const e = await net.setName(name.trim()); setMsg(e ?? 'Name saved.'); sfx.play(e ? 'nope' : 'learn'); };
  const copyKey = async () => { try { await navigator.clipboard.writeText(net.token); setMsg('Account key copied.'); } catch { setShowKey(true); } };
  const useKey = async () => { const e = await net.useKey(key); setMsg(e ?? 'Switched account.'); setKey(''); sfx.play(e ? 'nope' : 'questDone'); };
  const kda = p.games ? `${(p.kills / p.games).toFixed(1)} / ${(p.deaths / p.games).toFixed(1)} / ${(p.assists / p.games).toFixed(1)}` : '—';
  const heroName = (id: string) => catalog.heroes.find(h => h.id === id)?.name ?? id;

  return (
    <div className="profile-page">
      <section className="parchment prof-main">
        <div className="prof-name">
          <label className="field compact"><span>Name</span><input value={name} maxLength={16} onChange={e => setName(e.target.value)} /></label>
          <button className="btn small" disabled={!name.trim() || name.trim() === p.name} onClick={saveName}>Save</button>
        </div>
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
        <div className="prof-key">
          <small>Account key — keeps your profile on another device. Keep it secret.</small>
          <div className="key-row">
            <code>{showKey ? net.token.match(/.{1,8}/g)!.join('-') : '••••••••-••••••••-••••••••-••••••••'}</code>
            <button className="link" onClick={() => setShowKey(s => !s)}>{showKey ? 'Hide' : 'Show'}</button>
            <button className="link" onClick={copyKey}>Copy</button>
          </div>
          <div className="key-row">
            <input placeholder="Paste a key from another device" value={key} onChange={e => setKey(e.target.value)} />
            <button className="btn small" disabled={key.replace(/[^0-9a-f]/gi, '').length !== 32} onClick={useKey}>Use</button>
          </div>
        </div>
        {msg && <p className="ok-msg">{msg}</p>}
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
