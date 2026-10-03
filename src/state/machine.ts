// The client's screens as an explicit state machine. Only the transitions listed here are allowed; anything else is
// refused (and logged), so the UI can never land somewhere that makes no sense, like a victory screen mid-lobby.

export type GameState = 'MAIN_MENU' | 'LOBBY' | 'HERO_SELECT' | 'LOADING' | 'MATCH_START' | 'PLAYING' | 'VICTORY' | 'DEFEAT' | 'DISCONNECTED';

/** Coming back into a room after a reload or a dropped connection can land in any part of it. */
const REJOIN: GameState[] = ['LOBBY', 'HERO_SELECT', 'LOADING', 'MATCH_START', 'PLAYING', 'VICTORY', 'DEFEAT'];

export const TRANSITIONS: Record<GameState, GameState[]> = {
  MAIN_MENU: ['DISCONNECTED', ...REJOIN],
  LOBBY: ['HERO_SELECT', 'MAIN_MENU', 'DISCONNECTED'],
  HERO_SELECT: ['LOADING', 'LOBBY', 'MAIN_MENU', 'DISCONNECTED'],
  LOADING: ['MATCH_START', 'PLAYING', 'MAIN_MENU', 'DISCONNECTED'],
  MATCH_START: ['PLAYING', 'MAIN_MENU', 'DISCONNECTED'],
  PLAYING: ['VICTORY', 'DEFEAT', 'MAIN_MENU', 'DISCONNECTED'],
  VICTORY: ['LOBBY', 'MAIN_MENU', 'DISCONNECTED'],
  DEFEAT: ['LOBBY', 'MAIN_MENU', 'DISCONNECTED'],
  DISCONNECTED: ['MAIN_MENU', ...REJOIN],
};

export function canGo(from: GameState, to: GameState) { return from === to || TRANSITIONS[from].includes(to); }

/** Returns the next state, or the current one if the move isn't allowed. */
export function transition(from: GameState, to: GameState): GameState {
  if (canGo(from, to)) return to;
  console.warn(`[mini rift] refused state change ${from} → ${to}`);
  return from;
}
