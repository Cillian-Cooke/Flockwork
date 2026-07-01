# Flockwork — project guide

A browser-based, **dependency-free static** daily puzzle game (NYT-daily style):
herd sheep with a scripted hero on a tile grid. No build step — the site is the
[`web/`](web/) folder served as static files. Deployed on Vercel
(`vercel.json` → `outputDirectory: "web"`), live at
`https://flockwork.vercel.app`, played mostly on mobile. The one runtime dependency
is the Rive WASM runtime, **vendored** into [`web/rive/`](web/rive/) (see below).

- Serve it: `python3 -m http.server` in `web/`, open `http://localhost:8000/`.
  (ES-module `import()`/`fetch()` of the `.riv`/`.wasm` are blocked on `file://` —
  see §Rive below. The engine logic runs fine headless in Node without a server.)
- Entry point: [`web/index.html`](web/index.html) → `js/main.js` (ES module).
- Tests: `node web/js/parity.test.mjs` — the engine regression suite (push/herding
  rules). Run it after any change to `engine.js`, `terrain.js`, `abilities.js`, or
  the entity model. There is no `package.json` test script.

---

## The game in one screen

- One **round is 10 ticks** (`ROUND_LENGTH`). On each tick every living entity
  performs one action encoded as a single **token**. The player queues tokens for
  the hero; everything else (sheep, enemies) follows a fixed per-tick **loop/script**.
- **Goal:** clear every sheep. Sheep aren't attacked — you **push/herd** them onto
  hazards (lava/void) or into a sheep-lethal enemy. You **lose** if all heroes die.
- **Score** is `"<full_sets>.<extra_actions>"`: fully-spent 10-move rounds, plus how
  many actions into the final round the last sheep died. Lower is better; each map
  ships a `par`.
- **Vision:** the hero sees a radius; the board only renders a window around the
  focus hero and everything beyond vision is **fog** (blank, unclickable). This is
  what lets huge maps (100×100) stay cheap — never render the whole map.

## The daily pack

`web/maps/daily_pack.json` (mirrored at root `maps/daily_pack.json` — keep both in
sync). Shape: `{ start_date, name, maps: [...] }`. On load the game picks
`idx = min(daysSince(start_date), maps.length-1)`. Each map entry:

- `name`, `vision`, `par`.
- `grid`: the **combined grid** — each cell is a string of the terrain number with
  an entity letter appended when one stands there. `"1"` = grass empty, `"1P"` =
  hero `P` on grass, `"1s"` = sheep, `"1a"` = enemy `a`, `"0"` = void, `"26"` =
  ability-cache tile. Regex: `/^(\d{1,3})([A-Za-z])?$/`. See `mapdata.js`.
- `scripts`: per-letter 10-token loops (e.g. `"a": ["d","d","a",...]`).
- `meta.P.abilities`: the hero's starting 3-slot loadout.
- `grants`: `"row,col": ["hook","freeze"]` — abilities held by ability-cache tiles
  (terrain 26). A loadout **never changes on its own**: ending a turn on a grant
  tile lights the Interact button and the player confirms the swap in a popup (the
  choice is recorded per round boundary so re-simulation stays deterministic).
  [[ability-pickups-explicit]]

Days 1–3 are yours to edit; Days 4+ were authored by the user — don't rewrite them
unless asked.

## Source map (`web/js/`)

- **engine.js** — the heart. `Engine.step(token)` resolves one tick: classify
  actions → charges → abilities → record destinations → **sequential movement in
  priority order** (rank desc, grid-index asc; higher rank pushes lower:
  Hero > Sheep > Enemy) → terrain on-enter chains → contact-death. Flock sheep
  move in lockstep and mirror any off-script displacement onto the whole flock.
- **entity.js** — `Entity` model, `kind`/`rank` (letter case decides kind: `s`=sheep,
  upper=hero, lower=enemy), `entityRivKey` (picks the full-tile riv art).
- **terrain.js** — numeric terrain registry (`DEFAULT_REGISTRY`, ids 0–26 plus
  91–99 cracking) → effects (wall/die/slip/portal/conveyor/spike/plate/gate/grant…).
- **tokens.js** — token vocabulary: `wasd` move, `.` wait, `1/2/3` ability slots;
  `?`/`_` are hotbar placeholders (aim/lock) that read as waits.
- **abilities.js** — modular ability library (`ABILITIES`), 3 slots per hero. Each
  declares `directional`, `cost` (action-slots spent → forced-wait lock), `run()`,
  and a `color` (used by the move-preview dots). No ability "attacks" — they move
  things (duplicate/hook/charge/whistle/blink/shield/freeze).
