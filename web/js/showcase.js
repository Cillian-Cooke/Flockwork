// Clash-Royale-style inspect showcase: a looping demo board that takes over the
// map area when you click a tile or entity, plus the little animated icon shown
// in the inspect panel.
//
// Demos are not hand-animated — each is a small authored scenario run once
// through the REAL game Engine (engine.js) and replayed on a loop, so a demo can
// never drift from the live rules. Every demo is a 5x5 board and exactly 10
// actions long, so it fills the hotbar; the player driving it is mirrored into
// the hotbar tile-by-tile with the current action outlined.
//
// Visuals reuse the board's own pieces: terrain comes from the shared Rive
// filmstrips (held STATIC here — no idle looping while inspecting) or
// TERRAIN_FALLBACK colours, and actors are glyph divs styled by the board's own
// `.cell .ent-* .glyph` CSS.

import { GameMap } from "./mapdata.js";
import { Entity, kindOf, HERO, ENEMY, SHEEP } from "./entity.js";
import { Engine } from "./engine.js";
import * as terrain from "./terrain.js";
import { TERRAIN_FALLBACK } from "./riv.js";

const SIZE = 5;       // every demo board is 5x5
const ACTIONS = 10;   // every demo is exactly 10 actions (fills the hotbar)
const STEP_MS = 620;  // time spent on each action
const HOLD_MS = 900;  // pause on the final action before looping

// Colours for terrain the board normally draws with a .riv filmstrip, so the
// showcase still reads if filmstrips are missing (e.g. file://).
const RIV_FALLBACK = {
  0: null, 1: "#6fae4f", 2: "#6b6b73", 3: "#e0512b",
  4: "#9fd6e6", 5: "#8a6b46", 6: "#9b59d6", 8: "#3a8fd0",
};
function tileColour(id) {
  if (id in RIV_FALLBACK) return RIV_FALLBACK[id];
  if (id in TERRAIN_FALLBACK) return TERRAIN_FALLBACK[id];
  if (terrain.isCrack(id)) return TERRAIN_FALLBACK[id] || "#9c6b3f";
  return "#6fae4f";
}

let _filmstrips = null;
export function initShowcase(filmstrips) { _filmstrips = filmstrips; }

// --- demo authoring ---------------------------------------------------------

// 5x5 grass grid with feature tiles painted in: feats = [[r,c,id], …].
function field(feats = []) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(1));
  for (const [r, c, id] of feats) g[r][c] = id;
  return g;
}
// pad/trim a token list to exactly 10 actions.
function ten(tokens) {
  const out = tokens.slice(0, ACTIONS);
  while (out.length < ACTIONS) out.push(".");
  return out;
}
function demo(spec) {
  return { terrain: spec.terrain, entities: spec.entities, tokens: ten(spec.tokens) };
}

