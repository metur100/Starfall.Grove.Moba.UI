import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { Catalog, JoinResult, MatchEnd, MatchInit, Me, RoomView, Snapshot } from './protocol';

// The one connection to the Mini Rift server. It reconnects by itself after a drop and then takes the player's seat
// back (the server knows them by a secret token kept in this browser).

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:5080';

export type NetStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
type Events = {
  status: NetStatus;
  room: RoomView;
  matchStart: MatchInit;
  snap: { s: Snapshot; me: Me };
  matchEnd: MatchEnd;
};

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function makeToken() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

class Net {
  private conn: HubConnection | null = null;
  private listeners = new Map<keyof Events, Set<(v: never) => void>>();
  status: NetStatus = 'idle';
  catalog: Catalog | null = null;
  ping = 0;
  readonly token: string;

  constructor() {
    let t = store.get('minirift-token');
    if (!t) { t = makeToken(); store.set('minirift-token', t); }
    this.token = t;
  }

  get name() { return store.get('minirift-name') || ''; }
  set name(v: string) { store.set('minirift-name', v); }
  /** The room this browser was last seated in, to rejoin after a reload. */
  get lastRoom() { return store.get('minirift-room'); }
  set lastRoom(v: string | null) { store.set('minirift-room', v); }

  on<K extends keyof Events>(event: K, fn: (v: Events[K]) => void) {
    let set = this.listeners.get(event) as Set<(v: Events[K]) => void> | undefined;
    if (!set) { set = new Set(); this.listeners.set(event, set as Set<(v: never) => void>); }
    set.add(fn);
    const s = set;
    return () => { s.delete(fn); };
  }
  private emit<K extends keyof Events>(event: K, v: Events[K]) { (this.listeners.get(event) as Set<(v: Events[K]) => void> | undefined)?.forEach(fn => fn(v)); }
  private setStatus(s: NetStatus) { this.status = s; this.emit('status', s); }

  async connect(): Promise<boolean> {
    if (this.conn && this.conn.state === HubConnectionState.Connected) return true;
    if (!this.conn) {
      const conn = new HubConnectionBuilder()
        .withUrl(`${API_URL}/hub`)
        .withAutomaticReconnect([0, 1000, 2000, 4000, 6000, 10000, 15000])
        .configureLogging(LogLevel.Warning)
        .build();
      conn.serverTimeoutInMilliseconds = 30000;
      conn.keepAliveIntervalInMilliseconds = 10000;
      conn.on('room', (v: RoomView) => this.emit('room', v));
      conn.on('matchStart', (v: MatchInit) => this.emit('matchStart', v));
      conn.on('snap', (s: Snapshot, me: Me) => this.emit('snap', { s, me }));
      conn.on('matchEnd', (v: MatchEnd) => this.emit('matchEnd', v));
      conn.onreconnecting(() => this.setStatus('reconnecting'));
      conn.onreconnected(async () => {
        this.setStatus('connected');
        await this.rejoin();
      });
      conn.onclose(() => this.setStatus('disconnected'));
      this.conn = conn;
    }
    this.setStatus('connecting');
    try {
      await this.conn.start();
      this.setStatus('connected');
      this.catalog ??= await this.conn.invoke<Catalog>('GetCatalog');
      this.measurePing();
      return true;
    } catch {
      this.setStatus('disconnected');
      return false;
    }
  }

  private pingTimer = 0;
  private measurePing() {
    window.clearInterval(this.pingTimer);
    const go = async () => {
      if (this.conn?.state !== HubConnectionState.Connected) return;
      const t = performance.now();
      try { await this.conn.invoke('Ping', Math.round(t)); this.ping = Math.round(performance.now() - t); } catch { /* ignore */ }
    };
    void go();
    this.pingTimer = window.setInterval(go, 3000);
  }

  private async call<T>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.conn || this.conn.state !== HubConnectionState.Connected) throw new Error('Not connected to the server.');
    return this.conn.invoke<T>(method, ...args);
  }
  /** For calls that return an error message or null. */
  private async act(method: string, ...args: unknown[]): Promise<string | null> {
    try { return await this.call<string | null>(method, ...args); } catch (e) { return e instanceof Error ? e.message : 'Something went wrong.'; }
  }

  async createRoom(name: string, mode: number, map: string): Promise<JoinResult> {
    const r = await this.call<JoinResult>('CreateRoom', name, this.token, mode, map);
    if (r.ok) this.lastRoom = r.code;
    return r;
  }
  async joinRoom(code: string, name: string): Promise<JoinResult> {
    const r = await this.call<JoinResult>('JoinRoom', code.toUpperCase().trim(), name, this.token);
    if (r.ok) this.lastRoom = r.code;
    return r;
  }
  async rejoin(): Promise<JoinResult | null> {
    const code = this.lastRoom;
    if (!code) return null;
    try {
      const r = await this.call<JoinResult>('Rejoin', code, this.token);
      if (!r.ok) this.lastRoom = null;
      return r;
    } catch { return null; }
  }
  async leave() { this.lastRoom = null; try { await this.call('LeaveRoom'); } catch { /* gone anyway */ } }

  setReady(v: boolean) { return this.act('SetReady', v); }
  switchTeam() { return this.act('SwitchTeam'); }
  addBot(team: number) { return this.act('AddBot', team); }
  fillBots() { return this.act('FillBots'); }
  removePlayer(id: string) { return this.act('RemovePlayer', id); }
  setMode(mode: number) { return this.act('SetMode', mode); }
  setMap(map: string) { return this.act('SetMap', map); }
  startMatch() { return this.act('StartMatch'); }
  pickHero(hero: string, lockIn: boolean) { return this.act('PickHero', hero, lockIn); }
  loaded() { return this.act('Loaded'); }
  backToLobby() { return this.act('BackToLobby'); }
  upgrade(slot: number, choice: number) { return this.act('Upgrade', slot, choice); }
  cast(slot: number, x: number, y: number) { return this.act('Cast', slot, Math.round(x), Math.round(y)); }

  private lastInput = '';
  private lastInputAt = 0;
  /** Sends movement and attack intent when it changes (and twice a second regardless, in case a message was lost). */
  input(mx: number, my: number, attack: boolean) {
    if (this.conn?.state !== HubConnectionState.Connected) return;
    const key = `${mx.toFixed(2)},${my.toFixed(2)},${attack}`, now = performance.now();
    if (key === this.lastInput && now - this.lastInputAt < 500) return;
    this.lastInput = key; this.lastInputAt = now;
    void this.conn.send('Input', +mx.toFixed(2), +my.toFixed(2), attack).catch(() => { /* reconnect handles it */ });
  }
}

export const net = new Net();
