import { useState } from 'react';
import { net, type NetStatus } from '../net/connection';
import type { Catalog, MapInfo } from '../net/protocol';
import { HERO_ORDER } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { Fit } from '../ui/Fit';

/** How a map is described next to its name. */
export const laneLabel = (m: MapInfo) => m.type === 'duel' ? 'Arena' : m.lanes === 1 ? '1 lane' : `${m.lanes} lanes`;

type Props = { status: NetStatus; catalog: Catalog | null; initialCode: string; onJoined: () => void; onRetry: () => void };

export function MainMenu({ status, catalog, initialCode, onJoined, onRetry }: Props) {
  const [name, setName] = useState(net.name);
  const [code, setCode] = useState(initialCode);
  const [mode, setMode] = useState(3);
  const [map, setMap] = useState('glade');
  const [type, setType] = useState<'battle' | 'duel'>('battle');
  const allMaps: MapInfo[] = catalog?.maps ?? [{ id: 'glade', name: 'Starfall Glade', theme: 'meadow', type: 'battle', lanes: 1, blurb: '' }];
  const maps = allMaps.filter(m => m.type === type);
  const pickType = (t: 'battle' | 'duel') => {
    setType(t);
    const first = allMaps.find(m => m.type === t);
    if (first) setMap(first.id);
    if (t === 'duel' && mode === 3) setMode(1);
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [help, setHelp] = useState(false);
  const online = status === 'connected';

  const run = async (fn: () => Promise<{ ok: boolean; error: string | null }>) => {
    if (!name.trim()) { setErr('Choose a name first.'); return; }
    net.name = name.trim();
    setBusy(true); setErr('');
    try { const r = await fn(); if (r.ok) onJoined(); else setErr(r.error || 'Could not join.'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not reach the server.'); }
    finally { setBusy(false); }
  };

  return (
    <Fit className="screen">
      <div className="menu">
        <header className="menu-title">
          <div className="menu-heroes">{HERO_ORDER.map((h, i) => <img key={h} src={heroBust(h)} alt="" style={{ animationDelay: `${i * .25}s` }} />)}</div>
          <small>A Starfall Grove battle</small>
          <h1>Mini Rift</h1>
        </header>

        <div className="menu-card parchment">
          <section className="menu-create">
            <h3>Create a room</h3>
            <div className="type-pick">
              <button className={type === 'battle' ? 'on' : ''} onClick={() => pickType('battle')}><b>⚔ Battle</b><small>Lanes, towers. Destroy the Core.</small></button>
              <button className={type === 'duel' ? 'on' : ''} onClick={() => pickType('duel')}><b>✦ Duel</b><small>Heroes only. First to 3 rounds.</small></button>
            </div>
            <div className="seg">
              {[1, 2, 3].map(m => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m}v{m}</button>)}
            </div>
            <button className="btn primary" disabled={!online || busy} onClick={() => run(() => net.createRoom(name.trim(), mode, map))}>Create room <b>→</b></button>
          </section>

          <section className="menu-maps">
            <h3>{type === 'duel' ? 'Arena' : 'Battlefield'}</h3>
            <div className="maps">
              {maps.map(m => (
                <button key={m.id} className={`map-pick ${m.theme} ${map === m.id ? 'on' : ''}`} onClick={() => setMap(m.id)} title={m.blurb}>
                  {m.name}<em>{laneLabel(m)}</em>
                </button>
              ))}
            </div>
            <p className="map-blurb">{maps.find(m => m.id === map)?.blurb}</p>
          </section>

          <section className="menu-join">
            <label className="field">
              <span>Your name</span>
              <input value={name} maxLength={16} placeholder="Wanderer" onChange={e => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Join a friend: room code</span>
              <input className="code-input" value={code} maxLength={5} placeholder="ABCDE" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            </label>
            <button className="btn" disabled={!online || busy || code.length < 5} onClick={() => run(() => net.joinRoom(code, name.trim()))}>Join room <b>→</b></button>
            {err && <p className="err">{err}</p>}
            <div className={`net-status ${status}`}>
              {status === 'connected' ? '● Connected' : status === 'connecting' ? '◌ Connecting…' : status === 'reconnecting' ? '◌ Reconnecting…' : <>● Server unreachable <button className="link" onClick={onRetry}>Try again</button></>}
            </div>
            <button className="link" onClick={() => setHelp(true)}>How to play</button>
          </section>
        </div>
      </div>
      {help && (
        <div className="modal-wrap">
          <Fit onBackdrop={() => setHelp(false)}>
            <div className="howto-card parchment">
              <header><h3>How to play</h3><button className="close" onClick={() => setHelp(false)}>✕</button></header>
              <ul className="howto">
                <li><b>Battle:</b> destroy the enemy <b>Core</b>. Every lane has two towers; the Core opens up once one lane's inner tower falls. <b>Minions</b> march every 25 seconds — let them soak the tower's shots.</li>
                <li><b>Duel:</b> heroes only. Knock out the other side to win a round; first to 3 rounds wins. Everyone grows a level each round. Late in a round a ring of starfire closes in.</li>
                <li><b>Stones and trees</b> block sight: no attacks, shots or targeted spells through them. Hide behind one!</li>
                <li><b>Move</b> with WASD / right-click (PC) or the thumbstick (phone). <b>Attack</b> with Space / left mouse, or by standing still near an enemy.</li>
                <li><b>Abilities:</b> Q E R F (PC) or tap a button to auto-aim; drag it to aim yourself. The ultimate (F) unlocks at level {catalog?.ultLevel ?? 3}.</li>
                <li><b>Gold</b> buys spell upgrades in the <b>Spellbook</b> (B or the gold button): every step is a choice between two paths.</li>
              </ul>
            </div>
          </Fit>
        </div>
      )}
    </Fit>
  );
}
