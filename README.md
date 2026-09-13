# The Castles of Dr. Creep — Reimagined

A playable single-player Three.js remake of Ed Hobbs’s 1984 Commodore 64 puzzle adventure. Includes **all 13 original castles (204 rooms), the original tutorial (13 rooms), and Blackthorn (six bonus rooms)**. Original room layouts and object records are imported from C64 data; the 3D artwork, animation, interface, audio and JavaScript simulation are new.

**[Play online on GitHub Pages](https://algorithmwiz.github.io/castles-of-dr-creep-remake/)** — no download or installation needed.

## Run

Requires Node.js 20 or later. No package installation or build is needed.

```powershell
npm start
```

Open [the game](http://localhost:3000). The server binds to the local machine. To select another port, set `$env:PORT = 3001` before running. Any static web server can serve the project; opening `index.html` directly does not support ES modules.

## Play

- **All castles** opens the full collection. Selecting a castle resumes its own saved expedition. Start with **Tutorial** for the original lessons.
- **A / D or ← / →:** walk. **W / S or ↑ / ↓:** climb. Brass poles only descend; hold a sideways direction to leave a ladder or pole at an intermediate walkway.
- **E / Space:** collect keys, operate controls, ring bells and enter open doors. Numbers on bells identify their doors. Match coloured locks to their keys; some doors must be opened from the other side.
- **↑ / ↓ beside a transmitter:** choose a coloured receiver. **E:** transmit. Receivers can be one-way.
- **↑ / ↓ beside a ray-gun control:** aim. **E:** fire. Unattended guns track the player.
- **M:** actual castle map. **Esc:** pause. **R:** reset the current room’s machinery and enemies while retaining keys and opened passages.
- Lightning switches toggle their connected machines. Red buttons lower force fields for eight seconds. Conveyor controls cycle movement and direction. Crossing a trapdoor’s pressure control toggles the trap.
- Ankhs awaken mummies. Coffins awaken Frankenstein monsters, which can climb. Lure residents into open traps, lightning or ray-gun fire. Defeated enemies have distinct fall, electrocution and impact animations, with debris and a gradual fade.
- You cannot jump. Death returns you to the room entrance, with unlimited retries. Original-castle puzzle state persists across rooms and deaths. Blackthorn retains its original room-reset behavior.
- Every castle saves separately in browser localStorage, and conquered estates get a completion badge. The existing Blackthorn save format is retained. Use Continue after reloading; Pause → Restart this castle starts over in the selected estate.
- Sound starts muted. Settings include volume and a lighter graphics mode. Touch controls appear on touch devices; landscape gives a larger view.

## Collection

| Estate             | Rooms | Estate      | Rooms |
| ------------------ | ----: | ----------- | ----: |
| Sylvania           |    16 | Parthenia   |    16 |
| Callanwolde        |    24 | Teasdale    |    16 |
| Tannenbaum         |    10 | Rittenhouse |    19 |
| Alternation        |    16 | Romania     |    16 |
| Freedonia          |     5 | Doublecross |    15 |
| Carpathia          |    18 | Baskerville |    18 |
| Lovecraft          |    15 | Tutorial    |    13 |
| Blackthorn (bonus) |     6 |             |       |

This is a modern single-player adaptation, rather than a cycle-accurate C64 emulator. Original platforms, heights, gaps, ladders, poles, doors, map positions, coloured keys, control links and machinery placements are preserved. Movement speed, enemy pursuit, collision tolerances, lighting, audio, retries and death animation use the remake’s engine. The original simultaneous two-player mode, castle editor and bitmap escape screens are not implemented.

## Implementation

- `src/data/original-castles.js` and `.json`: generated original object records, with per-castle source hashes.
- `src/catalog.js`: C64 coordinates converted into 3D walkways and a complete castle catalog.
- `src/classic-game.js`: original-castle simulation, persistent mechanisms, ray guns and save validation.
- `src/game.js`, `src/levels.js`: retained Blackthorn simulation and layouts.
- `src/scene.js`, `src/original-scene.js`, `src/enemy-death.js`: procedural 3D construction, lighting, bloom, characters, and death effects.
- `src/main.js`, `src/castle-map.js`, `src/audio.js`: interface, input, per-castle saves, maps, settings and procedural audio.

Three.js **r186** is copied from `C:\three.js-master`, with a minimal local postprocessing dependency set. All geometry, stone textures and effects are generated in code. Optional Google Fonts have offline system-font fallbacks.

## GitHub Pages

The site publishes from the root of `main` using GitHub Pages. Pushing updates to `main` automatically redeploys the game. `.nojekyll` serves the existing static files directly; there is no build step. Relative asset paths support both the GitHub repository URL and a local web server.

Online progress is saved in the browser on the GitHub Pages domain, separately from any localhost saves.

## Verification

```powershell
npm test
```

Tests cover all castle and room counts, exact platform conversion, door and mechanism references, structural routes to every room/key/exit, original movement and machinery, save round-trips, pause behavior, enemy death phases, and complete no-death routes through the tutorial and Blackthorn. Structural route analysis ignores timed hazards and conveyor resistance; it does not substitute for a manual play-through of every castle.

Open [renderer verification](http://localhost:3000/tests/visual.html) to render all **223** rooms, inspect individual rooms, and scrub each enemy death animation. All 223 rooms were rendered successfully in the browser. This page never writes gameplay saves.

## Data and credits

Original game and castle designs: **Ed Hobbs / Brøderbund, 1984**. This is an unofficial fan remake. See [SOURCES.md](SOURCES.md) for the exact data source, research references, hashes and reproducible import steps. Three.js uses the MIT license in `vendor/LICENSE`.
