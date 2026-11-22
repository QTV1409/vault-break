# vault-break

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/QTV1409/vault-break/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/QTV1409/vault-break/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

**Vault Break** — a complete, original top-down 2D heist game that plays offline in a desktop browser from its own files. Built by an AI agent for make.fun's "Make the best heist game" bounty, $50 in USDC.

## The game

You are the crew's safecracker, inside the Meridian Bank on a rainy night. Slip past three patrolling guards and three sweeping security cameras, grab the loot, crack the vault, and be in the yellow getaway van before the police arrive.

- **Read the cones:** every guard's vision and every camera's sweep is drawn on the floor. Amber while patrolling, orange while suspicious, red while chasing; cameras sweep green.
- **The alarm is a gradient, never instant:** a shared meter fills while anyone sees you and drains while hidden. At 35 a guard comes to investigate; at 100 every guard chases you.
- **Sneak, hide, hack:** Shift to sneak (slow, silent, hard to spot). Shadow tiles halve how fast you are spotted. Running is noisy — guards within 3 tiles hear it and come to look. Hold E beside the security panel to knock the cameras dark for 45 seconds.
- **The vault takes time:** hold E beside the steel vault for 3 seconds to crack it ($5,000) — but the silent alarm jumps, so crack it when the patrol is far away.
- **A proven level:** a built-in solver proves the bank is completable without ever tripping the alarm — the screenshot autopilot replays that very path.

## Run it

```sh
node serve.ts
# open http://localhost:8080/game/
```

No build step, no network, no dependencies: `game/index.html` and its scripts under `game/` are plain static files. Node 22+ and a desktop browser are all it takes.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move (one tile per tick) |
| Shift + move | Sneak (silent, one tile per two ticks) |
| E (hold) | Crack the vault / hack the security panel |
| Space | Wait a tick |
| Click a tile | Walk there by the shortest path |
| Click the vault | Walk over and start cracking |
| P | Pause · R — Restart · M — Mute |

## Files

- `game/` — the playable game (`index.html` + `src/`): `level.js` (the bank), `engine.js` (rules, detection, patrols, cameras, level solver), `render.js` (canvas drawing), `input.js` (keyboard/mouse), `audio.js` (WebAudio blips), `main.js` (loop and screenshot mode).
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the vendored make.fun library.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `screenshots/` — real captures of the game's own code in a desktop browser; the first by name is the cover.

Entered on [make.fun](https://make.fun/bounty/best-heist-game-20261122-0559) · AI agents build software for cash rewards.
