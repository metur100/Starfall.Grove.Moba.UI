# Starfall.Grove.Moba.UI

**Mini Rift**: storybook battles (1, 2 or 3 lanes) and duels with the heroes of Starfall Grove.
React + TypeScript + Vite, drawn on a Canvas 2D with Starfall Grove's paper-puppet art. No game engine.

Live: https://metur100.github.io/Starfall.Grove.Moba.UI/ · Server: [Starfall.Grove.Moba.API](https://github.com/metur100/Starfall.Grove.Moba.API)

## Run it locally

Start the API first (see its README; it listens on `http://localhost:5080`), then:

```bash
npm install
npm run dev        # http://localhost:5173
```

Press **Find match** (after 30 s with nobody to play, it asks whether to fight bots instead), **vs Bots** for a practice match at once, or under **Custom** create a room, fill the
empty seats with bots, or open a second browser window and join with the room code.

## What's in it

- **Account**: sign up with a username, email and password, log in with username (or email) and password on any
  device, and reset a forgotten password through the emailed link (`?reset=…` opens the form). The welcome email's link
  (`?confirm=…`) confirms the email; the Profile tab reminds the player until then (with Send again) and can change the
  username. Tapping the picture there opens the picker (`ui/AvatarPicker.tsx`): hero portraits, emblems and the
  valley's creatures, drawn as paper cut-outs by `game/art/avatar.ts`; some unlock at a level. The picture shows in the
  top bar, the friend list and the ladder.
- **Home**: Play (matchmaking for battles and duels, 1v1 to 3v3, with an accept check; a bot offer after 30 s with
  nobody to play; vs Bots for practice; three daily quests), Custom (room codes, invite
  links, a list of public rooms, and each map as a card with a drawn preview from `GET /api/maps/preview`, `ui/MapPreview.tsx`), Heroes (unlock heroes and buy skins with coins), Friends (requests, online status,
  private chat), Profile (account, level, ranks, stats, recent matches, log out, delete) and Ladder. The menu has one
  fixed size per screen (`Fit` with `height`): switching tabs never resizes it, and every tab is laid out to fit without
  scrolling (only a long ladder scrolls its own list).
- **Chat**: in the lobby, hero select (team) and the match (all or team, with quick messages; Enter on a PC). Tap a
  name to add the player as a friend, block or report them. Friends can be invited to a custom room from its lobby.
- **Hero select**: only heroes you own (new accounts own Mira) or this week's two free ones, your skin, and your charm.
- **In a match**: map pings for the team (📍, or tap the minimap for "go here"), a surrender vote in battles after five
  minutes (🏳, which asks "Surrender this match?" first), fog of war (enemies show on the field and the minimap only
  near your team's heroes, minions, towers or Core: `MatchClient.vision`; towers always show, duels have no fog), charm button (C) and recall (H), drag an ability onto ✕ to cancel it, kill announcements with
  portraits (multikills, streaks, shutdowns, aces), death recap, last-hit marks on minions, the duel Starshard, round
  summaries, spectating a teammate when knocked out, vibration on phones. On a PC the spells sit in one bar in the
  bottom middle with the hero's health above it; on touch screens they ring the attack button under the right thumb, laid
  out like Starfall Grove's touch controls (a 96 px attack, 58 px spells in an arc, the charm where its potion is). The
  minimap's buttons sit in one row exactly as wide as the map, with the ping in the map's corner.
- **After a match**: the coins it paid line by line, the level bar filling, and the rating change; "Play again" goes
  straight back into the queue.
- **Animation**: heroes lunge, recoil and squash on attacks, lean into walks and kick up dust, crouch over a rune while
  winding up, leave afterimages when dashing, topple when they fall and pop back in on respawn. Skins recolour the
  puppet; epic and legendary skins add an aura and a trail. Your kills and critical hits hold the frame for an instant.
- **Settings** (⚙): sound, vibration, graphics (Auto / Sharp / Fast).

## Which server it talks to

`VITE_API_URL` picks the server:

- `npm run dev` uses `http://localhost:5080` unless you set it in `.env.local` (copy `.env.example`).
- `npm run build` (and the GitHub Pages deploy) uses `.env.production`: `https://starfallgrove.runasp.net`.

The server must use **https** for the GitHub Pages site to reach it (browsers block http calls from an https page).

## Deploy

Pushing to `master` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`). In the repository settings,
set *Pages → Source* to **GitHub Actions** once.

## Controls

| | PC | Phone / tablet |
| --- | --- | --- |
| Move | WASD / arrows, or right-click a spot | Thumbstick (touch anywhere on the left) |
| Attack | Space or hold left mouse; standing still attacks too | Big button (hold) |
| Abilities | Q, E, R, F (or 1–4), aimed at the mouse | Tap = best target in range; drag = aim yourself; drop on ✕ = cancel |
| Charm (Flash, Heal, Ghost or Barrier) | C, at the mouse | Small button left of the abilities (drag to aim Flash) |
| Recall home (battles) | H | ⌂ next to your health |
| Learn a spell (battles: one per level) | Click the glowing ability, or press its key | Tap the glowing ability |
| Spellbook (battles) | B | Gold button |
| Scoreboard (kills, damage to heroes, healing) | Tab | ☰ |

Phones are played sideways: held upright, the game asks you to turn the phone, and on Android it goes fullscreen.
Every screen fits the window without scrolling (`src/ui/Fit.tsx` scales a screen down when it has to).

## Code map

| Path | What's there |
| --- | --- |
| `src/state/machine.ts` | The screens as a state machine with the allowed transitions. |
| `src/net/` | The SignalR connection (with reconnect and rejoin) and the message types. |
| `src/game/client.ts` | Snapshot buffering, interpolation and prediction of your own hero. |
| `src/game/render.ts` | Drawing the battlefield, units, effects, health bars and minimap. |
| `src/game/input.ts` | Keyboard, mouse, thumbstick and ability aiming. |
| `src/game/heroes.ts` | How each hero is presented (quotes, descriptions, icons). Numbers come from the server. |
| `src/game/skins.ts` | What each skin looks like (colours, weapon, aura, trail). Names and prices come from the server. |
| `src/game/settings.ts` | Graphics quality and vibration settings. |
| `src/game/art/` | The paper-cutout art from Starfall Grove (heroes, scenery and its creatures, used for minions and monsters), plus Elara. |
| `src/screens/` | Home (with Collection and ProfilePage), lobby, hero select, match view with the HUD. |
| `src/ui/` | Shared pieces: `Fit` (screens that fit any window), the hero stage, coins and ranks, settings, the queue pill and match-found dialog. |
