// Clash-Royale-style "card" showcase: a tiny looping board that demonstrates
// what a tile or entity actually does, mounted above the description text in the
// inspect popup.
//
// Demos are not hand-animated — each one is a small authored scenario that is run
// once through the REAL game Engine (engine.js). We snapshot the board after every
// tick and replay those snapshots on a loop, so a demo can never drift from the
// live rules: lava kills, conveyors carry, gates open on plates, etc. — because
// it's the same code the game runs.
//
// Visuals reuse the board's own pieces: terrain comes from the shared Rive
// filmstrips (or TERRAIN_FALLBACK colours), and actors are glyph divs styled by
// the same `.cell .ent-* .glyph` CSS as the real board.

import { GameMap } from "./mapdata.js";
import { Entity, kindOf, HERO, ENEMY, SHEEP } from "./entity.js";
import { Engine } from "./engine.js";
import * as terrain from "./terrain.js";
import { TERRAIN_FALLBACK } from "./riv.js";

const CELL = 46;     // px per showcase tile
const GAP  = 3;      // px between tiles
const STEP = CELL + GAP;
const STEP_MS = 680; // time spent on each captured tick
const HOLD_MS = 950; // pause on the final frame before looping

// Colours for terrain that the board normally draws with a .riv filmstrip, so the
// showcase still reads correctly if filmstrips are missing (e.g. file://).
const RIV_FALLBACK = {
  0: null,        // void — transparent
  1: "#6fae4f",   // grass
  2: "#6b6b73",   // wall
  3: "#e0512b",   // lava
  4: "#9fd6e6",   // ice / slip
  5: "#8a6b46",   // mud / skip
  6: "#9b59d6",   // portal
  8: "#3a8fd0",   // water
};
function tileColour(id) {
  if (id in RIV_FALLBACK) return RIV_FALLBACK[id];
  if (id in TERRAIN_FALLBACK) return TERRAIN_FALLBACK[id];
  if (terrain.isCrack(id)) return TERRAIN_FALLBACK[id] || "#9c6b3f";
  return "#6fae4f";
}

let _filmstrips = null;
export function initShowcase(filmstrips) { _filmstrips = filmstrips; }

// --- demo authoring helpers -------------------------------------------------

// terrain ids as a compact grid; entities as { letter,row,col, ...overrides }.
// `tokens` is the hero's action each tick ("." when there's no hero to drive).
function demo(spec) {
  const rows = spec.terrain.length;
  const cols = spec.terrain[0].length;
  return { rows, cols, ...spec, tokens: spec.tokens || [] };
}

// short row builder: "1 1 3 1 1" -> [1,1,3,1,1]
const row = (s) => s.trim().split(/\s+/).map(Number);

// --- the demo registry ------------------------------------------------------
// Keyed by terrain effect string (terrain.effectOf) and by entity-variant key.
// Both namespaces are disjoint so they share one table.

