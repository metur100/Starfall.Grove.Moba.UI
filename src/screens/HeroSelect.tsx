import { useEffect, useState } from 'react';
import { net } from '../net/connection';
import type { Catalog, Profile, RoomView } from '../net/protocol';
import { CHARM_LOOK, HEROES, HERO_ORDER, ROLE_ICON } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { HeroStage } from '../ui/HeroStage';
import { Coins } from '../ui/Bits';
import { KEY_LABELS } from '../game/input';
import { TIER_COLOR } from '../game/skins';
import { sfx } from '../game/audio';
import { buzz } from '../game/settings';
import { Fit } from '../ui/Fit';
import type { HeroId } from '../game/types';

type Props = { room: RoomView; catalog: Catalog; profile: Profile | null };

const BAR_NAMES = { damage: 'Damage', toughness: 'Toughness', control: 'Control', mobility: 'Mobility', support: 'Support' } as const;

export function HeroSelect({ room, catalog, profile }: Props) {
  const me = room.players.find(p => p.id === room.you)!;
  // Heroes this player may pick: owned and this week's free ones (everything without a profile).
  const playable = (id: string) => !profile || profile.heroes.includes(id) || profile.rotation.includes(id);
  const [sel, setSel] = useState<HeroId>(() => (me.hero as HeroId) || HERO_ORDER.find(playable) || 'mira');
  const [err, setErr] = useState('');
  const takenByTeam = new Set(room.players.filter(p => p.team === me.team && p.locked && p.id !== me.id).map(p => p.hero));
  const def = catalog.heroes.find(h => h.id === sel)!;
  const look = HEROES[sel];
  const mySkin = me.hero === sel ? me.skin : null;
  const ownedSkins = catalog.shop.skins.filter(s => s.hero === sel && profile?.skins.includes(s.id));

  useEffect(() => { if (!me.locked && playable(sel)) void net.pickHero(sel, false); }, [sel, me.locked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sfx.play('discover'); buzz(40); }, []);
  const lock = async () => { const e = await net.pickHero(sel, true); setErr(e || ''); if (!e) { sfx.play('learn'); buzz(30); } };
  const charm = async (id: string) => { const e = await net.setCharm(id); setErr(e || ''); sfx.play(e ? 'nope' : 'ui'); };
  const skin = async (id: string | null) => { const e = await net.pickSkin(id); setErr(e || ''); sfx.play(e ? 'nope' : 'page'); };

  return (
    <Fit className="screen">
      <div className="select">
        <h2 className="select-title">{room.matchmade ? 'Match found — choose your hero' : 'Choose your hero'}</h2>
        <div className="select-body">
          <div className="hero-grid">
            {HERO_ORDER.map(id => {
              const h = catalog.heroes.find(x => x.id === id)!;
              const taken = takenByTeam.has(id), can = playable(id), free = profile && !profile.heroes.includes(id) && profile.rotation.includes(id);
              return (
                <button key={id} disabled={me.locked || taken || !can} className={`hero-card ${sel === id ? 'on' : ''} ${taken ? 'taken' : ''} ${can ? '' : 'locked'}`} style={{ ['--hc' as string]: HEROES[id].color }} onClick={() => { setSel(id); sfx.play('page'); }}>
                  <img src={heroBust(id, profile?.equipped[id])} alt="" />
                  <b>{h.name}</b>
                  <small>{can ? <>{ROLE_ICON[h.role]} {h.role}</> : <Coins value={catalog.shop.heroPrices[id]} />}</small>
                  {taken && <em>Taken</em>}
                  {!can && <em>🔒</em>}
                  {free && <em className="free">Free</em>}
                </button>
              );
            })}
          </div>

          <article className="hero-detail parchment">
            <div className="hero-detail-top">
              <HeroStage hero={sel} skin={mySkin} size={150} />
              <div>
                <h1>{def.name}</h1>
                <h4>{def.title}</h4>
                <blockquote>“{look.quote}”</blockquote>
                <div className="facts">
                  <span><small>Role</small>{ROLE_ICON[def.role]} {def.role}</span>
                  <span><small>Difficulty</small><i className="stars">{'★'.repeat(def.difficulty)}{'☆'.repeat(5 - def.difficulty)}</i></span>
                </div>
              </div>
            </div>
            <p className="blurb">{look.blurb}</p>
            <div className="stat-bars">
              {(Object.keys(BAR_NAMES) as Array<keyof typeof BAR_NAMES>).map(k => (
                <div key={k} className="stat"><small>{BAR_NAMES[k]}</small><div className="pips">{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= look.bars[k] ? 'on' : ''} />)}</div></div>
              ))}
              <div className="stat nums"><small>Health {def.hp} · {def.resource} {def.mana} · Speed {def.speed} · Range {def.abilities[0].range}</small></div>
            </div>
            <ul className="ability-list">
              {def.abilities.map((a, slot) => {
                const l = look.abilities[a.id];
                return (
                  <li key={a.id} style={{ ['--c' as string]: l?.color }}>
                    <span className="ab-icon">{l?.icon}</span>
                    <div>
                      <b>{a.name} <kbd>{KEY_LABELS[slot]}</kbd>{slot === 4 && <em> Ultimate · level {catalog.ultLevel}</em>}{slot === 0 && <em> Basic attack</em>}{room.type === 'duel' && def.duelSlots.includes(slot) && <em className="duel-tag"> ★ duel upgrade</em>}</b>
                      <p>{l?.text}</p>
                      {slot > 0 && <small>{a.cooldown}s cooldown · {a.cost} {def.resource.toLowerCase()}{a.range ? ` · range ${a.range}` : ''}</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>

          <aside className="select-team">
            <div className={`timer card ${room.timer <= 10 ? 'hurry' : ''}`}>{room.timer}s</div>
            {[1, 2].map(team => (
              <div key={team} className={`pick-col t${team}`}>
                <h4>{team === me.team ? 'Your team' : 'Enemy team'}</h4>
                {room.players.filter(p => p.team === team).map(p => (
                  <div key={p.id} className={`pick ${p.locked ? 'locked' : ''} ${p.id === me.id ? 'me' : ''}`}>
                    {p.hero ? <img src={heroBust(p.hero as HeroId, p.skin)} alt="" /> : <span className="q">?</span>}
                    <div><b>{p.name}</b><small>{p.hero ? catalog.heroes.find(h => h.id === p.hero)?.name : 'choosing…'}{p.locked ? ' ✓' : ''}</small></div>
                    {p.hero && CHARM_LOOK[p.charm] && team === me.team && <i className="pick-charm" style={{ color: CHARM_LOOK[p.charm].color }}>{CHARM_LOOK[p.charm].icon}</i>}
                  </div>
                ))}
              </div>
            ))}
            <div className="loadout">
              <small>Charm · {catalog.shop.charms.find(c => c.id === me.charm)?.name}</small>
              <div className="chips">
                {catalog.shop.charms.map(c => (
                  <button key={c.id} className={`chip-btn ${me.charm === c.id ? 'on' : ''}`} style={{ ['--c' as string]: CHARM_LOOK[c.id]?.color }} title={`${c.name}: ${c.text}`} disabled={me.locked && room.phase !== 'heroSelect'} onClick={() => charm(c.id)}>{CHARM_LOOK[c.id]?.icon}</button>
                ))}
              </div>
              {ownedSkins.length > 0 && me.hero === sel && (
                <>
                  <small>Skin</small>
                  <div className="chips">
                    <button className={`chip-btn bust ${!mySkin ? 'on' : ''}`} title="Classic" onClick={() => skin(null)}><img src={heroBust(sel)} alt="" /></button>
                    {ownedSkins.map(s => <button key={s.id} className={`chip-btn bust ${mySkin === s.id ? 'on' : ''}`} style={{ ['--c' as string]: TIER_COLOR[s.tier] }} title={s.name} onClick={() => skin(s.id)}><img src={heroBust(sel, s.id)} alt="" /></button>)}
                  </div>
                </>
              )}
            </div>
            {err && <span className="err">{err}</span>}
            <button className="btn primary big lock" disabled={me.locked || takenByTeam.has(sel) || !playable(sel)} onClick={lock}>{me.locked ? `Locked in` : `Lock in ${def.name}`} <b>✓</b></button>
          </aside>
        </div>
      </div>
    </Fit>
  );
}