export const DEMOS = {
  // ---- terrain ----
  [terrain.NONE]: demo({
    terrain: field(),
    entities: [{ letter: "A", row: 2, col: 2 }],
    tokens: ["w", "d", "s", "s", "a", "a", "w", "d", ".", "."],
  }),
  [terrain.WALL]: demo({
    terrain: field([[1, 2, 2], [2, 2, 2], [3, 2, 2]]),
    entities: [{ letter: "A", row: 2, col: 1 }],
    tokens: ["d", "d", "w", "w", "d", "d", "s", "s", "a", "."], // bumps, then routes around
  }),
  [terrain.DIE]: demo({
    terrain: field([[2, 2, 3], [2, 3, 3]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", ".", "d", ".", ".", ".", ".", "."], // walks into lava, dies
  }),
  [terrain.SLIP]: demo({
    terrain: field([[2, 2, 4]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", ".", ".", "a", ".", ".", ".", "."], // slides past the ice both ways
  }),
  [terrain.SKIP]: demo({
    terrain: field([[2, 2, 5]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", "d", "d", ".", "a", "a", ".", "."], // step lands, next action wasted
  }),
  [terrain.TELEPORT]: demo({
    terrain: field([[1, 1, 6], [3, 3, 6]]),
    entities: [{ letter: "A", row: 1, col: 0 }],
    tokens: ["d", ".", ".", "w", ".", "s", ".", ".", ".", "."], // portal hop, then hop back
  }),
  [terrain.DUPLICATE]: demo({
    terrain: field([[2, 2, 7]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", ".", ".", ".", ".", ".", ".", "."], // a copy splits off
  }),
  [terrain.PUSH]: demo({
    terrain: field([[2, 2, 8]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", ".", "d", ".", "d", ".", ".", "."], // bounced straight back, repeatedly
  }),
  [terrain.REPEAT_MOVE]: demo({
    terrain: field([[2, 1, 9]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", ".", ".", ".", ".", ".", ".", ".", "."], // one move becomes two
  }),
  [terrain.GLIDE]: demo({
    terrain: field([[2, 1, 10], [2, 4, 2]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", ".", ".", ".", ".", ".", ".", ".", "."], // slides till the wall
  }),
  [terrain.WARD]: demo({
    terrain: field([[2, 2, 11]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", ".", ".", "a", ".", ".", ".", "."], // shield ring while on the ward
  }),
  [terrain.WARP]: demo({
    terrain: field([[2, 2, 12]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", ".", ".", ".", ".", ".", ".", "."], // flung somewhere random
  }),
  [terrain.MIRROR]: demo({
    terrain: field([[2, 2, 13]]),
    entities: [
      { letter: "A", row: 2, col: 0 },
      { letter: "s", row: 0, col: 4, loop: ["."] },
    ],
    tokens: ["d", ".", "d", ".", ".", ".", ".", ".", ".", "."], // swaps places with the sheep
  }),
  [terrain.SPIKE]: demo({
    terrain: field([[2, 2, 14]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", "d", "d", ".", "a", ".", ".", ".", ".", "."], // crosses on the off-beat, caught on the on-beat
  }),
  [terrain.CONVEYOR]: demo({
    terrain: field([[2, 1, 17], [2, 2, 17], [2, 3, 17]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", ".", ".", ".", ".", ".", ".", ".", "."], // carried along the belt
  }),
  [terrain.CRACK]: demo({
    terrain: field([[2, 2, 91]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", ".", "a", ".", "d", ".", ".", "."], // cross collapses it; step back, fall
  }),
  [terrain.ONEWAY]: demo({
    terrain: field([[2, 2, 21]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", "d", ".", "a", "a", ".", ".", "."], // through one way, blocked the other
  }),
  [terrain.GRANT]: demo({
    terrain: field([[2, 2, 26]]),
    entities: [{ letter: "A", row: 2, col: 0 }],
    tokens: ["d", ".", "d", ".", ".", ".", ".", ".", ".", "."], // ends a turn on the cache (glows)
  }),
  [terrain.PLATE]: plateGate(),
  [terrain.GATE]: plateGate(),

  // ---- entities ----
  hero: demo({
    terrain: field(),
    entities: [
      { letter: "A", row: 2, col: 1 },
      { letter: "s", row: 2, col: 2, loop: ["."] },
    ],
    tokens: ["d", "d", "d", ".", "a", ".", ".", ".", ".", "."], // shoves the sheep ahead
  }),
  sheep: demo({
    terrain: field(),
    entities: [
      { letter: "s", row: 1, col: 1, loop: ["d", "d", ".", "a", "a", ".", ".", ".", ".", "."] },
      { letter: "s", row: 2, col: 1, loop: ["d", "d", ".", "a", "a", ".", ".", ".", ".", "."] },
      { letter: "s", row: 3, col: 1, loop: ["d", "d", ".", "a", "a", ".", ".", ".", ".", "."] },
    ],
    tokens: ["."], // the flock moves as one
  }),
  guard: demo({
    terrain: field(),
    entities: [
      { letter: "A", row: 2, col: 0 },
      { letter: "a", row: 2, col: 3, loop: ["."], lethalToHero: true },
    ],
    tokens: ["d", ".", "d", ".", "d", ".", ".", ".", ".", "."], // walks into the guard, dies
  }),
  wolf: demo({
    terrain: field(),
    entities: [
      { letter: "a", row: 2, col: 0, loop: ["d", "d", "d", ".", ".", ".", ".", ".", ".", "."], lethalToSheep: true },
      { letter: "s", row: 2, col: 3, loop: ["."] },
    ],
    tokens: ["."], // the wolf reaches the sheep and eats it
  }),
  boulder: demo({
    terrain: field(),
    entities: [
      { letter: "A", row: 2, col: 0 },
      { letter: "b", row: 2, col: 1, loop: ["."], heavy: true, lethalToHero: false },
    ],
    tokens: ["d", "d", "d", ".", ".", ".", ".", ".", ".", "."], // shoves a boulder — it won't move
  }),
  harmless: demo({
    terrain: field(),
    entities: [
      { letter: "A", row: 2, col: 0 },
      { letter: "e", row: 2, col: 1, loop: ["."], lethalToHero: false },
    ],
    tokens: ["d", "d", "d", ".", "a", "a", ".", ".", ".", "."], // simply pushed aside
  }),
};

function plateGate() {
  // sheep holds a pressure plate (4,0), opening the gate (2,3) the hero walks through.
  return demo({
    terrain: field([[2, 3, 25], [4, 0, 24]]),
    entities: [
      { letter: "A", row: 2, col: 1 },
      { letter: "s", row: 4, col: 1, loop: ["a", ".", ".", ".", ".", ".", ".", ".", ".", "."] },
    ],
    tokens: [".", "d", "d", ".", "a", "a", ".", ".", ".", "."],
  });
}

// --- running a demo through the engine --------------------------------------

function buildEntities(specs) {
  return specs.map((s) => {
    const kind = s.kind || kindOf(s.letter);
    return new Entity({
      letter: s.letter, kind, row: s.row, col: s.col, loop: s.loop || [],
      lethalToHero: s.lethalToHero !== undefined ? s.lethalToHero : true,
      lethalToSheep: !!s.lethalToSheep, heavy: !!s.heavy, abilities: [],
    });
  });
}

function snapshot(gmap) {
  return {
    terrain: gmap.terrain.map((r) => r.slice()),
    ents: gmap.entities.map((e, id) => ({
      id, letter: e.letter, kind: e.kind, row: e.row, col: e.col,
      alive: e.alive, invuln: e.invuln,
    })),
  };
}

function runDemo(spec) {
  const gmap = new GameMap({
    name: "demo", vision: 99,
    terrain: spec.terrain.map((r) => r.slice()),
    entities: buildEntities(spec.entities),
    rows: SIZE, cols: SIZE,
  });
  const engine = new Engine(gmap);
  const frames = [snapshot(gmap)];
  for (const tok of spec.tokens) { engine.step(tok); frames.push(snapshot(gmap)); }
  return frames; // length ACTIONS+1 (initial + one per action)
}

// --- shared terrain tile drawing --------------------------------------------

// Draw terrain id into ctx at S×S. Held static (grown filmstrip frame) — no idle
// looping. Adds direction arrows / gate bars where the meaning is directional.
function drawTerrainTile(ctx, id, S) {
  ctx.clearRect(0, 0, S, S);
  const strip = _filmstrips && _filmstrips.get(id);
  const conv = terrain.conveyorDir(id); // belt base points right → rotate per arrow
  if (strip) {
    if (conv) {
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate(Math.atan2(conv[0], conv[1]));
      ctx.drawImage(strip.frames[strip.topIdx], -S / 2, -S / 2, S, S);
      ctx.restore();
    } else {
      ctx.drawImage(strip.frames[strip.topIdx], 0, 0, S, S);
    }
  } else {
    const col = tileColour(id);
    if (col) { ctx.fillStyle = col; ctx.fillRect(0, 0, S, S); }
    if (conv) { drawArrow(ctx, conv, S); return; } // no riv (file://): drawn arrow
  }
  const ow = terrain.onewayDir(id);
  if (ow) { drawArrow(ctx, ow, S); return; }
  if (!strip && terrain.effectOf(id) === terrain.GATE) drawBars(ctx, S);
}
function drawArrow(ctx, [dr, dc], S) {
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(Math.atan2(dc, -dr));
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  const s = S * 0.2;
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, s * 0.5); ctx.lineTo(-s * 0.8, s * 0.5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawBars(ctx, S) {
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (let i = 0; i < 3; i++) ctx.fillRect(S * (0.18 + i * 0.28), S * 0.18, S * 0.1, S * 0.64);
}

const VARIANT_CLASS = { [HERO]: "ent-hero", [ENEMY]: "ent-enemy", [SHEEP]: "ent-sheep" };

// --- the looping board (mounted into the map area) --------------------------

// Build the 5x5 demo board into `container` and loop it. opts:
//   cellSize : px per tile (sized to fill the stage)
//   gap      : px between tiles (default 4)
//   onStep(i): called as action i becomes current (-1 between loops) — used to
//              drive the hotbar highlight.
// Returns { stop(), tokens }.
export function mountBoard(container, key, opts = {}) {
  const spec = DEMOS[key];
  container.innerHTML = "";
  if (!spec) return { stop() {}, tokens: [] };

  const CELL = opts.cellSize || 64;
  const GAP = opts.gap != null ? opts.gap : 4;
  const STEP = CELL + GAP;
  const onStep = opts.onStep || (() => {});
  const frames = runDemo(spec);

  const root = document.createElement("div");
  root.className = "showcase";
  root.style.setProperty("--cell", `${CELL}px`);
  root.style.width  = `${SIZE * CELL + (SIZE - 1) * GAP}px`;
  root.style.height = `${SIZE * CELL + (SIZE - 1) * GAP}px`;

  const grid = document.createElement("div");
  grid.className = "showcase-grid";
  grid.style.gridTemplateColumns = `repeat(${SIZE}, ${CELL}px)`;
  grid.style.gridTemplateRows    = `repeat(${SIZE}, ${CELL}px)`;
  grid.style.gap = `${GAP}px`;

  const tiles = [];
  for (let r = 0; r < SIZE; r++) {
    const trow = [];
    for (let c = 0; c < SIZE; c++) {
      const cv = document.createElement("canvas");
      cv.className = "showcase-tile";
      cv.width = cv.height = CELL;
      grid.appendChild(cv);
      trow.push(cv.getContext("2d"));
    }
    tiles.push(trow);
  }
  root.appendChild(grid);

  const actorLayer = document.createElement("div");
  actorLayer.className = "showcase-actors";
  root.appendChild(actorLayer);
  container.appendChild(root);

  const actors = new Map();
  function actorFor(snap) {
    let a = actors.get(snap.id);
    if (!a) {
      const wrap = document.createElement("div");
      wrap.className = `showcase-actor cell ${VARIANT_CLASS[snap.kind] || ""}`;
      const inner = document.createElement("div");
      inner.className = "cell-inner glyph";
      inner.textContent = snap.letter;
      wrap.appendChild(inner);
      wrap.style.opacity = "0";
      actorLayer.appendChild(wrap);
      a = { wrap, inner };
      actors.set(snap.id, a);
    }
    return a;
  }

  function drawTerrain(grid2d) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) drawTerrainTile(tiles[r][c], grid2d[r][c], CELL);
  }

  let prevAlive = new Map();
  function applyFrame(f, animate) {
    const frame = frames[f];
    drawTerrain(frame.terrain);
    const present = new Set();
    for (const snap of frame.ents) {
      present.add(snap.id);
      const a = actorFor(snap);
      a.wrap.style.transition = animate ? "transform .4s ease, opacity .2s ease" : "none";
      a.wrap.style.transform = `translate(${snap.col * STEP}px, ${snap.row * STEP}px)`;
      const eff = snap.alive ? terrain.effectOf(frame.terrain[snap.row][snap.col]) : null;
      a.wrap.classList.toggle("barrier", snap.invuln > 0 || eff === terrain.WARD);
      a.wrap.classList.toggle("charging", eff === terrain.GRANT);
      const wasAlive = prevAlive.get(snap.id);
      if (snap.alive) { a.wrap.style.opacity = "1"; a.inner.classList.remove("dying"); }
      else if (wasAlive) a.inner.classList.add("dying");
      else a.wrap.style.opacity = "0";
    }
    for (const [id, a] of actors)
      if (!present.has(id)) { a.wrap.style.opacity = "0"; a.inner.classList.remove("dying"); }
    prevAlive = new Map(frame.ents.map((s) => [s.id, s.alive]));
  }

  let stopped = false, idx = 0, timer = 0;
  function advance() {
    if (stopped) return;
    if (idx < frames.length - 1) {
      idx += 1;
      applyFrame(idx, true);
      onStep(idx - 1); // action (idx-1) is the one that just executed
      timer = setTimeout(advance, STEP_MS);
    } else {
      timer = setTimeout(() => {
        if (stopped) return;
        idx = 0; prevAlive = new Map();
        for (const [, a] of actors) a.inner.classList.remove("dying");
        applyFrame(0, false);
        onStep(-1);
        timer = setTimeout(advance, STEP_MS);
      }, HOLD_MS);
    }
  }

  applyFrame(0, false);
  onStep(-1);
  timer = setTimeout(advance, STEP_MS);

  return { stop() { stopped = true; clearTimeout(timer); }, tokens: spec.tokens.slice() };
}

// --- the inspect-panel icon (click to replay its in/out animation) ----------

// Mount the little "picture of the thing" into `container`. Terrain with a Rive
// file animates its grow-in/blank-out on click; other terrain shows a coloured
// swatch; entities show their glyph disc. Returns { play() }.
export function mountIcon(container, { key, terrainId, entity }) {
  container.innerHTML = "";
  const S = 72;

  if (entity) {
    const wrap = document.createElement("div");
    wrap.className = `inspect-icon-ent cell ${VARIANT_CLASS[entity.kind] || ""}`;
    wrap.style.setProperty("--cell", `${S}px`);
    const inner = document.createElement("div");
    inner.className = "cell-inner glyph";
    inner.textContent = entity.letter;
    wrap.appendChild(inner);
    container.appendChild(wrap);
    const play = () => { wrap.classList.remove("pop"); void wrap.offsetWidth; wrap.classList.add("pop"); };
    wrap.addEventListener("click", play);
    return { play };
  }

  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  cv.className = "inspect-icon-canvas";
  container.appendChild(cv);
  const ctx = cv.getContext("2d");
  const strip = _filmstrips && _filmstrips.get(terrainId);

  if (!strip) {
    drawTerrainTile(ctx, terrainId, S);
    const play = () => { cv.classList.remove("pop"); void cv.offsetWidth; cv.classList.add("pop"); };
    cv.addEventListener("click", play);
    return { play };
  }

  // Riv terrain: play frames 0..last (grow in, then blank out), settle on grown.
  let raf = 0;
  function settle() { ctx.clearRect(0, 0, S, S); ctx.drawImage(strip.frames[strip.topIdx], 0, 0, S, S); }
  function play() {
    cancelAnimationFrame(raf);
    const start = performance.now();
    const dur = 1300;
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const fi = Math.min(strip.frames.length - 1, Math.round(t * (strip.frames.length - 1)));
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(strip.frames[fi], 0, 0, S, S);
      if (t < 1) raf = requestAnimationFrame(step); else settle();
    }
    raf = requestAnimationFrame(step);
  }
  settle();
  cv.addEventListener("click", play);
  return { play };
}
