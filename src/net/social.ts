import { useEffect, useState } from 'react';
import { net } from './connection';
import type { ChatMsg, FriendsList, Invite } from './protocol';

// What the player's friends and the people around them say, kept for the screens that show it: the room and match
// chat (the last 60 messages), a private thread per friend with an unread count, the friend list, and the newest
// invite to a friend's room. Screens read it with useSocial(); it changes as messages arrive from the server.

type State = { room: ChatMsg[]; threads: Record<string, ChatMsg[]>; unread: Record<string, number>; friends: FriendsList | null; invite: Invite | null; open: string | null };
const state: State = { room: [], threads: {}, unread: {}, friends: null, invite: null, open: null };
const subs = new Set<() => void>();
const changed = () => subs.forEach(f => f());
let roomCode = '';

net.on('chat', m => {
  if (m.scope === 'friend') {
    const other = m.fromId === net.profile?.id ? m.to! : m.fromId;
    state.threads = { ...state.threads, [other]: [...(state.threads[other] ?? []).slice(-59), m] };
    if (other !== state.open && m.fromId !== net.profile?.id) state.unread = { ...state.unread, [other]: (state.unread[other] ?? 0) + 1 };
  } else state.room = [...state.room.slice(-59), m];
  changed();
});
net.on('friends', f => { state.friends = f; changed(); });
net.on('invite', i => { state.invite = i; changed(); });
// A new room starts with an empty chat.
net.on('room', r => { if (r.code !== roomCode) { roomCode = r.code; state.room = []; changed(); } });
net.on('signedOut', () => { Object.assign(state, { room: [], threads: {}, unread: {}, friends: null, invite: null, open: null }); changed(); });

export const social = {
  get: () => state,
  async refreshFriends() { const f = await net.friends(); if (f) { state.friends = f; changed(); } },
  /** Opens a friend's thread (clearing its unread count), or closes it with null. */
  openThread(id: string | null) { state.open = id; if (id) state.unread = { ...state.unread, [id]: 0 }; changed(); },
  clearInvite() { state.invite = null; changed(); },
  clearRoom() { state.room = []; changed(); },
  unreadTotal: () => Object.values(state.unread).reduce((a, b) => a + b, 0),
};

/** The social state, re-rendering when it changes. */
export function useSocial() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(n => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return state;
}