- **mapdata.js** — parses the combined grid → `GameMap` (`buildGameMap`, `MapError`).
  Holds the fallback `LEVEL`.
- **game.js** — round flow, scoring, re-simulation. `simulateTo(roundMoves,
  currentMoves, tick)` rebuilds from scratch and replays for deterministic timeline
  scrubbing. `tracePath` powers the move-preview dots (steps queued moves once, no
  loop; **enemies are dropped** so the preview ignores them — the player reasons
  about enemies themselves).
- **render.js** — the DOM board. **Windowed render**: grid sized to
  `min(2*vision+1, 31)` clamped to the map, centered on the focus hero; world↔screen
  via `board.originRow/Col`. Out-of-vision cells get `.fog` (transparent,
  `pointer-events:none`, terrain `"?"`, null tooltip). Rive tile filmstrips, path
  preview dots, rAF animation loop.
- **riv.js** — Rive runtime loader + filmstrip pre-renderer (§Rive). `TERRAIN_RIV`
  and entity/action riv maps; `ANIM_TERRAIN` for tiles that keep animating.
- **share.js** — Wordle-style shareable result: crops to a **10×10 window around
  the hero** (`SHARE_MAX`), terrain→square emoji, entity→circle emoji, score line +
  link. Keep the crop so big maps don't produce a giant emoji wall.
- **showcase.js** — Clash-Royale-style inspect demos: authored 5×5 / 10-action
  scenarios run through the **real Engine** and looped, so they can't drift from
  the live rules.
- **main.js** — all UI wiring: controls → hotbar, global timeline, chat log,
  save/load/download, daily-pack loading, board nav (recenter + switch-hero
  buttons, shown only when the map is bigger than the window), move-preview.
- **parity.test.mjs** — engine regression tests.

Other `maps/*.json` (level1, showcase, Greyfield_Keep, test_*) are standalone
fixtures/dev maps loadable via the load control, not part of the daily rotation.

---

# Rive — writing was retired; runtime is what matters

The `.riv` art (terrain, entities, UI actions) lives in [`web/rive/`](web/rive/) and
is **played at runtime** via `@rive-app/canvas-advanced` (vendored as
`web/rive/canvas_advanced.mjs` + `rive.wasm`). The old in-repo `.riv` *writer* and
the `stroke/`/`grid/` design tools are gone; the exports they produced are the
bundled `.riv` files here. What still bites:

- **canvas-advanced is an ES module**; its default export is an async factory:
  `const rive = await (await import('./rive/canvas_advanced.mjs')).default({ locateFile })`.
- **wasm path remap:** the build requests `canvas_advanced.wasm` but the package
  ships `rive.wasm`. `locateFile` MUST remap and return an **absolute** URL:
  `locateFile: f => new URL(f.endsWith('.wasm') ? 'rive/rive.wasm' : 'rive/'+f, location.href).href`.
- **API:** `file.defaultArtboard()` → `artboard.animationByIndex(0)` (a
  `LinearAnimation`) → `new rive.LinearAnimationInstance(la, artboard)`.
  `la.duration` is in **frames**, `la.fps` fps → `durationSeconds = duration/fps`.
  Pose a moment: `inst.time = seconds; inst.apply(1.0); artboard.advance(0);` then draw.
- **We pre-render filmstrips, we don't run 100 instances.** Browsers cap WebGL
  contexts (~16), so use **one** Rive instance to bake each tile/entity to a bitmap
  filmstrip, then blit per cell with `drawImage` + per-instance `globalAlpha`/
  transform. There is **no per-draw opacity** in the renderer and `flush()` is a
  no-op; to get pixels synchronously, drain the batched closures yourself:
  `const H = renderer.H; for (const fn of H) fn(); H.length = 0;`. (See riv.js.)
- **Serving:** `import()`/`fetch()` of `.riv`/`.wasm` are blocked on `file://`
  (null origin) — must be served over http. The bundled animations are stroke
  exports: artboard `Main`, one looping linear `Play` that draws on then holds,
  blanking on the last frame — so pick the **last full-coverage frame** as "grown".
- **Debug headlessly** with `google-chrome --headless=new --no-sandbox
  --screenshot=out.png URL` — the on-screen composite is the source of truth;
  `getImageData`/`drawImage` readback of a Rive canvas is unreliable unless you used
  the manual-flush path. `--virtual-time-budget` does **not** reliably advance rAF
  `dt`, so time-integrated values (paint progress) look stuck — crank the speed
  constant to verify logic instead of trusting the screenshot's timing.
