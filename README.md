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

Create a room, fill the empty seats with bots and play alone, or open a second browser window and join with the room
code.

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
| Abilities | Q, E, R, F (or 1–4), aimed at the mouse | Tap = best target in range; drag = aim yourself |
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
| `src/game/art/` | The paper-cutout art from Starfall Grove (heroes, scenery and its creatures, used for minions and monsters), plus Elara. |
| `src/screens/` | Main menu, lobby, hero select, match view with the HUD. |
| `src/ui/` | Shared pieces: `Fit` (screens that fit any window) and the hero stage. |
