import { useEffect, useState } from 'react';
import { net } from '../net/connection';
import type { Catalog, RoomView } from '../net/protocol';
import { HEROES, HERO_ORDER, ROLE_ICON } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { HeroStage } from '../ui/HeroStage';
import { KEY_LABELS } from '../game/input';
import { sfx } from '../game/audio';
import { Fit } from '../ui/Fit';
import type { HeroId } from '../game/types';

type Props = { room: RoomView; catalog: Catalog };

const BAR_NAMES = { damage: 'Damage', toughness: 'Toughness', control: 'Control', mobility: 'Mobility', support: 'Support' } as const;

export function HeroSelect({ room, catalog }: Props) {
  const me = room.players.find(p => p.id === room.you)!;
  const [sel, setSel] = useState<HeroId>((me.hero as HeroId) || 'mira');
  const [err, setErr] = useState('');
  const takenByTeam = new Set(room.players.filter(p => p.team === me.team && p.locked && p.id !== me.id).map(p => p.hero));
  const def = catalog.heroes.find(h => h.id === sel)!;
  const look = HEROES[sel];

  useEffect(() => { if (!me.locked) void net.pickHero(sel, false); }, [sel, me.locked]);
  const lock = async () => { const e = await net.pickHero(sel, true); setErr(e || ''); if (!e) sfx.play('learn'); };

  return (
    <Fit className="screen">
      <div className="select">
        <h2 className="select-title">Choose your hero</h2>
        <div className="select-body">
          <div className="hero-grid">
            {HERO_ORDER.map(id => {
              const h = catalog.heroes.find(x => x.id === id)!;
              const taken = takenByTeam.has(id);
              return (
                <button key={id} disabled={me.locked || taken} className={`hero-card ${sel === id ? 'on' : ''} ${taken ? 'taken' : ''}`} style={{ ['--hc' as string]: HEROES[id].color }} onClick={() => { setSel(id); sfx.play('page'); }}>
                  <img src={heroBust(id)} alt="" />
                  <b>{h.name}</b>
                  <small>{ROLE_ICON[h.role]} {h.role}</small>
                  {taken && <em>Taken</em>}
                </button>
              );
            })}
          </div>

          <article className="hero-detail parchment">
            <div className="hero-detail-top">
              <HeroStage hero={sel} size={150} />
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
                      <b>{a.name} <kbd>{KEY_LABELS[slot]}</kbd>{slot === 4 && <em> Ultimate · level {catalog.ultLevel}</em>}{slot === 0 && <em> Basic attack</em>}</b>
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
                    {p.hero ? <img src={heroBust(p.hero as HeroId)} alt="" /> : <span className="q">?</span>}
                    <div><b>{p.name}</b><small>{p.hero ? catalog.heroes.find(h => h.id === p.hero)?.name : 'choosing…'}{p.locked ? ' ✓' : ''}</small></div>
                  </div>
                ))}
              </div>
            ))}
            {err && <span className="err">{err}</span>}
            <button className="btn primary big lock" disabled={me.locked || takenByTeam.has(sel)} onClick={lock}>{me.locked ? `Locked in` : `Lock in ${def.name}`} <b>✓</b></button>
          </aside>
        </div>
      </div>
    </Fit>
  );
}
