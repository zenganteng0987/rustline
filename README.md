# RUSTLINE

A round-based tactical FPS in the browser, built with three.js. Two teams fight over a
container yard at dusk: **Ember** (you and three bots) must plant the bomb at Site A or
eliminate **Ash** (four bots), who hold the yard and will defuse a planted bomb. Money
earned each round buys weapons, armour and grenades. First team to 5 rounds wins.

## Play

Serve the game statically and open it in desktop Chrome:

```
node serve.ts          # http://localhost:8080
```

Click to play (pointer lock). No build step, no network: the game is plain ES modules
under `game/`, with three.js 0.187.0 vendored beside it.

| Key | Action |
| --- | --- |
| W A S D / mouse | Move / look |
| Click | Fire (hold for automatics) |
| B, then 1–7 | Buy menu at round start |
| 1–5 / wheel | Switch weapon |
| R | Reload |
| E (hold) | Plant the bomb inside Site A |
| G / F | Frag / smoke grenade |
| Ctrl / C | Crouch |
| Space | Jump |
| Right mouse | Aim down the DMR optic |

## How it plays

- **Gunplay.** Hitscan with per-part damage (a head shot pays four times), distance
  falloff, recoil and a spread model that punishes firing on the move — stop to shoot.
- **The bomb.** A carrier is chosen each round; the bomb drops where they fall, anyone
  on Ember can pick it up, and a planted bomb must be defused by Ash within 40 seconds.
- **Economy.** $800 to start, $300 a kill, $3,250 a won round, $1,400 a lost one.
  Five weapons (sidearm, SMG, scattergun, rifle, DMR), kevlar, frags and smokes.
- **Bots.** Waypoint navigation across three lanes, line-of-sight and field-of-view
  perception, hearing (gunfire draws a look), burst fire with cover checks, holds,
  rotations, a designated planter and a designated defuser. Smoke blocks their sight.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json` with the vendored make.fun library.
- `game/src/` — one module per job: `world` (the yard, colliders, waypoints), `player`
  (movement), `weapons` (the armoury as data, plus the player's loadout), `bots`,
  `match` (rounds, money, the bomb), `grenades`, `hud`, `input`, `audio` (synthesised
  Web Audio effects, no audio files), `palette` (the look in one place).
- `screenshots/` — real renders of the game in a browser.