export const DEMOS = {
  // ---- terrain ----
  [terrain.NONE]: demo({
    terrain: [row("1 1 1"), row("1 1 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "s", "d"],
  }),
  [terrain.WALL]: demo({
    terrain: [row("1 1 2 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "d", "d", "d"], // walks up, bounces off the wall, keeps trying
  }),
  [terrain.DIE]: demo({
    terrain: [row("1 1 3 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "d"], // step onto lava -> dies
  }),
  [terrain.SLIP]: demo({
    terrain: [row("1 1 4 1 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "d"], // lands on ice -> forced one more step
  }),
  [terrain.SKIP]: demo({
    terrain: [row("1 5 1 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "d", "d"], // onto skip -> next action wasted as a wait
  }),
  [terrain.TELEPORT]: demo({
    terrain: [row("1 6 1 1 6")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "."], // step on a portal -> jump to the other
  }),
  [terrain.DUPLICATE]: demo({
    terrain: [row("1 1 1"), row("1 7 1"), row("1 1 1")],
    entities: [{ letter: "A", row: 1, col: 0 }],
    tokens: ["d", "."], // onto duplicate -> a copy appears alongside
  }),
  [terrain.PUSH]: demo({
    terrain: [row("1 1 8 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "d"], // onto push -> shoved straight back
  }),
  [terrain.REPEAT_MOVE]: demo({
    terrain: [row("1 9 1 1 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", ".", "."], // onto repeat -> last move replays on its own
  }),
  [terrain.GLIDE]: demo({
    terrain: [row("1 10 1 1 2")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "."], // onto glide -> slides until the wall stops it
  }),
  [terrain.WARD]: demo({
    terrain: [row("1 11 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "."], // onto ward -> shielded (barrier ring) for the tick
  }),
  [terrain.WARP]: demo({
    terrain: [row("1 1 1"), row("1 12 1"), row("1 1 1")],
    entities: [{ letter: "A", row: 1, col: 0 }],
    tokens: ["d", "."], // onto warp -> flung to a random free tile
  }),
  [terrain.MIRROR]: demo({
    terrain: [row("1 13 1 1 1")],
    entities: [
      { letter: "A", row: 0, col: 0 },
      { letter: "s", row: 0, col: 4, loop: ["."] },
    ],
    tokens: ["d", "."], // onto mirror -> swap places with the nearest entity
  }),
  [terrain.SPIKE]: demo({
    terrain: [row("1 14 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d"], // onto an active spike -> dies (cross on the off-beat instead)
  }),
  [terrain.CONVEYOR]: demo({
    terrain: [row("1 17 17 17 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", ".", "."], // step on -> carried along the belt while idle
  }),
  [terrain.CRACK]: demo({
    terrain: [row("1 91 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "a", "d"], // cross once collapses it; step back on -> fall in
  }),
  [terrain.ONEWAY]: demo({
    terrain: [row("1 21 1 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "d"], // enters from the allowed side and passes through
  }),
  [terrain.GRANT]: demo({
    terrain: [row("1 26 1")],
    entities: [{ letter: "A", row: 0, col: 0 }],
    tokens: ["d", "."], // end a turn here -> the cache lights up to interact
  }),
  // plate + gate share one scene: a flock-sheep holds the plate, opening the gate.
  [terrain.PLATE]: plateGateDemo(),
  [terrain.GATE]: plateGateDemo(),

  // ---- entities ----
  hero: demo({
    terrain: [row("1 1 1 1")],
    entities: [
      { letter: "A", row: 0, col: 0 },
      { letter: "s", row: 0, col: 1, loop: ["."] },
    ],
    tokens: ["d", "d"], // hero shoves the sheep ahead of it
  }),
  sheep: demo({
    terrain: [row("1 1 1 1"), row("1 1 1 1")],
    entities: [
      { letter: "s", row: 0, col: 0, loop: ["d", "d"] },
      { letter: "s", row: 1, col: 0, loop: ["d", "d"] },
    ],
    tokens: [".", "."], // the flock moves as one
  }),
  guard: demo({
    terrain: [row("1 1 1 1")],
    entities: [
      { letter: "A", row: 0, col: 0 },
      { letter: "a", row: 0, col: 2, loop: ["."], lethalToHero: true },
    ],
    tokens: ["d", "d"], // hero walks into the guard -> hero dies
  }),
  wolf: demo({
    terrain: [row("1 1 1")],
    entities: [
      { letter: "a", row: 0, col: 0, loop: ["d", "d"], lethalToSheep: true },
      { letter: "s", row: 0, col: 2, loop: ["."] },
    ],
    tokens: [".", "."], // wolf reaches the sheep -> sheep is eaten
  }),
  boulder: demo({
    terrain: [row("1 1 1")],
    entities: [
      { letter: "A", row: 0, col: 0 },
      { letter: "b", row: 0, col: 1, loop: ["."], heavy: true, lethalToHero: false },
    ],
    tokens: ["d", "d"], // hero pushes a boulder -> it won't budge
  }),
  harmless: demo({
    terrain: [row("1 1 1 1")],
    entities: [
      { letter: "A", row: 0, col: 0 },
      { letter: "e", row: 0, col: 1, loop: ["."], lethalToHero: false },
    ],
    tokens: ["d", "d"], // a harmless creature is simply shoved aside
  }),
};

function plateGateDemo() {
  // (0,2) gate, (2,0) plate. A flock sheep steps onto the plate; while it's held
  // the gate opens and the hero walks through it.
  return demo({
    terrain: [
      row("1 1 25"),
      row("1 1 1"),
      row("24 1 1"),
    ],
    entities: [
      { letter: "A", row: 0, col: 0 },
      { letter: "s", row: 2, col: 1, loop: ["a", ".", "."] },
    ],
    tokens: [".", "d", "d"], // wait for the plate, then pass the opened gate
  });
}

// --- running a demo through the engine --------------------------------------

function buildEntities(specs) {
  return specs.map((s) => {
    const kind = s.kind || kindOf(s.letter);
    return new Entity({
      letter: s.letter,
      kind,
      row: s.row,
      col: s.col,
      loop: s.loop || [],
      lethalToHero: s.lethalToHero !== undefined ? s.lethalToHero : true,
      lethalToSheep: !!s.lethalToSheep,
      heavy: !!s.heavy,
      abilities: kind === HERO ? [] : [],
    });
  });
}

// Capture one frame: a snapshot of every entity plus the (possibly mutated)
// terrain grid, so dynamic tiles (cracks collapsing, anything that rewrites
// terrain) replay correctly.
function snapshot(gmap) {
  return {
    terrain: gmap.terrain.map((r) => r.slice()),
    ents: gmap.entities.map((e, id) => ({
      id, letter: e.letter, kind: e.kind, row: e.row, col: e.col,
      alive: e.alive, invuln: e.invuln, armed: !!e.armedAbility,
    })),
  };
}

function runDemo(spec) {
  const gmap = new GameMap({
    name: "demo",
    vision: 99,
    terrain: spec.terrain.map((r) => r.slice()),
    entities: buildEntities(spec.entities),
    rows: spec.rows,
    cols: spec.cols,
  });
  const engine = new Engine(gmap);
  const frames = [snapshot(gmap)];
  for (const tok of spec.tokens) {
    engine.step(tok);
    frames.push(snapshot(gmap));
  }
  return frames;
}

// --- the looping player -----------------------------------------------------

const VARIANT_CLASS = { [HERO]: "ent-hero", [ENEMY]: "ent-enemy", [SHEEP]: "ent-sheep" };

// Build the mini-board into `container` and start looping. Returns a handle with
// .stop() — call it when the popup closes so timers/rAF don't leak.
export function mountShowcase(container, key) {
  const spec = DEMOS[key];
  container.innerHTML = "";
  if (!spec) return { stop() {} };

  const { rows, cols } = spec;
  const frames = runDemo(spec);

  // Root + grid sized so the reused `.cell` CSS (width/height: var(--cell)) fits.
  const root = document.createElement("div");
  root.className = "showcase";
  root.style.setProperty("--cell", `${CELL}px`);
  root.style.width  = `${cols * CELL + (cols - 1) * GAP}px`;
  root.style.height = `${rows * CELL + (rows - 1) * GAP}px`;

  const grid = document.createElement("div");
  grid.className = "showcase-grid";
  grid.style.gridTemplateColumns = `repeat(${cols}, ${CELL}px)`;
  grid.style.gridTemplateRows    = `repeat(${rows}, ${CELL}px)`;
  grid.style.gap = `${GAP}px`;

  const tiles = []; // [r][c] -> { canvas, ctx }
  for (let r = 0; r < rows; r++) {
    const trow = [];
    for (let c = 0; c < cols; c++) {
      const cv = document.createElement("canvas");
      cv.className = "showcase-tile";
      cv.width = cv.height = CELL;
      grid.appendChild(cv);
      trow.push({ canvas: cv, ctx: cv.getContext("2d") });
    }
    tiles.push(trow);
  }
  root.appendChild(grid);

  const actorLayer = document.createElement("div");
  actorLayer.className = "showcase-actors";
  root.appendChild(actorLayer);
  container.appendChild(root);

  const actors = new Map(); // id -> { wrap, inner }
  function actorFor(snap) {
    let a = actors.get(snap.id);
    if (!a) {
      const wrap = document.createElement("div");
      wrap.className = `showcase-actor cell ${VARIANT_CLASS[snap.kind] || ""}`;
      const inner = document.createElement("div");
      inner.className = "cell-inner glyph";
      inner.textContent = snap.letter;
      wrap.appendChild(inner);
      wrap.style.opacity = "0"; // fade in on first real placement
      actorLayer.appendChild(wrap);
      a = { wrap, inner, seen: false };
      actors.set(snap.id, a);
    }
    return a;
  }

  function drawTerrain(grid2d) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const { ctx } = tiles[r][c];
        const id = grid2d[r][c];
        ctx.clearRect(0, 0, CELL, CELL);
        const strip = _filmstrips && _filmstrips.get(id);
        if (strip) {
          ctx.drawImage(strip.frames[terrFrame(strip)], 0, 0, CELL, CELL);
        } else {
          const col = tileColour(id);
          if (col) { ctx.fillStyle = col; ctx.fillRect(0, 0, CELL, CELL); }
        }
        drawTileMark(ctx, id);
      }
    }
  }

  // Direction arrows / markers for tiles whose meaning is a direction or state.
  function drawTileMark(ctx, id) {
    const conv = terrain.conveyorDir(id);
    const ow   = terrain.onewayDir(id);
    const dir  = conv || ow;
    if (dir) { drawArrow(ctx, dir); return; }
    if (terrain.effectOf(id) === terrain.GATE) drawBars(ctx);
  }
  function drawArrow(ctx, [dr, dc]) {
    ctx.save();
    ctx.translate(CELL / 2, CELL / 2);
    ctx.rotate(Math.atan2(dc, -dr)); // [dr,dc] -> screen angle (up = -row)
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const s = CELL * 0.22;
    ctx.beginPath();
    ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, s * 0.5); ctx.lineTo(-s * 0.8, s * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawBars(ctx) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    for (let i = 0; i < 3; i++) ctx.fillRect(CELL * (0.18 + i * 0.28), CELL * 0.18, CELL * 0.1, CELL * 0.64);
  }

  // Idle terrain animation phase: cycle each filmstrip 0..topIdx so the board
  // feels alive, just like the real game.
  let terrPhase = 0;
  function terrFrame(strip) {
    return Math.min(strip.topIdx, Math.round(terrPhase * strip.topIdx));
  }

  // Place actors for frame f. `animate` enables the CSS glide transition.
  let prevAlive = new Map();
  function applyFrame(f, animate) {
    const frame = frames[f];
    drawTerrain(frame.terrain);
    const present = new Set();
    for (const snap of frame.ents) {
      present.add(snap.id);
      const a = actorFor(snap);
      a.wrap.style.transition = animate ? "transform .42s ease, opacity .2s ease" : "none";
      a.wrap.style.transform = `translate(${snap.col * STEP}px, ${snap.row * STEP}px)`;
      // Ward's shield lasts a single tick (set + spent inside one engine step, so
      // it never survives into a snapshot) — show the ring while the actor stands
      // on a ward tile. Likewise glow on an ability cache to signal "interact".
      const eff = snap.alive ? terrain.effectOf(frame.terrain[snap.row][snap.col]) : null;
      a.wrap.classList.toggle("barrier", snap.invuln > 0 || eff === terrain.WARD);
      a.wrap.classList.toggle("charging", snap.armed || eff === terrain.GRANT);
      const wasAlive = prevAlive.get(snap.id);
      if (snap.alive) {
        a.wrap.style.opacity = "1";
        a.inner.classList.remove("dying");
        a.seen = true;
      } else if (wasAlive) {
        // death beat: sink + fade on the tile that killed it
        a.inner.classList.add("dying");
      } else {
        a.wrap.style.opacity = "0";
      }
    }
    // Hide actors that don't exist yet in this frame (e.g. before a duplicate).
    for (const [id, a] of actors) {
      if (!present.has(id)) { a.wrap.style.opacity = "0"; a.inner.classList.remove("dying"); }
    }
    prevAlive = new Map(frame.ents.map((s) => [s.id, s.alive]));
  }

  // ---- loop drivers ----
  let stopped = false;
  let raf = 0;
  const t0 = performance.now();
  function tickTerrain(now) {
    if (stopped) return;
    terrPhase = ((now - t0) / 1100) % 1; // ~1.1s idle cycle
    drawTerrain(frames[idx].terrain);
    raf = requestAnimationFrame(tickTerrain);
  }

  let idx = 0;
  let timer = 0;
  function advance() {
    if (stopped) return;
    if (idx < frames.length - 1) {
      idx += 1;
      applyFrame(idx, true);
      timer = setTimeout(advance, STEP_MS);
    } else {
      // hold on the final frame, then snap back to the start and replay
      timer = setTimeout(() => {
        if (stopped) return;
        idx = 0;
        prevAlive = new Map();
        for (const [, a] of actors) { a.inner.classList.remove("dying"); }
        applyFrame(0, false);
        timer = setTimeout(advance, STEP_MS);
      }, HOLD_MS);
    }
  }

  applyFrame(0, false);
  raf = requestAnimationFrame(tickTerrain);
  timer = setTimeout(advance, STEP_MS);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    },
  };
}
