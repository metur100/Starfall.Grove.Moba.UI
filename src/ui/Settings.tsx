import { useState } from 'react';
import { sfx } from '../game/audio';
import { prefs, buzz, type Quality } from '../game/settings';
import { Fit } from './Fit';

/** The ⚙ button that opens the settings. */
export function SettingsButton({ className = 'icon-btn card' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} title="Settings">⚙</button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [, redraw] = useState(0);
  const [help, setHelp] = useState(false);
  const set = (fn: () => void) => { fn(); redraw(n => n + 1); sfx.play('ui'); };
  return (
    <div className="modal-wrap">
      <Fit onBackdrop={onClose}>
        <div className="settings parchment">
          <header><h3>{help ? 'How to play' : 'Settings'}</h3><button className="close" onClick={onClose}>✕</button></header>
          {help ? <HowTo /> : (
            <div className="settings-rows">
              <div className="setting"><span>Sound</span><div className="seg">{[false, true].map(m => <button key={String(m)} className={sfx.isMuted() === m ? 'on' : ''} onClick={() => set(() => sfx.setMuted(m))}>{m ? 'Off' : 'On'}</button>)}</div></div>
              <div className="setting"><span>Vibration <small>(Android)</small></span><div className="seg">{[true, false].map(v => <button key={String(v)} className={prefs.haptics === v ? 'on' : ''} onClick={() => set(() => { prefs.haptics = v; if (v) buzz(30); })}>{v ? 'On' : 'Off'}</button>)}</div></div>
              <div className="setting"><span>Graphics <small>(next match)</small></span><div className="seg">{(['auto', 'high', 'low'] as Quality[]).map(q => <button key={q} className={prefs.quality === q ? 'on' : ''} onClick={() => set(() => { prefs.quality = q; })}>{q === 'auto' ? 'Auto' : q === 'high' ? 'Sharp' : 'Fast'}</button>)}</div></div>
              <button className="btn small" onClick={() => setHelp(true)}>How to play</button>
            </div>
          )}
          {help && <button className="btn small" onClick={() => setHelp(false)}>← Back</button>}
        </div>
      </Fit>
    </div>
  );
}

function HowTo() {
  return (
    <ul className="howto">
      <li><b>Battle:</b> destroy the enemy <b>Core</b>. Every lane has two towers; the Core opens once one lane's inner tower falls. <b>Minions</b> march every 25 s — let them soak the tower's shots, and land the last hit on them for gold.</li>
      <li><b>Duel:</b> heroes only. Before each round pick a free upgrade for your two duel spells. Midway through a round a <b>Starshard</b> falls into the middle: grab it for a burst of power.</li>
      <li><b>Move</b> with the thumbstick (phone) or WASD / right-click (PC). <b>Attack</b> with the big button, Space or left mouse.</li>
      <li><b>Abilities:</b> tap to auto-aim, drag to aim yourself, drag onto ✕ to cancel. PC: Q E R F at the mouse. In a battle you learn one spell per level.</li>
      <li><b>Charm</b> (C): Flash, Heal, Ghost or Barrier, chosen in hero select. <b>Recall</b> (H) takes you home in a battle after a few seconds standing still.</li>
      <li><b>Coins</b> come from every match (more for a win, plus a daily first-win bonus). Spend them on heroes and skins. Matchmaking games also move your <b>rank</b>.</li>
      <li><b>Stones and trees</b> block sight: no attacks, shots or targeted spells through them.</li>
    </ul>
  );
}
