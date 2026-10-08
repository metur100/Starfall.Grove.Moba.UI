import { useState } from 'react';
import { net } from '../net/connection';
import type { Catalog, Profile } from '../net/protocol';
import { HERO_ORDER } from '../game/heroes';
import { avatarArt } from '../game/art/avatar';
import { sfx } from '../game/audio';

type Pick = { id: string; name: string; lock: string | null };

/** Choosing the profile picture: hero portraits (owned heroes), emblems and the valley's creatures, some of them
 *  unlocked at a level. Saved at once on tap. */
export function AvatarPicker({ catalog, profile: p, onClose }: { catalog: Catalog; profile: Profile; onClose: () => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const heroName = (id: string) => catalog.heroes.find(h => h.id === id)?.name ?? id;
  const groups: Array<[string, Pick[]]> = [
    ['Heroes', HERO_ORDER.map(h => ({ id: `hero:${h}`, name: heroName(h), lock: p.heroes.includes(h) ? null : 'Unlock hero' }))],
    ['Emblems', catalog.shop.avatars.filter(a => a.group === 'emblem').map(a => ({ id: a.id, name: a.name, lock: p.level < a.level ? `Lv ${a.level}` : null }))],
    ['Creatures', catalog.shop.avatars.filter(a => a.group === 'creature').map(a => ({ id: a.id, name: a.name, lock: p.level < a.level ? `Lv ${a.level}` : null }))],
  ];
  const choose = async (a: Pick) => {
    if (a.lock) { setErr(a.lock === 'Unlock hero' ? `Unlock ${a.name} in Heroes to use this picture.` : `Reach level ${a.lock.slice(3)} to use ${a.name}.`); sfx.play('nope'); return; }
    if (busy || a.id === p.avatar) return;
    setBusy(a.id); setErr('');
    const e = await net.setAvatar(a.id);
    setBusy('');
    if (e) { setErr(e); sfx.play('nope'); } else sfx.play('learn');
  };
  return (
    <div className="av-wrap" onClick={onClose}>
      <div className="av-picker parchment" role="dialog" aria-label="Choose your picture" onClick={e => e.stopPropagation()}>
        <header>
          <img className="av-now" src={avatarArt(p.avatar)} alt="" />
          <span><h3>Your picture</h3><small>Friends and the ladder see it next to your name.</small></span>
          <button className="btn small" onClick={onClose}>Done</button>
        </header>
        {err && <p className="err">{err}</p>}
        <div className="av-groups">
          {groups.map(([title, list]) => (
            <section key={title}>
              <h4>{title}</h4>
              <div className="av-grid">
                {list.map(a => (
                  <button key={a.id} className={`av-pick ${a.id === p.avatar ? 'on' : ''} ${a.lock ? 'locked' : ''}`} title={a.name} onClick={() => choose(a)}>
                    <img src={avatarArt(a.id)} alt="" loading="lazy" />
                    {a.lock ? <em>🔒{a.lock.startsWith('Lv') ? ` ${a.lock}` : ''}</em> : busy === a.id ? <em><span className="spinner" /></em> : null}
                    <small>{a.name}</small>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
