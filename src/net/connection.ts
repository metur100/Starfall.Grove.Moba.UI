import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type {
  Catalog, HelloResult, JoinResult, LeaderRow, MatchEnd, MatchFound, MatchInit, MatchType, Me, Profile, QueueStatus, Rewards, RoomListing,
  RoomView, ShopResult, Snapshot,
} from './protocol';

// The one connection to the Mini Rift server. It reconnects by itself after a drop and then takes the player's seat
// back. The server knows a player by a secret token kept in this browser: it is their seat in a room and their
// profile (coins, heroes, skins, level). The token can be copied to another device to carry the profile over.

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:5080';

export type NetStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
type Events = {
  status: NetStatus;
  room: RoomView;
  matchStart: MatchInit;
  snap: { s: Snapshot; me: Me };
  matchEnd: MatchEnd;
  profile: Profile;
  queue: QueueStatus;
  matchFound: MatchFound;
  rewards: Rewards;
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

/** An account key as people type or paste it: 32 hex digits, maybe split up with spaces or dashes. */
export function cleanKey(v: string) { return v.toLowerCase().replace(/[^0-9a-f]/g, ''); }

class Net {
  private conn: HubConnection | null = null;
  private listeners = new Map<keyof Events, Set<(v: never) => void>>();
  status: NetStatus = 'idle';
  catalog: Catalog | null = null;
  profile: Profile | null = null;
  queue: QueueStatus = { state: 'idle', type: null, mode: 0, waited: 0, searching: 0, botsIn: 0 };
  ping = 0;
  token: string;

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
  private setProfile(p: Profile | null) { if (!p) return; this.profile = p; if (p.name) this.name = p.name; this.emit('profile', p); }

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
      conn.on('room', (v: RoomView) => { if (v.phase !== 'ended') this.lastRoom = v.code; this.emit('room', v); });
      conn.on('matchStart', (v: MatchInit) => this.emit('matchStart', v));
      conn.on('snap', (s: Snapshot, me: Me) => this.emit('snap', { s, me }));
      conn.on('matchEnd', (v: MatchEnd) => this.emit('matchEnd', v));
      conn.on('profile', (v: Profile) => this.setProfile(v));
      conn.on('queue', (v: QueueStatus) => { this.queue = v; this.emit('queue', v); });
      conn.on('matchFound', (v: MatchFound) => this.emit('matchFound', v));
      conn.on('rewards', (v: Rewards) => this.emit('rewards', v));
      conn.onreconnecting(() => this.setStatus('reconnecting'));
      conn.onreconnected(async () => {
        await this.hello();
        this.setStatus('connected');
        await this.rejoin();
      });
      conn.onclose(() => this.setStatus('disconnected'));
      this.conn = conn;
    }
    this.setStatus('connecting');
    try {
      await this.conn.start();
      await this.hello();
      this.catalog ??= await this.conn.invoke<Catalog>('GetCatalog');
      this.setStatus('connected');
      this.measurePing();
      return true;
    } catch {
      this.setStatus('disconnected');
      return false;
    }
  }

  /** Ties this connection to the player's profile (the server makes one on the first visit). */
  private async hello() {
    try {
      const r = await this.conn!.invoke<HelloResult>('Hello', this.token, this.name);
      if (r.ok) this.setProfile(r.profile);
      return r;
    } catch { return null; }
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
  /** For shop calls: keeps the returned profile, returns the error (or null). */
  private async shop(method: string, ...args: unknown[]): Promise<string | null> {
    try {
      const r = await this.call<ShopResult>(method, ...args);
      if (r.profile) this.setProfile(r.profile);
      return r.error;
    } catch (e) { return e instanceof Error ? e.message : 'Something went wrong.'; }
  }

  // ───────────────────────────── profile and shop

  setName(name: string) { this.name = name; return this.shop('SetName', name); }
  buyHero(hero: string) { return this.shop('BuyHero', hero); }
  buySkin(skin: string) { return this.shop('BuySkin', skin); }
  equipSkin(hero: string, skin: string | null) { return this.shop('EquipSkin', hero, skin ?? ''); }
  setCharm(charm: string) { return this.shop('SetCharm', charm); }
  async leaderboard(type: MatchType): Promise<LeaderRow[]> { try { return await this.call<LeaderRow[]>('Leaderboard', type); } catch { return []; } }
  /** Switches this browser to another account key (from another device). */
  async useKey(key: string): Promise<string | null> {
    const k = cleanKey(key);
    if (k.length !== 32) return 'An account key has 32 letters and digits.';
    if (k === this.token) return null;
    await this.leave();
    this.token = k; store.set('minirift-token', k);
    const r = await this.hello();
    return r?.ok ? null : r?.error ?? 'Could not reach the server.';
  }

  // ───────────────────────────── matchmaking

  findMatch(type: MatchType, mode: number) { this.lastRoom = null; return this.act('FindMatch', type, mode); }
  async cancelMatch() { try { await this.call('CancelMatch'); } catch { /* gone anyway */ } }
  acceptMatch(accept: boolean) { return this.act('AcceptMatch', accept); }

  // ───────────────────────────── rooms

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
  async listRooms(): Promise<RoomListing[]> { try { return await this.call<RoomListing[]>('ListRooms'); } catch { return []; } }
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
  setPublic(open: boolean) { return this.act('SetPublic', open); }
  startMatch() { return this.act('StartMatch'); }
  pickHero(hero: string, lockIn: boolean) { return this.act('PickHero', hero, lockIn); }
  pickSkin(skin: string | null) { return this.act('PickSkin', skin ?? ''); }
  loaded() { return this.act('Loaded'); }
  backToLobby() { return this.act('BackToLobby'); }

  // ───────────────────────────── in the match

  upgrade(slot: number, choice: number) { return this.act('Upgrade', slot, choice); }
  learn(slot: number) { return this.act('Learn', slot); }
  cast(slot: number, x: number, y: number) { return this.act('Cast', slot, Math.round(x), Math.round(y)); }
  charm(x: number, y: number) { return this.act('UseCharm', Math.round(x), Math.round(y)); }
  recall() { return this.act('Recall'); }

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
