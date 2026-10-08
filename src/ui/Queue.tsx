import { useEffect, useRef, useState } from 'react';
import { net } from '../net/connection';
import type { MatchFound, QueueStatus } from '../net/protocol';
import { sfx } from '../game/audio';
import { buzz } from '../game/settings';
import { fmtWait } from '../screens/Home';

/** A small pill while searching for a match, on every menu screen. */
export function QueuePill({ queue }: { queue: QueueStatus }) {
  if (queue.state !== 'searching') return null;
  return (
    <div className="queue-pill card">
      <span className="spinner" />
      <b>{queue.type === 'duel' ? '✦ Duel' : '⚔ Battle'} {queue.mode}v{queue.mode}</b>
      <span>{fmtWait(queue.waited)}</span>
      <button className="link" onClick={() => void net.cancelMatch()}>Cancel</button>
    </div>
  );
}

/** Nobody to play with yet: fight bots now, or keep searching. */
export function BotOfferDialog({ queue }: { queue: QueueStatus }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => { sfx.play('discover'); buzz([40, 40, 40]); }, []);
  const answer = async (yes: boolean) => { setBusy(true); await net.answerBots(yes); setBusy(false); sfx.play(yes ? 'learn' : 'ui'); };
  const mode = queue.mode, type = queue.type === 'duel' ? 'duel' : 'battle';
  return (
    <div className="found-wrap">
      <div className="found parchment bot-offer">
        <small>{type === 'duel' ? '✦ Duel' : '⚔ Battle'} · {mode}v{mode} · searching {fmtWait(queue.waited)}</small>
        <h2>No rivals yet</h2>
        <p className="hint dark">Nobody near your rank is looking for a {mode}v{mode} {type} right now. Fight bots instead? You still earn coins and rating{mode > 1 ? '. Anyone else searching joins in, bots fill the rest' : ''}.</p>
        <div className="found-actions">
          <button className="btn primary big" disabled={busy} onClick={() => answer(true)}>Play vs bots <b>🤖</b></button>
          <button className="btn ghost-dark" disabled={busy} onClick={() => answer(false)}>Keep searching</button>
        </div>
      </div>
    </div>
  );
}

/** Everyone has to accept a found match within a few seconds. */
export function MatchFoundDialog({ found }: { found: MatchFound }) {
  const [busy, setBusy] = useState(false);
  const shown = useRef('');
  const [left, setLeft] = useState(found.timeLeft);
  useEffect(() => {
    if (shown.current !== found.id) { shown.current = found.id; sfx.play('discover'); buzz([60, 60, 120]); }
    setLeft(found.timeLeft);
    const start = performance.now(), from = found.timeLeft;
    const id = window.setInterval(() => setLeft(Math.max(0, from - (performance.now() - start) / 1000)), 100);
    return () => window.clearInterval(id);
  }, [found]);
  const answer = async (yes: boolean) => { setBusy(true); await net.acceptMatch(yes); setBusy(false); sfx.play(yes ? 'learn' : 'nope'); };
  const k = Math.max(0, Math.min(1, left / 12));
  return (
    <div className="found-wrap">
      <div className="found parchment">
        <small>{found.type === 'duel' ? '✦ Duel' : '⚔ Battle'} · {found.mode}v{found.mode}{found.bots > 0 ? ` · ${found.bots} bot${found.bots > 1 ? 's' : ''}` : ''}</small>
        <h2>Match found!</h2>
        <div className="found-ring" style={{ ['--k' as string]: `${k * 360}deg` }}><b>{Math.ceil(left)}</b></div>
        <div className="found-dots">{Array.from({ length: found.total }, (_, i) => <i key={i} className={i < found.accepted ? 'on' : ''} />)}</div>
        {found.youAccepted ? <p className="hint dark">Accepted — waiting for {found.total - found.accepted} more…</p> : (
          <div className="found-actions">
            <button className="btn primary big" disabled={busy} onClick={() => answer(true)}>Accept <b>✓</b></button>
            <button className="btn ghost-dark" disabled={busy} onClick={() => answer(false)}>Decline</button>
          </div>
        )}
      </div>
    </div>
  );
}
