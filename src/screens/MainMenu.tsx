import { useState } from 'react';
import { net, type NetStatus } from '../net/connection';
import type { Catalog, MapInfo } from '../net/protocol';

/** How a map is described next to its name. */
export const laneLabel = (m: MapInfo) => m.type === 'duel' ? 'Arena' : m.lanes === 1 ? '1 lane' : `${m.lanes} lanes`;
import { HERO_ORDER } from '../game/heroes';
import { heroBust } from '../game/art/bust';

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
    <div className="menu">
      <div className="menu-heroes">{HERO_ORDER.map((h, i) => <img key={h} src={heroBust(h)} alt="" style={{ animationDelay: `${i * .25}s` }} />)}</div>
      <header className="menu-title">
        <small>A Starfall Grove battle</small>
        <h1>Mini Rift</h1>
        <p>Three heroes against three. One lane, two towers, one Core. Five to eight minutes.</p>
      </header>

      <div className="menu-card parchment">
        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={16} placeholder="Wanderer" onChange={e => setName(e.target.value)} />
        </label>

        <div className="menu-cols">
          <section>
            <h3>Create a room</h3>
            <div className="type-pick">
              <button className={type === 'battle' ? 'on' : ''} onClick={() => pickType('battle')}><b>⚔ Battle</b><small>Lanes, minions, towers. Destroy the Core.</small></button>
              <button className={type === 'duel' ? 'on' : ''} onClick={() => pickType('duel')}><b>✦ Duel</b><small>Heroes only. First to 3 rounds wins.</small></button>
            </div>
            <div className="seg">
              {[1, 2, 3].map(m => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m}v{m}</button>)}
            </div>
            <div className="maps">
              {maps.map(m => (
                <button key={m.id} className={`map-pick ${m.theme} ${map === m.id ? 'on' : ''}`} onClick={() => setMap(m.id)} title={m.blurb}>
                  {m.name}<em>{laneLabel(m)}</em>
                </button>
              ))}
            </div>
            {maps.find(m => m.id === map)?.blurb && <p className="map-blurb">{maps.find(m => m.id === map)?.blurb}</p>}
            <button className="btn primary" disabled={!online || busy} onClick={() => run(() => net.createRoom(name.trim(), mode, map))}>Create room <b>→</b></button>
          </section>
          <section>
            <h3>Join a friend</h3>
            <label className="field">
              <span>Room code</span>
              <input className="code-input" value={code} maxLength={5} placeholder="ABCDE" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            </label>
            <button className="btn" disabled={!online || busy || code.length < 5} onClick={() => run(() => net.joinRoom(code, name.trim()))}>Join room <b>→</b></button>
          </section>
        </div>
        {err && <p className="err">{err}</p>}
        <div className={`net-status ${status}`}>
          {status === 'connected' ? '● Connected to the server' : status === 'connecting' ? '◌ Connecting to the server…' : status === 'reconnecting' ? '◌ Reconnecting…' : <>● Server unreachable <button className="link" onClick={onRetry}>Try again</button></>}
        </div>
        <button className="link" onClick={() => setHelp(h => !h)}>{help ? 'Hide' : 'How to play (1 minute)'}</button>
        {help && (
          <ul className="howto">
            <li><b>Battle:</b> destroy the enemy <b>Core</b>. Every lane has two towers; the Core opens up once one lane's inner tower falls.</li>
            <li><b>Duel:</b> heroes only, no minions. Knock out the other side to win a round; first to 3 rounds wins. Late in a round a ring of starfire closes in.</li>
            <li><b>Minions</b> march down the lane every 25 seconds. Towers shoot minions first — let yours soak the shots.</li>
            <li><b>Move</b> with WASD / right-click (PC) or the thumbstick (phone). <b>Attack</b> with Space / left mouse, or by standing still near an enemy.</li>
            <li><b>Abilities:</b> Q E R F (PC) or tap a button to auto-aim; drag it to aim yourself. The ultimate (F) unlocks at level {catalog?.ultLevel ?? 3}.</li>
            <li><b>Gold</b> comes from kills and over time. Spend it in the <b>Spellbook</b> (B): every upgrade is a choice between two paths.</li>
            <li>The <b>Star Warden</b> in the woods blesses the team that defeats it. <b>Moonblooms</b> heal you as you walk over them.</li>
          </ul>
        )}
      </div>
    </div>
  );
}
