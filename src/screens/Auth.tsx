import { useState } from 'react';
import { net, type NetStatus } from '../net/connection';
import type { Profile } from '../net/protocol';
import { HERO_ORDER } from '../game/heroes';
import { heroBust } from '../game/art/bust';
import { Fit } from '../ui/Fit';
import { Coins } from '../ui/Bits';
import { sfx } from '../game/audio';
import { buzz } from '../game/settings';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

/** Logging in, signing up, and resetting a forgotten password (the email's link opens this with ?reset=…). */
export function Auth({ status, guest, resetCode, onRetry, onResetDone }: { status: NetStatus; guest: Profile | null; resetCode: string; onRetry: () => void; onResetDone: () => void }) {
  // A device with progress from before accounts is invited to sign up and keep it.
  const [mode, setMode] = useState<Mode>(resetCode ? 'reset' : guest && guest.games > 0 ? 'register' : 'login');
  const [username, setUsername] = useState(net.name && net.name !== 'Wanderer' ? net.name : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const online = status === 'connected';

  const go = (m: Mode) => { setMode(m); setErr(''); setNote(''); sfx.play('page'); };
  const submit = async () => {
    setBusy(true); setErr(''); setNote('');
    let e: string | null = null;
    if (mode === 'login') e = await net.login(username, password);
    else if (mode === 'register') e = await net.register(username, email, password);
    else if (mode === 'forgot') { e = await net.forgotPassword(email); if (!e) setNote('If an account uses that email, a link to choose a new password is on its way. Check your inbox (and spam).'); }
    else { e = await net.resetPassword(resetCode, password); if (!e) onResetDone(); }
    setBusy(false);
    if (e) { setErr(e); sfx.play('nope'); } else if (mode !== 'forgot') { sfx.play('questDone'); buzz([20, 40, 30]); }
  };
  const valid = mode === 'login' ? username.trim() && password : mode === 'register' ? username.trim() && email.trim() && password.length >= 8 : mode === 'forgot' ? email.trim() : password.length >= 8;
  const title = { login: 'Welcome back', register: 'Create your account', forgot: 'Forgot your password?', reset: 'Choose a new password' }[mode];

  return (
    <Fit className="screen">
      <div className="auth">
        <div className="auth-side">
          <div className="auth-heroes">{HERO_ORDER.map((h, i) => <img key={h} src={heroBust(h)} alt="" style={{ animationDelay: `${i * .2}s` }} />)}</div>
          <h1>Mini Rift</h1>
          <p>3v3 storybook battles and duels with the heroes of Starfall Grove.</p>
          <ul>
            <li>✦ Real matchmaking, custom rooms with friends</li>
            <li>✦ Chat, friends and invites</li>
            <li>✦ Coins, six heroes, eighteen skins, six ranks</li>
          </ul>
        </div>
        <form className="auth-card parchment" onSubmit={e => { e.preventDefault(); if (valid && !busy) void submit(); }}>
          {(mode === 'login' || mode === 'register') && (
            <div className="seg auth-tabs">
              <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => go('login')}>Log in</button>
              <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => go('register')}>Sign up</button>
            </div>
          )}
          <h2>{title}</h2>
          {mode === 'register' && guest && guest.games > 0 && (
            <p className="auth-keep">Your progress on this device is kept: <b>level {guest.level}</b>, <Coins value={guest.coins} />, {guest.heroes.length} heroes, {guest.skins.length} skins.</p>
          )}
          {mode === 'reset' && <p className="hint dark">Pick a new password for your account. Every other device will be signed out.</p>}
          {mode === 'forgot' && <p className="hint dark">Enter the email of your account and we'll send you a link to choose a new password.</p>}
          {(mode === 'login' || mode === 'register') && (
            <label className="field compact"><span>{mode === 'login' ? 'Username or email' : 'Username'}</span>
              <input value={username} maxLength={mode === 'login' ? 254 : 16} autoComplete="username" autoCapitalize="none" spellCheck={false} onChange={e => setUsername(e.target.value)} />
            </label>
          )}
          {(mode === 'register' || mode === 'forgot') && (
            <label className="field compact"><span>Email</span>
              <input type="email" value={email} maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} onChange={e => setEmail(e.target.value)} />
            </label>
          )}
          {mode !== 'forgot' && (
            <label className="field compact"><span>{mode === 'reset' ? 'New password' : 'Password'}{mode !== 'login' ? ' (at least 8 characters)' : ''}</span>
              <span className="pw">
                <input type={show ? 'text' : 'password'} value={password} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onChange={e => setPassword(e.target.value)} />
                <button type="button" className="link" onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'}</button>
              </span>
            </label>
          )}
          {err && <p className="err">{err}</p>}
          {note && <p className="ok-msg">{note}</p>}
          <button className="btn primary big auth-go" type="submit" disabled={!online || !valid || busy}>
            {busy ? <span className="spinner" /> : null}{{ login: 'Log in', register: 'Create account', forgot: 'Send the link', reset: 'Save password' }[mode]} <b>→</b>
          </button>
          <div className="auth-links">
            {mode === 'login' && <button type="button" className="link" onClick={() => go('forgot')}>Forgot password?</button>}
            {(mode === 'forgot' || mode === 'reset') && <button type="button" className="link" onClick={() => { if (mode === 'reset') onResetDone(); go('login'); }}>← Back to log in</button>}
            {mode === 'register' && <small className="hint dark">By signing up you agree to the <a href="https://starfallgrove.eu/terms/" target="_blank" rel="noopener">terms</a> and the <a href="https://starfallgrove.eu/minirift/privacy/" target="_blank" rel="noopener">privacy policy</a>.</small>}
          </div>
          {!online && <p className={`net-status ${status}`}>{status === 'connecting' || status === 'reconnecting' ? '◌ Connecting…' : <>● Offline <button type="button" className="link" onClick={onRetry}>Retry</button></>}</p>}
        </form>
      </div>
    </Fit>
  );
}
